// Deterministic hero timeline. Two schedules on one clock (Mihai, 2026-11-03):
// - ribbons: the three headlines (`plain`) at the ribbon tempo; cipher flows in at constant speed,
//   plaintext glides out at its own release times;
// - typing: the machine types each full decoded message (`body`) on the paper, much faster, wrapped
//   at COLS. The two loop independently.

export interface HeroMessage {
  id: string;
  title: string;
  key: string;
  cipher: string;
  plain: string; // headline: the ribbons
  body: string; // full decoded message: the paper
}

export type HeroEvent =
  | { t: number; kind: "press"; ch: string }
  | { t: number; kind: "print"; ch: string }
  | { t: number; kind: "cr" }
  | { t: number; kind: "eject" } // new page: the sheet fades out, a fresh one fades in
  | { t: number; kind: "msg"; index: number };

export const ASSEMBLE = 2000; // the 3D machine hovers in and assembles over [0, ASSEMBLE] ms
export const FIRST_KEY = 2100; // first strike, right after the assembly
// ribbon tempo (approved 2026-11-03; keep): release times of the headline glyphs
const IMPACT = 95;
const AFTER_LINE = 130;
const CR = 205;
const BEFORE_LINE = 225;
// typing tempo: very fast (~25 chars/s); scene.ts press() and cr() durations match these
export const COLS = 22; // characters per paper line
export const PAGE_LINES = 11; // a full sheet (its rise reaches the sheet's real top); a new page only when it is full or the message is done
const EJECT = 640; // scene.ts eject(): fade out 260 + fade in 260, plus a beat
const T_IMPACT = 60; // key down 25 + typebar flight 35
const T_AFTER = 60;
const T_CR = 205; // carriage return 160 + rebound 45
const T_BEFORE = 90;
const MSG_GAP = 300; // extra pause after the sheet of a finished message is ejected

/** A glyph on a stream: `a` is its offset along the stream in advance units. */
export interface StreamGlyph {
  ch: string;
  a: number;
}

export interface Stream {
  glyphs: StreamGlyph[]; // one round
  advance: number; // stream length of one round
  speed: number; // advance units per ms
}

export interface Timeline {
  period: number; // ribbon round
  input: Stream; // ciphertext, flows in at constant speed
  lines: { text: string; impacts: number[]; crAt: number }[]; // headline releases, one per message
  typing: { events: HeroEvent[]; period: number; msgStart: number[]; still: number }; // paper round, events sorted; `still`: reduced-motion frame (a full first page)
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** `unit` = one glyph's advance; the separator between messages gets the width the gap needs to keep speed. */
export function buildTimeline(msgs: HeroMessage[], seed = 10): Timeline {
  const rnd = seeded(seed);
  const presses: number[][] = [];
  const lines: Timeline["lines"] = [];
  let t = FIRST_KEY;
  let jit = 0.5;
  msgs.forEach((m) => {
    const times: number[] = [];
    for (let i = 0; i < m.plain.length; i++) {
      times.push(t);
      jit = 0.55 * jit + 0.45 * rnd(); // low-passed: an even, human typing rhythm
      t += 82 + jit * 30; // per-key interval 82-112 ms
    }
    presses.push(times);
    const lastPrint = times[times.length - 1] + IMPACT;
    lines.push({ text: m.plain, impacts: times.map((x) => x + IMPACT), crAt: lastPrint + AFTER_LINE });
    t = lastPrint + AFTER_LINE + CR + BEFORE_LINE;
  });
  const period = t + CR - FIRST_KEY;

  // constant speed, 1.7x the typing rate (Mihai, 2026-11-03); the "·" separator marks a message boundary
  const glyphs: StreamGlyph[] = [];
  let a = 0;
  for (const m of msgs) {
    for (const ch of m.cipher) glyphs.push({ ch, a: a++ });
    glyphs.push({ ch: "·", a: a + 1 });
    a += 3;
  }
  const typed = msgs.reduce((n, m) => n + m.plain.length, 0);

  return {
    period,
    input: { glyphs, advance: a, speed: (1.7 * typed) / period },
    lines,
    typing: typingSchedule(msgs, seeded(seed + 1)),
  };
}

/** Greedy word wrap at `cols` characters. */
export function wrap(text: string, cols: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > cols) {
      out.push(line);
      line = "";
    }
    line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

function typingSchedule(msgs: HeroMessage[], rnd: () => number): Timeline["typing"] {
  const events: HeroEvent[] = [];
  const msgStart: number[] = [];
  let t = FIRST_KEY;
  let jit = 0.5;
  let onPage = 0;
  const eject = () => {
    events.push({ t, kind: "eject" });
    t += EJECT;
    onPage = 0;
  };
  msgs.forEach((m, index) => {
    events.push({ t: t - 200, kind: "msg", index });
    msgStart.push(t);
    for (const line of wrap(m.body, COLS)) {
      if (onPage === PAGE_LINES) eject();
      onPage++;
      let last = t;
      for (const ch of line) {
        events.push({ t, kind: "press", ch }, { t: t + T_IMPACT, kind: "print", ch });
        last = t;
        jit = 0.55 * jit + 0.45 * rnd();
        t += 32 + jit * 16; // per-key interval 32-48 ms
      }
      const cr = last + T_IMPACT + T_AFTER;
      events.push({ t: cr, kind: "cr" });
      t = cr + T_CR + T_BEFORE;
    }
    eject(); // every message starts on a fresh sheet
    t += MSG_GAP;
  });
  events.sort((a, b) => a.t - b.t);
  const still = events.find((e) => e.kind === "eject")!.t - 100;
  return { events, period: t - FIRST_KEY, msgStart, still };
}
