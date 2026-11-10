import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AlgorithmId, AlgorithmRunState } from "../types";
import { useLanguage } from "../i18n/LanguageContext";
import { format, num } from "../i18n/translations";
import { prefersReducedMotion } from "../utils/a11y";
import { isCracked } from "../utils/verdict";
import Icon from "./Icon";

const ALGORITHMS: AlgorithmId[] = ["brute-force", "dictionary", "frequency"];

interface Props {
  states: Record<AlgorithmId, AlgorithmRunState>;
  maxKeyLength: number;
  disabled: boolean;
  onRun: (id: AlgorithmId) => void;
  shown: AlgorithmId | null; // whose decoded text shows
  onPick: (id: AlgorithmId) => void;
}

/* Dock magnification (Mihai: "like sliding across apps in the macOS dock"). While a mouse is over the row, every
   finished card scales by its distance to the cursor (raised cosine over one card pitch): the card under the cursor
   grows to hi, the others shrink toward lo. At rest the picked card stays at rest, the others at restOthers.
   Cards grow up from a shared baseline in a row (origin bottom), from their centre when stacked. */
const DOCK = {
  row: { hi: 1.06, lo: 0.96, rest: 1.03, restOthers: 0.98 },
  stack: { hi: 1.03, lo: 0.985, rest: 1.02, restOthers: 0.99 },
};

/** Rolls a number to its final, already-known value (400 ms, ease-out). Never invents progress. */
function useRolled(target: number, roll: boolean): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (!roll || prefersReducedMotion()) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 400);
      const v = Math.round(a + (target - a) * (1 - (1 - p) ** 4));
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, roll]);
  return shown;
}

export default function Stations({ states, maxKeyLength, disabled, onRun, shown, onPick }: Props) {
  const { t } = useLanguage();
  const row = useRef<HTMLElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef(0);

  // transforms are written straight to the cards (no re-render per mousemove); CSS transitions smooth and retarget them
  function magnify() {
    const cards = [...(row.current?.children ?? [])] as HTMLElement[];
    if (cards.length < 2) return;
    const inRow = cards[0].offsetTop === cards[1].offsetTop; // offsets ignore transforms, so no feedback loop
    const k = inRow ? DOCK.row : DOCK.stack;
    const pickable = ALGORITHMS.map((a) => !!states[a].result);
    const p = pointer.current;
    const box = row.current!.getBoundingClientRect();
    const pitch = inRow ? cards[1].offsetLeft - cards[0].offsetLeft : cards[1].offsetTop - cards[0].offsetTop;
    cards.forEach((c, i) => {
      let scale = 1;
      if (prefersReducedMotion() || !pickable.some(Boolean)) scale = 1;
      else if (p) {
        const at = inRow ? p.x - box.left : p.y - box.top;
        const centre = inRow ? c.offsetLeft + c.offsetWidth / 2 : c.offsetTop + c.offsetHeight / 2;
        const d = Math.abs(at - centre) / pitch;
        const w = pickable[i] && d < 1 ? (1 + Math.cos(Math.PI * d)) / 2 : 0;
        scale = k.lo + (k.hi - k.lo) * w;
      } else if (shown) scale = ALGORITHMS[i] === shown ? k.rest : k.restOthers;
      c.style.transform = scale === 1 ? "" : `scale(${scale.toFixed(4)})`;
    });
  }
  const magnifyRef = useRef(magnify);
  magnifyRef.current = magnify;
  // shortcut: a resize without a re-render keeps the old row/stack values until the next pointer move or render
  useLayoutEffect(() => magnify());
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function track(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return; // touch has no hover: a tap picks, the resting scale shows it
    pointer.current = { x: e.clientX, y: e.clientY };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => magnifyRef.current());
  }
  function leave() {
    pointer.current = null;
    cancelAnimationFrame(frame.current);
    magnify();
  }
  // rank by the server's measured time, among the attacks that cracked it; a failed attack gets no place (shows once all three are done)
  const allDone = ALGORITHMS.every((a) => states[a].result);
  const finished = ALGORITHMS.filter((a) => states[a].result && isCracked(states[a].result!)).sort((a, b) => states[a].result!.elapsed_ms - states[b].result!.elapsed_ms);
  return (
    <section aria-label={t.stations.label} className="stations" ref={row} onPointerMove={track} onPointerLeave={leave}>
      {ALGORITHMS.map((id, i) => (
        <Station
          key={id}
          no={i + 1}
          id={id}
          state={states[id]}
          rank={allDone && finished.includes(id) ? finished.indexOf(id) + 1 : null}
          maxKeyLength={maxKeyLength}
          disabled={disabled}
          onRun={() => onRun(id)}
          picked={id === shown}
          onPick={() => onPick(id)}
        />
      ))}
    </section>
  );
}

