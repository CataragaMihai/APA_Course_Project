import { useEffect, useMemo, useRef, useState } from "react";
import type { Mission } from "../../App";
import type { Known } from "../Method";
import { heatColour, type Stage } from "./stage";
import { useLanguage } from "../../i18n/LanguageContext";
import { format, LOCALE } from "../../i18n/translations";
import { ALPHA, frequencyStory, ioc, lettersOf, shares, shiftText, sweep, typed } from "./analysis";
import Icon from "../Icon";

const rgb = (t: number) => `rgb(${heatColour(t).fill.join(" ")})`;
const LEGEND = `linear-gradient(90deg, ${[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => `${rgb(t)} ${t * 100}%`).join(", ")})`;
const back = (letter: string, key: string) => ALPHA[(letter.charCodeAt(0) - key.charCodeAt(0) + 26) % 26];

/**
 * Frequency analysis in three clicks (Mihai presents between them, never on a timer):
 * 1. the message as a Caesar cipher: English peaks, only moved; 2. the real Vigenère ciphertext: almost flat;
 * 3. every L-th letter: each column peaks again and gives one key letter.
 * The keyboard heats up as the machine types the text: a darker green key was pressed more often.
 */
export default function Frequency({ stage, mission, known }: { stage: Stage | null; mission: Mission | null; known: Known | null }) {
  const { t, lang } = useLanguage();
  const F = t.method.freq;
  const [step, setStep] = useState(0);
  const [col, setCol] = useState(0);
  const run = useRef(0);
  const pct = (x: number) => `${(x * 100).toLocaleString(LOCALE[lang], { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
  const dec = (x: number) => x.toLocaleString(LOCALE[lang], { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  const data = useMemo(() => {
    const cipherText = typed(mission?.ciphertext ?? "");
    const story = frequencyStory(cipherText);
    // step 1 needs the plaintext: the true one when known, else the one the recovered key gives
    const plain = known ? typed(known.plaintext) : shiftText(cipherText, story.key, -1);
    const caesarKey = (known?.key ?? story.key)[0] ?? "A";
    const caesar = shiftText(plain, caesarKey, 1);
    const sets = [caesar, cipherText, ...story.cols.map((c) => c.replace(/(.{5})/g, "$1 ").trim())].map((text) => {
      const letters = lettersOf(text);
      const s = shares(letters);
      const peak = ALPHA[s.indexOf(Math.max(...s))];
      return { text, letters, s, peak, ioc: ioc(letters), top: [...s.keys()].sort((a, b) => s[b] - s[a]).slice(0, 3) };
    });
    return { story, caesarKey, sets, scale: Math.max(0.1, ...sets[0].s) };
  }, [mission?.ciphertext, known]);

  const { story, caesarKey, sets, scale } = data;
  const L = story.L;
  const cur = sets[step < 2 ? step : 2 + col];

  // the machine types the text; each key darkens with how often it has been pressed so far
  useEffect(() => {
    if (!stage) return;
    const id = ++run.current;
    stage.view("keys");
    stage.heat(new Array(26).fill(0), scale);
    stage.paper("");
    const { letters, text } = cur;
    const n = letters.length;
    if (!n) return; // a text without letters: nothing to count
    const at: number[] = []; // text index of each letter, for the paper
    for (let i = 0; i < text.length; i++) if (text[i] !== " ") at.push(i);
    const c = new Array(26).fill(0);
    let last = 0, lastPaper = -1e9;
    void stage
      .play(380, () => undefined) // let the old heat fade first
      .then(() => {
        if (id !== run.current) return;
        return stage.play(step < 2 ? 2600 : 1500, (k) => {
          if (id !== run.current) return;
          const m = sweep(n, k);
          if (m === last) return;
          for (let i = last; i < m; i++) c[letters.charCodeAt(i) - 65]++;
          last = m;
          stage.heat(c.map((x) => x / n), scale, true);
          stage.press(letters[m - 1]);
          const now = performance.now();
          if (now - lastPaper > 100 || m === n) {
            lastPaper = now;
            stage.paper(text.slice(0, at[m - 1] + 1));
          }
        });
      });
    return () => {
      run.current++;
      stage.stop();
    };
  }, [stage, cur, scale, step]);

  const caption =
    step === 0
      ? format(F.captions[0], { k: caesarKey, p: cur.peak, o: back(cur.peak, caesarKey) })
      : step === 1
        ? F.captions[1]
        : format(F.captions[2], { L });
  const lastCol = step === 2 && col === L - 1;
  const ok = known && lastCol ? story.key === known.key : null;

  function next() {
    if (step < 2) {
      setStep(step + 1);
      setCol(0);
    } else if (col < L - 1) setCol(col + 1);
    else setStep(0);
  }

  return (
    <div className="mx-mode mx-freq">
      <p className="mx-line">{F.line}</p>
      <div className="mx-steps" role="group" aria-label={F.stepsLabel}>
        {F.steps.map((name, i) => (
          <button
            key={name}
            type="button"
            className="mx-step"
            aria-pressed={step === i}
            onClick={() => {
              setStep(i);
              setCol(0);
            }}
          >
            <span className="mx-step-i num" aria-hidden="true">
              {i + 1}
            </span>
            {name}
          </button>
        ))}
      </div>
      <div className="mx-stepbody" aria-live="polite">
        <p className="mx-caption">{caption}</p>
        {step === 2 && (
          <>
            <div className="slots mx-keyslots" aria-label={F.key}>
              {story.key.split("").map((k, i) => (
                <span key={i} className={`slot ${i <= col ? "final" : ""} ${i === col ? "live" : ""}`} style={{ "--i": 0 } as React.CSSProperties}>
                  {i <= col ? k : ""}
                </span>
              ))}
            </div>
            <p className="mx-caption">{format(F.column, { c: col + 1, L, p: cur.peak, o: back(cur.peak, story.key[col]), k: story.key[col] })}</p>
            {lastCol && (
              <p className={`mx-verdict ${ok === false ? "v-bad" : "v-ok"}`}>
                {ok !== null && <Icon name={ok ? "check" : "close"} size={16} />} {F.key}: <b className="type">{story.key}</b>
                {ok !== null && ` · ${ok ? F.correct : F.wrong}`}
              </p>
            )}
          </>
        )}
      </div>
      <dl className="mx-stats">
        <div>
          <dt className="label">{F.top}</dt>
          <dd className="mx-top">
            {cur.top.map((i) => (
              <span key={i} className="mx-chip num">
                <i style={{ background: rgb(Math.min(1, cur.s[i] / scale)) }} aria-hidden="true" />
                <b className="type">{ALPHA[i]}</b> {pct(cur.s[i])}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="label">{F.ioc}</dt>
          <dd className="num">
            {dec(cur.ioc)} <span className="hint mx-ref">{F.iocRef}</span>
          </dd>
        </div>
      </dl>
      <div className="mx-legend">
        <span className="label">{F.legend}</span>
        <span className="mx-legend-bar" style={{ background: LEGEND }} aria-hidden="true" />
        <span className="mx-legend-ends num">
          <span>0 %</span>
          <span>{pct(scale)}</span>
        </span>
      </div>
      <p className="sr-only">{format(F.all, { list: ALPHA.split("").map((ch, i) => `${ch} ${pct(cur.s[i])}`).join(", ") })}</p>
      <div className="btn-row">
        <button className="btn primary mx-go" type="button" onClick={next}>
          {step < 2 ? F.next : col < L - 1 ? F.nextColumn : F.restart} <Icon name="arrowRight" size={16} />
        </button>
        <span className="hint num">{format(F.stepOf, { i: step + 1 })}</span>
      </div>
    </div>
  );
}
