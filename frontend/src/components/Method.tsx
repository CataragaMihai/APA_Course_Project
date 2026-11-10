import { lazy, useEffect, useRef, useState } from "react";
import type { Mission } from "../App";
import type { AlgorithmId, RevealResponse } from "../types";
import { useLanguage } from "../i18n/LanguageContext";
import { revealMessage } from "../api";
import { prefersReducedMotion } from "../utils/a11y";
import type { Stage } from "./method/stage";
import BruteForce from "./method/BruteForce";
import Dictionary from "./method/Dictionary";
import Frequency from "./method/Frequency";
import Near from "./Near";

const Experiments = lazy(() => import("./Experiments"));
const ALGORITHMS: AlgorithmId[] = ["brute-force", "dictionary", "frequency"];

export interface Known {
  key: string;
  plaintext: string;
}

/** Method: each attack as a visual on the hero's typewriter (one 3D stage, three modes), then the experiments. */
export default function Method({ mission, missionTitle, truth, maxKeyLength }: { mission: Mission | null; missionTitle: string; truth: RevealResponse | null; maxKeyLength: number }) {
  const { t } = useLanguage();
  const M = t.method;
  const [attack, setAttack] = useState<AlgorithmId>("brute-force");
  const canvas = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [stageState, setStageState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  // phones (Mihai 2026-11-05, his mock-up): the three numbers share one row; a sideways drag moves a continuous focus
  // f (0..2) across them and each item's closeness (--p, 0..1) widens it, lengthens and darkens its line, grows its
  // number and fades its name in; on release f settles on the nearest one, which becomes the pick. A tap picks too.
  const tabs = useRef<HTMLDivElement>(null);
  const [phone, setPhone] = useState(() => matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const mq = matchMedia("(max-width: 767px)");
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const focus = useRef({ f: 0, v: 0, raf: 0, dragged: false });
  const paintFocus = () => {
    const items = [...(tabs.current?.children ?? [])] as HTMLElement[];
    items.forEach((b, i) => b.style.setProperty("--p", Math.max(0, 1 - Math.abs(focus.current.f - i)).toFixed(3)));
  };
  // release: a critically damped spring that starts with the finger's speed, so the slide never stops dead
  const glideTo = (i: number) => {
    const F = focus.current;
    cancelAnimationFrame(F.raf);
    if (prefersReducedMotion()) {
      [F.f, F.v] = [i, 0];
      return paintFocus();
    }
    const k = 160, c = 2 * Math.sqrt(k); // stiffness; damping for no overshoot (~0.4 s)
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      F.v += (-k * (F.f - i) - c * F.v) * dt;
      F.f += F.v * dt;
      if (Math.abs(F.f - i) < 0.002 && Math.abs(F.v) < 0.02) [F.f, F.v] = [i, 0];
      paintFocus();
      if (F.f !== i || F.v !== 0) F.raf = requestAnimationFrame(step);
    };
    F.raf = requestAnimationFrame(step);
  };
  useEffect(() => {
    if (phone) glideTo(ALGORITHMS.indexOf(attack));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attack, phone]);
  useEffect(() => {
    const el = tabs.current;
    if (!phone || !el) return;
    const F = focus.current;
    F.f = ALGORITHMS.indexOf(attack);
    paintFocus();
    let x0 = 0, y0 = 0, f0 = 0, lock: "x" | "y" | null = null, id = -1, lx = 0, lt = 0;
    const down = (e: PointerEvent) => {
      [x0, y0, f0, lock, id, lx, lt] = [e.clientX, e.clientY, F.f, null, e.pointerId, e.clientX, e.timeStamp];
      F.dragged = false;
      F.v = 0;
      cancelAnimationFrame(F.raf);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (!lock && Math.hypot(dx, dy) > 8) {
        lock = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (lock === "x") el.setPointerCapture(id);
      }
      if (lock !== "x") return;
      F.dragged = true;
      const unit = el.clientWidth / 3;
      // 1:1 with the finger; past either end it rubber-bands instead of stopping hard
      const raw = f0 - dx / unit, over = raw < 0 ? raw : raw > 2 ? raw - 2 : 0;
      F.f = Math.max(0, Math.min(2, raw)) + (over * 0.35) / (1 + Math.abs(over));
      const dt = (e.timeStamp - lt) / 1000;
      if (dt > 0) F.v = 0.7 * F.v + 0.3 * (-(e.clientX - lx) / unit / dt); // smoothed finger speed, items per second
      [lx, lt] = [e.clientX, e.timeStamp];
      paintFocus();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      if (lock !== "x") return;
      // a flick carries on to the next one, but one swipe moves one step at most
      const from = Math.round(f0), aim = Math.round(F.f + F.v * 0.15);
      const i = Math.max(0, Math.min(2, Math.max(from - 1, Math.min(from + 1, aim))));
      setAttack(ALGORITHMS[i]);
      glideTo(i);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      cancelAnimationFrame(F.raf);
      [...el.children].forEach((b) => (b as HTMLElement).style.removeProperty("--p"));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  // phones: brute force and the dictionary run without the 3D (Mihai: the machine is too small there to add
  // anything); the same visuals run on a plain clock that starts once the panel is on screen
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = tabs.current; // the panel itself is display: contents on phones (no box to observe)
    if (!phone || !el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 1 });
    io.observe(el);
    return () => io.disconnect();
  }, [phone, seen]);
  const [clock] = useState(clockOnly);
  useEffect(() => () => clock.dispose(), [clock]);

  // the 3D loads when the section comes near (three.js + the GLB the hero already cached), never before
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let made: Stage | null = null, off = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        setStageState("loading");
        import("./method/stage")
          .then(({ createStage }) => createStage(el, prefersReducedMotion()))
          .then((s) => {
            if (off) return s.dispose();
            made = s;
            setStage(s);
            setStageState("ready");
          })
          .catch(() => !off && setStageState("error"));
      },
      { rootMargin: "900px 0px" },
    );
    io.observe(el);
    return () => {
      off = true;
      io.disconnect();
      made?.dispose();
    };
  }, []);

  // ground truth for the checks (and the Caesar text of step 1): the decoder's truth, else the archive's
  const [known, setKnown] = useState<Known | null>(null);
  useEffect(() => {
    let off = false;
    setKnown(truth ? { key: truth.key, plaintext: truth.plaintext } : null);
    if (!truth && mission?.archiveId)
      revealMessage(mission.archiveId)
        .then((r) => !off && setKnown(r))
        .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [mission?.ciphertext, mission?.archiveId, truth]);

  const keyLength = known?.key.length ?? mission?.summary?.key_length ?? null;
  const panelProps = { stage: phone && attack !== "frequency" ? (seen ? clock : null) : stage, mission, known };

  return (
    <section className="section" id="algoritmi" aria-labelledby="method-h">
      <div className="section-head">
        <h2 id="method-h">{M.heading}</h2>
        <p>{M.intro}</p>
      </div>
      <div className="mx">
        <div className="mx-tabs" role="group" aria-label={M.pick} ref={tabs}>
          {ALGORITHMS.map((id, i) => (
            <button
              key={id}
              type="button"
              className="mx-tab"
              aria-pressed={attack === id}
              aria-label={`0${i + 1} ${t.algorithms.names[id]}`}
              onClick={() => {
                if (focus.current.dragged) return (focus.current.dragged = false); // the drag already picked
                setAttack(id);
              }}
            >
              <span className="mx-tab-i" aria-hidden="true">
                0{i + 1}
              </span>
              <span className="mx-tab-name">{t.algorithms.names[id]}</span>
            </button>
          ))}
        </div>
        <div className="mx-body">
          <div className="mx-stage" data-view={mission && attack === "frequency" ? "keys" : "machine"} data-ready={stageState === "ready"} aria-hidden="true">
            <canvas ref={canvas} />
            {stageState !== "ready" && stageState !== "error" && (
              <img className="mx-stage-ghost skel-ghost" src={`${import.meta.env.BASE_URL}hero/still-phone.webp`} alt="" decoding="async" />
            )}
            {stageState !== "ready" && (
              <p className={`mx-stage-note ${stageState === "error" ? "is-error" : "sr-only"}`} aria-busy={stageState === "loading"}>
                {stageState === "error" ? M.stage.error : M.stage.loading}
              </p>
            )}
          </div>
          <div className="mx-panel">
            <div className="mx-title">
              <h3>{t.algorithms.names[attack]}</h3>
              <code>{t.algorithms.complexity[attack]}</code>
            </div>
            {!mission ? (
              <p className="hint">{M.noMessage}</p>
            ) : attack === "brute-force" ? (
              <BruteForce key={mission.ciphertext} {...panelProps} cap={maxKeyLength} keyLength={keyLength} />
            ) : attack === "dictionary" ? (
              <Dictionary key={mission.ciphertext} {...panelProps} />
            ) : (
              <Frequency key={mission.ciphertext} {...panelProps} />
            )}
          </div>
        </div>
      </div>
      <Near minHeight={160}>
        <Experiments mission={mission} missionTitle={missionTitle} truth={truth} />
      </Near>
    </section>
  );
}

/** Phones: the Stage contract with no machine, only the clock (frames advance while the tab is visible). */
function clockOnly(): Stage {
  type Player = { el: number; ms: number; fn: (k: number) => void; res: () => void };
  const players = new Set<Player>();
  let raf = 0, last = 0;
  const frame = (now: number) => {
    const dt = Math.min(100, now - last);
    last = now;
    for (const p of players) {
      p.el = Math.min(p.ms, p.el + dt);
      p.fn(p.el / p.ms);
      if (p.el >= p.ms) {
        players.delete(p);
        p.res();
      }
    }
    raf = players.size ? requestAnimationFrame(frame) : 0;
  };
  return {
    view() {},
    heat() {},
    press() {},
    paper() {},
    play(ms, fn) {
      if (prefersReducedMotion() || ms <= 0) {
        fn(1);
        return Promise.resolve();
      }
      return new Promise<void>((res) => {
        players.add({ el: 0, ms, fn, res });
        if (!raf) {
          last = performance.now();
          raf = requestAnimationFrame(frame);
        }
      });
    },
    stop() {
      players.clear(); // their promises never resolve: the caller started something newer
    },
    dispose() {
      cancelAnimationFrame(raf);
      players.clear();
    },
  };
}
