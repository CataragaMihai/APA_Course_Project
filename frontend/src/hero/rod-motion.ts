// Rigid flight of an original typebar rod.
import { MathUtils, Quaternion, Vector3, type Object3D, type Mesh } from "three";

// The type head lands on the ribbon's front face at the writing point (Mihai 2026-11-03: it flew past the
// ribbon onto the platen at z -0.243). The ribbon there is a vertical band, front face z = -0.205 (measured
// after the copper ribbon guide in front of it, at -0.172, was removed at Mihai's request).
export const STRIKE = new Vector3(0, 0.185, -0.205);
// Front half-space of the ribbon face: keeping every vertex in it keeps the bar out of ribbon and drum.
export const NORMAL = new Vector3(0, 0, 1);
// The carriage overhangs the strike: its underside is at y 0.200 for z in [-0.12, 0] (measured, Rig_Carriage).
// Bars must pass under it, like real typebars rising behind the rail (Mihai 2026-11-03: "goes through the bar").
const CARRIAGE_UNDER = 0.196, CARRIAGE_BACK = -0.125;

export function rigRod(o: Object3D): void {
  const rest = o.position.clone();
  const q0 = o.quaternion.clone();
  const vertices: Vector3[] = [];
  o.traverse((child) => {
    const m = child as Mesh;
    if (!m.isMesh) return;
    const a = m.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) vertices.push(new Vector3().fromBufferAttribute(a, i));
  });
  const direction = rest.clone().sub(new Vector3().fromArray(o.userData.hinge as number[])).normalize();
  // Preserve each bent original rod: choose a rigid orientation whose whole shape stays on the camera side of the platen tangent.
  let best = Infinity;
  const q1 = q0.clone();
  const v = new Vector3();
  for (const y of [0.05, 0.2, 0.35, 0.5, 0.7, 0.9]) {
    const axis = new Vector3(0, y, -Math.sqrt(1 - y * y));
    const align = new Quaternion().setFromUnitVectors(direction, axis);
    for (let roll = 0; roll < 24; roll++) {
      const q = new Quaternion().setFromAxisAngle(axis, (roll * Math.PI) / 12).multiply(align);
      let deficit = 0, overlap = 0;
      for (const p of vertices) {
        v.copy(p).applyQuaternion(q);
        deficit = Math.max(deficit, -v.dot(NORMAL));
        v.add(STRIKE);
        if (v.z > CARRIAGE_BACK) overlap = Math.max(overlap, v.y - CARRIAGE_UNDER);
      }
      const cost = deficit * 1000 + overlap * 1000 + q0.angleTo(q) * 0.001;
      if (cost < best) {
        best = cost;
        q1.copy(q);
      }
    }
  }
  o.userData.pose = (f: number) => {
    f = MathUtils.clamp(f, 0, 1);
    if (f === 0) {
      o.position.copy(rest);
      o.quaternion.copy(q0);
      return;
    }
    o.quaternion.copy(q0).slerp(q1, f);
    o.position.copy(rest).lerp(STRIKE, f);
    o.position.z += 0.025 * Math.sin(Math.PI * f);
    let deficit = 0;
    for (const p of vertices) deficit = Math.max(deficit, 0.0018 - v.copy(p).applyQuaternion(o.quaternion).add(o.position).sub(STRIKE).dot(NORMAL));
    o.position.addScaledVector(NORMAL, deficit);
  };
}
