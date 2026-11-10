"""
Algorithm 2: Dictionary attack.

Tries every entry in a wordlist as the Vigenere key (real intercepted
traffic is often keyed with a memorable word/phrase rather than random
letters). Each candidate key is scored the same way as brute force
(chi-squared against English letter frequencies); the lowest-scoring
word wins.

Unlike brute_force.py, there is no combinatorial search to optimize away:
we genuinely decrypt the ciphertext once per wordlist entry. Wordlists are
small (hundreds of entries) so this is cheap, and it is a legitimate
independent algorithm — a word may be recovered here even when its length
exceeds the brute-force cap.
"""

from __future__ import annotations

import time
from typing import Iterator

from .. import i18n
from ..cipher import decrypt, extract_letters, normalize_key
from ..scoring import chi_squared, is_plausible_english


def run_dictionary_attack(ciphertext: str, wordlist: list[str],
                           progress_every: int = 10, lang: str = "en") -> Iterator[dict]:
    """
    Generator yielding progress events and a final result event.

    Result event: {"type": "result", "algorithm": "dictionary", "success": bool,
                    "elapsed_ms": float, "attempts": int, "recovered_key": str,
                    "recovered_plaintext": str, "best_score": float}
    """
    start = time.perf_counter()

    best_score = float("inf")
    best_key = ""
    best_plaintext = ""
    words_tried = 0

    candidates = [normalize_key(w) for w in wordlist]
    candidates = [w for w in candidates if w]

    for idx, key in enumerate(candidates, start=1):
        candidate_plaintext = decrypt(ciphertext, key)
        score = chi_squared(candidate_plaintext)
        words_tried += 1

        if score < best_score:
            best_score = score
            best_key = key
            best_plaintext = candidate_plaintext

        if idx % progress_every == 0:
            yield {
                "type": "progress",
                "message": i18n.dictionary_trying(lang, key, idx, len(candidates)),
                "attempts": words_tried,
                "total": len(candidates),
                "candidate_key": best_key,
            }

    elapsed_ms = (time.perf_counter() - start) * 1000.0

    yield {
        "type": "result",
        "algorithm": "dictionary",
        "success": is_plausible_english(best_score, len(extract_letters(ciphertext))) if best_key else False,
        "elapsed_ms": elapsed_ms,
        "attempts": words_tried,
        "recovered_key": best_key,
        "recovered_plaintext": best_plaintext,
        "best_score": best_score,
        "wordlist_size": len(candidates),
    }
