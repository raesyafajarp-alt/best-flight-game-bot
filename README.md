# Garuda Ridge Run

A bush-courier flight game over a volcanic Indonesian archipelago. Fly a
high-wing prop plane in chase view over ridged jungle, terraced rice fields,
volcanoes and the sea; thread glowing target rings in order, watch fuel and
damage, then put the plane down gently on a grass strip.

## Play

- **W / S** (or Shift / Ctrl) — throttle up / down
- **A / D** or **← / →** — bank and turn
- **↑ / ↓** — pitch up / down
- **Mouse drag** — look around from the chase camera
- **P** pause · **R** restart · **M** mute

## Missions

1. **Ridge Run** — 8 rings down the volcanic ridge, land at Banda Strip.
2. **Mail Run** — 6 rings over the terraces, land at Ternate Field.
3. **Time Trial** — 10 rings against a 4-minute clock.

Score rewards fast ring passes, smooth landings and time left. Fuel burns
with throttle, ridges scrape the airframe, and a hard touchdown hurts — a
sortie is a set of decisions, not a sightseeing tour.

## Tech

- Three.js (vendored minified build under `game/vendor/`, official r160) for
  the 3D world; everything else is hand-written ES modules under `game/src/`,
  one job per file: `terrain.js` (heightfield island), `aircraft.js` (the
  courier), `rings.js` (target gates), `physics.js` (arcade flight model),
  `missions.js` (scoring), `hud.js` (instruments), `audio.js` (WebAudio
  synth: engine, wind, ring, landing, crash), `input.js`, `shots.js`
  (deterministic screenshot staging with an autopilot).
- No network, no external files: the game runs from static files alone.
- Screenshots are real renders of the game's own code in headless Chromium,
  staged with `?shot=cover|approach|rings` (see `shots.json`).

## Run it

```sh
node serve.ts   # then open http://localhost:8080
```

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```
