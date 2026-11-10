// The live typewriter (camera, lighting, rig, paper).
// The script that drives it is not here: the timeline (timeline.ts) calls press / print / cr,
// and the engine steps the tweens with the same scaled clock as the ribbons.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { NORMAL, STRIKE, rigRod } from "./rod-motion";
import { ASSEMBLE, COLS, PAGE_LINES, wrap } from "./timeline";

// Locked H0 camera: centred, 35° down; position, target, vertical fov
const CAM = [0, 1.768, 2.439, 0, -0.01, -0.1, 27];

const KEYS: Record<string, string> = { "-": "Minus", ";": "Semicolon", ",": "Comma", ".": "Period", "/": "Slash", "'": "Quote" };

// Paper (sheet UV: u across, v=0 top of the free sheet .. v=1 start of the wrap; peel at v~.824)
const TEX = 2048, SHEET_W = 0.72, SHEET_L = 0.6797, PEEL_V = 0.824;
const PX_X = TEX / SHEET_W, PX_Y = TEX / SHEET_L, ASPECT = PX_X / PX_Y;
const CW = 0.017; // character pitch on the paper (model units); 2026-11-03: larger so the decoded text reads
const LINE = 0.038;
const WRITE_Y = PEEL_V * TEX - 0.045 * PX_Y;
const H0 = 0.045 + 0.09;
const HMAX = H0 + LINE * PAGE_LINES; // a full page; then the sheet is ejected (timeline "eject")

// Ribbon anchors in model space, just inside the body's left and right flanks (hidden by the machine's own pixels).
// The first choice for east was the platen's right end; it sat above the H1 in the locked camera, so the
// fallback (a fixed point on the frame) is used: the plaintext then runs below the title.
const WEST = new THREE.Vector3(-0.37, 0.0, -0.05);
const EAST = new THREE.Vector3(0.39, 0.0, -0.05);

type Tween = { el: number; ms: number; fn: (p: number) => void; res: () => void };
const ease = { out: (t: number) => 1 - (1 - t) ** 3, io: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2) };

export interface Scene {
  render(): void;
  resize(w: number, h: number): void;
  step(dt: number): void;
  assemble(t: number): void;
  press(ch: string): void;
  print(ch: string): void;
  cr(): void;
  eject(): void;
  explode(k: number): void; // 0 = assembled .. 1 = the intro's start pose (language switch)
  setText(text: string): void; // docked: the paper mirrors the user's text field
  clearPaper(): void; // finish running tweens, blank sheet, carriage home
  machineRect(): { x: number; y: number; w: number; h: number }; // the assembled machine on the canvas (CSS px)
  setSpin(x: number, y: number): void; // docked: the user turns the machine about its centre (radians)
  pick(nx: number, ny: number): string | null; // docked: the key under a canvas point (NDC), as a typed character
  setQuality(f: number): void; // pixel-ratio boost while the machine is shown larger than in the hero
  setShadow(k: number): void; // 0..1 strength of the floor shadow (the hero keeps 1; docked it fades to 0)
  frame(k: number, dx: number, dy: number): void; // per-viewport framing: k x the hero zoom, then a lens shift (CSS px)
  anchors(): { west: { x: number; y: number }; east: { x: number; y: number } };
  dispose(): void;
  debug: Record<string, unknown>;
}

