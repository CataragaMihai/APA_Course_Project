// Shared types mirroring backend/app/models.py

export type MessageCase = "word-key" | "random-key" | "short" | "long" | "archive";

export interface MessageSummary {
  id: string;
  title: string;
  ciphertext: string;
  length: number;
  key_length: number;
  case: MessageCase;
  featured: boolean;
}

export interface RevealResponse {
  id: string;
  key: string;
  plaintext: string;
}

export interface EncryptResponse {
  ciphertext: string;
  normalized_plaintext: string;
}

export type AlgorithmId = "brute-force" | "dictionary" | "frequency";

export interface AlgorithmResult {
  algorithm: string;
  success: boolean;
  elapsed_ms: number;
  elapsed_std_ms?: number;
  repeats?: number;
  attempts: number;
  recovered_key: string;
  recovered_plaintext: string;
  best_score: number;
  // brute force only: the Kasiski/IoC key-length estimate exceeded the search cap
  key_exceeds_limit?: boolean;
  estimated_key_length?: number;
  max_key_length?: number;
  // the recovered key checked against the true key (null when no true key is known)
  correct?: boolean | null;
  [key: string]: unknown;
}

export interface ProgressStreamEvent {
  type: "progress";
  message: string;
  attempts: number;
  total?: number; // present when the search space is known up front
  candidate_key?: string; // brute force, dictionary: best key so far
  partial_key?: string; // frequency: key letters recovered so far
  key_length?: number; // length being searched (brute force) or estimated (frequency)
}

export interface ResultStreamEvent extends AlgorithmResult {
  type: "result";
}

export type CrackStreamEvent = ProgressStreamEvent | ResultStreamEvent;

export interface ArchiveMessageResult {
  id: string;
  title: string;
  true_key: string;
  results: AlgorithmResult[];
}

export type ArchiveStreamEvent =
  | { type: "start"; total: number; messages: number; repeats: number }
  | { type: "progress"; done: number; total: number; message_index: number; message_title: string; algorithm: AlgorithmId; repeat: number }
  | { type: "message"; done: number; total: number; result: ArchiveMessageResult }
  | { type: "done"; done: number; total: number }
  | { type: "error"; detail: string };

export interface AlgorithmRunState {
  status: "idle" | "running" | "done" | "error";
  progressMessage: string;
  attempts: number;
  total: number | null;
  liveKey: string; // candidate_key / partial_key from the latest progress event
  keyLength: number | null;
  result: AlgorithmResult | null;
  error?: string;
}

export interface KeyLengthPoint {
  max_key_length: number;
  attempts: number;
  elapsed_ms: number;
  success: boolean;
  correct: boolean | null;
  recovered_key: string;
}

export interface TextLengthPoint {
  letters: number;
  success: boolean;
  correct: boolean | null;
  estimated_key_length: number;
  recovered_key: string;
  steps: number;
  elapsed_ms: number;
}

export interface KeyLengthExperiment {
  points: KeyLengthPoint[];
  true_key_length: number | null;
}

export interface TextLengthExperiment {
  points: TextLengthPoint[];
  total_letters: number;
  true_key_length: number | null;
}
