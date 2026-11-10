// Self-check: `npx esbuild src/hero/timeline.check.ts --bundle --platform=node | node`
import { ASSEMBLE, COLS, FIRST_KEY, PAGE_LINES, buildTimeline, wrap } from "./timeline";
import msgs from "../../public/hero/hero-messages.json";

const tl = buildTimeline(msgs);
const fail = (m: string) => {
  throw new Error(m);
};
const ev = tl.typing.events;
ev.forEach((e, i) => i && e.t < ev[i - 1].t && fail(`events not sorted at ${i}`));
const first = ev.find((e) => e.kind === "press")!;
if (first.t !== FIRST_KEY || FIRST_KEY <= ASSEMBLE) fail("first strike must land right after the assembly");
tl.lines.forEach((l, m) => l.impacts.forEach((t, j) => j && t <= l.impacts[j - 1] && fail(`line ${m} impacts out of order`)));
tl.input.glyphs.forEach((g, i) => i && g.a <= tl.input.glyphs[i - 1].a && fail("input glyph offsets must increase"));
if (!(tl.input.speed > 0) || tl.input.glyphs[tl.input.glyphs.length - 1].a >= tl.input.advance) fail("input stream must loop forward");
for (const m of msgs) {
  const lines = wrap(m.body, COLS);
  if (lines.join(" ") !== m.body.trim().split(/\s+/).join(" ")) fail(`${m.id}: wrap lost or changed words`);
  lines.forEach((l) => l.length > COLS && !/^\S+$/.test(l) && fail(`${m.id}: line over ${COLS} cols: ${l}`));
}
// a new page only when the sheet is full or the message is done (Mihai, 2026-11-03)
{
  let onPage = 0, msgDone = false;
  for (const e of ev) {
    if (e.kind === "msg") msgDone = false;
    if (e.kind === "cr" && ++onPage > PAGE_LINES) fail("page overfull");
    if (e.kind === "eject") {
      const next = ev[ev.indexOf(e) + 1];
      msgDone = !next || next.kind === "msg";
      if (!msgDone && onPage !== PAGE_LINES) fail(`page changed with ${onPage} lines mid-message`);
      onPage = 0;
    }
  }
}
// the ribbon tempo was approved as is: keep it when the typing changes
if (Math.round(tl.period) !== 8201 || Math.abs(tl.input.speed * 1000 - 13.89) > 0.01) fail("ribbon tempo changed");
console.log(`OK period ${tl.period.toFixed(0)} ms, input ${(tl.input.speed * 1000).toFixed(2)} glyphs/s, typing round ${(tl.typing.period / 1000).toFixed(1)} s, ${ev.length} events`);
