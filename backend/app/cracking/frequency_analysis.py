"""
Algorithm 3: Kasiski examination + per-column frequency analysis.

Unlike brute force (enumerate all keys) or dictionary attack (enumerate
all words), this algorithm derives the key directly:

  Step A — Kasiski examination: find repeated 3-letter sequences in the
  ciphertext. If the same plaintext sequence appears twice under the
  Vigenere key, the distance between the two occurrences is (with high
  probability) a multiple of the key length. Tallying the factors of all
  such distances produces a strong candidate key length. As a fallback
  (or tie-break) we also compute the Index of Coincidence (IC) for every
  candidate length 1..max_key_length; English text splits into columns
  with IC close to ~0.067, while wrong-length columns look closer to
  random (~0.038).

  Step B — Per-column frequency analysis: once the key length L is fixed,
  ciphertext letters at positions i, i+L, i+2L, ... were all shifted by
  the *same* key letter. Each such column is effectively single-letter
  (Caesar) ciphertext, so we can pick the shift that makes that column's
  letter histogram best match English frequencies — independently and
  directly per column, with no combinatorial search over full keys.

This is what makes frequency analysis fundamentally different (and far
cheaper) than brute_force.py: it recovers each key character in O(26)
per column instead of trying every combination of key characters.
"""

from __future__ import annotations

import time
from collections import Counter
from typing import Iterator

from .. import i18n
from ..cipher import decrypt, extract_letters
from ..scoring import chi_squared_from_counts, chi_squared, is_plausible_english

DEFAULT_MAX_KEY_LENGTH_GUESS = 12
_SEQ_LEN = 3
_ENGLISH_IC = 0.0667
_RANDOM_IC = 1.0 / 26.0
# A column's average Index of Coincidence at or above this is treated as
# "genuinely single-shifted English", i.e. periodic at that length. Chosen
# roughly halfway between the random baseline (~0.038) and English (~0.067):
# empirically, columns split at a length that only *divides* the true key
# length (a mix of a few different shifts) land around 0.05-0.055, while the
# true key length (and its multiples, which inherit the same periodicity)
# land at 0.06+. Taking the smallest length that clears this bar picks the
# true key length rather than one of its multiples.
_IC_PERIODIC_THRESHOLD = 0.056
_FIT_TOLERANCE = 2.0
_A = ord("A")


def _find_repeated_sequences(letters: str, seq_len: int = _SEQ_LEN) -> dict[str, list[int]]:
    positions: dict[str, list[int]] = {}
    for i in range(len(letters) - seq_len + 1):
        seg = letters[i:i + seq_len]
        positions.setdefault(seg, []).append(i)
    return {seg: pos for seg, pos in positions.items() if len(pos) > 1}


def _pairwise_distances(repeats: dict[str, list[int]]) -> list[int]:
    distances = []
    for positions in repeats.values():
        for a in range(len(positions)):
            for b in range(a + 1, len(positions)):
                distances.append(positions[b] - positions[a])
    return distances


def _factor_tally(distances: list[int], max_key_length: int) -> Counter:
    tally: Counter = Counter()
    for d in distances:
        if d <= 0:
            continue
        for factor in range(2, max_key_length + 1):
            if d % factor == 0:
                tally[factor] += 1
    return tally


def _index_of_coincidence(text: str) -> float:
    n = len(text)
    if n <= 1:
        return 0.0
    counts = Counter(text)
    numerator = sum(c * (c - 1) for c in counts.values())
    return numerator / (n * (n - 1))


def _estimate_key_length(letters: str, max_key_length: int) -> tuple[int, Counter, dict[int, float], int, int]:
    """
    Returns (best_length, factor_tally, ic_by_length, repeats_found, steps).

    Kasiski's repeated-sequence distances give *candidate* factors (the
    true key length must divide most of them), but raw factor tallies are
    biased toward small numbers (2 and 3 divide many integers by pure
    chance) and cannot distinguish the true key length from one of its
    multiples (a length that is a multiple of the true key length is
    "accidentally" periodic too, since it inherits the same repeating
    pattern). Index of Coincidence resolves that ambiguity: we scan
    candidate lengths in ascending order and take the *smallest* one whose
    average column IC looks like single-shifted English rather than a
    blend of several shifts or noise, then break ties by how well each
    candidate's decryption fits English.
    """
    steps = 0
    repeats = _find_repeated_sequences(letters)
    steps += max(0, len(letters) - _SEQ_LEN + 1)

    distances = _pairwise_distances(repeats)
    tally = _factor_tally(distances, max_key_length)
    steps += len(distances) * max_key_length

    ic_by_length: dict[int, float] = {}
    for length in range(1, max_key_length + 1):
        columns = [letters[i::length] for i in range(length)]
        avg_ic = sum(_index_of_coincidence(col) for col in columns) / length
        ic_by_length[length] = avg_ic
        steps += length

    periodic_lengths = [
        length for length in range(2, max_key_length + 1)
        if ic_by_length[length] >= _IC_PERIODIC_THRESHOLD
    ]

    if tally:
        fallback = tally.most_common(1)[0][0]
    else:
        fallback = max(range(2, max_key_length + 1), key=lambda length: ic_by_length[length])

    # On short text a length that only divides the true one can clear the IC bar
    # by chance (FORT, 92 letters: IC 0.0560 at length 2). Its decryption fits
    # English clearly worse than the true length's, while multiples of the true
    # length fit about as well, so take the smallest candidate whose decryption
    # is within a factor of the best fit. 2 was the best factor on the fixtures
    # at every prefix length from 40 letters up.
    candidates = sorted(set(periodic_lengths) | {fallback})
    fits = {}
    for length in candidates:
        key, key_steps = _recover_key(letters, length)
        fits[length] = _decrypted_chi_squared(letters, key)
        steps += key_steps
    best_fit = min(fits.values())
    best_length = next(length for length in candidates if fits[length] <= best_fit * _FIT_TOLERANCE)

    return best_length, tally, ic_by_length, len(repeats), steps


