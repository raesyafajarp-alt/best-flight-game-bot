// Garuda Ridge Run — main glue: renderer, chase camera, game screens
// (title / play / pause / complete / crashed), the frame loop, and the
// ?shot= staging used for screenshots. The flight model, terrain, rings and
// HUD live in their own files; this file only wires them together.
// Three.js r160 loads as a classic script in index.html; modules read the
// global it sets (a UMD build has no ES exports to import).
const THREE = globalThis.THREE;
import { MISSIONS, WORLD } from './config.js';
import { buildTerrain, heightAt } from './terrain.js';
import { buildAircraft } from './aircraft.js';
import { Mission, MISSION_STATE } from './missions.js';
import { buildHud, updateHud } from './hud.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';
import { stageShot } from './shots.js';
import { clamp, angleLerp } from './rng.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED_MISSION = 0; // screenshots always fly the Ridge Run

let renderer;
let scene;
let camera;
let aircraft;
let prop;
let mission;
let sound;
let input;
let screen = 'title'; // title | play | pause | complete | crashed
let paused = false;
let lastTime = 0;
let elapsed = 0;
let shotStaged = false;

function buildScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.getElementById('game').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  // Tropical late-afternoon sky: warm horizon, blue zenith.
  scene.background = new THREE.Color(0x8ec9e8);
  scene.fog = new THREE.Fog(0xa8c8dd, 700, 3400);
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 9000);
  camera.position.set(0, 120, -220);

  const sun = new THREE.DirectionalLight(0xfff1d6, 1.5);
  sun.position.set(800, 1200, 400);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd9e8, 0.75));
  // A visible sun disc so the sky has a direction.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(90, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff6c9, fog: false }),
  );
  sunDisc.position.set(2400, 1500, 1200);
  sunDisc.lookAt(camera.position);
  scene.add(sunDisc);

  buildTerrain(scene);
  const built = buildAircraft();
  aircraft = built.group;
  prop = built.prop;
  scene.add(aircraft);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function newMission(index) {
  if (mission) mission.dispose();
  mission = new Mission(scene, MISSIONS[index]);
  mission.flight.input = { throttle: 0, bank: 0, pitch: 0 };
  updateMissionPanel();
}

function updateMissionPanel() {
  const name = document.getElementById('title-mission');
  if (name) name.textContent = mission.def.name;
  const brief = document.getElementById('title-brief');
  if (brief) brief.textContent = mission.def.briefing;
}

function buildScreens() {
  const root = document.getElementById('game');
  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  overlay.innerHTML = `
    <div id="screen-title" class="screen">
      <h1>GARUDA<br>RIDGE RUN</h1>
      <p class="tagline">Bush courier over the volcanic islands — thread the rings, land the mail.</p>
      <p class="brief"><span id="title-mission">Ridge Run</span> — <span id="title-brief"></span></p>
      <div class="mission-buttons">
        <button data-mission="0" class="mission-btn selected">1 · Ridge Run</button>
        <button data-mission="1" class="mission-btn">2 · Mail Run</button>
        <button data-mission="2" class="mission-btn">3 · Time Trial</button>
      </div>
      <button id="btn-fly" class="fly-btn">FLY ▸</button>
      <p class="controls">W/S throttle · A/D or ←/→ bank · ↑/↓ pitch · mouse drag to look · P pause · R restart · M mute</p>
      <p class="controls dim">Fuel burns, ridges bite. Land gently on a strip to finish the mission.</p>
    </div>
    <div id="screen-pause" class="screen hidden">
      <h2>PAUSED</h2>
      <p class="controls">P to resume · R to restart the mission</p>
      <button id="btn-resume" class="fly-btn">RESUME ▸</button>
    </div>
    <div id="screen-end" class="screen hidden">
      <h2 id="end-title">MISSION COMPLETE</h2>
      <p id="end-detail" class="brief"></p>
      <p class="end-score">SCORE <span id="end-score">0</span></p>
      <button id="btn-again" class="fly-btn">FLY AGAIN ▸</button>
      <button id="btn-menu" class="fly-btn ghost">CHANGE MISSION</button>
    </div>`;
  root.appendChild(overlay);

  overlay.querySelectorAll('.mission-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.mission-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      newMission(Number(btn.dataset.mission));
      sound.ensure();
    });
  });
  document.getElementById('btn-fly').addEventListener('click', () => startFlying());
  document.getElementById('btn-resume').addEventListener('click', () => togglePause(false));
  document.getElementById('btn-again').addEventListener('click', () => restartMission());
  document.getElementById('btn-menu').addEventListener('click', () => showScreen('title'));
}

function showScreen(name) {
  screen = name;
  document.getElementById('screen-title').classList.toggle('hidden', name !== 'title');
  document.getElementById('screen-pause').classList.toggle('hidden', name !== 'pause');
  document.getElementById('screen-end').classList.toggle('hidden', name !== 'complete' && name !== 'crashed');
  document.getElementById('hud').classList.toggle('hidden', name === 'title');
}

function startFlying() {
  sound.ensure();
  mission.start();
  showScreen('play');
}

function restartMission() {
  const index = MISSIONS.indexOf(mission.def);
  newMission(index);
  startFlying();
}

function togglePause(force) {
  if (screen !== 'play' && screen !== 'pause') return;
  paused = force !== undefined ? force : !paused;
  showScreen(paused ? 'pause' : 'play');
}

function endMission(complete, title, detail) {
  showScreen(complete ? 'complete' : 'crashed');
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-detail').textContent = detail;
  document.getElementById('end-score').textContent = String(mission.score);
}

