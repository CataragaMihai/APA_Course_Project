// Liquid ribbons: glyphs placed one by one on breathing curves in a 2D canvas.
// West: several lime ciphertext strands drawn into the machine. East: plaintext glides out in ink.
import { FIRST_KEY, type Timeline } from "./timeline";

// colours come from the theme tokens --cipher / --plain (styles.css), read each frame so a theme switch applies at once

export type Pt = { x: number; y: number };

export interface Layout {
  kind: "cinema" | "tablet" | "strips";
  w: number;
  h: number;
  glyph: number; // px
  amp: number; // breathing amplitude, px
  top?: number; // strips: y of the cipher strip (px), from the still's position
  bottom?: number; // strips: y of the plaintext strip (px)
  right?: number; // strips: x where both strips end (px; past the right edge in portrait)
  curved?: boolean; // strips, portrait: the strands flow into and out of the machine instead of running straight
  paper?: number; // strips, portrait: y of the top of the sheet (px); the cipher arches above it
  floor?: number; // strips, portrait: y of the title's bottom (px); a strand never rises above floor + 10
}

const PERIODS = [5.3, 6.7, 8.9, 11.3]; // s, mutually prime: the pattern never visibly repeats
const SAMPLES = 512;

/** A straight strand: interior points on the line, so only the breathing gives it a slight wave. */
const straight = (a: Pt, b: Pt): Pt[] => [a, ...[0.3, 0.6, 0.85].map((u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u })), b];

/** One cubic Bézier as waypoints: evenly spaced `t` keeps them evenly spaced, which the Catmull-Rom in samplePath needs to stay free of kinks. */
const bezier = (a: Pt, b: Pt, c: Pt, d: Pt): Pt[] =>
  Array.from({ length: 7 }, (_, i) => {
    const t = i / 6, s = 1 - t;
    const f = (p: number, q: number, r: number, u: number) => s ** 3 * p + 3 * s * s * t * q + 3 * s * t * t * r + t ** 3 * u;
    return { x: f(a.x, b.x, c.x, d.x), y: f(a.y, b.y, c.y, d.y) };
  });

/** Phone portrait strand (Mihai's drawing, 2026-11-10): level from the left edge, then bending steadily down behind the
 *  machine. `gap` shifts every control point linearly, so strands stay evenly spaced; lower ones end lower and further left, each at its own point behind the machine. */
export function arch(L: Layout, end: Pt, gap = 0): Pt[] {
  const paper = L.paper ?? end.y - 0.15 * L.h, H = end.y - paper, x0 = -0.06 * L.w, run = end.x - x0;
  const crest = Math.max(paper - 0.55 * H, (L.floor ?? 0) + 22); // clear of the title
  return bezier(
    { x: x0, y: crest + gap },
    { x: x0 + 0.45 * run, y: crest + gap },
    { x: x0 + 0.8 * run - 0.2 * gap, y: crest + 0.3 * (end.y - crest) + 0.8 * gap },
    { x: end.x - 0.4 * gap, y: end.y + 0.6 * gap },
  );
}

/** Tablet strand (Mihai 2026-11-10: "no order" near iPad size): `a`, `b` are the heights at the left edge and at the machine,
 *  relative to the west anchor and sorted alike, so the fan follows the machine and stays ordered at any size. */
const fan = (a: number, b: number, k: number) => ({ w, h }: Layout, W: Pt, E: Pt): Pt[] => {
  const m = Math.min(w, h);
  return straight({ x: -0.05 * w, y: W.y + a * m }, into(W, E, k, b * m));
};

/** Waypoints (pinned ends, breathing interior) for each viewport's composition. */
function inWaypoints(L: Layout, anchor: Pt): Pt[] {
  const { w, h } = L;
  if (L.kind === "strips" && L.curved) {
    return arch(L, anchor);
  }
  if (L.kind === "strips") return straight({ x: -0.06 * w, y: anchor.y }, anchor); // landscape: level with the platen
  if (L.kind === "tablet") return straight({ x: -0.05 * w, y: anchor.y }, anchor);
  return straight({ x: -0.05 * w, y: 0.5 * h }, anchor); // Mihai 2026-11-03: straight strands, no loop
}

