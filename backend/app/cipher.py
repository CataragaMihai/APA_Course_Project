"""
Vigenere cipher — the ONLY cipher implemented in this project.

Presentation note: the app is themed as a "WWII intercepted transmission"
exercise, but the underlying algorithm is a classic polyalphabetic
Vigenere cipher, not a rotor machine / Enigma simulation. The historical
framing is UI decoration only; the academic content is Vigenere
encryption/decryption plus classical ciphertext-only cryptanalysis.

Normalization convention (documented, applied consistently everywhere):
- Text is uppercased and accented letters are reduced to their base letter
  (Romanian Ș -> S, Â -> A), so a Romanian message keeps all its letters.
- Only letters (A-Z) and whitespace are kept; all other punctuation is
  stripped. Whitespace is preserved verbatim in the output so ciphertext
  stays readable, but whitespace characters do NOT consume a position in
  the running key (only letters advance the key index). This means
  decrypting with the correct key exactly reconstructs the spacing of the
  normalized plaintext.
- The key is normalized the same way (uppercased, letters only) before use.
"""

from __future__ import annotations

import re
import unicodedata

_ALPHABET_SIZE = 26
_A = ord("A")

# Keep letters and whitespace, drop everything else (punctuation, digits, etc).
_KEEP_RE = re.compile(r"[^A-Z\s]")


def _fold(text: str) -> str:
    """Uppercase and split accented letters into base letter + combining mark (dropped later)."""
    return unicodedata.normalize("NFKD", text.upper())


def normalize_text(text: str) -> str:
    """Uppercase and strip everything except letters and whitespace."""
    return _KEEP_RE.sub("", _fold(text))


def normalize_key(key: str) -> str:
    """Uppercase and strip everything except letters (no whitespace allowed in a key)."""
    return re.sub(r"[^A-Z]", "", _fold(key))


def extract_letters(text: str) -> str:
    """Return only the A-Z letters of a (typically already-normalized) string, in order."""
    return re.sub(r"[^A-Z]", "", _fold(text))


def _shift_letters(text: str, key: str, direction: int) -> str:
    """
    Shared core for encrypt/decrypt.

    direction = +1 for encryption, -1 for decryption. Whitespace passes
    through unchanged and does not advance the key index.
    """
    norm_key = normalize_key(key)
    if not norm_key:
        raise ValueError("Key must contain at least one letter (A-Z).")

    out_chars = []
    key_idx = 0
    key_len = len(norm_key)

    for ch in normalize_text(text):
        if ch.isspace():
            out_chars.append(ch)
            continue
        p = ord(ch) - _A
        k = ord(norm_key[key_idx % key_len]) - _A
        c = (p + direction * k) % _ALPHABET_SIZE
        out_chars.append(chr(c + _A))
        key_idx += 1

    return "".join(out_chars)


def encrypt(plaintext: str, key: str) -> str:
    """Vigenere-encrypt plaintext with the given key. See module docstring for normalization rules."""
    return _shift_letters(plaintext, key, +1)


def decrypt(ciphertext: str, key: str) -> str:
    """Vigenere-decrypt ciphertext with the given key. See module docstring for normalization rules."""
    return _shift_letters(ciphertext, key, -1)
