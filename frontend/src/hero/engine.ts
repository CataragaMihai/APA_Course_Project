// One requestAnimationFrame clock for the hero: 3D assembly -> timeline -> three.js tweens -> ribbons.
// The clock starts when the model is loaded: the machine assembles over [0, ASSEMBLE] while the cipher
// strands pour in, the H1 rises as it lands, the first key strikes at FIRST_KEY.
import { ASSEMBLE, buildTimeline, type HeroEvent, type HeroMessage, type Timeline } from "./timeline";
import { createRibbons, type Layout } from "./ribbons";
import type { Scene } from "./scene";

export type HeroMode = "cinema" | "tablet" | "strips";

export interface HeroElements {
  root: HTMLElement;
  gl: HTMLCanvasElement;
  ribbons: HTMLCanvasElement;
  poster: HTMLImageElement | null; // shown only if the 3D fails
}

export interface HeroCallbacks {
  onCaption?: (index: number) => void;
  onTitle: () => void; // the machine is landing: reveal the H1
  onModel?: () => void; // the 3D is in (or failed): the page's loading skeleton may lift
  onProgress?: (f: number | null) => void; // download progress of the 3D model, 0..1 (null: the size is unknown)
  /** Resolves when the skeleton has lifted, so the assembly plays in full view (eCarnet's load gate). */
  gate?: Promise<void>;
}

const STILL_AR = 1008 / 1200; // public/hero/still-phone.webp, height / width
const TITLE_AT = ASSEMBLE - 300; // H1 starts rising just before the machine lands
// dev only: ?slow=0.1 runs the whole hero at 10% speed (inspect which typebars move)
const SLOW = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("slow")) || 1 : 1;
const OMEGA = 9;
const REGROUP = 900; // language switch: half-disassemble (out 360 ms), then reassemble
const regroupCurve = (p: number) => {
  const K = 0.5; // how far apart: half the intro's start pose
  if (p < 0.4) return K * (1 - (1 - p / 0.4) ** 3);
  const u = (p - 0.4) / 0.6;
  return K * (1 - (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2));
}; // critically damped timescale spring, ~0.35 s to settle

