import { useLayoutEffect, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { format } from "../i18n/translations";
import { TEAM } from "../team";
import { prefersReducedMotion } from "../utils/a11y";
import Icon from "./Icon";

type Phase = "closed" | "opening" | "open" | "closing";
type Disc = { x: number; y: number; d: number; rot: number }; // centre relative to the section, diameter, tilt

const MORPH = { duration: 560, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }; // the drawer curve: quick start, long settle
const STAGGER = 45;
const CROP = 500 / 960; // the disc photo is a square this share of the card width, around the face (team.ts)
// cards follow the discs left to right (front disc in the middle), so no two morph paths cross
const ORDER = [1, 0, 2];

/**
 * "Our team": a small layered stack of discs (GitHub-contributor style) that morphs into portrait cards and back
 * (Mihai, 2026-11-04: "smooth between the morphing", not a fade). Each card starts clipped to a circle around the
 * face, scaled and tilted exactly onto its disc, then the clip opens to the rounded card while it travels home.
 */
export default function Team() {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<Phase>("closed");
  const root = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const discs = useRef<Disc[]>([]); // where the discs actually were when clicked (maybe fanned out by hover): the open starts here
  const restDiscs = useRef<Disc[]>([]); // where they sit at rest: the close lands here, exactly where they reappear
  const body = useRef<HTMLDivElement>(null); // wraps stack/cards: its height glides between the two layouts
  const closedH = useRef(0);
  const [ringIn, setRingIn] = useState(false); // discs fade their white ring back in after a close

  function keyframes(card: HTMLElement, i: number, from: Disc[] = discs.current): Keyframe[] {
    const sec = root.current!.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    const img = card.querySelector("img")!.getBoundingClientRect();
    const W = r.width, Ht = r.height, fy = TEAM[i].faceY * img.height, fxl = TEAM[i].faceX * W;
    const c = CROP * W, disc = from[i];
    const fx = r.left - sec.left + fxl, fyAbs = r.top - sec.top + fy; // focal point (the face) in section space
    card.style.transformOrigin = `${fxl}px ${fy}px`;
    const s = disc.d / c;
    return [
      {
        transform: `translate(${disc.x - fx}px, ${disc.y - fyAbs}px) rotate(${disc.rot}deg) scale(${s})`,
        clipPath: `inset(${fy - c / 2}px ${W - fxl - c / 2}px ${Ht - fy - c / 2}px ${fxl - c / 2}px round ${c / 2}px)`,
      },
      { transform: "none", clipPath: `inset(0px 0px 0px 0px round 16px)` },
    ];
  }

  function cards() {
    return [...(root.current?.querySelectorAll<HTMLElement>(".team-card") ?? [])];
  }

  function open() {
    if (phase !== "closed") return;
    const sec = root.current!.getBoundingClientRect();
    closedH.current = body.current!.offsetHeight;
    const stack = root.current!.querySelector<HTMLElement>(".team-stack")!;
    const measure = () =>
      [...stack.querySelectorAll<HTMLElement>(".disc")].map((el) => {
        const b = el.getBoundingClientRect(); // a circle: its box centre is its centre at any tilt
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        return { x: b.left - sec.left + b.width / 2, y: b.top - sec.top + b.height / 2, d: el.clientWidth * Math.hypot(m.a, m.b), rot: (Math.atan2(m.b, m.a) * 180) / Math.PI };
      });
    discs.current = measure();
    stack.classList.add("measure"); // rest pose, no transition, for one synchronous read
    restDiscs.current = measure();
    stack.classList.remove("measure");
    setRingIn(false);
    if (prefersReducedMotion()) return setPhase("open");
    // the rings fade out first (120 ms, the press feedback), then the photos lift off
    setPhase("opening");
    window.setTimeout(() => setPhase("open"), 120);
  }

  /** The section's height glides between the stack and the cards instead of jumping (Mihai, 2026-11-04). */
  function glideHeight(from: number, to: number, duration: number) {
    return body.current!.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing: MORPH.easing, fill: "forwards" });
  }

  function close() {
    if (prefersReducedMotion()) return setPhase("closed");
    setPhase("closing");
    const list = cards();
    const dur = MORPH.duration - 80;
    const anims = list.map((el, k) =>
      el.animate(keyframes(el, ORDER[k], restDiscs.current).reverse(), { ...MORPH, duration: dur, delay: (list.length - 1 - k) * STAGGER, fill: "forwards" }),
    );
    const h = glideHeight(body.current!.offsetHeight, closedH.current, dur + (list.length - 1) * STAGGER);
    Promise.all(anims.map((a) => a.finished)).then(() => {
      setRingIn(true);
      setPhase("closed");
      requestAnimationFrame(() => h.cancel()); // the stack's own height takes over (same value)
    });
  }

  // warm the portrait cache so the morph never opens on an empty card
  useLayoutEffect(() => {
    TEAM.forEach((m) => (new Image().src = m.card));
  }, []);

  // open: play the morph from the discs as soon as the cards are laid out (before paint, so no flash)
  useLayoutEffect(() => {
    if (phase !== "open" || prefersReducedMotion() || !discs.current.length) return;
    const list = cards();
    list.forEach((el, k) => el.animate(keyframes(el, ORDER[k]), { ...MORPH, delay: k * STAGGER, fill: "backwards" }));
    const h = glideHeight(closedH.current, body.current!.offsetHeight, MORPH.duration + (list.length - 1) * STAGGER);
    h.finished.then(() => h.cancel());
  }, [phase]);

  // focus follows the toggle across the swap (not on first render: the page must not start focused down here)
  const lastPhase = useRef<Phase>("closed");
  useLayoutEffect(() => {
    if (phase === lastPhase.current) return; // first render, and React's dev double-run: nothing changed
    lastPhase.current = phase;
    if (phase !== "closing") toggle.current?.focus({ preventScroll: true });
  }, [phase]);

  const showCards = phase === "open" || phase === "closing";
  return (
    <section ref={root} className="section team" id="echipa" aria-labelledby="team-h">
      <h2 id="team-h" className="team-title">
        {t.team.heading}
      </h2>
      <div ref={body} className="team-body">
      {showCards ? (
        <div className={`team-open ${phase}`}>
          <ul className="team-cards" id="team-cards">
            {ORDER.map((i) => TEAM[i]).map((m) => (
              <li key={m.name} className="team-card">
                <img src={m.card} alt="" width={480} height={600} />
                <span className="team-name">{m.name}</span>
              </li>
            ))}
          </ul>
          <button
            ref={toggle}
            className="btn small ghost team-collapse"
            type="button"
            aria-expanded={true}
            aria-controls="team-cards"
            onClick={close}
            disabled={phase === "closing"}
          >
            {t.team.collapse} <Icon name="close" size={14} />
          </button>
        </div>
      ) : (
        <button
          ref={toggle}
          className={`team-stack ${phase === "opening" ? "unring" : ""} ${ringIn ? "ring-in" : ""}`}
          type="button"
          aria-expanded={false}
          onClick={open}
        >
          <span className="team-discs" aria-hidden="true">
            {TEAM.map((m) => (
              <img key={m.name} className="disc" src={m.photo} alt="" width={72} height={72} />
            ))}
          </span>
          <span className="team-stack-label">
            {format(t.team.show, { n: TEAM.length })} <Icon name="arrowRight" />
          </span>
          <span className="sr-only">{TEAM.map((m) => m.name).join(", ")}</span>
        </button>
      )}
      </div>
    </section>
  );
}
