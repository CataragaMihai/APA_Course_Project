import { useEffect, useRef, useState } from "react";
import type { Mission } from "../../App";
import type { Known } from "../Method";
import type { Stage } from "./stage";
import { useLanguage } from "../../i18n/LanguageContext";
import { format, num } from "../../i18n/translations";
import { bruteKey, bruteTotal, sweep } from "./analysis";
import Icon from "../Icon";
import Pipeline from "./Pipeline";

const SUP = ["", "", "²", "³", "⁴", "⁵"];

/** Brute force: the machine types every candidate key in order while the counter races to 26 + 26² + … + 26^cap. */
export default function BruteForce({ stage, cap, keyLength }: { stage: Stage | null; mission: Mission | null; known: Known | null; cap: number; keyLength: number | null }) {
  const { t, lang } = useLanguage();
  const B = t.method.brute;
  const N = bruteTotal(cap);
  const blocks = Array.from({ length: cap }, (_, i) => 26 ** (i + 1));
  const counter = useRef<HTMLSpanElement>(null);
  const cand = useRef<HTMLSpanElement>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const run = useRef(0);
  const at = useRef(0); // the candidate on screen (kept across re-renders)
  const [done, setDone] = useState(false);

  function show(idx: number) {
    at.current = idx;
    if (counter.current) counter.current.textContent = num(idx, lang);
    if (cand.current) cand.current.textContent = idx ? bruteKey(idx) : "–";
    let start = 0;
    blocks.forEach((b, i) => {
      const f = Math.min(1, Math.max(0, (idx - start) / b));
      bars.current[i]?.style.setProperty("transform", `scaleX(${f})`);
      start += b;
    });
  }

  function play() {
    if (!stage) return;
    const id = ++run.current;
    setDone(false);
    stage.view("machine");
    stage.heat(null, 1);
    stage.paper("");
    let last = 0, lastPaper = -1e9;
    show(0);
    void stage
      .play(9000, (k) => {
        if (id !== run.current) return;
        const idx = sweep(N, k);
        if (idx === last) return;
        const key = bruteKey(idx);
        stage.press(key[key.length - 1]);
        show(idx);
        last = idx;
        // the paper shows the last candidates typed (throttled: one 2048 px redraw every ~90 ms)
        const now = performance.now();
        if (now - lastPaper > 90 || k >= 1) {
          lastPaper = now;
          const tail = [];
          for (let i = Math.max(1, idx - 23); i <= idx; i++) tail.push(bruteKey(i));
          stage.paper(tail.join(" "));
        }
      })
      .then(() => id === run.current && setDone(true));
  }

  useEffect(() => {
    play();
    return () => {
      run.current++;
      stage?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, cap]);
  // re-renders (language switch) keep the readout; without a stage it shows the finished count
  useEffect(() => show(stage ? at.current : N));

  const sum = blocks.map((_, i) => `26${SUP[i + 1]}`).join(" + ");
  return (
    <div className="mx-mode">
      <p className="mx-line">{B.line}</p>
      <Pipeline steps={t.method.pipe.brute} state={done || !stage ? "done" : "run"} />
      <div className="mx-readout" aria-live="off">
        <span ref={cand} className="mx-cand type">
          –
        </span>
        <span className="mx-count num">
          <span ref={counter}>0</span> {B.of} {num(N, lang)} {B.attempts}
        </span>
      </div>
      <ol className="mx-blocks" aria-label={format(B.sum, { cap, sum, n: num(N, lang) })}>
        {blocks.map((b, i) => (
          <li key={b}>
            <span className="mx-block-l">{format(B.letters[i === 0 ? 0 : 1], { n: i + 1 })}</span>
            <span className="mx-block-track" style={{ "--w": b / blocks[cap - 1] } as React.CSSProperties}>
              <span ref={(el) => (bars.current[i] = el)} className="mx-block-fill" />
            </span>
            <span className="mx-block-n num">{num(b, lang)}</span>
          </li>
        ))}
      </ol>
      <p className="mx-sum num">{format(B.sum, { cap, sum, n: num(N, lang) })}</p>
      {keyLength !== null && <p className="hint">{format(keyLength > cap ? B.keyOver : B.keyWithin, { k: keyLength, cap })}</p>}
      <div className="btn-row">
        <button className="btn mx-go" type="button" onClick={play} disabled={!stage}>
          <Icon name="play" size={16} /> {t.method.replay}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {done ? format(B.sum, { cap, sum, n: num(N, lang) }) : ""}
      </p>
    </div>
  );
}
