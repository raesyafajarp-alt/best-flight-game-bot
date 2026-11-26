// Garuda Ridge Run — tuning constants. One place for every number the flight
// model, the missions and the world share, so a balance tweak never hides in
// a render file.
export const WORLD = {
  size: 4200, // terrain spans -2100..2100 on x and z, metres
  seaLevel: 0,
  seed: 20261126,
};

export const PLANE = {
  maxSpeed: 92, // m/s at full throttle
  cruiseSpeed: 55,
  minFlySpeed: 24, // below this the wing stops lifting and the plane sinks
  accel: 14, // m/s^2 toward the throttle target speed
  turnRate: 0.85, // rad/s at full bank
  pitchRate: 0.55, // rad/s
  rollRate: 2.4, // rad/s toward the commanded bank
  maxBank: 1.05, // rad
  maxPitch: 0.55, // rad
  fuelCapacity: 100,
  fuelBurn: 1.15, // units/s at full throttle
  fuelBurnIdle: 0.25,
  crashDamage: 100,
  hardLandingDamage: 34, // vertical speed over this on touchdown hurts
  terrainScrapeDamage: 55, // per second while grinding terrain
};

export const RUNWAYS = [
  { name: 'Banda Strip', x: 620, z: -860, heading: 0.35, length: 340, width: 26, altitude: 14 },
  { name: 'Ternate Field', x: -980, z: 720, heading: -0.9, length: 300, width: 24, altitude: 18 },
];

export const VOLCANOES = [
  { x: -720, z: -520, height: 430, radius: 620 },
  { x: 820, z: 640, height: 330, radius: 480 },
  { x: 150, z: 1150, height: 210, radius: 380 },
];

// Missions: id, name, briefing, ring path seed, time limit, fuel on start.
export const MISSIONS = [
  {
    id: 'ridge-run',
    name: 'Ridge Run',
    briefing: 'Thread 8 rings down the volcanic ridge, then land at Banda Strip.',
    rings: 8,
    ringSeed: 11,
    timeLimit: 300,
    startFuel: 100,
    ringBonus: 250,
    landingBonus: 500,
  },
  {
    id: 'mail-run',
    name: 'Mail Run',
    briefing: 'Carry the mail: 6 rings over the terraces, land at Ternate Field.',
    rings: 6,
    ringSeed: 47,
    timeLimit: 300,
    startFuel: 100,
    ringBonus: 250,
    landingBonus: 500,
  },
  {
    id: 'time-trial',
    name: 'Time Trial',
    briefing: '10 rings, no mercy: every second counts. Land anywhere to stop the clock.',
    rings: 10,
    ringSeed: 83,
    timeLimit: 240,
    startFuel: 85,
    ringBonus: 150,
    landingBonus: 400,
  },
];

export const SCORE = {
  ringTimeBonusMax: 120, // extra points for fast ring passes, scaled by speed
  smoothLandingBonus: 300, // gentle touchdown
  timeBonusPerSecond: 4, // seconds left at mission end
};

export const KEYS = {
  throttleUp: ['KeyW', 'ShiftLeft', 'ShiftRight'],
  throttleDown: ['KeyS', 'ControlLeft', 'ControlRight'],
  bankLeft: ['KeyA', 'ArrowLeft'],
  bankRight: ['KeyD', 'ArrowRight'],
  pitchUp: ['ArrowUp'],
  pitchDown: ['ArrowDown'],
  pause: ['KeyP', 'Escape'],
  restart: ['KeyR'],
  mute: ['KeyM'],
};