/** Extra cipher strands behind the main spiral: smaller, fainter, slightly different speeds (depth). */
interface Strand {
  pts: (L: Layout, west: Pt, east: Pt) => Pt[];
  size: number; // glyph scale
  alpha: number;
  speed: number; // x the main flow
  phase: number; // offset into the glyph stream, in glyphs
}
const into = (west: Pt, east: Pt, k: number, dy: number): Pt => ({ x: west.x + (east.x - west.x) * k, y: west.y + dy });
const EXTRA: Record<Layout["kind"], Strand[]> = {
  cinema: [
    { pts: ({ w, h }, W, E) => straight({ x: -0.05 * w, y: 0.36 * h }, into(W, E, 0.18, -0.05 * h)), size: 0.78, alpha: 0.55, speed: 1.12, phase: 61 },
    { pts: ({ w, h }, W, E) => straight({ x: -0.05 * w, y: 0.43 * h }, into(W, E, 0.24, -0.02 * h)), size: 0.62, alpha: 0.35, speed: 1.05, phase: 203 },
    { pts: ({ w, h }, W, E) => straight({ x: -0.05 * w, y: 0.58 * h }, into(W, E, 0.26, 0.04 * h)), size: 0.6, alpha: 0.32, speed: 0.86, phase: 271 },
    { pts: ({ w, h }, W, E) => straight({ x: -0.05 * w, y: 0.67 * h }, into(W, E, 0.12, 0.06 * h)), size: 0.84, alpha: 0.6, speed: 0.92, phase: 137 },
  ],
  tablet: [
    { pts: fan(-0.11, -0.05, 0.18), size: 0.78, alpha: 0.55, speed: 1.12, phase: 61 },
    { pts: fan(-0.055, -0.02, 0.24), size: 0.62, alpha: 0.35, speed: 1.05, phase: 203 },
    { pts: fan(0.06, 0.03, 0.26), size: 0.6, alpha: 0.32, speed: 0.86, phase: 271 },
    { pts: fan(0.11, 0.05, 0.12), size: 0.84, alpha: 0.6, speed: 0.92, phase: 137 },
  ],
  // portrait phones only (landscape strips stay straight): two fainter arches under the main one
  strips: [
    { pts: (L, W) => (L.curved ? arch(L, W, 36) : []), size: 0.78, alpha: 0.55, speed: 1.12, phase: 61 },
    { pts: (L, W) => (L.curved ? arch(L, W, 72) : []), size: 0.62, alpha: 0.38, speed: 0.9, phase: 203 },
  ],
};

export function outWaypoints(L: Layout, anchor: Pt): Pt[] {
  const { w, h } = L;
  if (L.kind === "strips" && L.curved) {
    // Mihai's drawing, 2026-11-10: one wide bowl from the machine's foot, lowest near the right edge, rising off screen.
    // Lowest point 16 px above L.bottom (the lede starts about there on short phones); these ratios put the bowl's depth at exactly D.
    const D = (L.bottom ?? 0.66 * h) - 16 - anchor.y;
    return bezier(anchor, { x: anchor.x + 0.12 * w, y: anchor.y + 0.98 * D }, { x: 0.95 * w, y: anchor.y + 1.47 * D }, { x: 1.35 * w, y: anchor.y + 0.38 * D });
  }
  if (L.kind === "strips") {
    const y = L.bottom ?? 0.66 * h, x1 = L.right ?? 1.06 * w;
    return [anchor, { x: 0.3 * x1, y: y + 0.005 * h }, { x: 0.65 * x1, y: y - 0.005 * h }, { x: x1, y }];
  }
  return [anchor, { x: anchor.x + 0.06 * w, y: anchor.y + 0.005 * h }, { x: anchor.x + 0.16 * w, y: anchor.y - 0.035 * h }, { x: 1.08 * w, y: anchor.y - 0.1 * h }];
}

