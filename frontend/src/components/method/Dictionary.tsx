import { useEffect, useMemo, useRef, useState } from "react";
import type { Mission } from "../../App";
import type { Known } from "../Method";
import type { Stage } from "./stage";
import { useLanguage } from "../../i18n/LanguageContext";
import { format, num } from "../../i18n/translations";
import { fetchWordlist } from "../../api";
import { chi, counts, lettersOf, shift, shiftText, sweep, typed } from "./analysis";
import Icon from "../Icon";
import Pipeline from "./Pipeline";

let cache: Promise<string[]> | null = null; // the list never changes: fetched once per page

/** Dictionary attack: every word of the list tried as the key, each with its χ²; the best one lights up. */
export default function Dictionary({ stage, mission, known }: { stage: Stage | null; mission: Mission | null; known: Known | null }) {
  const { t, lang } = useLanguage();
  const D = t.method.dict;
  const [words, setWords] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upto, setUpto] = useState(0); // words tried so far (React state at most once per frame; rows are cheap)
  const list = useRef<HTMLOListElement>(null);
  const run = useRef(0);

  useEffect(() => {
    let off = false;
    (cache ??= fetchWordlist()).then((w) => !off && setWords(w)).catch((e) => {
      cache = null;
      if (!off) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      off = true;
    };
  }, []);

  const cipher = useMemo(() => lettersOf(mission?.ciphertext ?? ""), [mission?.ciphertext]);
  // the same score the backend uses: χ² of the letters decrypted with the word
  const scores = useMemo(() => (words ?? []).map((w) => chi(counts(shift(cipher, w, -1)))), [words, cipher]);
  const bestAt = (n: number) => {
    let b = 0;
    for (let i = 1; i < n; i++) if (scores[i] < scores[b]) b = i;
    return b;
  };
  const total = words?.length ?? 0;
  const best = upto ? bestAt(upto) : -1;
  const min = total ? scores[bestAt(total)] : 1;

  function play() {
    if (!stage || !words?.length) return;
    const id = ++run.current;
    stage.view("machine");
    stage.heat(null, 1);
    stage.paper("");
    setUpto(0);
    let last = 0, lastPaper = -1e9;
    void stage
      .play(8000, (k) => {
        if (id !== run.current) return;
        const n = sweep(total, k);
        if (n === last) return;
        last = n;
        setUpto(n);
        const w = words[n - 1];
        stage.press(w[w.length - 1]);
        const now = performance.now();
        if (now - lastPaper > 90) {
          lastPaper = now;
          stage.paper(words.slice(Math.max(0, n - 16), n).join(" "));
        }
      })
      .then(() => {
        if (id !== run.current) return;
        // the payoff: the start of the message, decrypted with the best word
        stage.paper(shiftText(typed(mission?.ciphertext ?? ""), words[bestAt(total)], -1).slice(0, 110));
      });
  }

  useEffect(() => {
    play();
    return () => {
      run.current++;
      stage?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, words]);

  // keep the word being tried in view, inside the list only (never scrolls the page)
  useEffect(() => {
    const el = list.current;
    // at the end the winner's row, so RAVEN #170 is what's left on screen
    const row = el?.children[upto && upto === words?.length ? bestAt(upto) : Math.max(0, upto - 1)] as HTMLElement | undefined;
    if (el && row) el.scrollTop = row.offsetTop - el.clientHeight * 0.6;
  }, [upto]);

  const shown = stage ? upto : total; // no 3D: the finished list
  const bestShown = stage ? best : total ? bestAt(total) : -1;
  const ok = known && bestShown >= 0 && shown === total ? words![bestShown] === known.key : null;
  const verdict = ok === null ? null : ok ? D.real : words!.includes(known!.key) ? D.notReal : D.notInList;

  return (
    <div className="mx-mode">
      <p className="mx-line">{D.line}</p>
      {error ? (
        <p className="error-text" role="alert">
          {format(D.error, { msg: error })}
        </p>
      ) : !words ? (
        <p className="hint" aria-busy="true">
          {D.loading}
        </p>
      ) : (
        <>
          <Pipeline steps={t.method.pipe.dict} state={shown === total ? "done" : "run"} />
          <div className="mx-readout">
            <span className="mx-count num">
              {num(shown, lang)} {D.of} {num(total, lang)} {D.words}
            </span>
            {bestShown >= 0 && (
              <span className="mx-best">
                {D.best}: <b className="type">{words[bestShown]}</b> <span className="num">#{bestShown + 1} · {D.score} {num(Math.round(scores[bestShown]), lang)}</span>
              </span>
            )}
          </div>
          <ol className="mx-words" ref={list} aria-label={D.listLabel} tabIndex={0}>
            {words.map((w, i) => {
              const tried = i < shown;
              return (
                <li key={w + i} className={`${tried ? "tried" : ""} ${i === bestShown ? "best" : ""} ${i === shown - 1 && shown < total ? "now" : ""}`}>
                  <span className="mx-w-i num">{i + 1}</span>
                  <span className="mx-w type">{w}</span>
                  <span className="mx-w-bar" aria-hidden="true">
                    <i style={{ transform: `scaleX(${tried ? min / scores[i] : 0})` }} />
                  </span>
                  <span className="mx-w-s num">{tried ? num(Math.round(scores[i]), lang) : "–"}</span>
                </li>
              );
            })}
          </ol>
          {verdict && (
            <p className={`mx-verdict ${ok ? "v-ok" : "v-bad"}`}>
              <Icon name={ok ? "check" : "close"} size={16} /> <b className="type">{words[bestShown]}</b> {verdict}
            </p>
          )}
        </>
      )}
      <div className="btn-row">
        <button className="btn mx-go" type="button" onClick={play} disabled={!stage || !words}>
          <Icon name="play" size={16} /> {t.method.replay}
        </button>
      </div>
    </div>
  );
}