function handleEvent(event) {
  if (!event) return;
  if (event === 'ring') {
    sound.ring();
    mission.flight.message = `RING ${mission.rings.passedCount}/${mission.rings.total} ✓ +${mission.def.ringBonus}`;
    setTimeout(() => { if (mission.flight.message.startsWith('RING')) mission.flight.message = ''; }, 1800);
  } else if (event === 'landed') {
    sound.landing();
  } else if (event === 'mission-complete') {
    sound.landing();
    endMission(true, 'MISSION COMPLETE', `Landed at ${mission.landingStrip?.name ?? 'the strip'}${mission.smoothLanding ? ' — smooth touchdown!' : ''} · ${mission.rings.total} rings · ${Math.round(mission.timeLeft)}s to spare.`);
  } else if (event === 'landed-early') {
    endMission(false, 'LANDED EARLY', mission.failReason);
  } else if (event === 'crash-terrain' || event === 'crash-hard-landing') {
    sound.crash();
    endMission(false, 'CRASHED', mission.failReason);
  } else if (event === 'timeout') {
    endMission(false, 'OUT OF TIME', mission.failReason);
  } else if (event === 'fuel-empty') {
    sound.blip(220, 0.4, 'square', 0.12);
  }
}

function updateCamera(dt) {
  const f = mission.flight;
  // Chase position: behind and above the plane, along its heading.
  const back = 19 + f.speed * 0.09;
  const up = 6.5 + f.speed * 0.02;
  const hx = Math.sin(f.heading);
  const hz = Math.cos(f.heading);
  // Mouse drag orbits the camera around the plane a little.
  const orbit = input.dragX;
  const lookX = Math.sin(f.heading + orbit * 0.9);
  const lookZ = Math.cos(f.heading + orbit * 0.9);
  const tx = f.x - lookX * back;
  const tz = f.z - lookZ * back;
  const ty = Math.max(f.y + up + input.dragY * 14, heightAt(f.x, f.z) + 6);
  const k = 1 - Math.exp(-dt * 5);
  camera.position.x += (tx - camera.position.x) * k;
  camera.position.y += (ty - camera.position.y) * k;
  camera.position.z += (tz - camera.position.z) * k;
  // Look slightly ahead of the plane, with a touch of banking lean.
  const lookAhead = 26;
  camera.lookAt(
    f.x + hx * lookAhead,
    f.y + 1 + Math.sin(f.pitch) * 8,
    f.z + hz * lookAhead,
  );
  camera.rotateZ(-f.roll * 0.12);
  // Speed widens the field of view a touch.
  const targetFov = 62 + clamp(f.speed / 92, 0, 1) * 10;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * 0.1;
    camera.updateProjectionMatrix();
  }
}

function syncAircraft() {
  const f = mission.flight;
  aircraft.position.set(f.x, f.y, f.z);
  // Yaw, then pitch, then roll (intrinsic YXZ). The model nose points down
  // local -Z, so heading + PI turns it onto the flight heading; positive
  // pitch raises the nose; positive roll banks right, which is a negative
  // rotation about local +Z (right wing down).
  aircraft.rotation.order = 'YXZ';
  aircraft.rotation.y = f.heading + Math.PI;
  aircraft.rotation.x = f.pitch;
  aircraft.rotation.z = -f.roll;
  prop.rotation.z += (4 + f.throttle * 26) * (1 / 60);
}

function frame(time) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (time - lastTime) / 1000 || 0.016);
  lastTime = time;
  elapsed += dt;

  if (SHOT) {
    // Screenshot mode: stage once, then freeze the sim and keep rendering
    // the same state every frame, so the captured frame is deterministic.
    if (!shotStaged) {
      stageShot(SHOT, mission);
      shotStaged = true;
      showScreen('play');
      document.title = 'Garuda Ridge Run — ready';
    }
    syncAircraft();
    updateCamera(1);
    mission.rings.update(elapsed);
    updateHud(mission.flight, mission);
    renderer.render(scene, camera);
    return;
  }

  if (screen === 'play' && !paused) {
    mission.flight.input = input.readFlightInput();
    const event = mission.step(dt);
    handleEvent(event);
    sound.update(mission.flight.throttle, mission.flight.speed, mission.flight.status === 'flying');
    if (mission.state === MISSION_STATE.COMPLETE || mission.state === MISSION_STATE.FAILED) {
      // The end screen is already shown by handleEvent; keep rendering.
    }
  }
  input.decayDrag(dt);
  syncAircraft();
  updateCamera(dt);
  mission.rings.update(elapsed);
  updateHud(mission.flight, mission);
  // Clouds drift with the wind.
  for (const cloud of scene.userData.clouds ?? []) {
    cloud.position.x += cloud.userData.drift * dt;
    if (cloud.position.x > 2100) cloud.position.x = -2100;
  }
  renderer.render(scene, camera);
}

function boot() {
  buildScene();
  buildHud();
  buildScreens();
  sound = new SoundEngine();
  input = new Input();
  input.attach();
  input.onPause = () => togglePause();
  input.onRestart = () => {
    if (screen === 'play' || screen === 'pause' || screen === 'complete' || screen === 'crashed') restartMission();
  };
  input.onMute = () => {
    sound.ensure();
    sound.setMuted(!sound.muted);
  };
  input.onAnyKey = () => sound.ensure();
  newMission(SEED_MISSION);
  updateMissionPanel();
  // Debug hook for play-testing: window.__game.mission / .screen / .flight.
  window.__game = {
    get mission() { return mission; },
    get flight() { return mission.flight; },
    get screen() { return screen; },
  };
  if (SHOT) {
    showScreen('play');
  } else {
    showScreen('title');
  }
  requestAnimationFrame(frame);
}

boot();
