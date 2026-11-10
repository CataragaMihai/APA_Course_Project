"""
Algorithm 1: Brute force key search.

Tries every possible key made of A-Z letters, up to a capped length, and
scores each candidate's decryption with the chi-squared English-likeness
test from scoring.py. The lowest-scoring key wins.

Naive brute force would decrypt the *entire* ciphertext for every one of
the 26^1 + 26^2 + ... + 26^L candidate keys, which is wasteful: for a key
of length L, position i of the plaintext only depends on
ciphertext[i] and key[i % L]. So the chi-squared contribution of each of
the L "columns" (positions sharing the same key letter) is independent of
the other columns. We therefore:

  1. Split the ciphertext letters into L columns (one per key position).
  2. For each column, precompute the chi-squared score for all 26 possible
     Caesar shifts (this is just the column's own letter-count histogram
     rotated by the shift).
  3. The score for a *full* key of length L is simply the sum of the
     per-column scores for that key's letters — no need to touch the
     ciphertext text itself while searching.

This keeps brute force honest (it still logically enumerates every key
and reports how many it "tried") while remaining fast enough to run
in a browser-triggered request. The key-length cap (default 4, hard max 5)
is what actually bounds the search — this is disclosed in the UI/metrics
so students see *why* brute force doesn't scale to longer keys, in
contrast to the frequency-analysis approach in frequency_analysis.py.
"""

from __future__ import annotations

import itertools
import time
from typing import Iterator

from .. import i18n
from ..cipher import decrypt, extract_letters
from ..scoring import chi_squared_from_counts, is_plausible_english
from .frequency_analysis import DEFAULT_MAX_KEY_LENGTH_GUESS, _estimate_key_length

DEFAULT_MAX_KEY_LENGTH = 4
HARD_MAX_KEY_LENGTH = 5
_A = ord("A")


def _column_shift_scores(column_text: str) -> list[float]:
    """
    For one column of ciphertext letters, return a list of 26 chi-squared
    scores — one per hypothetical key letter (shift 0='A' .. 25='Z') that
    would have produced this column from English plaintext.
    """
    raw_counts = [0] * 26
    for ch in column_text:
        raw_counts[ord(ch) - _A] += 1

    scores = []
    for shift in range(26):
        # Decrypting with key-letter `shift` maps ciphertext letter c -> (c - shift) mod 26.
        # Equivalently, the decrypted-letter histogram is raw_counts rotated by -shift,
        # i.e. decrypted_counts[i] = raw_counts[(i + shift) % 26].
        decrypted_counts = [raw_counts[(i + shift) % 26] for i in range(26)]
        scores.append(chi_squared_from_counts(decrypted_counts))
    return scores


def run_brute_force(ciphertext: str, max_key_length: int = DEFAULT_MAX_KEY_LENGTH,
                     progress_every: int = 25_000, lang: str = "en") -> Iterator[dict]:
    """
    Generator yielding progress events and a final result event.

    Progress events: {"type": "progress", "message": str, "attempts": int}
    Result event: {"type": "result", "algorithm": "brute_force", "success": bool,
                    "elapsed_ms": float, "attempts": int, "recovered_key": str,
                    "recovered_plaintext": str, "best_score": float,
                    "max_key_length": int, "estimated_key_length": int,
                    "key_exceeds_limit": bool}
    """
    max_key_length = max(1, min(max_key_length, HARD_MAX_KEY_LENGTH))
    letters = extract_letters(ciphertext)
    start = time.perf_counter()

    # Known up front, so progress can be reported as a real fraction.
    total_keys = sum(26 ** k for k in range(1, max_key_length + 1))
    total_attempts = 0
    best_score = float("inf")
    best_key = ""

    if not letters:
        yield {
            "type": "result", "algorithm": "brute_force", "success": False,
            "elapsed_ms": 0.0, "attempts": 0, "recovered_key": "",
            "recovered_plaintext": "", "best_score": float("inf"),
            "max_key_length": max_key_length, "estimated_key_length": 0, "key_exceeds_limit": False,
        }
        return

    for length in range(1, max_key_length + 1):
        columns = [letters[i::length] for i in range(length)]
        *prefix_scores, last_scores = [_column_shift_scores(col) for col in columns]

        combos_at_length = 26 ** length
        since_last_report = 0

        # Keys are enumerated as prefix + last letter: the prefix's partial score is
        # summed once, then all 26 keys sharing it are scored in one comprehension.
        # Same keys, same scores and same tie-breaking as one loop per key, ~7x faster.
        for prefix in itertools.product(range(26), repeat=length - 1):
            base = 0.0
            for col_idx, shift in enumerate(prefix):
                base += prefix_scores[col_idx][shift]
            scores = [base + s for s in last_scores]
            lowest = min(scores)

            total_attempts += 26
            since_last_report += 26

            if lowest < best_score:
                best_score = lowest
                best_key = "".join(chr(_A + s) for s in prefix) + chr(_A + scores.index(lowest))

            if since_last_report >= progress_every:
                since_last_report = 0
                trying = "".join(chr(_A + s) for s in prefix) + "Z"
                yield {
                    "type": "progress",
                    "message": i18n.brute_force_trying(lang, trying, length, total_attempts),
                    "attempts": total_attempts,
                    "total": total_keys,
                    "candidate_key": best_key,
                    "key_length": length,
                }

        yield {
            "type": "progress",
            "message": i18n.brute_force_length_done(lang, length, combos_at_length, best_key, best_score),
            "attempts": total_attempts,
            "total": total_keys,
            "candidate_key": best_key,
            "key_length": length,
        }

    elapsed_ms = (time.perf_counter() - start) * 1000.0
    recovered_plaintext = decrypt(ciphertext, best_key) if best_key else ""

    # A short key matching some columns of a longer one can pass the chi-squared
    # test (e.g. HAR for HARBOR), so the score alone can't be trusted when the
    # key-length estimate says the real key is longer than anything we tried.
    estimated_key_length = _estimate_key_length(letters, DEFAULT_MAX_KEY_LENGTH_GUESS)[0]
    key_exceeds_limit = estimated_key_length > max_key_length

    yield {
        "type": "result",
        "algorithm": "brute_force",
        "success": is_plausible_english(best_score, len(letters)) and not key_exceeds_limit,
        "elapsed_ms": elapsed_ms,
        "attempts": total_attempts,
        "recovered_key": best_key,
        "recovered_plaintext": recovered_plaintext,
        "best_score": best_score,
        "max_key_length": max_key_length,
        "estimated_key_length": estimated_key_length,
        "key_exceeds_limit": key_exceeds_limit,
    }
