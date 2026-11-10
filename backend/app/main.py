"""
FastAPI backend for the "Intercepted Transmission" Vigenere cracking demo.

Stateless by design: no database, no server-side session state, nothing
persisted between requests. The only "data" is the static fixture file
app/data/messages.json (see generate_data.py) and app/data/wordlist.txt,
both read fresh at startup and held in memory as plain read-only lists.

Cipher: classic Vigenere (see app/cipher.py). The WWII "intercepted
transmission" framing is UI/content theming only.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from .cipher import decrypt, encrypt, normalize_key
from .cracking.brute_force import DEFAULT_MAX_KEY_LENGTH as BF_DEFAULT_MAX_LEN
from .cracking.brute_force import HARD_MAX_KEY_LENGTH as BF_HARD_MAX_LEN
from .cracking.brute_force import run_brute_force
from .cracking.dictionary_attack import run_dictionary_attack
from .cracking.frequency_analysis import run_frequency_analysis
from .models import (
    ArchiveMessageResult,
    ArchiveRunRequest,
    AlgorithmResult,
    CrackRequest,
    DecryptRequest,
    DecryptResponse,
    EncryptRequest,
    EncryptResponse,
    KeyLengthExperimentRequest,
    KeyLengthExperimentResponse,
    KeyLengthPoint,
    MessageSummary,
    RevealResponse,
    TextLengthExperimentRequest,
    TextLengthExperimentResponse,
    TextLengthPoint,
)
from statistics import mean, pstdev

DATA_DIR = Path(__file__).parent / "data"

app = FastAPI(title="Intercepted Transmission — Vigenere Cracking Demo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_messages() -> list[dict]:
    with (DATA_DIR / "messages.json").open("r", encoding="utf-8") as f:
        return json.load(f)


def _load_wordlist() -> list[str]:
    with (DATA_DIR / "wordlist.txt").open("r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]


MESSAGES = _load_messages()
MESSAGES_BY_ID = {m["id"]: m for m in MESSAGES}
WORDLIST = _load_wordlist()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "messages_loaded": len(MESSAGES), "wordlist_size": len(WORDLIST)}


@app.get("/api/wordlist", response_model=list[str])
def wordlist() -> list[str]:
    """The dictionary attack's candidate keys, in the order it tries them (Method section visual)."""
    return [w for w in (normalize_key(x) for x in WORDLIST) if w]


@app.get("/api/messages", response_model=list[MessageSummary])
def list_messages() -> list[MessageSummary]:
    """Archive listing. Keys and plaintexts are withheld until explicitly revealed."""
    return [
        MessageSummary(
            id=m["id"], title=m["title"], ciphertext=m["ciphertext"],
            length=m["length"], key_length=m["key_length"],
            case=m["case"], featured=m["featured"],
        )
        for m in MESSAGES
    ]