export function startHero(el: HeroElements, mode: HeroMode, reduced: boolean, messages: HeroMessage[], glbUrl: string, cb: HeroCallbacks) {
  // phones render the hero at the screen's full density (3x on iPhones; the renderer caps at 2 otherwise)
  const BASE_Q = mode === "strips" ? Math.max(1, Math.min(3, devicePixelRatio) / Math.min(devicePixelRatio, 2)) : 1;
  const tl: Timeline = buildTimeline(messages);
  const rib = createRibbons(el.ribbons, tl);
  let scene: Scene | null = null;
  let disposed = false;
  let live = false; // clock running (model loaded)
  let titled = false;
  let regroup = -1; // ms into a language-switch regroup, -1 = idle
  let userPaused = false;
  let lastK = 0; // last explode amount sent to the scene
  let T = 0; // timeline ms
  let scale = 1, scaleV = 0, scaleTarget = 1;
  let fade = 0; // input path reveal 0..1 after the cut
  let onScreen = true;
  let raf = 0;
  let evIndex = 0, evRound = 0;
  let size = { w: el.root.clientWidth, h: el.root.clientHeight };

  // ---- dock (own message): the machine flies from the hero to the composer's stage and back ----
  // fp is the flight progress, 0 = in the hero .. 1 = on the stage, driven by a critically damped spring so a
  // reversal mid-flight starts from where the machine is (apple-design: interruptible, same path both ways).
  // zp blends the landing spot from the stage to the full-screen "big" overlay (double-click), the same way.
  const FLY_OMEGA = 8; // ~0.7 s response
  let stage: HTMLElement | null = null, big: HTMLElement | null = null;
  let fp = 0, fv = 0, zp = 0, zv = 0;
  let where: "hero" | "fly" | "stage" = "hero";
  let typed = "";
  let mrect: { x: number; y: number; w: number; h: number } | null = null;
  let hold: number | null = null;
  let stageOn = false; // docked and the stage is on screen (no rendering while it is scrolled away)
  // drag to spin (radians), with momentum; keyboard typing turns it back to face the user
  let sx = 0, sy = 0, vx = 0, vy = 0, spinHome = false;
  const home = { parent: el.gl.parentElement!, next: el.gl.nextSibling };
  const flyKeys = ["position", "left", "top", "width", "height", "transform", "transformOrigin", "zIndex", "willChange"] as const;
  function moveCanvas(to: typeof where) {
    if (to === where) return;
    where = to;
    const s = el.gl.style;
    if (to === "hero") {
      home.parent.insertBefore(el.gl, home.next);
      for (const k of flyKeys) s[k] = "";
      return;
    }
    (to === "fly" ? document.body : stage!).appendChild(el.gl);
    Object.assign(s, { position: to === "fly" ? "fixed" : "absolute", left: "0", top: "0", width: `${size.w}px`, height: `${size.h}px`, transformOrigin: "0 0", willChange: "transform" });
  }
  function heroVisible(r: DOMRect) {
    return Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / Math.max(1, r.height);
  }
  function skipToNextMessage() {
    // back in the hero: blank sheet, and the demo resumes at the next message (no burst of skipped strikes)
    const ev = tl.typing.events;
    for (let n = 0; n < 2 * ev.length; n++) {
      const e = ev[evIndex];
      if (e.kind === "msg" && e.t + evRound * tl.typing.period >= T) {
        T = e.t + evRound * tl.typing.period;
        return;
      }
      evIndex++;
      if (evIndex >= ev.length) {
        evIndex = 0;
        evRound++;
      }
    }
  }
  const spring = (x: number, v: number, target: number, w: number, dt: number) => {
    v += (-2 * w * v - w * w * (x - target)) * dt;
    x += v * dt;
    return Math.abs(x - target) < 0.001 && Math.abs(v) < 0.01 ? [target, 0] : [x, v];
  };

  // pointer input on the stage / overlay (the canvas itself never takes pointer events: it overflows the stage)
  let input: HTMLElement | null = null;
  let drag: { x: number; y: number; t: number; moved: boolean } | null = null;
  function ndc(e: MouseEvent) {
    const r = el.gl.getBoundingClientRect(); // the transformed canvas
    return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)] as const;
  }
  const onDown = (e: PointerEvent) => {
    if (!scene || fp < 1 || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault(); // keep the focus (and the caret) in the message field
    input!.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    vx = vy = 0;
    spinHome = false;
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now();
    if (!drag.moved && Math.hypot(dx, dy) < 5) return; // hysteresis: a click stays a click
    drag.moved = true;
    const dt = Math.max(1, now - drag.t) / 1000;
    sy += dx * 0.008;
    sx = Math.max(-0.45, Math.min(0.45, sx + dy * 0.004));
    vy = (dx * 0.008) / dt;
    vx = (dy * 0.004) / dt;
    Object.assign(drag, { x: e.clientX, y: e.clientY, t: now });
  };
  const onUp = (e: PointerEvent) => {
    if (!drag) return;
    const click = !drag.moved;
    drag = null;
    if (performance.now() - (lastMove ?? 0) > 80) vx = vy = 0; // held still before release: no throw
    if (click && scene) {
      const [nx, ny] = ndc(e);
      const ch = scene.pick(nx, ny);
      if (ch) window.dispatchEvent(new CustomEvent("hero-key", { detail: ch })); // the composer types it
    }
  };
  let lastMove: number | null = null;
  const onMoveStamp = () => (lastMove = performance.now());
  const onDbl = (e: MouseEvent) => {
    if (!scene || fp < 1) return;
    const [nx, ny] = ndc(e);
    if (!scene.pick(nx, ny)) window.dispatchEvent(new CustomEvent("hero-big")); // a key double-click types twice instead
  };
  function bindInput(next: HTMLElement | null) {
    if (next === input) return;
    if (input) {
      input.removeEventListener("pointerdown", onDown);
      input.removeEventListener("pointermove", onMove);
      input.removeEventListener("pointermove", onMoveStamp);
      input.removeEventListener("pointerup", onUp);
      input.removeEventListener("pointercancel", onUp);
      input.removeEventListener("dblclick", onDbl);
    }
    input = next;
    drag = null;
    if (input) {
      input.addEventListener("pointerdown", onDown);
      input.addEventListener("pointermove", onMove);
      input.addEventListener("pointermove", onMoveStamp);
      input.addEventListener("pointerup", onUp);
      input.addEventListener("pointercancel", onUp);
      input.addEventListener("dblclick", onDbl);
    }
  }

  /** Steps the flight; returns true while the machine is off the hero (the hero loop then stays frozen). */
  function updateDock(dt: number, heroRect: DOMRect): boolean {
    if (!scene) return false;
    let want = false;
    let sr: DOMRect | null = null;
    if (stage && stage.isConnected) {
      sr = stage.getBoundingClientRect();
      const inView = sr.top < innerHeight * 0.85 && sr.bottom > innerHeight * 0.15;
      stageOn = sr.bottom > 0 && sr.top < innerHeight;
      want = (heroVisible(heroRect) < 0.35 || !!big) && (fp > 0 || inView);
    }
    const target = want ? 1 : 0, ztarget = want && big ? 1 : 0;
    const sdt = (dt * SLOW) / 1000;
    if (reduced) {
      if (fp !== target && target === 1) el.gl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
      [fp, fv, zp, zv] = [target, 0, ztarget, 0];
    } else {
      [fp, fv] = spring(fp, fv, target, FLY_OMEGA, sdt);
      fp = Math.max(0, Math.min(1, fp));
      [zp, zv] = spring(zp, zv, ztarget, FLY_OMEGA, sdt);
      zp = Math.max(0, Math.min(1, zp));
    }
    if (hold !== null) [fp, fv] = [hold, 0]; // dev: __hero.hold(p) freezes the flight for frame checks
    if (fp === 0) {
      if (where !== "hero") {
        moveCanvas("hero");
        bindInput(null);
        scene.clearPaper();
        scene.setSpin(0, 0);
        scene.setShadow(1);
        scene.setQuality(BASE_Q);
        [sx, sy, vx, vy] = [0, 0, 0, 0];
        if (reduced) {
          // the still hero: print its first page again
          evIndex = evRound = 0;
          advanceTo(tStatic);
          for (let i = 0; i < 20; i++) scene.step(500);
          paintStatic();
        } else skipToNextMessage();
      }
      return false;
    }
    if (where === "hero") {
      scene.clearPaper();
      scene.setText(typed);
    }
    const landed = fp === 1 && want && zp === 0;
    moveCanvas(landed ? "stage" : "fly");
    el.gl.style.zIndex = zp > 0 ? "310" : "150"; // above the big overlay (300) while it is open
    bindInput(fp === 1 ? (big ?? stage) : null);

    // docked, the machine stands clean, without the floor shadow (Mihai, 2026-11-04); it fades with the flight
    scene.setShadow(1 - fp);

    // spin: momentum decays; typing on the keyboard springs it back to the front, and so does leaving: on the way
    // back to the hero it turns to face front quickly, so it lands in the hero's pose instead of snapping there
    if (!want) {
      drag = null;
      spinHome = true;
    }
    if (!drag) {
      const f = Math.exp(-dt / 280);
      if (spinHome) {
        const w = want ? 9 : 16;
        [sx, vx] = spring(sx, vx, 0, w, dt / 1000);
        [sy, vy] = spring(sy, vy, Math.round(sy / (2 * Math.PI)) * 2 * Math.PI, w, dt / 1000);
      } else {
        sy += vy * (dt / 1000);
        sx = Math.max(-0.45, Math.min(0.45, sx + vx * (dt / 1000)));
        vx *= f;
        vy *= f;
      }
    }
    scene.setSpin(sx, sy);

    // place: the machine's centre travels on one arc from the hero to the landing spot, scaling to fit it
    const mr = (mrect ??= scene.machineRect());
    const mcx = mr.x + mr.w / 2, mcy = mr.y + mr.h / 2;
    const st = sr ?? el.root.getBoundingClientRect();
    const bg = big?.getBoundingClientRect() ?? st;
    const lerp = (a: number, b: number) => a + (b - a) * zp;
    const box = { left: lerp(st.left, bg.left), top: lerp(st.top, bg.top), width: lerp(st.width, bg.width), height: lerp(st.height, bg.height) };
    // the body ends at the stage's foot: on tablets the stage sits above the fields, and the machine must not cover them
    const h3 = stage?.closest(".composer")?.querySelector("h3")?.getBoundingClientRect();
    // one column (phones, tablets): the heading is above the stage, so the stage's own top is the anchor
    const head = h3 && h3.bottom > st.top + 1 ? h3 : null;
    const fit = Math.min((0.82 * st.width) / mr.w, 440 / mr.h, (st.bottom - (head?.top ?? st.top)) / (1.04 * mr.h));
    const s1 = big && zp > 0
      ? lerp(fit, Math.min((0.7 * bg.width) / mr.w, (0.62 * bg.height) / mr.h))
      : fit; // body only (the carriage sticks out by its travel); the stage only reserves room, the machine may overhang it sideways
    const c0 = { x: heroRect.left + mcx, y: Math.max(heroRect.top + mcy, -mr.h / 2) }; // from just above the fold at most
    // stage: the sheet's top sits level with the composer's heading (Mihai; optical, not the stage centre; the
    // machine may stand out of the panel). The blank sheet tops out ~4% of the body height above the body.
    // big view: centred, a little low because the sheet rises
    const dockY = (head ? head.top + 0.04 * s1 * mr.h : st.top) + (s1 * mr.h) / 2;
    const c1 = { x: box.left + box.width / 2, y: lerp(dockY, bg.top + bg.height / 2 + 0.04 * bg.height) };
    const e = fp, q = 1 - e;
    const ctrl = { x: c0.x + (c1.x - c0.x) * 0.7, y: c0.y + (c1.y - c0.y) * 0.3 };
    const cx = q * q * c0.x + 2 * q * e * ctrl.x + e * e * c1.x;
    const cy = q * q * c0.y + 2 * q * e * ctrl.y + e * e * c1.y;
    const sc = 1 + (s1 - 1) * e;
    const ox = where === "stage" ? st.left : 0, oy = where === "stage" ? st.top : 0;
    el.gl.style.transform = `translate3d(${cx - sc * mcx - ox}px, ${cy - sc * mcy - oy}px, 0) scale(${sc})`;
    if (zp === 1) scene.setQuality(Math.max(BASE_Q, Math.min(2, sc))); // sharp when shown larger than in the hero
    else if (zp === 0) scene.setQuality(BASE_Q);
    return true;
  }

  // phone: the two strips run just above and below the still, wherever the flow layout put it
  function stripsY() {
    const s = el.root.querySelector<HTMLElement>(".hero-phone-still");
    if (!s || !s.offsetHeight) {
      const { w, h } = size;
      return { top: 0.28 * h, bottom: 0.66 * h, right: 1.06 * w, inlet: { x: 0.42 * w, y: 0.45 * h }, outlet: { x: 0.52 * w, y: 0.6 * h }, landscape: false, paper: undefined, floor: 0 };
    }
    // object-fit: contain: the drawn image may be shorter than its box
    const drawn = Math.min(s.offsetHeight, s.offsetWidth * STILL_AR), y0 = s.offsetTop + (s.offsetHeight - drawn) / 2;
    // landscape: the still sits in the left column and the strips end at its right edge, clear of the copy
    const dw = drawn / STILL_AR, x1 = s.offsetLeft + (s.offsetWidth + dw) / 2, cx = s.offsetLeft + s.offsetWidth / 2;
    // the machine in the still: the platen (where the cipher goes in) and the foot (where the plaintext comes out)
    const inlet = { x: cx - 0.1 * dw, y: y0 + 0.47 * drawn }, outlet = { x: cx - 0.055 * dw, y: y0 + 0.9 * drawn };
    // the same test as the CSS (a short portrait still is narrow too, so its width cannot tell)
    const landscape = matchMedia("(orientation: landscape)").matches;
    // the sheet's top (20% down the still) and the title's bottom bound the cipher's arch (ribbons.ts arch)
    const t = el.root.querySelector<HTMLElement>(".hero-title");
    // portrait: on a tall screen the box is taller than the drawn image, so the plaintext may use that space below the machine
    return { top: y0 - 14, bottom: landscape ? y0 + drawn + 18 : Math.max(y0 + drawn + 18, s.offsetTop + s.offsetHeight + 8), right: landscape ? x1 : 1.06 * size.w, inlet, outlet, landscape, paper: y0 + 0.2 * drawn, floor: t ? t.offsetTop + t.offsetHeight : 0 };
  }

  function layout(): Layout {
    const { w, h } = size;
    const big = w >= 1700;
    if (mode === "strips") {
      const { top, bottom, right, landscape, paper, floor } = stripsY();
      return { kind: "strips", w, h, glyph: 15, amp: 4, top, bottom, right, curved: !landscape, paper, floor };
    }
    if (mode === "tablet") return { kind: "tablet", w, h, glyph: 16, amp: 8 };
    return { kind: "cinema", w, h, glyph: big ? 20 : 18, amp: Math.max(6, Math.min(14, (10 * w) / 1440)) };
  }

  function anchors() {
    const { w, h } = size;
    if (mode === "strips") {
      const y = stripsY();
      // portrait (Mihai's arrows, 2026-11-05): the cipher arcs into the platen, the plaintext leaves from the foot
      if (!y.landscape) return { west: y.inlet, east: y.outlet };
      // landscape (Mihai 2026-11-10): the cipher runs in at the typewriter's platen, not above it; the plaintext leaves from the left edge
      return { west: y.inlet, east: { x: -0.06 * w, y: y.bottom } };
    }
    if (scene) return scene.anchors();
    return { west: { x: 0.31 * w, y: 0.68 * h }, east: { x: 0.66 * w, y: 0.63 * h } };
  }

  // tablet portrait (art direction): the locked camera alone puts the keyboard
  // under the lede, so the machine is scaled and lens-shifted into the space between the H1 and the copy.
  // Never cropped or faded (Mihai): the whole body plus the sheet's headroom must fit.
  const HEADROOM = 0.35; // sheet + carriage above the body, as a share of the body's height
  function fitFrame() {
    if (!scene) return;
    scene.frame(1, 0, 0);
    if (mode === "strips") return fitStill();
    if (mode !== "tablet") return;
    const { w, h } = size;
    const mr = scene.machineRect();
    const R = el.root.getBoundingClientRect();
    const t = el.root.querySelector(".hero-title")?.getBoundingClientRect();
    const copy = el.root.querySelector(".hero-copy")?.getBoundingClientRect();
    const top = t ? t.bottom - R.top - 0.3 * t.height : 0.25 * h; // the sheet may rise over the title's foot, as on desktop
    const bottom = copy ? copy.top - R.top - 24 : 0.75 * h;
    const avail = bottom - top;
    // width: the carriage overhangs the body by ~30% of its width on either side as it travels along a line
    const k = Math.max(0.4, Math.min(1, (0.96 * w) / (1.6 * mr.w), avail / ((1 + HEADROOM) * mr.h)));
    const stack = (1 + HEADROOM) * k * mr.h;
    const tx = w / 2, ty = top + Math.max(0, (avail - stack) / 2) + HEADROOM * k * mr.h + (k * mr.h) / 2;
    // zoom scales about the canvas centre; then shift the body's centre onto the target
    const cx = w / 2 + k * (mr.x + mr.w / 2 - w / 2), cy = h / 2 + k * (mr.y + mr.h / 2 - h / 2);
    scene.frame(k, tx - cx, ty - cy);
  }

  // phones: the live machine lands exactly where the placeholder still is drawn (its body is 71% of the image width)
  function fitStill() {
    const s = el.root.querySelector<HTMLElement>(".hero-phone-still");
    if (!scene || !s || !s.offsetHeight) return;
    const { w, h } = size;
    const mr = scene.machineRect();
    const drawn = Math.min(s.offsetHeight, s.offsetWidth * STILL_AR), dw = drawn / STILL_AR;
    const top = s.offsetTop + (s.offsetHeight - drawn) / 2;
    const k = Math.min((0.71 * dw) / mr.w, drawn / ((1 + HEADROOM) * mr.h));
    const tx = s.offsetLeft + s.offsetWidth / 2, ty = top + drawn - (k * mr.h) / 2 - 0.06 * drawn;
    const cx = w / 2 + k * (mr.x + mr.w / 2 - w / 2), cy = h / 2 + k * (mr.y + mr.h / 2 - h / 2);
    scene.frame(k, tx - cx, ty - cy);
  }

  function resize() {
    size = { w: el.root.clientWidth, h: el.root.clientHeight };
    mrect = null; // the camera framing changes with the hero's size
    if (where !== "hero") Object.assign(el.gl.style, { width: `${size.w}px`, height: `${size.h}px` });
    rib.resize(layout());
    scene?.resize(size.w, size.h);
    fitFrame();
    if (!live) paintStatic();
  }

  function fire(e: HeroEvent) {
    if (e.kind === "msg") cb.onCaption?.(e.index);
    else if (!scene) return;
    else if (e.kind === "press") scene.press(e.ch);
    else if (e.kind === "print") scene.print(e.ch);
    else if (e.kind === "eject") scene.eject();
    else scene.cr();
  }

  function advanceTo(t: number) {
    for (;;) {
      const e = tl.typing.events[evIndex];
      if (e.t + evRound * tl.typing.period > t) break;
      fire(e);
      evIndex++;
      if (evIndex >= tl.typing.events.length) {
        evIndex = 0;
        evRound++;
      }
    }
  }

  let last = performance.now();
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(64, now - last);
    last = now;
    if (document.hidden) return;
    // scrolling away: over the first 60% of the hero's height the flow slows to a stop; scrolling back resumes it.
    // The machine stays assembled (Mihai, 2026-11-04: the scroll-linked disassembly made scrolling stagger)
    const r = el.root.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, -r.top / (0.6 * r.height)));
    const away = u * u * (3 - 2 * u);
    if (updateDock(dt, r)) {
      // off the hero: the demo is frozen; the user's keys still animate (real time)
      if (T < ASSEMBLE) {
        T = Math.min(ASSEMBLE, T + dt);
        scene?.assemble(T);
      }
      if (lastK !== 0 && T >= ASSEMBLE) {
        scene?.explode(0); // a language-switch regroup cut short by the flight
        lastK = 0;
      }
      scene?.step(dt);
      if (where === "fly" || stageOn) scene?.render();
      return;
    }
    if (!onScreen) return;
    scaleTarget = userPaused ? 0 : 1 - away;
    // critically damped spring toward the target timescale
    scaleV += (-2 * OMEGA * scaleV - OMEGA * OMEGA * (scale - scaleTarget)) * (dt / 1000);
    scale = Math.max(0, Math.min(1, scale + scaleV * (dt / 1000)));
    if (scaleTarget === 0 && scale < 0.002) scale = 0;
    if (!live) return;
    const sdt = dt * scale * SLOW;
    T += sdt;
    fade = Math.max(fade, Math.min(1, T / ASSEMBLE));
    if (T < 400) el.gl.style.opacity = String(Math.min(1, T / 300));
    scene?.assemble(T);
    let k = 0; // only the language switch regroups the machine now
    if (regroup >= 0) {
      regroup += dt; // real time: it plays even while the demo is paused
      const p = Math.min(1, regroup / REGROUP);
      k = Math.max(k, p < 1 ? regroupCurve(p) : 0);
      if (p >= 1) regroup = -1;
    }
    if (k !== lastK && T >= ASSEMBLE) {
      scene?.explode(k);
      lastK = k;
    }
    if (!titled && T >= TITLE_AT) {
      titled = true;
      cb.onTitle();
    }
    advanceTo(T);
    scene?.step(sdt);
    rib.draw(T, anchors(), { fadeIn: fade, breathe: true, dt: sdt });
    scene?.render();
  }

  // reduced motion: the first full page printed, ribbons frozen, nothing loops
  const tStatic = tl.typing.still;
  function paintStatic() {
    if (!reduced) return;
    rib.draw(tStatic, anchors(), { fadeIn: 1, breathe: false, dt: 0, frozen: true });
    scene?.render();
  }

  function start() {
    if (disposed || live) return;
    if (reduced) {
      el.gl.style.opacity = "1";
      scene?.assemble(ASSEMBLE);
      advanceTo(tStatic);
      for (let i = 0; i < 20; i++) scene?.step(500);
      T = tStatic;
      cb.onCaption?.(0);
      titled = true;
      cb.onTitle();
      paintStatic();
      return;
    }
    scene?.assemble(0);
    live = true;
    T = 0;
  }

  // ---- start ----
  rib.resize(layout());
  const ro = new ResizeObserver(resize);
  ro.observe(el.root);
  // the H1's size lands with its font: phones' strips follow the still, tablets' machine is framed under the title
  const still = el.root.querySelector(".hero-phone-still");
  const watched = mode === "tablet" ? el.root.querySelector(".hero-title") : still;
  if (watched) ro.observe(watched);
  const io = new IntersectionObserver(([e]) => (onScreen = e.isIntersecting));
  io.observe(el.root);
  raf = requestAnimationFrame(frame);

  el.gl.style.opacity = "0";
  const ghost = el.root.querySelector<HTMLElement>(".hero-ghost");
  // a running CSS animation beats an inline opacity, so the ghost's breathing has to stop too
  const vanish = (ph: HTMLElement | null) => ph && Object.assign(ph.style, { animation: "none", opacity: "0" });
  import("./scene")
    .then(({ createScene }) => createScene(el.gl, glbUrl, size.w, size.h, cb.onProgress))
    .then((s) => {
      if (disposed) return s.dispose();
      scene = s;
      s.setQuality(BASE_Q);
      s.resize(size.w, size.h); // the hero may have resized while the model loaded
      fitFrame();
      document.documentElement.dataset.hero3d = ""; // the composer shows its machine stage only with live 3D
      for (const ph of [still as HTMLElement | null, ghost]) vanish(ph); // the live machine takes over from the placeholder
      cb.onModel?.();
      void (cb.gate ?? Promise.resolve()).then(start);
    })
    .catch((e) => {
      // no 3D: show the poster (phones keep their still) and still run the ribbons from the fallback anchors
      console.error("hero 3D failed", e);
      vanish(ghost);
      if (el.poster) el.poster.hidden = false;
      cb.onModel?.();
      void (cb.gate ?? Promise.resolve()).then(start);
    });

  const api = {
    setPaused(p: boolean) {
      userPaused = p;
    },
    regroup() {
      if (live && !reduced && T >= ASSEMBLE && where === "hero") regroup = 0;
    },
    /** The composer's stage while "own message" is open, or null. */
    dock(st: HTMLElement | null, bigEl: HTMLElement | null = null) {
      stage = st;
      big = st ? bigEl : null;
    },
    /** The user's text field changed; `ch` is the one character just typed, if any. */
    type(text: string, ch?: string) {
      typed = text;
      if (where === "hero" || !scene) return;
      if (ch && !reduced) scene.press(ch);
      if (ch) spinHome = true; // typing: the machine turns back to face the user
      scene.setText(text);
    },
    replay() {
      // reduced motion opt-in: run the normal loop
      reduced = false;
      live = true;
      userPaused = false;
      scale = scaleTarget = 1;
      fade = 1;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      bindInput(null);
      moveCanvas("hero"); // React owns the canvas: give it back where it was
      delete document.documentElement.dataset.hero3d;
      ro.disconnect();
      io.disconnect();
      scene?.dispose();
    },
  };
  (window as unknown as { __hero: unknown }).__hero = {
    get T() { return T; },
    get scale() { return scale; },
    get live() { return live; },
    get fp() { return fp; },
    hold: (p: number | null) => (hold = import.meta.env.DEV ? p : null),
    get where() { return where; },
    get docked() { return !!stage && stage.isConnected; },
    machineRect: () => scene?.machineRect(),
    pick: (x: number, y: number) => scene?.pick(x, y),
    get input() { return input?.className; },
    timeline: tl,
    get scene() { return scene?.debug; },
    anchors,
    api,
  };
  return api;
}