export async function createScene(canvas: HTMLCanvasElement, glbUrl: string, w: number, h: number): Promise<Scene> {
  // start the downloads first (the GLB is usually already preloaded by index.html); the setup below overlaps them
  const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(glbUrl);
  const font = document.fonts.load('700 40px "Courier Prime"').catch(() => undefined);
  gltf.catch(() => undefined); // a failure is rethrown where it is awaited below, not reported twice
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.setSize(w, h, false);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(r);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.65;

  const cam = new THREE.PerspectiveCamera(CAM[6], w / h, 0.05, 20);
  cam.position.set(CAM[0], CAM[1], CAM[2]);
  cam.lookAt(CAM[3], CAM[4], CAM[5]);
  cam.zoom = 1 / 1.3; // Mihai 2026-11-03: machine 1.3x smaller than the H0 frame
  // dev only: ?zoom=3 closes in on the machine (inspect the typebars)
  if (import.meta.env.DEV) cam.zoom *= Number(new URLSearchParams(location.search).get("zoom")) || 1;
  // wider than 16:9: shrink the vertical fov so the framing stays the same as at 16:9
  function fitCam(a: number) {
    cam.aspect = a;
    cam.fov = a <= 16 / 9 ? CAM[6] : (2 * Math.atan((Math.tan((CAM[6] * Math.PI) / 360) * (16 / 9)) / a) * 180) / Math.PI;
    cam.updateProjectionMatrix();
  }
  const baseZoom = cam.zoom;
  fitCam(w / h);
  let size = { w, h };
  let boost = 1;
  let shadowK = 1;

  // light design (on the machine only, the background stays flat): warm key spot from upper left front, neutral rim from behind right
  // (was lime; removed 2026-11-03 at Mihai's request), faint cool fill
  const key = new THREE.SpotLight(0xffe6c4, 150, 9, 0.6, 1, 1.5);
  key.position.set(-1.1, 1.9, 1.5);
  key.target.position.set(0, 0.18, -0.1);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.004;
  key.shadow.radius = 5;
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(1.6, 0.9, -1.8);
  const fill = new THREE.HemisphereLight(0x7f9fc0, 0x0a0c0a, 0.4);
  scene.add(key, key.target, rim, fill);
  const floorY = -0.282;
  const floorMat = new THREE.ShadowMaterial({ opacity: 0.6 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  floor.receiveShadow = true;
  scene.add(floor); // no light pool: it banded on the flat background

  // ---- live paper ----
  const paperCanvas = Object.assign(document.createElement("canvas"), { width: TEX, height: TEX });
  const pc = paperCanvas.getContext("2d")!;
  const base = Object.assign(document.createElement("canvas"), { width: TEX, height: TEX });
  {
    const g = base.getContext("2d")!;
    g.fillStyle = "#d8cfb6";
    g.fillRect(0, 0, TEX, TEX);
    // paper fibres: one 512 px tile (same density as before), repeated; 16x fewer draw calls
    const tile = Object.assign(document.createElement("canvas"), { width: 512, height: 512 });
    const tg = tile.getContext("2d")!;
    let s = 7;
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 5625; i++) {
      tg.fillStyle = `rgba(${rnd() < 0.5 ? "120,98,62" : "255,255,248"},${0.02 + rnd() * 0.035})`;
      tg.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1);
    }
    g.fillStyle = g.createPattern(tile, "repeat")!;
    g.fillRect(0, 0, TEX, TEX);
    const edge = g.createLinearGradient(0, 0, TEX, 0);
    edge.addColorStop(0, "rgba(60,45,20,.16)");
    edge.addColorStop(0.06, "rgba(60,45,20,0)");
    edge.addColorStop(0.94, "rgba(60,45,20,0)");
    edge.addColorStop(1, "rgba(60,45,20,.16)");
    g.fillStyle = edge;
    g.fillRect(0, 0, TEX, TEX);
    const down = g.createLinearGradient(0, TEX * 0.62, 0, TEX * PEEL_V);
    down.addColorStop(0, "rgba(40,28,10,0)");
    down.addColorStop(1, "rgba(40,28,10,.34)");
    g.fillStyle = down;
    g.fillRect(0, TEX * 0.62, TEX, TEX * (PEEL_V - 0.62));
    g.fillStyle = "rgba(40,28,10,.5)";
    g.fillRect(0, TEX * PEEL_V, TEX, TEX);
  }
  const paperTex = new THREE.CanvasTexture(paperCanvas);
  paperTex.flipY = false;
  paperTex.colorSpace = THREE.SRGBColorSpace;
  paperTex.anisotropy = 8;
  // sheet top edge: fragments above it are discarded, so the page starts low and rolls out as lines feed
  const clip = { value: PEEL_V - H0 / SHEET_L };
  const paperMats: THREE.Material[] = [];
  const setPaperOpacity = (o: number) => paperMats.forEach((m) => (m.opacity = o));
  let rise = H0;
  const setRise = (hh: number) => {
    rise = hh;
    clip.value = PEEL_V - Math.min(HMAX, hh) / SHEET_L;
  };
  const clipMaterial = (m: THREE.Material) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTop = clip;
      sh.vertexShader = "varying float vPv;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvPv = uv.y;");
      sh.fragmentShader = "varying float vPv; uniform float uTop;\n" + sh.fragmentShader.replace("void main() {", "void main() {\n if (vPv < uTop) discard;");
    };
    m.customProgramCacheKey = () => "paperclip";
    m.transparent = true; // opacity 1 except while a page change fades the sheet
    paperMats.push(m);
    return m;
  };
  const lines: string[] = [];
  let cur: string | undefined;
  let col = 0;
  let feed = 1;
  let paperDirty = false;
  function drawPaper() {
    paperDirty = false;
    pc.drawImage(base, 0, 0);
    pc.save();
    pc.scale(1, 1 / ASPECT); // square glyphs on a non-square sheet
    const sizePx = (CW * PX_X) / 0.6;
    pc.font = `700 ${sizePx}px "Courier Prime", "Courier New", monospace`; // same face as the east ribbon
    pc.textBaseline = "alphabetic";
    pc.fillStyle = "#17150f";
    pc.globalAlpha = 0.93;
    const x0 = ((SHEET_W - COLS * CW) / 2) * PX_X, lh = LINE * PX_Y * ASPECT;
    const n = lines.length;
    for (let i = 0; i <= n; i++) {
      const t = i < n ? lines[i] : cur;
      if (!t) continue;
      const y = (WRITE_Y - (n - i) * LINE * PX_Y + (1 - feed) * LINE * PX_Y) * ASPECT;
      if (y < -lh) continue;
      for (let c = 0; c < t.length; c++) {
        const tx = x0 + c * CW * PX_X + (CW * PX_X - pc.measureText(t[c]).width) / 2;
        pc.fillText(t[c], tx, y);
      }
    }
    pc.restore();
    pc.globalAlpha = 1;
    paperTex.needsUpdate = true;
  }

  // ---- load ----
  await font;
  const g = await gltf;
  const m = g.scene;
  // spin pivot (docked drag): spin sits at the machine's centre, off moves the model back so it turns in place
  const spin = new THREE.Group(), off = new THREE.Group();
  spin.add(off);
  off.add(m);
  scene.add(spin);
  const node: Record<string, THREE.Object3D> = {};
  const bars: Record<string, THREE.Object3D> = {};
  const rods: Record<string, THREE.Object3D> = {};
  // Mihai 2026-11-03: no ½ key; the shift cap sits in its place on the ½ lever (rod hidden: shift prints nothing)
  m.getObjectByName("Key_Shift")!.position.copy(m.getObjectByName("Key_Fraction")!.position);
  m.traverse((o) => {
    if (/^Key_Fraction|^Rig_Rod_Key_Fraction|^Rig_ShiftLever/.test(o.name)) o.visible = false;
  });
  m.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
    if (/^Key_/.test(o.name) && !/Fraction/.test(o.name)) node[o.name] = o;
  });
  const carriage = m.getObjectByName("Rig_Carriage")!;
  carriage.attach(m.getObjectByName("Brand_Rear_upper_title")!); // rear nameplate sits on the carriage's paper table
  const space = m.getObjectByName("Rig_Spacebar")!;
  const paper = m.getObjectByName("Paper_sheet")!;
  const pm: THREE.Mesh[] = [];
  paper.traverse((o) => (o as THREE.Mesh).isMesh && pm.push(o as THREE.Mesh));
  pm[2].visible = false; // thickness edge strip: its UVs don't follow the clip (0.9 mm, not visible anyway)
  paper.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.Material;
    if (mat.name !== "Paper_front_live") {
      clipMaterial(mat);
      mesh.castShadow = false;
      return;
    }
    mesh.material = clipMaterial(
      new THREE.MeshStandardMaterial({ map: paperTex, color: 0xcdc6b2, roughness: 0.92, metalness: 0, emissive: 0xfff2d6, emissiveMap: paperTex, emissiveIntensity: 0.05 }),
    );
    mesh.castShadow = true;
  });
  for (const k of Object.keys(node)) {
    const b = m.getObjectByName("Rig_Bar_" + k);
    if (b) bars[k] = b;
  }
  m.traverse((o) => {
    if (o.name.startsWith("Rig_Rod_")) {
      rods[o.name.slice(8)] = o;
      rigRod(o);
    }
  });
  // Type slugs (Mihai 2026-11-03: the bars ended in a point). A square steel head on every bar, placed so that
  // at the strike its face lies flat on the ribbon, upright. Built in the strike pose, then carried by the bar.
  const SLUG = new THREE.Vector3(0.011, 0.02, 0.009); // width, height, depth (model units)
  const slugGeo = new THREE.BoxGeometry(SLUG.x, SLUG.y, SLUG.z);
  const slugMat = new THREE.MeshStandardMaterial({ color: 0x9c9c98, metalness: 1, roughness: 0.32 });
  const centre = STRIKE.clone().addScaledVector(NORMAL, 0.0005 + SLUG.z / 2);
  // The original bars run on past the slug as a short forked leg (Mihai 2026-11-03: "end at the tip"). Each bar
  // is an arch from its hinge end to the slug, then the leg. Distance along the bar (graph distance over its
  // edges, from the vertex farthest from the slug = hinge end) tells them apart: every vertex further along than
  // the slug is collapsed into the slug centre, where the slug hides it.
  function endAtSlug(bar: THREE.Object3D, slugLocal: THREE.Vector3) {
    if (!(bar as THREE.Mesh).isMesh) {
      bar.children.forEach((ch) => (ch as THREE.Mesh).isMesh && ch.name !== "TypeSlug" && endAtSlug(ch, slugLocal));
      return;
    }
    const g = (bar as THREE.Mesh).geometry;
    const pa = g.attributes.position as THREE.BufferAttribute;
    const n = pa.count;
    const P = Array.from({ length: n }, (_, i) => new THREE.Vector3().fromBufferAttribute(pa, i));
    // weld coincident vertices (split normals / uvs) so the graph is connected
    const key = (v: THREE.Vector3) => `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
    const id = new Map<string, number>();
    const w = P.map((v) => id.get(key(v)) ?? (id.set(key(v), id.size), id.size - 1));
    const W = Array.from({ length: id.size }, () => new THREE.Vector3());
    P.forEach((v, i) => W[w[i]].copy(v));
    const adj: number[][] = W.map(() => []);
    const ix = g.index ? Array.from(g.index.array as ArrayLike<number>) : P.map((_, i) => i);
    for (let t = 0; t < ix.length; t += 3)
      for (const [a, b] of [[ix[t], ix[t + 1]], [ix[t + 1], ix[t + 2]], [ix[t + 2], ix[t]]]) {
        adj[w[a]].push(w[b]);
        adj[w[b]].push(w[a]);
      }
    // Dijkstra from the hinge end (small graphs: O(n^2) is fine)
    const start = W.reduce((best, v, i) => (v.distanceTo(slugLocal) > W[best].distanceTo(slugLocal) ? i : best), 0);
    const dist = W.map(() => Infinity);
    const done = W.map(() => false);
    dist[start] = 0;
    for (let k = 0; k < W.length; k++) {
      let u = -1;
      for (let i = 0; i < W.length; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] === Infinity) break;
      done[u] = true;
      for (const v of adj[u]) dist[v] = Math.min(dist[v], dist[u] + W[u].distanceTo(W[v]));
    }
    // the slug's place along the bar: the vertex nearest the slug centre
    const j = W.reduce((best, v, i) => (v.distanceTo(slugLocal) < W[best].distanceTo(slugLocal) ? i : best), 0);
    const limit = dist[j] + 0.004;
    let moved = 0;
    P.forEach((_, i) => {
      if (dist[w[i]] > limit) {
        pa.setXYZ(i, slugLocal.x, slugLocal.y, slugLocal.z);
        moved++;
      }
    });
    if (moved) {
      pa.needsUpdate = true;
      g.computeBoundingSphere();
      g.computeBoundingBox();
    }
    if (import.meta.env.DEV) ((window as unknown as { __trim: Record<string, number> }).__trim ??= {})[bar.name] = moved;
  }
  for (const rod of Object.values(rods)) {
    const pose = rod.userData.pose as (f: number) => void;
    pose(1);
    rod.updateMatrixWorld(true);
    const slug = new THREE.Mesh(slugGeo, slugMat);
    slug.name = "TypeSlug";
    slug.castShadow = true;
    rod.add(slug);
    rod.worldToLocal(slug.position.copy(centre));
    slug.quaternion.copy(rod.getWorldQuaternion(new THREE.Quaternion()).invert()); // world-aligned at the strike
    endAtSlug(rod, slug.position);
    pose(0);
  }
  for (const k of Object.values(node)) k.userData.y0 = k.position.y;
  space.userData.y0 = space.position.y;
  carriage.userData.x0 = carriage.position.x;
  paper.userData.x0 = paper.position.x;

  // ---- tweens, stepped by the engine's scaled clock ----
  const tasks = new Set<Tween>();
  const tween = (ms: number, fn: (p: number) => void) => new Promise<void>((res) => tasks.add({ el: 0, ms, fn, res }));
  function step(dt: number) {
    for (const t of [...tasks]) {
      t.el += dt;
      const p = Math.min(1, t.el / t.ms);
      t.fn(p);
      if (p >= 1) {
        tasks.delete(t);
        t.res();
      }
    }
  }
  const carriageX = () => carriage.position.x - carriage.userData.x0;
  function setCarriage(x: number) {
    carriage.position.x = carriage.userData.x0 + x;
    paper.position.x = paper.userData.x0 + x;
  }
  const colX = (c: number) => -((c + 0.5) * CW - (COLS * CW) / 2); // carriage offset that puts column c under the strike point

  async function press(ch: string) {
    const k = ch === " " ? space : node["Key_" + (KEYS[ch] || ch.toUpperCase())];
    if (!k) return;
    if (k === space) {
      await tween(25, (p) => {
        space.rotation.x = 0.055 * ease.out(p);
        space.position.y = space.userData.y0 - 0.004 * ease.out(p);
      });
      tween(70, (p) => {
        space.rotation.x = 0.055 * (1 - ease.out(p));
        space.position.y = space.userData.y0 - 0.004 * (1 - ease.out(p));
      });
      return;
    }
    const b = bars["Key_" + k.name.slice(4)];
    const th = b ? 0.007 / (b.userData.front_dz as number) : 0; // lever follows the key: front end down, back end up
    const token = (k.userData.pressToken = ((k.userData.pressToken as number) || 0) + 1);
    const pose = (f: number) => {
      if (k.userData.pressToken !== token) return;
      k.position.y = k.userData.y0 - 0.007 * f;
      if (b) b.rotation.x = th * f;
    };
    const hm = rods[k.name];
    const swing = (f: number) => k.userData.pressToken === token && hm && (hm.userData.pose as (f: number) => void)(f);
    await tween(25, (p) => pose(ease.out(p))); // key goes down
    await tween(35, (p) => swing(p * p)); // typebar flies to the platen; the timeline prints at impact (T_IMPACT)
    tween(70, (p) => {
      swing(1 - ease.out(p));
      pose(1 - Math.min(1, p * 1.6));
    });
  }
  function print(ch: string) {
    cur = (cur ?? "") + ch;
    col++;
    paperDirty = true; // fast typing: redraw + upload the 2048 px paper once per frame, not per letter
    const from = carriageX(), target = colX(col);
    tween(55, (p) => setCarriage(from + (target - from) * ease.out(p))); // ratchet step
  }
  async function cr() {
    lines.push(cur ?? "");
    cur = undefined;
    col = 0;
    if (lines.length > 60) lines.splice(0, 30);
    const from = carriageX(), to = colX(0);
    feed = 0;
    // target from the line count, so returns that overlap (reduced-motion fast-forward) still end at the right height
    const r0 = rise, r1 = Math.min(HMAX, H0 + LINE * lines.length);
    await Promise.all([
      tween(160, (p) => setCarriage(from + (to - from) * ease.io(p))),
      tween(130, (p) => {
        feed = ease.out(p);
        setRise(r0 + (r1 - r0) * feed);
        drawPaper();
      }),
    ]);
    await tween(45, (p) => setCarriage(to + Math.sin(p * Math.PI) * -0.004)); // small rebound
  }

  async function eject() {
    // a new page: the full sheet fades out, a fresh one fades in at the start height (Mihai, 2026-11-03)
    await tween(260, (p) => setPaperOpacity(1 - ease.io(p)));
    lines.length = 0;
    cur = undefined;
    col = 0;
    feed = 1;
    setRise(H0);
    drawPaper();
    await tween(260, (p) => setPaperOpacity(ease.io(p)));
  }

  const v = new THREE.Vector3();
  function toScreen(p: THREE.Vector3) {
    cam.updateMatrixWorld(); // valid before the first render too
    v.copy(p).project(cam);
    return { x: ((v.x + 1) / 2) * size.w, y: ((1 - v.y) / 2) * size.h };
  }

  // ---- assembly: each top-level part sits in a wrapper at identity, so the rig keeps its own local transforms ----
  type Part = { w: THREE.Object3D; o: THREE.Vector3; s: number; d: number };
  const parts: Part[] = [];
  const box = new THREE.Box3();
  const mid = box.setFromObject(m).getCenter(new THREE.Vector3());
  const keys = m.children.filter((c) => /^Key_|^Brand_Front|^EasterEgg/.test(c.name)).sort((a, b) => a.position.z - b.position.z || a.position.x - b.position.x);
  for (const c of [...m.children]) {
    const w = new THREE.Object3D();
    m.add(w);
    w.add(c);
    const n = c.name;
    const ki = keys.indexOf(c);
    if (ki >= 0) parts.push({ w, o: new THREE.Vector3(0, 0.3, 0.04), s: 520 + ki * 16, d: 640 }); // keys drop in, back row first
    else if (/^Rig_Carriage|^Paper_sheet/.test(n)) parts.push({ w, o: new THREE.Vector3(0, 0.28, -0.06), s: 1060, d: 900 }); // carriage + paper land last
    else if (/^Rig_Spacebar/.test(n)) parts.push({ w, o: new THREE.Vector3(0, 0.02, 0.32), s: 860, d: 820 });
    else if (/^Rig_(Rod|Bar)_/.test(n)) parts.push({ w, o: new THREE.Vector3(0, -0.14, 0), s: 300, d: 1000 });
    else {
      // body pieces drift together from around the machine
      const c0 = box.setFromObject(c).getCenter(new THREE.Vector3()).sub(mid);
      c0.y = 0;
      const dir = c0.lengthSq() > 1e-6 ? c0.normalize() : new THREE.Vector3(0, 0, 1);
      parts.push({ w, o: dir.multiplyScalar(0.3).add(new THREE.Vector3(0, 0.06, 0)), s: (parts.length % 6) * 45, d: 1250 });
    }
  }
  const restBox = new THREE.Box3();
  const corner = new THREE.Vector3();
  function machineRect() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? restBox.max.x : restBox.min.x, i & 2 ? restBox.max.y : restBox.min.y, i & 4 ? restBox.max.z : restBox.min.z);
      const p = toScreen(corner);
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // docked typing: the sheet shows the field's text, wrapped like the hero's pages (long words are cut)
  function setText(text: string) {
    const all: string[] = [];
    for (const para of text.split("\n")) {
      const ws = wrap(para, COLS).flatMap((l) => l.match(new RegExp(`.{1,${COLS}}`, "g")) ?? []);
      all.push(...(ws.length ? ws : [""]));
    }
    const last = all.pop() ?? "";
    lines.length = 0;
    lines.push(...all.slice(-40));
    cur = last;
    col = Math.min(COLS, last.length + (/ $/.test(text) && last ? 1 : 0));
    feed = 1;
    setRise(Math.min(HMAX, H0 + LINE * all.length));
    paperDirty = true;
    const from = carriageX(), target = colX(col);
    tween(55, (p) => setCarriage(from + (target - from) * ease.out(p))); // ratchet step
  }
  function clearPaper() {
    for (const t of [...tasks]) {
      t.fn(1);
      t.res();
    }
    tasks.clear();
    lines.length = 0;
    cur = undefined;
    col = 0;
    feed = 1;
    setRise(H0);
    setPaperOpacity(1);
    setCarriage(colX(0));
    paperDirty = true;
  }

  const quint = (u: number) => 1 - (1 - u) ** 5;
  let assembled = false;
  /** Deterministic in t (ms since start); exactly at rest for t >= ASSEMBLE. */
  function assemble(t: number) {
    if (assembled) return;
    assembled = t >= ASSEMBLE;
    const e = assembled ? 1 : quint(Math.min(1, t / ASSEMBLE));
    m.position.y = 0.14 * (1 - e); // the whole machine hovers down
    m.rotation.y = -0.12 * (1 - e);
    for (const p of parts) {
      const f = assembled ? 1 : quint(THREE.MathUtils.clamp((t - p.s) / p.d, 0, 1));
      p.w.position.copy(p.o).multiplyScalar(1 - f);
    }
  }

  setCarriage(colX(0));
  setRise(H0);
  drawPaper();
  // the assembled machine's visible bounds without the sheet (it rises with the text), carriage at the line
  // start, measured before any assembly offset exists
  m.updateMatrixWorld(true);
  const mb = new THREE.Box3();
  // the carriage is left out too: it travels with the typing, so the body is what gets centred
  paper.visible = carriage.visible = false;
  m.traverseVisible((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (!(o as THREE.Mesh).isMesh || !g) return;
    g.boundingBox ?? g.computeBoundingBox();
    restBox.union(mb.copy(g.boundingBox!).applyMatrix4(o.matrixWorld));
  });
  paper.visible = carriage.visible = true;
  const pivot = restBox.getCenter(new THREE.Vector3());
  spin.position.copy(pivot);
  off.position.copy(pivot).negate();

  // docked key clicks: ray against the key caps and the space bar (hidden parts never count)
  const ray = new THREE.Raycaster();
  const NAMES = Object.fromEntries(Object.entries(KEYS).map(([ch, n]) => [n, ch]));
  const pickable = [...Object.values(node), space];
  function pick(nx: number, ny: number): string | null {
    scene.updateMatrixWorld(true);
    ray.setFromCamera(new THREE.Vector2(nx, ny), cam);
    for (const hit of ray.intersectObjects(pickable, true)) {
      let o: THREE.Object3D | null = hit.object, hidden = false, key: THREE.Object3D | null = null;
      for (; o; o = o.parent) {
        if (!o.visible) hidden = true;
        if (o === space || pickable.includes(o)) key = o; // outermost wins: key caps hold child meshes named Key_*
      }
      if (hidden || !key) continue;
      if (key === space) return " ";
      const n = key.name.slice(4);
      return n.length === 1 ? n.toLowerCase() : (NAMES[n] ?? null); // Shift and the like type nothing
    }
    return null;
  }
  await r.compileAsync(scene, cam); // shaders compile in parallel off the main thread where supported
  const debug = { scene, cam, carriage, rods, lines, parts, clip, get rise() { return rise; }, get tasks() { return tasks.size; } };

  return {
    render() {
      if (paperDirty) drawPaper();
      // on the light theme the cast shadow reads much stronger: keep it a soft contact shadow
      floorMat.opacity = (document.documentElement.dataset.theme === "light" ? 0.22 : 0.6) * shadowK;
      floor.visible = shadowK > 0.005;
      r.render(scene, cam);
    },
    resize(w2, h2) {
      size = { w: w2, h: h2 };
      r.setPixelRatio(Math.min(devicePixelRatio, 2) * boost);
      r.setSize(w2, h2, false);
      fitCam(w2 / h2);
    },
    step,
    assemble,
    press: (ch) => void press(ch),
    print,
    cr: () => void cr(),
    eject: () => void eject(),
    explode(k) {
      if (!assembled) return; // never fights the intro
      m.position.y = 0.14 * k;
      m.rotation.y = -0.12 * k;
      for (const p of parts) p.w.position.copy(p.o).multiplyScalar(k);
    },
    anchors: () => ({ west: toScreen(WEST), east: toScreen(EAST) }),
    setText,
    clearPaper,
    machineRect,
    setSpin(x, y) {
      spin.rotation.set(x, y, 0);
    },
    pick,
    setShadow(k) {
      shadowK = k;
    },
    frame(k, dx, dy) {
      // a lens shift (view offset) moves the image without turning the camera, so the locked angle stays
      cam.zoom = baseZoom * k;
      if (dx || dy) cam.setViewOffset(size.w, size.h, -dx, -dy, size.w, size.h);
      else cam.clearViewOffset();
      cam.updateProjectionMatrix();
    },
    setQuality(f) {
      if (f === boost) return;
      boost = f;
      r.setPixelRatio(Math.min(devicePixelRatio, 2) * boost);
      r.setSize(size.w, size.h, false);
    },
    dispose() {
      r.dispose();
      pmrem.dispose();
    },
    debug,
  };
}