function Station({ no, id, state, rank, maxKeyLength, disabled, onRun, picked, onPick }: {
  no: number;
  id: AlgorithmId;
  state: AlgorithmRunState;
  rank: number | null;
  maxKeyLength: number;
  disabled: boolean;
  onRun: () => void;
  picked: boolean;
  onPick: () => void;
}) {
  const { t, lang } = useLanguage();
  const r = state.result;
  const done = state.status === "done" && r;
  const attempts = useRolled(state.attempts, !!done);
  const unit = id === "frequency" ? t.stations.steps : t.stations.attempts;
  const cracked = done ? isCracked(r) : false;
  const verdict = done ? (cracked ? "cracked" : "failed") : null;

  // slots: the live key while running, the recovered key when done
  const key = done ? r.recovered_key : state.liveKey;
  const slotCount = done ? Math.max(1, r.recovered_key.length) : Math.max(state.keyLength ?? 0, key.length);
  const fraction = state.total ? Math.min(1, state.attempts / state.total) : null;


  return (
    <article className={`station ${state.status} ${verdict ?? ""} ${done && picked ? "picked" : ""}`} aria-labelledby={`st-${id}`}>
      <div className="station-head">
        <span className="station-no num" aria-hidden="true">
          {String(no).padStart(2, "0")}
        </span>
        {/* complexity under the name: it explains the count below, e.g. 26 + 26² + 26³ + 26⁴ = 475,254 (Mihai, 2026-11-04) */}
        <div className="station-name">
          <h3 id={`st-${id}`}>{t.algorithms.names[id]}</h3>
          <code className="station-sub">{t.algorithms.complexity[id]}</code>
        </div>
        {state.status === "idle" ? (
          <button className="btn small" type="button" onClick={onRun} disabled={disabled}>
            {t.stations.run}
          </button>
        ) : (
          <span className={`status-chip ${state.status}`}>
            {state.status === "running" ? t.stations.running : state.status === "error" ? t.stations.error : <Icon name={verdict === "cracked" ? "check" : "close"} size={14} />}
          </span>
        )}
      </div>

      {/* only number, name + complexity, attempts and result (Mihai, 2026-11-04: no parameters or hints here) */}
      <div className="readout">
      <div className="slots" aria-label={`${t.stations.key}: ${key || t.stations.noKey}`} role="img">
        {Array.from({ length: slotCount }, (_, i) => (
          <span key={`${done ? "f" : "l"}${i}`} className={`slot ${done ? "final" : key[i] ? "live" : ""}`} style={{ ["--i" as string]: i }}>
            {key[i] ?? ""}
          </span>
        ))}
      </div>
        <div
          className={`bar ${state.status === "running" && fraction === null ? "scan" : ""}`}
          {...(state.status === "running"
            ? { role: "progressbar", "aria-label": t.algorithms.names[id], "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": fraction === null ? undefined : Math.round(fraction * 100) }
            : { "aria-hidden": true })}
        >
          <i style={state.status === "running" && fraction !== null ? { transform: `scaleX(${fraction})` } : undefined} />
        </div>
      </div>

      <div className="station-metrics">
        <div className="attempts">
          <strong className="num">{num(attempts, lang)}</strong>
          <span>
            {unit}
            {state.total && !done ? ` · ${format(t.stations.of, { n: num(state.total, lang) })}` : ""}
          </span>
        </div>
        {done && <span className="elapsed num">{r.elapsed_ms.toFixed(1)} ms</span>}
      </div>


      <div className="station-foot">
        {/* live progress is announced, not shown: the run lasts milliseconds and the result says the rest */}
        <p className="sr-only" aria-live="polite">
          {state.status === "running" ? state.progressMessage : ""}
        </p>
        {state.status === "error" && <p className="station-reason">{state.error}</p>}
        {done && (
          <>
            <div className="verdict">
              <span className={`stamp ${cracked ? "ok" : "bad"}`}>
                <Icon name={cracked ? "check" : "close"} size={18} />
                {cracked ? t.stations.cracked : t.stations.failed}
              </span>
              {rank && (
                <span className="rank" aria-label={format(t.stations.rank, { n: rank })}>
                  {rank}
                </span>
              )}
            </div>
            {r.key_exceeds_limit && (
              <p className="station-reason">{format(t.stations.capReason, { est: r.estimated_key_length ?? "?", max: r.max_key_length ?? maxKeyLength })}</p>
            )}
            {r.success && r.correct === false && <p className="station-reason">{t.stations.plausibleWrong}</p>}
          </>
        )}
      </div>

      {done && (
        <button
          className="station-pick"
          type="button"
          aria-pressed={picked}
          aria-label={format(t.stations.pick, { name: t.algorithms.names[id] })}
          onClick={onPick}
          onPointerEnter={(e) => e.pointerType === "mouse" && onPick()} // hover picks; the pick sticks after leaving
        />
      )}
    </article>
  );
}
