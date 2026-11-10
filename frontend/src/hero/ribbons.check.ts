// Self-check: `npx esbuild src/hero/ribbons.check.ts --bundle --platform=node | node`
import { arch, outWaypoints, samplePath, type Layout, type Pt } from "./ribbons";

// measured on the live page (portrait phones): sheet top, platen, title foot, machine foot, lowest allowed band (hero-relative px)
const PHONES = [
  { w: 320, h: 504, paper: 88.2, end: { x: 131.8, y: 153.3 }, floor: 51, foot: { x: 144.7, y: 256.9 }, bottom: 299 },
  { w: 360, h: 676, paper: 144.7, end: { x: 139, y: 237.7 }, floor: 62, foot: { x: 157.4, y: 385.8 }, bottom: 456 },
  { w: 375, h: 603, paper: 118.6, end: { x: 145.2, y: 215.7 }, floor: 61, foot: { x: 164.5, y: 370.3 }, bottom: 424.3 },
  { w: 390, h: 780, paper: 157.4, end: { x: 151, y: 258.3 }, floor: 69, foot: { x: 171, y: 419 }, bottom: 494 },
  { w: 430, h: 868, paper: 173, end: { x: 166, y: 284.2 }, floor: 76, foot: { x: 188.1, y: 461.1 }, bottom: 543 },
];
const MAX_TURN = 14; // degrees of heading change over 12 px of path: above this the glyphs visibly swing

let worst = 0;
function checkTurns(pts: Pt[], name: string) {
  const path = samplePath(pts);
  const heading = (d: number) => {
    const a = path.at(d - 1), b = path.at(d + 1);
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  for (let d = 2; d + 12 < path.total - 1; d += 2) {
    const dA = heading(d + 12) - heading(d);
    const turn = Math.abs(Math.atan2(Math.sin(dA), Math.cos(dA))) * (180 / Math.PI);
    worst = Math.max(worst, turn);
    if (turn > MAX_TURN) throw new Error(`${name}: turn of ${turn.toFixed(1)} deg at ${d} px of ${path.total.toFixed(0)}`);
  }
  return path;
}

for (const { end, foot, ...p } of PHONES) {
  const L: Layout = { kind: "strips", glyph: 15, amp: 4, curved: true, ...p };
  const [top, mid, low] = [0, 36, 72].map((gap) => arch(L, end, gap));
  const crest = Math.min(...checkTurns(top, `${p.w} in`).raw.map((q) => q.y));
  if (crest < p.floor + 21) throw new Error(`${p.w}: crest ${crest.toFixed(1)} reaches the title (${p.floor})`);
  top.forEach((q, i) => {
    if (Math.abs(mid[i].y - q.y - (low[i].y - mid[i].y)) > 0.01) throw new Error(`${p.w}: strands unevenly spaced at waypoint ${i}`);
  });
  checkTurns(mid, `${p.w} in+36`);
  checkTurns(low, `${p.w} in+72`);
  const out = checkTurns(outWaypoints(L, foot), `${p.w} out`);
  const lowest = Math.max(...out.raw.map((q) => q.y));
  if (lowest > p.bottom - 15) throw new Error(`${p.w}: plaintext reaches y ${lowest.toFixed(1)}, into the lede (${p.bottom})`);
}
console.log(`OK arch: worst turn ${worst.toFixed(1)} deg per 12 px, strands evenly spaced, title and lede clear on ${PHONES.length} phones`);
