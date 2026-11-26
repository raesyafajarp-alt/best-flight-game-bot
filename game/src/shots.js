// Screenshot scenes: each one plays the real rules forward from a fresh
// mission for a fixed number of steps, steered by a simple autopilot (bank
// toward the next ring, pitch to its altitude, throttle to cruise), so the
// frame is what a short flight really looks like — and the same mission
// always gives the same frame.
import { MISSIONS } from './config.js';
import { heightAt } from './terrain.js';
import { clamp } from './rng.js';

const STEP = 1 / 60;

/** Steer the flight input toward the next ring (or the landing strip). */
export function autopilot(mission) {
  const f = mission.flight;
  const next = mission.rings.next();
  let tx;
  let ty;
  let tz;
  if (next) {
    tx = next.point.x;
    ty = next.point.y;
    tz = next.point.z;
  } else {
    const strip = mission.def.id === 'mail-run'
      ? { x: -980, z: 720, altitude: 18 }
      : { x: 620, z: -860, altitude: 14 };
    tx = strip.x;
    ty = strip.altitude + 40;
    tz = strip.z;
  }
  // On the runway, roll straight and rotate once fast enough to lift.
  if (f.onGround) {
    return { throttle: 1, bank: 0, pitch: f.speed > 38 ? 0.4 : 0 };
  }
  const dx = tx - f.x;
  const dz = tz - f.z;
  const wantHeading = Math.atan2(dx, dz);
  let dh = wantHeading - f.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  // Climb first, turn second: gentle bank while slow or still climbing to
  // the ring's altitude, full bank only once fast and level with the gate.
  // Bank sign: positive roll turns the heading down (right), so steer with
  // -dh — a ring to the left of the nose needs a left (negative) bank.
  const clearance = f.y - heightAt(f.x, f.z);
  const climbing = ty - f.y > 25;
  const bankCap = f.speed < 45 || climbing ? 0.35 : 1;
  const bank = clamp(-dh * 1.6, -bankCap, bankCap);
  let pitch = clamp((ty - f.y) * 0.005, -0.6, 0.6);
  if (clearance < 45 && f.speed > 30) pitch = Math.max(pitch, 0.7);
  const throttle = f.speed < 60 ? 1 : f.speed > 72 ? -1 : 0;
  return { throttle, bank, pitch };
}

function flyForward(mission, seconds) {
  mission.start();
  for (let i = 0; i < seconds / STEP; i += 1) {
    mission.flight.input = autopilot(mission);
    const event = mission.step(STEP);
    if (event === 'crash-terrain' || event === 'crash-hard-landing' || event === 'timeout') break;
    if (mission.state !== 'flying') break;
  }
}

/**
 * Set `mission` to the named scene and return the screen to show over it.
 * Scenes: 'cover' (mid ridge-run, threading rings), 'approach' (on final to
 * the strip), 'rings' (closing on the next ring low over the terraces).
 */
export function stageShot(name, mission) {
  if (name === 'approach') {
    // Park the plane on final: 420 m out, 55 m up, lined up with Banda Strip.
    // (The last ring sits 272 m ahead of the strip, so 420 m keeps it a
    // readable gate in frame instead of filling the screen.)
    const f = mission.flight;
    const heading = 0.35;
    f.x = 620 - Math.sin(heading) * 420;
    f.z = -860 - Math.cos(heading) * 420;
    f.y = 14 + 55;
    f.heading = heading;
    f.pitch = -0.06;
    f.roll = 0;
    f.speed = 48;
    f.throttle = 0.45;
    f.fuel = 62;
    f.onGround = false;
    mission.state = 'flying';
    mission.rings.nextIndex = mission.rings.total; // all rings done: land now
    mission.flight.message = 'FINAL — BANDA STRIP';
    return { screen: 'play' };
  }
  if (name === 'rings') {
    flyForward(mission, 9);
    return { screen: 'play' };
  }
  // Default: cover — deep into the ridge run, a ring dead ahead.
  flyForward(mission, 30);
  return { screen: 'play' };
}

export { MISSIONS };
