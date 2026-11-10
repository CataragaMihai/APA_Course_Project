import type {
  ArchiveStreamEvent,
  CrackStreamEvent,
  EncryptResponse,
  MessageSummary,
  RevealResponse,
  AlgorithmId,
  KeyLengthExperiment,
  TextLengthExperiment,
} from "./types";
import archive from "./messages.json";

// Local dev: empty, and Vite proxies /api to :8000. Deployed (GitHub Pages):
// set VITE_API_BASE at build time to the backend's public URL.
const BASE = `${(import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "")}/api`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { detail?: string }).detail ?? `${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// The archive list ships with the site (no keys or plaintexts; test_algorithms.py checks it matches GET /api/messages),
// so it shows at once even while the free-tier backend sleeps (20-60 s to wake).
export function fetchMessages(): Promise<MessageSummary[]> {
  return Promise.resolve(archive as MessageSummary[]);
}

/** Pinged on page load so a sleeping backend boots while the visitor watches the hero; resolves once it answers (or fails). */
export const serverAwake: Promise<void> = fetch(`${BASE}/health`).then(
  () => undefined,
  () => undefined,
);

/** The dictionary attack's word list, in the order it tries the words. */
export function fetchWordlist(): Promise<string[]> {
  return getJson<string[]>("/wordlist");
}

export function revealMessage(id: string): Promise<RevealResponse> {
  return getJson<RevealResponse>(`/messages/${id}/reveal`);
}

export function encryptMessage(plaintext: string, key: string): Promise<EncryptResponse> {
  return postJson<EncryptResponse>("/encrypt", { plaintext, key });
}

/** Raised when the server answers with a non-2xx status. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * POSTs a JSON body and consumes the Server-Sent-Events response. Uses fetch
 * + a streaming reader (rather than EventSource) because EventSource cannot
 * send a POST body.
 */
async function streamSse<E>(path: string, body: unknown, onEvent: (event: E) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.json().catch(() => ({}));
    const msg = (detail as { detail?: unknown }).detail;
    throw new HttpError(res.status, typeof msg === "string" ? msg : `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const line = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;
      let parsed: E;
      try {
        parsed = JSON.parse(jsonStr) as E;
      } catch {
        continue; // malformed chunk; the stream continues
      }
      onEvent(parsed);
    }
  }
}

export function streamCrack(
  algorithm: AlgorithmId,
  ciphertext: string,
  maxKeyLength: number | undefined,
  onEvent: (event: CrackStreamEvent) => void,
  signal?: AbortSignal,
  lang: "en" | "ro" = "en",
  truth: { message_id?: string; true_key?: string } = {},
): Promise<void> {
  return streamSse(`/crack/stream/${algorithm}`, { ciphertext, max_key_length: maxKeyLength ?? null, lang, ...truth }, onEvent, signal);
}

export function streamArchive(
  maxKeyLength: number,
  repeats: number,
  onEvent: (event: ArchiveStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamSse("/archive/stream", { max_key_length: maxKeyLength, repeats }, onEvent, signal);
}

/** Ground truth: an archive id (server looks up the key) or a key the user typed. */
interface Truth {
  message_id?: string | null;
  true_key?: string | null;
}

export function runKeyLengthExperiment(ciphertext: string, truth: Truth, maxKeyLength = 5): Promise<KeyLengthExperiment> {
  return postJson<KeyLengthExperiment>("/experiments/key-length", { ciphertext, max_key_length: maxKeyLength, ...truth });
}

export function runTextLengthExperiment(ciphertext: string, truth: Truth): Promise<TextLengthExperiment> {
  return postJson<TextLengthExperiment>("/experiments/text-length", { ciphertext, ...truth });
}
