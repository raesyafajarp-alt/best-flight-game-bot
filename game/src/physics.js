// Arcade flight model: throttle sets a target speed, bank turns the plane,
// pitch climbs or dives, and the wing only lifts above the stall speed.
// Everything here is pure numbers — no Three.js — so the autopilot and the
// screenshot staging can step it without a renderer.
import { PLANE, RUNWAYS } from './config.js';
import { clamp, angleLerp } from './rng.js';
import { heightAt } from './terrain.js';

export const FLIGHT = {
  FLYING: 'flying',
  LANDED: 'landed',
  CRASHED: 'crashed',
};

export function createFlight(mission, start) {
  return {
    // Position and attitude.
    x: start.x,
    y: start.y,
    z: start.z,
    heading: start.heading,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0.55,
    fuel: mission.startFuel,
    damage: 0,
    status: FLIGHT.FLYING,
    // On the ground until liftoff speed with the nose up; while rolling the
    // plane follows the strip instead of sinking into it.
    onGround: true,
    // Input state, filled by input.js or the autopilot.
    input: { throttle: 0, bank: 0, pitch: 0 },
    prevX: start.x,
    prevZ: start.z,
    verticalSpeed: 0,
    groundSpeed: 0,
    time: 0,
    message: '',
  };
}

export function startPose(mission) {
  // Parked on the first runway, nose down the strip, ready to roll.
  const r = RUNWAYS[0];
  const x = r.x - Math.sin(r.heading) * (r.length * 0.35);
  const z = r.z - Math.cos(r.heading) * (r.length * 0.35);
  return { x, y: r.altitude + 2.2, z, heading: r.heading };
}

/**
 * Step the flight model by dt seconds. Returns an event string:
 * 'crash-terrain' | 'crash-hard-landing' | 'landed' | 'fuel-empty' | ''.
 */
export function stepFlight(f, dt) {
  if (f.status !== FLIGHT.FLYING) return '';
  f.time += dt;
  const input = f.input;

  // Throttle: W/S nudge it, Shift/Ctrl hold it at the ends.
  f.throttle = clamp(f.throttle + input.throttle * dt * 0.9, 0, 1);

  // Speed chases the throttle target; drag grows with the square of speed.
  const targetSpeed = f.throttle * PLANE.maxSpeed;
  const drag = 0.0015 * f.speed * f.speed;
  f.speed += clamp(targetSpeed - f.speed, -PLANE.accel * dt, PLANE.accel * dt) - drag * dt;
  f.speed = Math.max(0, f.speed);

  // Bank toward the commanded roll, then turn at a rate set by the bank.
  const targetRoll = input.bank * PLANE.maxBank;
  f.roll = angleLerp(f.roll, targetRoll, clamp(PLANE.rollRate * dt, 0, 1));
  f.heading += -Math.sin(f.roll) * PLANE.turnRate * dt;

  // Pitch toward the commanded pitch, eased so the nose never snaps.
  const targetPitch = input.pitch * PLANE.maxPitch;
  f.pitch = angleLerp(f.pitch, targetPitch, clamp(2.2 * dt, 0, 1));

  // Lift: climbing costs speed, diving gains it; below stall speed the wing
  // gives up and the plane sinks.
  const climbRate = Math.sin(f.pitch) * f.speed;
  const sink = f.speed < PLANE.minFlySpeed
    ? (PLANE.minFlySpeed - f.speed) * 0.9
    : 0;
  f.verticalSpeed = climbRate - sink;
  f.y += f.verticalSpeed * dt;

  // Horizontal motion follows the heading.
  f.prevX = f.x;
  f.prevZ = f.z;
  const forward = Math.cos(f.pitch) * f.speed;
  f.x += Math.sin(f.heading) * forward * dt;
  f.z += Math.cos(f.heading) * forward * dt;
  f.groundSpeed = forward;

  // Fuel: throttle burns it, idling sips it. Empty tanks mean a glide.
  const burn = PLANE.fuelBurnIdle + (PLANE.fuelBurn - PLANE.fuelBurnIdle) * f.throttle;
  f.fuel = Math.max(0, f.fuel - burn * dt);
  if (f.fuel <= 0 && f.throttle > 0) {
    f.throttle = 0;
    f.message = 'FUEL EMPTY — gliding';
    return 'fuel-empty';
  }

  // Stay inside the island's airspace: a soft wall pushes the plane back.
  const r = Math.sqrt(f.x * f.x + f.z * f.z);
  if (r > 2300) {
    const push = (r - 2300) / 100;
    f.x -= (f.x / r) * push * dt * 60;
    f.z -= (f.z / r) * push * dt * 60;
  }

  // Terrain: the ground is the hard limit.
  const ground = heightAt(f.x, f.z);
  if (f.onGround) {
    // Rolling: follow the ground, lift off once fast with the nose up.
    f.y = ground + 2.2;
    f.verticalSpeed = 0;
    if (f.speed >= PLANE.minFlySpeed && f.pitch > 0.04) f.onGround = false;
    return '';
  }
  const clearance = f.y - ground;
  if (clearance < 2.2) {
    const strip = stripUnder(f.x, f.z);
    if (strip && f.speed < 45 && Math.abs(f.verticalSpeed) < 6 && Math.abs(f.roll) < 0.35) {
      // A gentle touchdown on a runway: landed.
      f.y = strip.altitude + 2.2;
      f.onGround = true;
      f.status = FLIGHT.LANDED;
      f.speed = Math.max(0, f.speed - 30 * dt);
      return 'landed';
    }
    if (strip && Math.abs(f.verticalSpeed) < 9 && f.speed < 60) {
      // Hard landing on the strip: damage, but the plane survives and rolls.
      f.damage += PLANE.hardLandingDamage;
      f.y = strip.altitude + 2.2;
      f.onGround = true;
      f.pitch = 0;
      f.roll = 0;
      if (f.damage >= 100) {
        f.status = FLIGHT.CRASHED;
        return 'crash-hard-landing';
      }
      f.message = 'HARD LANDING!';
      return 'hard-landing';
    }
    // Anywhere else, the ground wins.
    f.damage = 100;
    f.status = FLIGHT.CRASHED;
    return 'crash-terrain';
  }

  // Grinding along a ridge at low altitude scrapes the airframe.
  if (clearance < 6 && f.speed > 30) {
    f.damage += PLANE.terrainScrapeDamage * dt * 0.4;
    if (f.damage >= 100) {
      f.status = FLIGHT.CRASHED;
      return 'crash-terrain';
    }
  }
  return '';
}

/** The runway strip under (x, z), or null when the plane is off-strip. */
export function stripUnder(x, z) {
  for (const r of RUNWAYS) {
    const dx = x - r.x;
    const dz = z - r.z;
    const along = dx * Math.cos(r.heading) + dz * Math.sin(r.heading);
    const across = -dx * Math.sin(r.heading) + dz * Math.cos(r.heading);
    if (Math.abs(along) < r.length / 2 && Math.abs(across) < r.width / 2) return r;
  }
  return null;
}
