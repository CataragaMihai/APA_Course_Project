"""Pydantic request/response models for the FastAPI endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field

# The backend is public; this bounds the work one request can cause
# (the longest archive message is ~1.9k characters).
MAX_TEXT = 20_000
MAX_KEY = 100


class MessageSummary(BaseModel):
    id: str
    title: str
    ciphertext: str
    length: int
    key_length: int  # disclosed as a "difficulty" hint; the key itself is not
    case: str        # what this message is a test case for (see generate_data.FEATURED_CASES)
    featured: bool


class RevealResponse(BaseModel):
    id: str
    key: str
    plaintext: str


class EncryptRequest(BaseModel):
    plaintext: str = Field(max_length=MAX_TEXT)
    key: str = Field(max_length=MAX_KEY)


class EncryptResponse(BaseModel):
    ciphertext: str
    normalized_plaintext: str


class DecryptRequest(BaseModel):
    ciphertext: str = Field(max_length=MAX_TEXT)
    key: str = Field(max_length=MAX_KEY)


class DecryptResponse(BaseModel):
    plaintext: str


class CrackRequest(BaseModel):
    ciphertext: str = Field(max_length=MAX_TEXT)
    max_key_length: int | None = Field(default=None, description="Brute force / Kasiski search cap override")
    lang: str = Field(default="en", description="Language for live progress messages: 'en' or 'ro'")
    # ground truth for the verdict: an archive message id, or the key of a custom message
    message_id: str | None = None
    true_key: str | None = Field(default=None, max_length=MAX_KEY)


class ArchiveRunRequest(BaseModel):
    max_key_length: int | None = None
    repeats: int = Field(default=3, ge=1, le=10, description="Timing samples per algorithm per message")


class AlgorithmResult(BaseModel):
    algorithm: str
    success: bool
    elapsed_ms: float          # mean over `repeats` samples when repeats > 1
    elapsed_std_ms: float = 0.0
    repeats: int = 1
    attempts: int
    recovered_key: str
    recovered_plaintext: str
    best_score: float


class ExperimentRequestBase(BaseModel):
    ciphertext: str = Field(max_length=MAX_TEXT)
    # Ground truth, if known: an archive message id (server looks up its key)
    # or the key the user encrypted a custom message with. Lets the experiment
    # report `correct` alongside the algorithm's own `success` verdict.
    message_id: str | None = None
    true_key: str | None = Field(default=None, max_length=MAX_KEY)


class KeyLengthExperimentRequest(ExperimentRequestBase):
    max_key_length: int = Field(default=5, ge=1, le=5)


class KeyLengthPoint(BaseModel):
    max_key_length: int
    attempts: int          # keys actually tried = sum(26^k, k=1..L)
    elapsed_ms: float
    success: bool          # the algorithm's own statistical verdict
    correct: bool | None   # ground truth when known, else None
    recovered_key: str


class KeyLengthExperimentResponse(BaseModel):
    points: list[KeyLengthPoint]
    true_key_length: int | None


class TextLengthExperimentRequest(ExperimentRequestBase):
    pass


class TextLengthPoint(BaseModel):
    letters: int
    success: bool
    correct: bool | None
    estimated_key_length: int
    recovered_key: str
    steps: int
    elapsed_ms: float


class TextLengthExperimentResponse(BaseModel):
    points: list[TextLengthPoint]
    total_letters: int
    true_key_length: int | None


class ArchiveMessageResult(BaseModel):
    id: str
    title: str
    true_key: str
    results: list[AlgorithmResult]
