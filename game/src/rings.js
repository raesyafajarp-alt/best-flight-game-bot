// Target rings: glowing torus gates the pilot flies through in order. Ring
// positions are generated from the mission seed along a ridge-hugging path, so
// every mission flies a different valley. The next ring pulses gold; passed
// rings turn green and fade.
// Three.js r160 loads as a classic script in index.html; modules read the
// global it sets (a UMD build has no ES exports to import).
const THREE = globalThis.THREE;
import { heightAt } from './terrain.js';
import { mulberry32 } from './rng.js';
import { RUNWAYS } from './config.js';

const RING_RADIUS = 15;

export function generateRingPath(mission, count) {
  const rng = mulberry32(mission.ringSeed * 7919 + 13);
  const points = [];
  // Start near the first runway, then wander the island: each step picks a
  // heading change and a distance, hugging ridges between 60 and 190 m up.
  let x = RUNWAYS[0].x - 500;
  let z = RUNWAYS[0].z + 200;
  let heading = rng() * Math.PI * 2;
  for (let i = 0; i < count; i += 1) {
    heading += (rng() - 0.5) * 1.5;
    const dist = 260 + rng() * 240;
    x = clampToIsland(x + Math.sin(heading) * dist);
    z = clampToIsland(z + Math.cos(heading) * dist);
    const ground = heightAt(x, z);
    const alt = Math.max(ground + 55, 70 + rng() * 110);
    points.push({ x, y: alt, z, heading });
  }
  // The last ring sits on final approach to the mission's landing strip.
  const strip = mission.id === 'mail-run' ? RUNWAYS[1] : RUNWAYS[0];
  const fx = strip.x - Math.sin(strip.heading) * (strip.length * 0.8);
  const fz = strip.z - Math.cos(strip.heading) * (strip.length * 0.8);
  points[points.length - 1] = { x: fx, y: strip.altitude + 55, z: fz, heading: strip.heading };
  return points;
}

function clampToIsland(v) {
  return Math.max(-1850, Math.min(1850, v));
}

export class RingField {
  constructor(scene, mission) {
    this.scene = scene;
    this.points = generateRingPath(mission, mission.rings);
    this.group = new THREE.Group();
    this.group.name = 'rings';
    this.meshes = this.points.map((p, i) => {
      const ring = new THREE.Group();
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(RING_RADIUS, 1.1, 12, 40),
        new THREE.MeshBasicMaterial({ color: 0x35d0ff, transparent: true, opacity: 0.85 }),
      );
      ring.add(torus);
      // Inner glow disc so the gate reads from far away.
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(RING_RADIUS - 1, 40),
        new THREE.MeshBasicMaterial({
          color: 0x35d0ff, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      ring.add(disc);
      // Number sprite: a small canvas texture with the ring's order.
      const label = makeLabel(String(i + 1));
      label.position.set(0, RING_RADIUS + 7, 0);
      ring.add(label);
      ring.position.set(p.x, p.y, p.z);
      // Face along the flight path: the ring's normal points at the pilot.
      ring.rotation.y = p.heading;
      this.group.add(ring);
      return { group: ring, torus, disc, passed: false, point: p };
    });
    scene.add(this.group);
    this.nextIndex = 0;
  }

  next() {
    return this.meshes[this.nextIndex] ?? null;
  }

  get passedCount() {
    return this.nextIndex;
  }

  get total() {
    return this.meshes.length;
  }

  get done() {
    return this.nextIndex >= this.meshes.length;
  }

  /** Returns true when the plane just passed through the next ring. */
  checkPass(px, py, pz, prevX, prevZ) {
    const ring = this.next();
    if (!ring) return false;
    const p = ring.point;
    // The ring's normal points along the flight path (rotation.y = heading).
    const nx = Math.sin(p.heading);
    const nz = Math.cos(p.heading);
    const along = (px - p.x) * nx + (pz - p.z) * nz;
    const prevAlong = (prevX - p.x) * nx + (prevZ - p.z) * nz;
    const crossed = (prevAlong <= 0 && along > 0) || (prevAlong >= 0 && along < 0);
    if (!crossed) return false;
    const dx = px - p.x;
    const dy = py - p.y;
    const dz = pz - p.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    const radial = Math.sqrt(Math.max(0, distSq - along * along));
    if (radial < RING_RADIUS - 1.5) {
      ring.passed = true;
      ring.torus.material.color.set(0x37d67a);
      ring.disc.material.color.set(0x37d67a);
      ring.disc.material.opacity = 0.04;
      this.nextIndex += 1;
      return true;
    }
    return false;
  }

  update(time) {
    // Pulse the next ring gold; dim the ones still ahead.
    this.meshes.forEach((ring, i) => {
      if (ring.passed) return;
      const active = i === this.nextIndex;
      const pulse = active ? 0.75 + Math.sin(time * 4) * 0.25 : 0.55;
      ring.torus.material.color.set(active ? 0xffb020 : 0x35d0ff);
      ring.torus.material.opacity = pulse;
      ring.disc.material.color.set(active ? 0xffb020 : 0x35d0ff);
    });
  }

  reset() {
    this.meshes.forEach((ring) => {
      ring.passed = false;
      ring.torus.material.color.set(0x35d0ff);
      ring.torus.material.opacity = 0.85;
      ring.disc.material.color.set(0x35d0ff);
      ring.disc.material.opacity = 0.1;
    });
    this.nextIndex = 0;
  }
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(10, 20, 30, 0.65)';
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(14, 14, 1);
  return sprite;
}
