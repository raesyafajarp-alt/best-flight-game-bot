// The island: a heightfield with volcanic cones, terraced rice slopes, sandy
// coast and a sea plane. heightAt() is the single source of truth — the mesh,
// the collision, the ring placement and the autopilot all read it.
// Three.js r160 loads as a classic script in index.html; modules read the
// global it sets (a UMD build has no ES exports to import).
const THREE = globalThis.THREE;
import { WORLD, RUNWAYS, VOLCANOES } from './config.js';
import { fbm2, clamp, lerp } from './rng.js';

const HALF = WORLD.size / 2;

function islandMask(x, z) {
  const r = Math.sqrt(x * x + z * z) / HALF;
  // Main island fades into the sea past r ~ 0.72; a couple of islets offshore.
  const main = 1 - smoothstep(0.55, 0.95, r);
  const islet1 = Math.exp(-(((x - 1650) ** 2 + (z + 1500) ** 2) / (2 * 260 * 260))) * 0.5;
  const islet2 = Math.exp(-(((x + 1750) ** 2 + (z - 1350) ** 2) / (2 * 200 * 200))) * 0.4;
  return clamp(main + islet1 + islet2, 0, 1);
}

function smoothstep(a, b, t) {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}

/** Ground height in metres at world (x, z). Below 0 is under the sea. */
export function heightAt(x, z) {
  const mask = islandMask(x, z);
  if (mask <= 0.001) return -12;
  let h = 14 * mask;
  // Rolling ridges and valleys.
  h += fbm2(x, z, 520, 4, WORLD.seed) * 95 * mask;
  h += fbm2(x + 900, z - 400, 180, 3, WORLD.seed + 7) * 34 * mask;
  // Volcanic cones rise above the ridges.
  for (const v of VOLCANOES) {
    const d = Math.sqrt((x - v.x) ** 2 + (z - v.z) ** 2);
    const cone = Math.max(0, 1 - d / v.radius);
    h += cone * cone * v.height;
  }
  // Flatten the ground under each runway strip so landings are fair.
  for (const r of RUNWAYS) {
    const dx = x - r.x;
    const dz = z - r.z;
    const along = dx * Math.cos(r.heading) + dz * Math.sin(r.heading);
    const across = -dx * Math.sin(r.heading) + dz * Math.cos(r.heading);
    const flat = smoothstep(1, 0, Math.max(Math.abs(along) / (r.length * 0.62), Math.abs(across) / 90));
    h = lerp(h, r.altitude, flat);
  }
  return h;
}

function terrainColor(x, z, h, slope) {
  // slope: 0 flat .. 1 cliff. Colours are sampled per vertex and blended by
  // the GPU, which gives the terraced fields their banded look.
  const sand = new THREE.Color(0xd9c27a);
  const grass = new THREE.Color(0x4f8f3a);
  const field = new THREE.Color(0x7fb069);
  const jungle = new THREE.Color(0x2e6b2f);
  const rock = new THREE.Color(0x6b6259);
  const ash = new THREE.Color(0x3a3632);
  const out = new THREE.Color();
  if (h < 4) return out.copy(sand);
  out.copy(grass).lerp(jungle, clamp((h - 40) / 120, 0, 1));
  // Rice terraces: flat-ish bands between 15 and 130 m read as stepped fields.
  if (h > 15 && h < 130 && slope < 0.35) {
    const band = Math.floor(h / 9) % 2 === 0 ? field : grass;
    out.lerp(band, 0.65);
  }
  out.lerp(rock, smoothstep(0.35, 0.7, slope));
  out.lerp(ash, smoothstep(200, 320, h));
  // Beach blend near the waterline.
  out.lerp(sand, smoothstep(7, 3, h) * 0.8);
  return out;
}