@app.get("/api/messages/{message_id}/reveal", response_model=RevealResponse)
def reveal_message(message_id: str) -> RevealResponse:
    m = MESSAGES_BY_ID.get(message_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return RevealResponse(id=m["id"], key=m["key"], plaintext=m["plaintext"])


@app.post("/api/encrypt", response_model=EncryptResponse)
def encrypt_message(req: EncryptRequest) -> EncryptResponse:
    if not req.key.strip():
        raise HTTPException(status_code=400, detail="Key must not be empty")
    try:
        ciphertext = encrypt(req.plaintext, req.key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    from .cipher import normalize_text
    return EncryptResponse(ciphertext=ciphertext, normalized_plaintext=normalize_text(req.plaintext))


@app.post("/api/decrypt", response_model=DecryptResponse)
def decrypt_message(req: DecryptRequest) -> DecryptResponse:
    try:
        plaintext = decrypt(req.ciphertext, req.key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return DecryptResponse(plaintext=plaintext)


def _sse_format(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def _clamp_max_key_length(value: int | None) -> int:
    if value is None:
        return BF_DEFAULT_MAX_LEN
    return max(1, min(value, BF_HARD_MAX_LEN))


@app.post("/api/crack/stream/{algorithm}")
def crack_stream(algorithm: str, req: CrackRequest) -> StreamingResponse:
    if not req.ciphertext.strip():
        raise HTTPException(status_code=400, detail="ciphertext must not be empty")

    lang = req.lang if req.lang in ("en", "ro") else "en"

    if algorithm == "brute-force":
        max_len = _clamp_max_key_length(req.max_key_length)
        generator = run_brute_force(req.ciphertext, max_key_length=max_len, lang=lang)
    elif algorithm == "dictionary":
        generator = run_dictionary_attack(req.ciphertext, WORDLIST, lang=lang)
    elif algorithm == "frequency":
        generator = run_frequency_analysis(req.ciphertext, lang=lang)
    else:
        raise HTTPException(status_code=404, detail=f"Unknown algorithm '{algorithm}'")

    truth = _resolve_true_key(req.message_id, req.true_key)

    def event_stream():
        for event in generator:
            if event["type"] == "result":
                # the UI's verdict: checked against the true key when it is known, never shown before reveal
                event["correct"] = _correct(event["recovered_key"], truth)
            yield _sse_format(event)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _run_to_completion(generator) -> dict:
    result = None
    for event in generator:
        if event["type"] == "result":
            result = event
    return result


def _archive_events(max_key_length: int, repeats: int):
    """
    Runs all three algorithms `repeats` times on every archive message,
    yielding events so the client can show real progress:

      start    {total, messages, repeats}
      progress {done, total, message_index, message_title, algorithm, repeat}  (before each run)
      message  {done, total, result: ArchiveMessageResult}                     (after each message)
      done     {done, total}
      error    {detail}

    The algorithms are deterministic, so key/plaintext/attempts are identical
    across repeats; only wall-clock time varies, and at the ~1 ms scale a
    single sample is mostly noise. Each result reports the mean and
    (population) standard deviation of elapsed time.
    """
    algorithms = (
        ("brute-force", lambda c: run_brute_force(c, max_key_length=max_key_length)),
        ("dictionary", lambda c: run_dictionary_attack(c, WORDLIST)),
        ("frequency", lambda c: run_frequency_analysis(c)),
    )
    total = len(MESSAGES) * len(algorithms) * repeats
    done = 0
    yield {"type": "start", "total": total, "messages": len(MESSAGES), "repeats": repeats}

    try:
        for index, m in enumerate(MESSAGES):
            results = []
            for algo_id, make in algorithms:
                samples = []
                for rep in range(1, repeats + 1):
                    yield {
                        "type": "progress", "done": done, "total": total,
                        "message_index": index, "message_title": m["title"],
                        "algorithm": algo_id, "repeat": rep,
                    }
                    samples.append(_run_to_completion(make(m["ciphertext"])))
                    done += 1
                times = [s["elapsed_ms"] for s in samples]
                r = samples[-1]
                results.append(AlgorithmResult(
                    algorithm=r["algorithm"], success=r["success"],
                    elapsed_ms=mean(times), elapsed_std_ms=pstdev(times) if len(times) > 1 else 0.0,
                    repeats=repeats, attempts=r["attempts"], recovered_key=r["recovered_key"],
                    recovered_plaintext=r["recovered_plaintext"], best_score=r["best_score"],
                ))
            message_result = ArchiveMessageResult(id=m["id"], title=m["title"], true_key=m["key"], results=results)
            yield {"type": "message", "done": done, "total": total, "result": message_result.model_dump()}
    except Exception as exc:  # surfaced to the UI instead of silently dropping the stream
        yield {"type": "error", "detail": f"{type(exc).__name__}: {exc}"}
        return

    yield {"type": "done", "done": done, "total": total}


# The archive and the options are fixed, so a finished run is the same for every visitor. Cache its events and replay them
# (the timings in a replay are the measured samples of the first run, flagged by `cached` on the start event).
# shortcut: in-memory per process (lost on restart/redeploy), bounded by cap x repeats. One lock: simultaneous first runs
# wait for the first to finish (8 cold clients took 35 s each when every one computed), so the first run does not stream live progress.
_ARCHIVE_CACHE: dict[tuple[int, int], list[dict]] = {}
_ARCHIVE_LOCK = threading.Lock()


def _archive_events_cached(max_key_length: int, repeats: int):
    key = (max_key_length, repeats)
    with _ARCHIVE_LOCK:
        events = _ARCHIVE_CACHE.get(key)
        fresh = events is None
        if fresh:
            events = list(_archive_events(max_key_length, repeats))
            if events[-1]["type"] == "done":  # an error is shown to this client only, never cached
                _ARCHIVE_CACHE[key] = events
    yield events[0] if fresh else {**events[0], "cached": True}
    yield from events[1:]


@app.on_event("startup")
def _prewarm_archive() -> None:
    # the options the UI sends by default (cap 4, ArchiveMode REPEATS = 3), so the first visitor's click is already a replay
    threading.Thread(target=lambda: list(_archive_events_cached(BF_DEFAULT_MAX_LEN, 3)), daemon=True).start()


@app.post("/api/archive/stream")
def stream_archive(req: ArchiveRunRequest) -> StreamingResponse:
    """Run all 3 algorithms against every archive message, streaming progress as SSE."""
    max_len = _clamp_max_key_length(req.max_key_length)
    events = _archive_events_cached(max_len, req.repeats)
    return StreamingResponse((_sse_format(e) for e in events), media_type="text/event-stream")


# ---------- Scaling experiments (the "analysis" part of an algorithms course) ----------

def _resolve_true_key(message_id: str | None, true_key: str | None) -> str | None:
    if message_id and message_id in MESSAGES_BY_ID:
        return MESSAGES_BY_ID[message_id]["key"]
    if true_key:
        from .cipher import normalize_key
        return normalize_key(true_key) or None
    return None


def _correct(recovered: str, truth: str | None) -> bool | None:
    return None if truth is None else recovered == truth


def _key_length_experiment_sync(ciphertext: str, max_key_length: int, truth: str | None) -> list[KeyLengthPoint]:
    """Brute force with the cap at 1, 2, ..., max: makes the 26^L growth visible."""
    points = []
    for cap in range(1, max_key_length + 1):
        r = _run_to_completion(run_brute_force(ciphertext, max_key_length=cap))
        points.append(KeyLengthPoint(
            max_key_length=cap, attempts=r["attempts"], elapsed_ms=r["elapsed_ms"],
            success=r["success"], correct=_correct(r["recovered_key"], truth),
            recovered_key=r["recovered_key"],
        ))
    return points


@app.post("/api/experiments/key-length", response_model=KeyLengthExperimentResponse)
async def key_length_experiment(req: KeyLengthExperimentRequest) -> KeyLengthExperimentResponse:
    if not req.ciphertext.strip():
        raise HTTPException(status_code=400, detail="ciphertext must not be empty")
    truth = _resolve_true_key(req.message_id, req.true_key)
    points = await run_in_threadpool(_key_length_experiment_sync, req.ciphertext, req.max_key_length, truth)
    return KeyLengthExperimentResponse(points=points, true_key_length=len(truth) if truth else None)


_TEXT_LENGTH_STEPS = [40, 60, 80, 100, 130, 160, 200, 260, 320, 400, 500, 650, 800, 1000, 1300]


def _truncate_to_letters(ciphertext: str, n_letters: int) -> str:
    """Keep the prefix containing the first n letters (whitespace preserved)."""
    out, seen = [], 0
    for ch in ciphertext:
        if ch.isalpha():
            if seen >= n_letters:
                break
            seen += 1
        out.append(ch)
    return "".join(out)


def _text_length_experiment_sync(ciphertext: str, truth: str | None) -> tuple[list[TextLengthPoint], int]:
    """Frequency analysis on growing prefixes: shows how much ciphertext it needs."""
    total = sum(1 for ch in ciphertext if ch.isalpha())
    sizes = sorted({n for n in _TEXT_LENGTH_STEPS if n < total} | {total})
    points = []
    for n in sizes:
        r = _run_to_completion(run_frequency_analysis(_truncate_to_letters(ciphertext, n)))
        points.append(TextLengthPoint(
            letters=n, success=r["success"], correct=_correct(r["recovered_key"], truth),
            estimated_key_length=r["estimated_key_length"], recovered_key=r["recovered_key"],
            steps=r["attempts"], elapsed_ms=r["elapsed_ms"],
        ))
    return points, total


@app.post("/api/experiments/text-length", response_model=TextLengthExperimentResponse)
async def text_length_experiment(req: TextLengthExperimentRequest) -> TextLengthExperimentResponse:
    if not req.ciphertext.strip():
        raise HTTPException(status_code=400, detail="ciphertext must not be empty")
    truth = _resolve_true_key(req.message_id, req.true_key)
    points, total = await run_in_threadpool(_text_length_experiment_sync, req.ciphertext, truth)
    return TextLengthExperimentResponse(points=points, total_letters=total, true_key_length=len(truth) if truth else None)
