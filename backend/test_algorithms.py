"""
Runs all three algorithms on every archive message and checks them against
the true keys. Run from backend/: `venv/bin/python test_algorithms.py`
(also collected by pytest if it is installed).
"""

from app.cipher import decrypt, encrypt
from app.cracking.brute_force import DEFAULT_MAX_KEY_LENGTH, run_brute_force
from app.cracking.dictionary_attack import run_dictionary_attack
from app.cracking.frequency_analysis import run_frequency_analysis
import asyncio
import json

from app.main import MESSAGES, WORDLIST, _correct, _run_to_completion, crack_stream
from app.models import CrackRequest

ALGORITHMS = {
    "brute_force": lambda c: run_brute_force(c),
    "dictionary": lambda c: run_dictionary_attack(c, WORDLIST),
    "frequency": lambda c: run_frequency_analysis(c),
}
# XQZVKP is a random key on purpose: no dictionary word can match it.
DICTIONARY_MISSES = {"XQZVKP"}


def _results():
    for m in MESSAGES:
        for name, run in ALGORITHMS.items():
            r = _run_to_completion(run(m["ciphertext"]))
            yield m, name, r, _correct(r["recovered_key"], m["key"])


def test_algorithms():
    failures = []
    for m, name, r, correct in _results():
        print(f"{m['key']:<10} {name:<12} key={r['recovered_key']:<10} success={r['success']!s:<5} correct={correct}")
        # A statistical "success" must never be wrong.
        if r["success"] and not correct:
            failures.append(f"{name} false success on {m['key']}: {r['recovered_key']}")
        expected = {
            "brute_force": len(m["key"]) <= DEFAULT_MAX_KEY_LENGTH,
            "dictionary": m["key"] not in DICTIONARY_MISSES,
            "frequency": True,
        }[name]
        if expected and not (r["success"] and correct):
            failures.append(f"{name} should crack {m['key']}, got {r['recovered_key']} (success={r['success']})")
    assert not failures, "\n".join(failures)


def test_romanian_letters_survive():
    assert decrypt(encrypt("Mâine în zori, Ștefan!", "Țară"), "TARA") == "MAINE IN ZORI STEFAN"


def test_tiny_inputs_do_not_crash():
    for text in ("A", "AB C", "!!!", "QWERTYUIOPASDFGHJKLZ"):
        for run in ALGORITHMS.values():
            assert _run_to_completion(run(text))["success"] is False


def test_progress_key_ends_at_result_key():
    """The live key the UI shows (candidate_key / partial_key) must end on the real result."""
    for m in MESSAGES[:6]:
        for name, run in ALGORITHMS.items():
            events = list(run(m["ciphertext"]))
            live = [e.get("candidate_key", e.get("partial_key")) for e in events if e["type"] == "progress"]
            live = [k for k in live if k is not None]
            assert live, f"{name}: no live key in progress events"
            assert live[-1] == events[-1]["recovered_key"], f"{name} on {m['key']}: {live[-1]} != {events[-1]['recovered_key']}"


def _stream_result(algorithm: str, req: CrackRequest) -> dict:
    async def collect():
        return [c async for c in crack_stream(algorithm, req).body_iterator]
    chunks = asyncio.run(collect())
    text = "".join(c if isinstance(c, str) else c.decode() for c in chunks)
    events = [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]
    return events[-1]


def test_stream_verdict_uses_true_key():
    """The UI's verdict (`correct`) comes from the true key: archive id, custom key, or unknown."""
    m = MESSAGES[0]
    r = _stream_result("frequency", CrackRequest(ciphertext=m["ciphertext"], message_id=m["id"]))
    assert r["correct"] == (r["recovered_key"] == m["key"])
    wrong = _stream_result("frequency", CrackRequest(ciphertext=m["ciphertext"], true_key="ZZZZ"))
    assert wrong["correct"] is False
    unknown = _stream_result("frequency", CrackRequest(ciphertext=m["ciphertext"]))
    assert unknown["correct"] is None


def test_wordlist_matches_dictionary_attack():
    """GET /api/wordlist is exactly what the dictionary attack tries, in order (402 words)."""
    from app.main import wordlist
    words = wordlist()
    r = _run_to_completion(run_dictionary_attack(MESSAGES[0]["ciphertext"], WORDLIST))
    assert len(words) == r["attempts"] == r["wordlist_size"]
    assert r["recovered_key"] in words


def test_archive_replay_matches_first_run():
    """A second archive run is served from the cache: same events, flagged `cached`, and no recomputation."""
    from app.main import _ARCHIVE_CACHE, _archive_events_cached
    _ARCHIVE_CACHE.clear()
    first = list(_archive_events_cached(2, 1))
    assert first[-1]["type"] == "done" and not first[0].get("cached")
    second = list(_archive_events_cached(2, 1))
    assert second[0]["cached"] is True and second[1:] == first[1:]
    assert [e["type"] for e in first].count("message") == len(MESSAGES)
    _ARCHIVE_CACHE.clear()


def test_simultaneous_first_runs_compute_once():
    """Several visitors clicking Run at once share one computation (the thundering herd made 8 clients wait 35 s each)."""
    import threading
    import app.main as m
    m._ARCHIVE_CACHE.clear()
    real, calls = m._archive_events, []
    m._archive_events = lambda *a: (calls.append(a), real(*a))[1]
    try:
        results = []
        ts = [threading.Thread(target=lambda: results.append(list(m._archive_events_cached(1, 1)))) for _ in range(4)]
        [t.start() for t in ts]
        [t.join() for t in ts]
    finally:
        m._archive_events = real
        m._ARCHIVE_CACHE.clear()
    assert len(calls) == 1 and len(results) == 4
    assert sum(1 for r in results if r[0].get("cached")) == 3  # one computed it, three replayed it
    assert all(r[1:] == results[0][1:] for r in results)


if __name__ == "__main__":
    test_algorithms()
    test_progress_key_ends_at_result_key()
    test_romanian_letters_survive()
    test_tiny_inputs_do_not_crash()
    test_stream_verdict_uses_true_key()
    test_wordlist_matches_dictionary_attack()
    test_archive_replay_matches_first_run()
    test_simultaneous_first_runs_compute_once()
    print(f"OK: {len(MESSAGES)} messages x {len(ALGORITHMS)} algorithms")
