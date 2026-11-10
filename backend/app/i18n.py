"""
Bilingual (EN/RO) progress-message templates for the SSE cracking streams.

Kept separate from the cracking algorithms themselves so the actual
algorithm logic isn't cluttered with language branches — each cracking
module just calls one of these builders and forwards the caller's `lang`.
"""

from __future__ import annotations


def brute_force_trying(lang: str, key: str, length: int, attempts: int) -> str:
    if lang == "ro":
        return f"Se încearcă cheia '{key}' (lungime {length})... încercarea {attempts:,}"
    return f"Trying key '{key}' (length {length})... attempt {attempts:,}"


def brute_force_length_done(lang: str, length: int, total: int, best_key: str, best_score: float) -> str:
    if lang == "ro":
        return (f"S-au încercat toate cele {total:,} chei de lungime {length}. "
                f"Cea mai bună până acum: '{best_key}' (scor {best_score:.1f})")
    return (f"Finished all {total:,} keys of length {length}. "
            f"Best so far: '{best_key}' (score {best_score:.1f})")


def dictionary_trying(lang: str, key: str, idx: int, total: int) -> str:
    if lang == "ro":
        return f"Se încearcă cuvântul '{key}' ca cheie... cuvântul {idx:,}/{total:,}"
    return f"Trying word '{key}' as key... word {idx:,}/{total:,}"


def frequency_kasiski_start(lang: str) -> str:
    if lang == "ro":
        return "Se rulează examinarea Kasiski: se caută secvențe repetate de 3 litere..."
    return "Running Kasiski examination: scanning for repeated 3-letter sequences..."


def frequency_kasiski_done(lang: str, repeats_found: int, top_factors: str, best_length: int) -> str:
    if lang == "ro":
        return (f"S-au găsit {repeats_found} secvențe repetate. Cele mai probabile lungimi de "
                f"cheie (vot Kasiski): {top_factors}. Lungime estimată = {best_length}.")
    return (f"Found {repeats_found} repeated sequences. Top candidate key lengths by Kasiski "
            f"vote: {top_factors}. Estimated key length = {best_length}.")


def frequency_columns_start(lang: str, length: int) -> str:
    if lang == "ro":
        return f"Se rulează analiza de frecvență (chi-pătrat) pe {length} coloană(e)..."
    return f"Running per-column chi-squared frequency analysis for {length} column(s)..."
