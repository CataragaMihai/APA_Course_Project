// The Method section's typewriter: the hero's own scene (hero/scene.ts, same GLB, already cached), seen from
// a second camera. One WebGL context for all three attacks; it renders only while on screen and only while
// something moves (a sweep, a key, a camera glide, a heat change), so it never runs next to the hero's loop.
import type { PerspectiveCamera, Mesh, MeshStandardMaterial, Object3D, Texture } from "three";
import type { Scene } from "../../hero/scene";

export type View = "keys" | "machine";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GLB = `${import.meta.env.BASE_URL}hero/apa-no-10.rig.min.glb`;

// ---- heat colours: one green hue, light -> dark with the share of the text (OKLCH, chroma eased at the ends) ----
function oklchToRgb(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return lin.map((x) => {
    const v = Math.min(1, Math.max(0, x));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  }) as [number, number, number];
}
/** t in 0..1 (rare .. frequent). The same ramp draws the HTML legend (Method.tsx). */
// Two segments with a small step between them: no fill sits in the band (L ~0.54-0.60) where neither ink reaches 4.5:1
export const heatL = (t: number) => (t < 0.64 ? 0.95 - (0.34 * t) / 0.64 : 0.515 - (0.145 * (t - 0.64)) / 0.36);
export const heatC = (t: number) => 0.035 + 0.1 * Math.sin((Math.PI / 2) * Math.min(1, t * 1.15));
export const HEAT_HUE = 150;
const lum = ([r, g, b]: number[]) => {
  const f = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const INK_DARK: [number, number, number] = [18, 22, 16];
const INK_LIGHT: [number, number, number] = [241, 243, 234];
const ratio = (x: number, y: number) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
/** Fill and the letter ink with the higher contrast on it (WCAG ratio, >= 4.5 across the whole ramp). */
export function heatColour(t: number) {
  const fill = oklchToRgb(heatL(t), heatC(t), HEAT_HUE);
  const lf = lum(fill), dark = ratio(lf, lum(INK_DARK)), light = ratio(lf, lum(INK_LIGHT));
  return { fill, ink: dark >= light ? INK_DARK : INK_LIGHT, contrast: Math.max(dark, light) };
}

const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

export interface Stage {
  view(v: View): void;
  /** Share of the text per letter A..Z (0..1), shown against `scale` (the share that is darkest). null = plain keys. */
  heat(shares: number[] | null, scale: number, instant?: boolean): void;
  press(ch: string): void;
  paper(text: string): void;
  /** Runs fn(k) once per rendered frame with k going 0 -> 1 over ms (paused while off screen). Resolves at 1. */
  play(ms: number, fn: (k: number) => void): Promise<void>;
  stop(): void;
  dispose(): void;
}

export async function createStage(canvas: HTMLCanvasElement, reduced: boolean): Promise<Stage> {
  const [{ createScene }, { ASSEMBLE }, THREE] = await Promise.all([import("../../hero/scene"), import("../../hero/timeline"), import("three")]);
  const size = () => ({ w: Math.max(1, canvas.clientWidth), h: Math.max(1, canvas.clientHeight) });
  let { w, h } = size();
  const scene: Scene = await createScene(canvas, GLB, w, h);
  scene.assemble(ASSEMBLE);
  scene.setShadow(0.6);
  // phones: cap the pixel ratio at 1.5 (the scene caps at 2)
  const dpr = Math.min(devicePixelRatio, 2);
  if (matchMedia("(pointer: coarse)").matches || w < 640) scene.setQuality(Math.min(1, 1.5 / dpr));
  const cam = scene.debug.cam as PerspectiveCamera;
  const root = scene.debug.scene as Object3D;
  cam.zoom = 1;

  // ---- the key-face atlas, redrawn per heat frame (half the GLB's resolution: faces are small on screen) ----
  let faceMat: MeshStandardMaterial | null = null;
  const faces: Mesh[] = [];
  const tiles: { x: number; y: number; w: number; h: number }[] = [];
  const kb = new THREE.Box3();
  for (const ch of LETTERS) {
    const key = root.getObjectByName(`Key_${ch}`)!;
    kb.expandByPoint(key.getWorldPosition(new THREE.Vector3()));
    let face: Mesh | null = null;
    key.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh && (mesh.material as MeshStandardMaterial).map) face = mesh;
    });
    const uv = (face as Mesh | null)?.geometry.attributes.uv;
    if (!face || !uv) throw new Error(`no face on Key_${ch}`);
    faceMat = (face as Mesh).material as MeshStandardMaterial;
    faces.push(face);
    let u0 = 1, u1 = 0, v0 = 1, v1 = 0;
    for (let i = 0; i < uv.count; i++) {
      u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i));
      v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i));
    }
    tiles.push({ x: u0, y: v0, w: u1 - u0, h: v1 - v0 });
  }
  const lb = kb.clone(); // letter keys only: the phone frames just these, as large as the width allows
  root.traverseVisible((o) => /^Key_[^_]+$/.test(o.name) && kb.expandByPoint(o.getWorldPosition(new THREE.Vector3())));
  const mat = faceMat!;
  const src = (mat.map as Texture).image as CanvasImageSource & { width: number; height: number };
  const AW = 1024, AH = Math.round((AW * src.height) / src.width);
  const mk = (cw: number, ch: number) => Object.assign(document.createElement("canvas"), { width: cw, height: ch });
  const base = mk(AW, AH);
  const bg = base.getContext("2d")!;
  bg.drawImage(src, 0, 0, AW, AH);
  // heat labels are redrawn solid (the GLB's letters are thin outlines, too faint on a pale fill), in the paper's face
  const glyphs = tiles.map((t) => ({ x: Math.round(t.x * AW), y: Math.round(t.y * AH), w: Math.round(t.w * AW), h: Math.round(t.h * AH) }));
  const atlas = mk(AW, AH);
  const ag = atlas.getContext("2d")!;
  ag.drawImage(base, 0, 0);
  const tex = new THREE.CanvasTexture(atlas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // heat on: the letter faces become unlit, untoned stickers, so each key shows exactly its legend colour (the
  // lit material added a pale sheen that washed the darkest greens out); heat off: the hero's own material again
  const heatMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });

  let litOn = false;
  function lit(on: boolean) {
    if (on === litOn) return;
    litOn = on;
    for (const f of faces) f.material = on ? heatMat : mat;
  }
  // compile the heat material now, not on the first click (a ~0.4 s hitch on the switch to frequency analysis)
  lit(true);
  scene.render();
  lit(false);
  let shown = new Array(26).fill(0), from = shown, to = shown, scale = 0.12, amount = 0, amountFrom = 0, amountTo = 0;
  let heatT = 1, heatDirty = true;
  function drawHeat() {
    heatDirty = false;
    ag.globalAlpha = 1;
    ag.drawImage(base, 0, 0);
    lit(amount > 0.001);
    if (amount <= 0.001) {
      tex.needsUpdate = true;
      return;
    }
    ag.globalAlpha = amount;
    ag.textAlign = "center";
    ag.textBaseline = "middle";
    glyphs.forEach((g, i) => {
      const c = heatColour(Math.min(1, shown[i] / scale));
      ag.fillStyle = `rgb(${c.fill.join(",")})`;
      ag.fillRect(g.x, g.y, g.w, g.h);
      ag.fillStyle = `rgb(${c.ink.join(",")})`;
      ag.font = `700 ${Math.round(g.h * 0.62)}px "Courier Prime", "Courier New", monospace`;
      ag.fillText(LETTERS[i], g.x + g.w / 2, g.y + g.h * 0.54);
    });
    tex.needsUpdate = true;
  }

  // ---- cameras: the keyboard from above, or the whole machine with its paper ----
  const keysView = (narrow: boolean) => {
    const b = narrow ? lb : kb, m = narrow ? 0.035 : 0.115;
    const c = b.getCenter(new THREE.Vector3()).add(new THREE.Vector3(0, 0, narrow ? 0 : -0.02));
    return { target: c, dir: new THREE.Vector3(0, Math.sin(1.05), Math.cos(1.05)), hw: (b.max.x - b.min.x) / 2 + m, hh: ((b.max.z - b.min.z) / 2) * Math.sin(1.05) + m };
  };
  // the whole machine (the floor's shadow catcher left out), seen from the hero's 35° angle
  const mb = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverseVisible((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh && (mesh.material as { type?: string }).type !== "ShadowMaterial") mb.expandByObject(mesh);
  });
  const mc = mb.getCenter(new THREE.Vector3());
  const md = new THREE.Vector3(0, 1.778, 2.539).normalize();
  const views: Record<View, { target: InstanceType<typeof THREE.Vector3>; dir: InstanceType<typeof THREE.Vector3>; hw: number; hh: number }> = {
    keys: keysView(false),
    // perspective: the keyboard sits nearer than the target, so the fit box is wider than the body itself
    machine: { target: new THREE.Vector3(0, mc.y - 0.15, mc.z + 0.04), dir: md, hw: 0.8, hh: 0.6 },
  };
  let current: View = "keys";
  // art-directed per viewport: on a phone the keyboard view crops to the letter rows
  const fit = (v: View) => {
    const { target, dir, hw, hh } = v === "keys" && w < 640 ? keysView(true) : views[v];
    const tv = Math.tan((cam.fov * Math.PI) / 360), th = tv * cam.aspect;
    return { pos: target.clone().addScaledVector(dir, Math.max(hw / th, hh / tv)), target: target.clone() };
  };
  let camFrom = fit(current), camTo = camFrom, camT = 1;
  const look = new THREE.Vector3();
  function placeCam(k: number) {
    const e = ease(k);
    cam.position.lerpVectors(camFrom.pos, camTo.pos, e);
    look.lerpVectors(camFrom.target, camTo.target, e);
    cam.lookAt(look);
  }
  placeCam(1);

  // ---- loop ----
  type Player = { el: number; ms: number; fn: (k: number) => void; res: () => void };
  const players = new Set<Player>();
  let raf = 0, last = 0, visible = false, dirty = true, disposed = false, shownOnce = false;
  const busy = () => players.size > 0 || camT < 1 || heatT < 1 || heatDirty || dirty || (scene.debug.tasks as number) > 0;
  function kick() {
    if (!raf && visible && !disposed && !document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }
  function frame(now: number) {
    raf = 0;
    const dt = Math.min(64, now - last);
    last = now;
    for (const p of [...players]) {
      p.el += dt;
      const k = Math.min(1, p.el / p.ms);
      p.fn(k);
      if (k >= 1) {
        players.delete(p);
        p.res();
      }
    }
    if (camT < 1) {
      camT = Math.min(1, camT + dt / 900);
      placeCam(camT);
    }
    if (heatT < 1) {
      heatT = Math.min(1, heatT + dt / 450);
      const e = ease(heatT);
      shown = from.map((f, i) => f + (to[i] - f) * e);
      amount = amountFrom + (amountTo - amountFrom) * e;
      heatDirty = true;
    }
    if (heatDirty) drawHeat();
    scene.step(dt);
    scene.render();
    dirty = false;
    shownOnce = true;
    if (busy()) kick();
  }
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    kick();
  });
  io.observe(canvas);
  const ro = new ResizeObserver(() => {
    ({ w, h } = size());
    scene.resize(w, h);
    camFrom = camTo = fit(current);
    camT = 1;
    placeCam(1);
    dirty = true;
    kick();
  });
  ro.observe(canvas);
  const onVis = () => kick();
  document.addEventListener("visibilitychange", onVis);

  return {
    view(v) {
      if (v === current) return;
      current = v;
      const k = ease(camT);
      camFrom = { pos: cam.position.clone(), target: camFrom.target.clone().lerp(camTo.target, k) };
      camTo = fit(v);
      // the first view is a cut (nothing to glide from yet); later ones glide unless motion is reduced
      camT = reduced || !shownOnce ? 1 : 0;
      if (camT === 1) placeCam(1);
      kick();
    },
    heat(shares, s, instant = false) {
      from = shown;
      to = shares ?? shown;
      amountFrom = amount;
      amountTo = shares ? 1 : 0;
      if (shares) scale = s;
      heatT = instant || reduced ? 1 : 0;
      if (heatT === 1) [shown, amount] = [to, amountTo];
      heatDirty = true;
      kick();
    },
    press(ch) {
      if (reduced) return;
      scene.press(ch);
      kick();
    },
    paper(text) {
      scene.setText(text);
      kick();
    },
    play(ms, fn) {
      if (reduced || ms <= 0) {
        fn(1);
        kick();
        return Promise.resolve();
      }
      return new Promise((res) => {
        players.add({ el: 0, ms, fn, res });
        kick();
      });
    },
    stop() {
      players.clear(); // their promises never resolve: the caller started something newer
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      tex.dispose();
      heatMat.dispose();
      scene.dispose();
    },
  };
}