/** Catmull-Rom through the waypoints, resampled to an arc-length table. */
export function samplePath(pts: Pt[]) {
  const raw: Pt[] = [];
  const segs = pts.length - 1;
  for (let i = 0; i <= SAMPLES; i++) {
    const f = (i / SAMPLES) * segs;
    const s = Math.min(segs - 1, Math.floor(f)), u = f - s;
    const p0 = pts[Math.max(0, s - 1)], p1 = pts[s], p2 = pts[s + 1], p3 = pts[Math.min(pts.length - 1, s + 2)];
    const u2 = u * u, u3 = u2 * u;
    const q = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
    raw.push({ x: q(p0.x, p1.x, p2.x, p3.x), y: q(p0.y, p1.y, p2.y, p3.y) });
  }
  const len = [0];
  for (let i = 1; i < raw.length; i++) len.push(len[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y));
  const total = len[len.length - 1];
  const at = (d: number): Pt => {
    d = Math.max(0, Math.min(total, d));
    let lo = 0, hi = len.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (len[mid] <= d) lo = mid;
      else hi = mid;
    }
    const u = (d - len[lo]) / (len[hi] - len[lo] || 1);
    return { x: raw[lo].x + (raw[hi].x - raw[lo].x) * u, y: raw[lo].y + (raw[hi].y - raw[lo].y) * u };
  };
  return { raw, len, total, at };
}

/** Distance warp near an anchor: spacing goes from `c0` at the anchor to 1 over `width` px of stream. */
function makeWarp(c0: number, width: number, shape: (u: number) => number) {
  const N = 64, table = [0];
  for (let i = 1; i <= N; i++) {
    const u = (i - 0.5) / N;
    table.push(table[i - 1] + (c0 + (1 - c0) * shape(u)) * (width / N));
  }
  return (d: number) => {
    if (d >= width) return table[N] + (d - width);
    const f = (d / width) * N, i = Math.floor(f);
    return table[i] + (table[Math.min(N, i + 1)] - table[i]) * (f - i);
  };
}
const smooth = (u: number) => u * u * (3 - 2 * u);
const DRIFT = 12; // px/s: a typed line drifts calmly while it is written
const EXIT_V = 460; // px/s at 1440: a finished line glides off
/** Integral of a smoothstep velocity ramp (0 -> 1 over `ramp` ms), in ms. */
function rampIntegral(dt: number, ramp: number) {
  if (dt >= ramp) return ramp / 2 + (dt - ramp);
  const u = dt / ramp;
  return ramp * (u ** 3 - u ** 4 / 2);
}
const quint = (u: number) => 1 - (1 - u) ** 5;