def _decrypted_chi_squared(letters: str, key: str) -> float:
    counts = [0] * 26
    for i, ch in enumerate(letters):
        counts[(ord(ch) - ord(key[i % len(key)])) % 26] += 1
    return chi_squared_from_counts(counts)


def _recover_column(letters: str, length: int, col_idx: int) -> tuple[str, int]:
    """Best Caesar shift (as a key letter) for one column. Returns (letter, steps)."""
    raw_counts = [0] * 26
    for ch in letters[col_idx::length]:
        raw_counts[ord(ch) - _A] += 1

    best_shift = 0
    best_score = float("inf")
    for shift in range(26):
        decrypted_counts = [raw_counts[(i + shift) % 26] for i in range(26)]
        score = chi_squared_from_counts(decrypted_counts)
        if score < best_score:
            best_score = score
            best_shift = shift
    return chr(_A + best_shift), 26


def _recover_key(letters: str, length: int) -> tuple[str, int]:
    """Directly recover each key letter, one column at a time. Returns (key, steps)."""
    cols = [_recover_column(letters, length, i) for i in range(length)]
    return "".join(c for c, _ in cols), sum(n for _, n in cols)


def run_frequency_analysis(ciphertext: str,
                            max_key_length_guess: int = DEFAULT_MAX_KEY_LENGTH_GUESS,
                            lang: str = "en") -> Iterator[dict]:
    """
    Generator yielding progress events and a final result event.

    Result event: {"type": "result", "algorithm": "frequency", "success": bool,
                    "elapsed_ms": float, "attempts": int (== computation steps),
                    "recovered_key": str, "recovered_plaintext": str,
                    "best_score": float, "estimated_key_length": int}
    """
    start = time.perf_counter()
    letters = extract_letters(ciphertext)

    if len(letters) < _SEQ_LEN * 2:
        yield {
            "type": "result", "algorithm": "frequency", "success": False,
            "elapsed_ms": 0.0, "attempts": 0, "recovered_key": "",
            "recovered_plaintext": "", "best_score": float("inf"),
            "estimated_key_length": 0,
        }
        return

    yield {
        "type": "progress",
        "message": i18n.frequency_kasiski_start(lang),
        "attempts": 0,
    }

    best_length, tally, ic_by_length, repeats_found, steps_a = _estimate_key_length(
        letters, max_key_length_guess
    )

    top_factors = ", ".join(f"{length}({votes})" for length, votes in tally.most_common(3)) or "none"
    yield {
        "type": "progress",
        "message": i18n.frequency_kasiski_done(lang, repeats_found, top_factors, best_length),
        "attempts": steps_a,
    }

    yield {
        "type": "progress",
        "message": i18n.frequency_columns_start(lang, best_length),
        "attempts": steps_a,
        "key_length": best_length,
        "partial_key": "",
    }

    # One event per column so the UI can fill the key in letter by letter.
    recovered_key, steps_b = "", 0
    for col_idx in range(best_length):
        letter, n = _recover_column(letters, best_length, col_idx)
        recovered_key += letter
        steps_b += n
        yield {
            "type": "progress",
            "message": i18n.frequency_columns_start(lang, best_length),
            "attempts": steps_a + steps_b,
            "key_length": best_length,
            "partial_key": recovered_key,
        }
    total_steps = steps_a + steps_b

    recovered_plaintext = decrypt(ciphertext, recovered_key)
    score = chi_squared(recovered_plaintext)

    elapsed_ms = (time.perf_counter() - start) * 1000.0

    yield {
        "type": "result",
        "algorithm": "frequency",
        "success": is_plausible_english(score, len(letters)),
        "elapsed_ms": elapsed_ms,
        "attempts": total_steps,
        "recovered_key": recovered_key,
        "recovered_plaintext": recovered_plaintext,
        "best_score": score,
        "estimated_key_length": best_length,
    }
