import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { prefersReducedMotion } from "../utils/a11y";
import Galaxy from "../components/Galaxy";
import type { HeroMessage } from "./timeline";
import type { HeroMode } from "./engine";
import Icon from "../components/Icon";

const BASE = import.meta.env.BASE_URL;
// start fetching the hero code at page load instead of after the messages arrive (three.js only where it is used)
const engineModule = import("./engine");
const asset = (p: string) => `${BASE}hero/${p}`;
const STILL = { w: 1200, h: 1008 }; // public/hero/still-phone.webp (rendered from the live scene, alpha)

// Phones ("strips": a touch screen whose short side is under 600 px, or under 600 px wide) get the one-column
// composition; the still is their placeholder until the live 3D lands (Mihai 2026-11-05: the assembly is the wow).
function pickMode(): HeroMode {
  const forced = import.meta.env.DEV ? new URLSearchParams(location.search).get("mode") : null; // dev: ?mode=tablet
  if (forced === "cinema" || forced === "tablet" || forced === "strips") return forced;
  const w = innerWidth, phone = w < 600 || (matchMedia("(pointer: coarse)").matches && Math.min(w, innerHeight) < 600);
  return phone ? "strips" : w >= 1024 ? "cinema" : "tablet";
}
void import("./scene");

// eCarnet's load gate: the skeleton holds for as long as the fonts and the 3D take (Mihai 2026-11-10: no time limit), then
// lifts and the assembly plays in full view. Only a real failure opens it without the 3D (`modelIn` from the catch paths).
// Once per page: a mode change (tablet turned) does not bring it back.
let modelIn: () => void = () => undefined;
const modelReady = new Promise<void>((r) => (modelIn = r));
let lift: () => void = () => undefined;
const lifted = new Promise<void>((r) => (lift = r));
void Promise.all([document.fonts?.ready ?? Promise.resolve(), modelReady]).then(() => lift());

// latest dock request from the composer, replayed when the engine starts
const dockState: { stage: HTMLElement | null; big: HTMLElement | null; text: string } = { stage: null, big: null, text: "" };

