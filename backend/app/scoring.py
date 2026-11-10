"""
English-likeness scoring via a chi-squared goodness-of-fit test against
standard English letter frequencies. Used by all three cracking algorithms
to judge whether a candidate decryption "looks like English" without
knowing the real plaintext.

Lower chi-squared score = closer to English letter-frequency distribution.
"""

from __future__ import annotations

from collections import Counter

# Standard English letter frequencies (percent), source: classic corpus
# statistics (e.g. Cornell/Practical Cryptography reference tables).
ENGLISH_FREQ_PERCENT = {
    "A": 8.167, "B": 1.492, "C": 2.782, "D": 4.253, "E": 12.702,
    "F": 2.228, "G": 2.015, "H": 6.094, "I": 6.966, "J": 0.153,
    "K": 0.772, "L": 4.025, "M": 2.406, "N": 6.749, "O": 7.507,
    "P": 1.929, "Q": 0.095, "R": 5.987, "S": 6.327, "T": 9.056,
    "U": 2.758, "V": 0.978, "W": 2.360, "X": 0.150, "Y": 1.974,
    "Z": 0.074,
}

_LETTERS = [chr(ord("A") + i) for i in range(26)]
_EXPECTED_FRACTION = [ENGLISH_FREQ_PERCENT[ch] / 100.0 for ch in _LETTERS]

# Success criterion: chi-squared PER LETTER. The raw chi-squared statistic
# grows with the amount of text (a systematically wrong distribution
# accumulates error on every letter), so an absolute threshold would pass
# garbage on short text and could reject English on very long text.
# Calibrated on the fixture messages at prefix lengths 30..400 letters:
#   true-key decryptions:  max 1.13 per letter at >=40 letters (0.08 at 400)
#   wrong-key decryptions: min 1.46 per letter, mean 7-12
# 1.2 sits in the gap. Below ~30 letters the statistic is too noisy either way.
SUCCESS_CHI_SQUARED_PER_LETTER = 1.2
MIN_LETTERS_FOR_VERDICT = 20


def letter_counts(text: str) -> list[int]:
    """Counts of A..Z (index 0..25) in text, ignoring non-letters and case."""
    counts = Counter(ch for ch in text.upper() if "A" <= ch <= "Z")
    return [counts.get(ch, 0) for ch in _LETTERS]


def chi_squared_from_counts(counts: list[int]) -> float:
    """Chi-squared statistic comparing observed letter counts to expected English frequencies."""
    total = sum(counts)
    if total == 0:
        return float("inf")
    score = 0.0
    for observed, fraction in zip(counts, _EXPECTED_FRACTION):
        expected = fraction * total
        if expected == 0:
            continue
        score += (observed - expected) ** 2 / expected
    return score


def chi_squared(text: str) -> float:
    """Chi-squared "Englishness" score for a piece of text (letters only considered)."""
    return chi_squared_from_counts(letter_counts(text))


def is_plausible_english(score: float, n_letters: int) -> bool:
    if n_letters < MIN_LETTERS_FOR_VERDICT:
        return False
    return score / n_letters <= SUCCESS_CHI_SQUARED_PER_LETTER