export function createRibbons(canvas: HTMLCanvasElement, tl: Timeline) {
  const ctx = canvas.getContext("2d")!;
  const angles = new Map<string, number>();
  let L: Layout = { kind: "cinema", w: 1, h: 1, glyph: 18, amp: 10 };
  let unit = 11; // px per stream unit (glyph advance)
  let dpr = 1;
  const font = (k = 1) => `700 ${(L.glyph * k).toFixed(1)}px "Courier Prime", "Courier New", monospace`;

  function resize(layout: Layout) {
    L = layout;
    dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(L.w * dpr);
    canvas.height = Math.round(L.h * dpr);
    ctx.font = font();
    unit = ctx.measureText("M").width * 1.32; // Courier advance + tracking
  }

  function breathe(pts: Pt[], tSec: number, seed: number): Pt[] {
    const a = L.amp;
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p; // ends stay pinned
      const P = PERIODS[(i + seed) % 4], Q = PERIODS[(i + seed + 1) % 4];
      return {
        x: p.x + a * Math.sin((2 * Math.PI * tSec) / P + i * 1.7 + seed),
        y: p.y + a * Math.sin((2 * Math.PI * tSec) / Q + i * 2.3 + seed * 0.5),
      };
    });
  }

  const warpIn = makeWarp(0.6, 175, smooth);
  const warpOut = makeWarp(0.6, 160, quint);

  /** Draw at timeline time t (ms). `fadeIn` 0..1 reveals the input path from the left at the cut. */
  function draw(t: number, anchors: { west: Pt; east: Pt }, opts: { fadeIn: number; breathe: boolean; dt: number; frozen?: boolean }) {
    const tSec = opts.breathe ? t / 1000 : 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.w, L.h);
    ctx.font = font();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const k = 1 - Math.exp(-opts.dt / 80); // rotation low-pass, tau 80 ms
    const pathIn = samplePath(breathe(inWaypoints(L, anchors.west), tSec, 0));
    const pathOut = samplePath(breathe(outWaypoints(L, anchors.east), tSec, 2));

    const glyphAt = (path: ReturnType<typeof samplePath>, pos: number, id: string) => {
      const half = 0.6 * unit;
      const a = path.at(pos - half), b = path.at(pos + half);
      const target = Math.atan2(b.y - a.y, b.x - a.x);
      const prev = angles.get(id);
      let ang = target;
      if (prev !== undefined && !opts.frozen) {
        let dA = target - prev;
        dA = Math.atan2(Math.sin(dA), Math.cos(dA));
        ang = prev + dA * k;
      }
      angles.set(id, ang);
      return { p: path.at(pos), ang };
    };

    // ---- west: ciphertext strands drawn in at constant speed ----
    const A = tl.input.advance;
    const strand = (path: ReturnType<typeof samplePath>, s: number, k: number, alpha0: number, id: string) => {
      const u = unit * k;
      ctx.font = font(k);
      const r0 = Math.floor(s / A) - 1;
      for (let r = Math.max(0, r0); r <= r0 + 4; r++) {
        for (let g = 0; g < tl.input.glyphs.length; g++) {
          const gl = tl.input.glyphs[g];
          const d = (gl.a + r * A - s) * u; // px still to travel
          if (d < 0) continue; // already inside the machine
          const p = warpIn(d);
          if (p > path.total) break;
          const pos = path.total - p;
          const alpha = alpha0 * Math.max(0, Math.min(1, (opts.fadeIn * (path.total + 240) - pos) / 240));
          if (alpha <= 0 || gl.ch === " ") continue;
          const { p: pt, ang } = glyphAt(path, pos, `${id}${r}:${g}`);
          const sc = 0.86 + 0.14 * smooth(Math.min(1, d / 175));
          ctx.globalAlpha = alpha;
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate(ang);
          ctx.scale(sc, sc);
          ctx.fillText(gl.ch, 0, 0);
          ctx.restore();
        }
      }
    };
    const css = getComputedStyle(canvas);
    ctx.fillStyle = css.getPropertyValue("--cipher").trim() || "#d1fe17";
    const sIn = tl.input.speed * t;
    EXTRA[L.kind].forEach((x, n) => {
      const pts = x.pts(L, anchors.west, anchors.east);
      if (pts.length) strand(samplePath(breathe(pts, tSec, 3 + n)), sIn * x.speed + x.phase, x.size, x.alpha, `x${n}:`);
    });
    strand(pathIn, sIn, 1, 0.95, "i");
    ctx.globalAlpha = 1;
    ctx.font = font();

    // ---- east: plaintext in ink, readable ----
    // A stream paid out to the right would read backwards, so each letter is released at the east
    // anchor at its impact and glides out (ease-out-quint) to its place in a left-to-right line.
    // After the carriage return the finished line detaches and glides off to the right.
    const P = tl.period;
    const pad = unit * 0.9;
    const placed: { ch: string; pt: Pt; ang: number }[] = [];
    const rNow = Math.floor((t - FIRST_KEY) / P);
    for (let r = Math.max(0, rNow - 1); r <= Math.max(0, rNow); r++) {
      tl.lines.forEach((line, m) => {
        const t0 = line.impacts[0] + r * P;
        if (t < t0) return;
        const tc = line.crAt + r * P;
        const exit = t > tc ? rampIntegral(t - tc, 350) : 0;
        const D = DRIFT * (t - t0) / 1000 + (EXIT_V * L.w / 1440) * exit / 1000;
        for (let j = 0; j < line.text.length; j++) {
          const ti = line.impacts[j] + r * P;
          if (t < ti) break; // never leaves before it is printed
          const target = D + pad + j * unit;
          const u = Math.min(1, (t - ti) / (70 + target * 0.09));
          const pos = target * quint(u);
          if (pos - unit > pathOut.total) continue;
          if (line.text[j] !== " ") {
            const { p, ang } = glyphAt(pathOut, pos, `o${r}:${m}:${j}`);
            placed.push({ ch: line.text[j], pt: p, ang });
          }
        }
      });
    }
    ctx.fillStyle = css.getPropertyValue("--plain").trim() || "#eef0e6";
    for (const { ch, pt, ang } of placed) {
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(ang);
      ctx.fillText(ch, 0, 1);
      ctx.restore();
    }
    if (angles.size > 6000) angles.clear(); // ids of glyphs long gone
  }

  return { resize, draw, get unit() { return unit; } };
}

export type Ribbons = ReturnType<typeof createRibbons>;