export default function Hero() {
  const { t, lang } = useLanguage();
  const root = useRef<HTMLDivElement>(null);
  const gl = useRef<HTMLCanvasElement>(null);
  const rib = useRef<HTMLCanvasElement>(null);
  const poster = useRef<HTMLImageElement>(null);
  const engine = useRef<ReturnType<typeof import("./engine").startHero> | null>(null);
  const [mode, setMode] = useState(pickMode);
  // a tablet turned between portrait and landscape crosses 1024 px: restart the hero in the other composition
  useEffect(() => {
    const onResize = () => setMode(pickMode());
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);
  const [reduced] = useState(prefersReducedMotion);
  const [messages, setMessages] = useState<HeroMessage[]>([]);
  const [titled, setTitled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [canReplay, setCanReplay] = useState(reduced);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void lifted.then(() => setLoaded(true));
  }, []);

  // the hero's code or messages failed: nothing will ever call onModel, so show the headline and copy instead of a skeleton forever
  const noHero = () => {
    setTitled(true);
    modelIn();
  };

  useEffect(() => {
    let off = false;
    fetch(asset("hero-messages.json"))
      .then((r) => r.json())
      .then((m: HeroMessage[]) => !off && setMessages(m))
      .catch(noHero);
    return () => {
      off = true;
    };
  }, []);

  useEffect(() => {
    if (!messages.length || !root.current || !gl.current || !rib.current) return;
    let alive = true;
    engineModule.then(({ startHero }) => {
      if (!alive) return;
      engine.current = startHero(
        { root: root.current!, gl: gl.current!, ribbons: rib.current!, poster: poster.current },
        mode,
        reduced,
        messages,
        asset("apa-no-10.rig.min.glb"),
        {
          onTitle: () => setTitled(true),
          onModel: () => modelIn(),
          gate: lifted,
        },
      );
      // the composer may have opened before the engine started
      engine.current.dock(dockState.stage, dockState.big);
      engine.current.type(dockState.text);
    }, noHero);
    return () => {
      alive = false;
      engine.current?.dispose();
      engine.current = null;
    };
  }, [messages, mode, reduced]);

  // the starfield follows the theme toggle (ThemeSwitch sets <html data-theme>)
  const [light, setLight] = useState(() => document.documentElement.dataset.theme === "light");
  useEffect(() => {
    const mo = new MutationObserver(() => setLight(document.documentElement.dataset.theme === "light"));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  // own message: the composer registers its stage and reports typing (Composer.tsx); the engine flies the machine there
  useEffect(() => {
    const onDock = (e: Event) => {
      const d = (e as CustomEvent<{ stage: HTMLElement | null; big: HTMLElement | null }>).detail;
      Object.assign(dockState, d);
      engine.current?.dock(d.stage, d.big);
    };
    const onType = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; ch?: string }>).detail;
      dockState.text = d.text;
      engine.current?.type(d.text, d.ch);
    };
    window.addEventListener("hero-dock", onDock);
    window.addEventListener("hero-type", onType);
    return () => {
      window.removeEventListener("hero-dock", onDock);
      window.removeEventListener("hero-type", onType);
    };
  }, []);

  // language switch: the machine half-disassembles and snaps back while the copy fades (LanguageContext)
  useEffect(() => {
    const onSwitch = () => engine.current?.regroup();
    window.addEventListener("lang-switch", onSwitch);
    return () => window.removeEventListener("lang-switch", onSwitch);
  }, []);

  function togglePause() {
    const next = !paused;
    setPaused(next);
    engine.current?.setPaused(next);
  }

  // phone portrait and tablets (Mihai 2026-11-05, 11-10): the headline sits on one line, sized to the screen's width
  useLayoutEffect(() => {
    const h = root.current?.querySelector<HTMLElement>(".hero-title");
    if (!h) return;
    const fit = () => {
      h.style.fontSize = "";
      if (mode === "cinema") {
        // desktop keeps its CSS size; only a longer language (Russian, in a fallback face) is shrunk to fit the width
        const r = document.createRange();
        r.selectNodeContents(h);
        const cs = getComputedStyle(h);
        const avail = h.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const w = r.getBoundingClientRect().width;
        if (w > avail) h.style.fontSize = `${Math.floor((parseFloat(cs.fontSize) * avail) / w)}px`;
        return;
      }
      if (mode === "strips" && innerWidth > innerHeight) return; // landscape phones keep their two-line title in the right column
      h.style.fontSize = "100px";
      const r = document.createRange();
      r.selectNodeContents(h);
      const cs = getComputedStyle(h);
      const avail = h.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      h.style.fontSize = `${Math.floor((100 * avail) / r.getBoundingClientRect().width)}px`;
    };
    fit();
    void document.fonts?.ready.then(fit);
    addEventListener("resize", fit);
    return () => {
      removeEventListener("resize", fit);
      h.style.fontSize = ""; // a window widened into cinema mode goes back to the CSS size
    };
  }, [mode, t.hero.title, lang]);

  const [titleA, titleB] = t.hero.title.split(" & ");

  return (
    <section className={`hero hero--${mode} ${loaded ? "is-loaded" : ""}`} id="top" ref={root} aria-labelledby="hero-h" aria-busy={!loaded}>
      {/* loading skeleton (eCarnet's): mirrors this mode's layout, shimmers, fades out when the gate lifts */}
      <div className="hero-skeleton" aria-hidden="true">
        <i className="sk sk-title" />
        <i className="sk sk-machine" />
        <span className="sk-copy">
          <i className="sk sk-line" />
          <i className="sk sk-line" />
          <i className="sk sk-line sk-short" />
        </span>
        <i className="sk sk-btn" />
      </div>
      <Galaxy
        className="hero-galaxy"
        aria-hidden="true"
        dpr={1}
        lightMode={light}
        starColors={light ? ["#141512", "#5c5f55", "#5a7400"] : ["#eef0e6", "#8d9184", "#d1fe17"]}
        density={1}
        glowIntensity={0.3}
        flareIntensity={0.6}
        starSpeed={0.5}
        twinkleIntensity={0.3}
        opacity={0.8}
        mouseRepulsion
        clickWarp
      />
      {/* one line on desktop: the longer RO title scales down by its length (--title-k) */}
      <h1
        id="hero-h"
        className={`hero-title ${titled ? "reveal" : "pre"}`}
        style={{ "--title-k": Math.min(1, 18 / t.hero.title.length) } as React.CSSProperties}
      >
        <span className="line">{titleA} &amp;</span> <span className="line">{titleB}</span>
      </h1>
      <canvas ref={rib} className="hero-layer hero-ribbons" aria-hidden="true" />
      <canvas ref={gl} className="hero-layer hero-gl" aria-hidden="true" />
      {mode === "strips" ? (
        <img className="hero-phone-still" src={asset("still-phone.webp")} width={STILL.w} height={STILL.h} alt="" aria-hidden="true" decoding="async" />
      ) : (
        <>
          {/* skeleton while the 3D downloads: a soft, breathing ghost of the machine where it will assemble */}
          <img className="hero-ghost skel-ghost" src={asset("still-phone.webp")} alt="" aria-hidden="true" decoding="async" />
          <img ref={poster} className="hero-layer hero-still" src={asset("poster.webp")} alt="" aria-hidden="true" loading="lazy" hidden />
        </>
      )}

      <div className="hero-ui">
        <div className="hero-copy">
          <p className="hero-lede">{t.hero.lede}</p>
          <p className="sr-only">{t.hero.srDemo}</p>
        </div>
        <div className="hero-ctas">
          {canReplay ? (
            <button
              className="btn hero-pause"
              type="button"
              onClick={() => {
                setCanReplay(false);
                engine.current?.replay();
              }}
            >
              <Icon name="play" size={14} /> {t.hero.replay}
            </button>
          ) : (
            <button className="btn hero-pause" type="button" onClick={togglePause} aria-pressed={paused}>
              <Icon name={paused ? "play" : "pause"} size={14} /> {paused ? t.hero.resume : t.hero.pause}
            </button>
          )}
          <a className="btn primary" href="#decodor">
            {t.hero.ctaPrimary} <Icon name="arrowDown" />
          </a>
        </div>
      </div>
    </section>
  );
}