export function buildTerrain(scene) {
  const segments = 180;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const hx = heightAt(x + 6, z) - heightAt(x - 6, z);
    const hz = heightAt(x, z + 6) - heightAt(x, z - 6);
    const slope = clamp(Math.sqrt(hx * hx + hz * hz) / 24, 0, 1);
    terrainColor(x, z, h, slope).toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'island';
  scene.add(mesh);

  // Sea: a calm blue plane with a lighter shore ring painted by the shader-free
  // trick of a second, slightly larger translucent plane.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size * 2.4, WORLD.size * 2.4),
    new THREE.MeshLambertMaterial({ color: 0x1e6f8e }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0.4;
  sea.name = 'sea';
  scene.add(sea);

  // The peaks already read as dark ash through the vertex colours; no
  // separate crater mesh — a flat dark cone floating over the peak reads
  // as a saucer from the air.

  buildTrees(scene);
  buildVillages(scene);
  buildRunways(scene);
  buildClouds(scene);
  return mesh;
}

function buildTrees(scene) {
  // Two instanced meshes (trunks + canopies) scattered on low grass, never on
  // a runway flat or in the sea.
  const rng = mulberryFromSeed(99);
  const spots = [];
  for (let i = 0; i < 900; i += 1) {
    const x = (rng() * 2 - 1) * (HALF - 80);
    const z = (rng() * 2 - 1) * (HALF - 80);
    const h = heightAt(x, z);
    if (h < 8 || h > 150) continue;
    let onStrip = false;
    for (const r of RUNWAYS) {
      const dx = x - r.x;
      const dz = z - r.z;
      const along = dx * Math.cos(r.heading) + dz * Math.sin(r.heading);
      const across = -dx * Math.sin(r.heading) + dz * Math.cos(r.heading);
      if (Math.abs(along) < r.length * 0.7 && Math.abs(across) < 80) onStrip = true;
    }
    if (!onStrip) spots.push([x, h, z, 0.7 + rng() * 0.9]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 5, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
  const canopyGeo = new THREE.ConeGeometry(3.4, 9, 6);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2f7a33 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, h, z, s], i) => {
    m.makeScale(s, s, s);
    m.setPosition(x, h + 2.5 * s, z);
    trunks.setMatrixAt(i, m);
    m.makeScale(s, s, s);
    m.setPosition(x, h + (5 + 4.5) * s, z);
    canopies.setMatrixAt(i, m);
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  scene.add(trunks);
  scene.add(canopies);
}

function buildVillages(scene) {
  const rng = mulberryFromSeed(31);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xb3543f });
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xe8dcc3 });
  for (const r of RUNWAYS) {
    const group = new THREE.Group();
    for (let i = 0; i < 9; i += 1) {
      const a = rng() * Math.PI * 2;
      const d = 120 + rng() * 130;
      const x = r.x + Math.cos(a) * d;
      const z = r.z + Math.sin(a) * d;
      const h = heightAt(x, z);
      if (h < 6) continue;
      const house = new THREE.Group();
      const walls = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 8), wallMat);
      walls.position.y = 2.5;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(7.2, 4, 4), roofMat);
      roof.position.y = 7;
      roof.rotation.y = Math.PI / 4;
      house.add(walls, roof);
      house.position.set(x, h, z);
      house.rotation.y = rng() * Math.PI;
      group.add(house);
    }
    scene.add(group);
  }
}

function buildRunways(scene) {
  for (const r of RUNWAYS) {
    const group = new THREE.Group();
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(r.length, r.width),
      new THREE.MeshLambertMaterial({ color: 0x3c3f45 }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = 0.15;
    group.add(strip);
    // Centre dashes.
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf2f2e8 });
    for (let d = -r.length / 2 + 18; d < r.length / 2 - 10; d += 34) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(16, 1.6), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(d, 0.3, 0);
      group.add(dash);
    }
    // Threshold bars at both ends.
    for (const end of [-1, 1]) {
      for (let k = -2; k <= 2; k += 1) {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2), dashMat);
        bar.rotation.x = -Math.PI / 2;
        bar.position.set(end * (r.length / 2 - 12), 0.3, k * 4.4);
        group.add(bar);
      }
    }
    // Windsock pole + orange cone at the side.
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 12, 6),
      new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
    );
    pole.position.set(r.length / 2 - 20, 6, r.width / 2 + 12);
    const sock = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 7, 8),
      new THREE.MeshLambertMaterial({ color: 0xff7a1a }),
    );
    sock.rotation.z = Math.PI / 2;
    sock.position.set(r.length / 2 - 24, 11.5, r.width / 2 + 12);
    group.add(pole, sock);
    group.position.set(r.x, r.altitude, r.z);
    group.rotation.y = -r.heading;
    scene.add(group);
  }
}

function buildClouds(scene) {
  // Flat-shaded puffs: clusters of bright white spheres drifting slowly.
  // Unlit material so they read as sunlit cloud, not grey rock.
  const rng = mulberryFromSeed(7);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    const group = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p += 1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(16 + rng() * 22, 10, 8), mat);
      s.position.set((rng() - 0.5) * 90, (rng() - 0.5) * 10, (rng() - 0.5) * 40);
      s.scale.y = 0.55;
      group.add(s);
    }
    group.position.set((rng() * 2 - 1) * 1900, 260 + rng() * 160, (rng() * 2 - 1) * 1900);
    group.userData.drift = 1.5 + rng() * 2;
    clouds.push(group);
    scene.add(group);
  }
  scene.userData.clouds = clouds;
}

function mulberryFromSeed(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
