// The Method visuals' numbers, computed in the browser from the decoder's message.
// Mirrors backend/app/scoring.py and cracking/frequency_analysis.py (same constants), so the
// key length and key letters shown here are the ones the frequency attack finds.

const A = 65;
// English letter frequencies (fractions), scoring.py ENGLISH_FREQ_PERCENT / 100
export const ENGLISH = [
  8.167, 1.492, 2.782, 4.253, 12.702, 2.228, 2.015, 6.094, 6.966, 0.153, 0.772, 4.025, 2.406, 6.749, 7.507, 1.929, 0.095, 5.987, 6.327, 9.056,
  2.758, 0.978, 2.36, 0.15, 1.974, 0.074,
].map((p) => p / 100);
export const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A-Z only, uppercased, accents folded (cipher.py extract_letters). */
export const lettersOf = (s: string) => s.toUpperCase().normalize("NFKD").replace(/[^A-Z]/g, "");

export function counts(letters: string): number[] {
  const c = new Array(26).fill(0);
  for (let i = 0; i < letters.length; i++) c[letters.charCodeAt(i) - A]++;
  return c;
}

export function chi(c: number[]): number {
  const n = c.reduce((a, b) => a + b, 0);
  if (!n) return Infinity;
  return c.reduce((s, o, i) => s + (o - ENGLISH[i] * n) ** 2 / (ENGLISH[i] * n), 0);
}

export function ioc(letters: string): number {
  const n = letters.length;
  if (n <= 1) return 0;
  return counts(letters).reduce((s, k) => s + k * (k - 1), 0) / (n * (n - 1));
}

/** Vigenère over letters only: dir +1 encrypts, -1 decrypts. */
export function shift(letters: string, key: string, dir: 1 | -1): string {
  let out = "";
  for (let i = 0; i < letters.length; i++) {
    const k = key.charCodeAt(i % key.length) - A;
    out += String.fromCharCode(((letters.charCodeAt(i) - A + dir * k + 26) % 26) + A);
  }
  return out;
}

export const column = (letters: string, L: number, i: number) => {
  let s = "";
  for (let j = i; j < letters.length; j += L) s += letters[j];
  return s;
};

/** Best Caesar shift of one column, as a key letter (frequency_analysis._recover_column). */
export function recoverColumn(col: string): string {
  const raw = counts(col);
  let best = 0, bestScore = Infinity;
  for (let s = 0; s < 26; s++) {
    const score = chi(raw.map((_, i) => raw[(i + s) % 26]));
    if (score < bestScore) [best, bestScore] = [s, score];
  }
  return ALPHA[best];
}

const recoverKey = (letters: string, L: number) => Array.from({ length: L }, (_, i) => recoverColumn(column(letters, L, i))).join("");

/** Kasiski + IoC + fit tie-break, as frequency_analysis._estimate_key_length (max guess 12). */
export function keyLength(letters: string, max = 12): number {
  if (letters.length < 6) return 1;
  const pos = new Map<string, number[]>();
  for (let i = 0; i + 3 <= letters.length; i++) {
    const seg = letters.slice(i, i + 3);
    const p = pos.get(seg);
    if (p) p.push(i);
    else pos.set(seg, [i]);
  }
  const tally = new Map<number, number>();
  for (const p of pos.values())
    for (let a = 0; a < p.length; a++)
      for (let b = a + 1; b < p.length; b++)
        for (let f = 2; f <= max; f++) if ((p[b] - p[a]) % f === 0) tally.set(f, (tally.get(f) ?? 0) + 1);
  const ic: number[] = [];
  for (let L = 1; L <= max; L++) {
    let s = 0;
    for (let i = 0; i < L; i++) s += ioc(column(letters, L, i));
    ic[L] = s / L;
  }
  const periodic = [];
  for (let L = 2; L <= max; L++) if (ic[L] >= 0.056) periodic.push(L);
  let fallback = 2;
  if (tally.size) {
    let top = -1; // Counter.most_common: highest count, first inserted wins ties (factors are inserted ascending)
    for (let f = 2; f <= max; f++) if ((tally.get(f) ?? 0) > top) [fallback, top] = [f, tally.get(f) ?? 0];
  } else for (let L = 2; L <= max; L++) if (ic[L] > ic[fallback]) fallback = L;
  const cands = [...new Set([...periodic, fallback])].sort((a, b) => a - b);
  const fits = cands.map((L) => chi(counts(shift(letters, recoverKey(letters, L), -1))));
  const best = Math.min(...fits);
  return cands[fits.findIndex((f) => f <= best * 2)];
}

/** Everything the frequency story needs, from the ciphertext alone (plus the true text for step 1). */
export function frequencyStory(ciphertext: string) {
  const cipher = lettersOf(ciphertext);
  const L = keyLength(cipher);
  const cols = Array.from({ length: L }, (_, i) => column(cipher, L, i));
  return { cipher, L, cols, key: cols.map(recoverColumn).join("") };
}

/** The n-th brute-force candidate (1-based) in the backend's order: A..Z, AA..ZZ, AAA.. (shortest first). */
export function bruteKey(n: number): string {
  let len = 1, block = 26;
  while (n > block) [n, len, block] = [n - block, len + 1, block * 26];
  let i = n - 1, s = "";
  for (let k = 0; k < len; k++, i = Math.floor(i / 26)) s = ALPHA[i % 26] + s;
  return s;
}
export const bruteTotal = (cap: number) => Array.from({ length: cap }, (_, i) => 26 ** (i + 1)).reduce((a, b) => a + b, 0);

/** Share of each letter A..Z in a text (0..1). */
export function shares(letters: string): number[] {
  const n = letters.length || 1;
  return counts(letters).map((c) => c / n);
}

/** Uppercase A-Z and spaces, as typed on the paper (cipher.py normalize_text, whitespace collapsed). */
export const typed = (s: string) => s.toUpperCase().normalize("NFKD").replace(/[^A-Z\s]/g, "").replace(/\s+/g, " ").trim();

/** Vigenère over a typed text: spaces pass through and do not advance the key (cipher.py). */
export function shiftText(text: string, key: string, dir: 1 | -1): string {
  let j = 0, out = "";
  for (const ch of text) {
    if (ch < "A" || ch > "Z") {
      out += ch;
      continue;
    }
    const k = key.charCodeAt(j++ % key.length) - A;
    out += String.fromCharCode(((ch.charCodeAt(0) - A + dir * k + 26) % 26) + A);
  }
  return out;
}

/** n^k - 1 .. n over k in 0..1: slow enough at the start to watch single keys, then racing. */
export const sweep = (n: number, k: number) => (k >= 1 ? n : Math.max(1, Math.floor(n ** k)));
