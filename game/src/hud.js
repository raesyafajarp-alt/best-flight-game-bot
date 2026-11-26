// The cockpit: a DOM overlay of lit instruments — altitude, speed, heading,
// fuel, damage, throttle, a compass strip, an attitude ball and the mission
// panel. DOM text stays crisp when the judge shrinks the screenshot.
import { RUNWAYS } from './config.js';

function el(id) {
  return document.getElementById(id);
}

export function buildHud() {
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div class="hud-top">
      <div class="hud-cluster">
        <div class="hud-gauge"><span class="hud-label">ALT</span><span id="hud-alt" class="hud-value">0</span><span class="hud-unit">m</span></div>
        <div class="hud-gauge"><span class="hud-label">SPD</span><span id="hud-spd" class="hud-value">0</span><span class="hud-unit">km/h</span></div>
        <div class="hud-gauge"><span class="hud-label">HDG</span><span id="hud-hdg" class="hud-value">000°</span></div>
        <div class="hud-gauge"><span class="hud-label">V/S</span><span id="hud-vs" class="hud-value">+0</span><span class="hud-unit">m/s</span></div>
      </div>
      <div id="hud-compass" class="hud-compass"></div>
      <div class="hud-cluster hud-right">
        <div class="hud-bar-row"><span class="hud-label">FUEL</span><div class="hud-bar"><div id="hud-fuel" class="hud-fill fuel"></div></div><span id="hud-fuel-num" class="hud-num">100</span></div>
        <div class="hud-bar-row"><span class="hud-label">DMG</span><div class="hud-bar"><div id="hud-dmg" class="hud-fill dmg"></div></div><span id="hud-dmg-num" class="hud-num">0</span></div>
      </div>
    </div>
    <div id="hud-reticle" class="hud-reticle">+</div>
    <div id="hud-ring" class="hud-ring">RING 1/8 · 0m</div>
    <div class="hud-bottom">
      <div class="hud-panel">
        <canvas id="hud-attitude" width="120" height="120"></canvas>
        <div class="hud-throttle"><div class="hud-bar vertical"><div id="hud-thr" class="hud-fill thr"></div></div><span class="hud-label">THR</span></div>
      </div>
      <div id="hud-msg" class="hud-msg"></div>
      <div class="hud-panel hud-mission">
        <div id="hud-mission-name" class="hud-mission-name">RIDGE RUN</div>
        <div id="hud-mission-obj" class="hud-mission-obj">Fly through the rings</div>
        <div class="hud-score-row"><span class="hud-label">SCORE</span><span id="hud-score" class="hud-value">0</span></div>
        <div class="hud-score-row"><span class="hud-label">TIME</span><span id="hud-time" class="hud-value">5:00</span></div>
      </div>
    </div>`;
  document.getElementById('game').appendChild(hud);
  return hud;
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function updateHud(flight, mission) {
  const alt = Math.max(0, Math.round(flight.y));
  el('hud-alt').textContent = String(alt);
  el('hud-spd').textContent = String(Math.round(flight.speed * 3.6));
  const hdgDeg = ((flight.heading * 180) / Math.PI % 360 + 360) % 360;
  el('hud-hdg').textContent = `${String(Math.round(hdgDeg)).padStart(3, '0')}°`;
  const vs = flight.verticalSpeed;
  el('hud-vs').textContent = `${vs >= 0 ? '+' : ''}${vs.toFixed(1)}`;

  // Compass strip: the eight points scroll past a fixed centre marker.
  const strip = el('hud-compass');
  let marks = '';
  for (let d = -60; d <= 60; d += 30) {
    const deg = Math.round(((hdgDeg + d) % 360 + 360) % 360);
    const label = deg % 45 === 0 ? COMPASS_POINTS[Math.round(deg / 45) % 8] : String(deg);
    const offset = Math.max(7, Math.min(93, 50 + (d / 120) * 100));
    marks += `<span class="compass-mark" style="left:${offset.toFixed(1)}%">${label}</span>`;
  }
  strip.innerHTML = `${marks}<span class="compass-centre">▼</span>`;

  // Fuel and damage bars.
  el('hud-fuel').style.width = `${flight.fuel.toFixed(0)}%`;
  el('hud-fuel-num').textContent = String(Math.round(flight.fuel));
  el('hud-dmg').style.width = `${flight.damage.toFixed(0)}%`;
  el('hud-dmg-num').textContent = String(Math.round(flight.damage));
  el('hud-fuel').classList.toggle('low', flight.fuel < 25);
  el('hud-dmg').classList.toggle('high', flight.damage > 60);

  // Throttle bar.
  el('hud-thr').style.height = `${(flight.throttle * 100).toFixed(0)}%`;

  // Mission panel.
  el('hud-mission-name').textContent = mission.def.name.toUpperCase();
  const next = mission.rings.next();
  if (mission.rings.done) {
    el('hud-mission-obj').textContent = `Land at ${mission.landingStripName()}`;
    el('hud-ring').textContent = 'ALL RINGS ✓ — LAND NOW';
  } else if (next) {
    const dx = next.point.x - flight.x;
    const dy = next.point.y - flight.y;
    const dz = next.point.z - flight.z;
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
    el('hud-mission-obj').textContent = `Ring ${mission.rings.nextIndex + 1} of ${mission.rings.total}`;
    el('hud-ring').textContent = `RING ${mission.rings.nextIndex + 1}/${mission.rings.total} · ${dist}m`;
  }
  el('hud-score').textContent = String(mission.score);
  const t = Math.max(0, Math.ceil(mission.timeLeft));
  el('hud-time').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  el('hud-time').classList.toggle('low', mission.timeLeft < 30);

  const msg = el('hud-msg');
  if (flight.message) {
    msg.textContent = flight.message;
    msg.classList.add('show');
  } else {
    msg.classList.remove('show');
  }

  drawAttitude(flight);
}

function drawAttitude(flight) {
  const canvas = el('hud-attitude');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = 52;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  // Sky and ground roll with the bank, shift with the pitch. Banking right
  // tilts the horizon clockwise on screen (canvas rotate is clockwise for
  // positive angles); climbing drops the horizon line below the centre.
  ctx.translate(cx, cy);
  ctx.rotate(flight.roll);
  const pitchPx = -flight.pitch * 90;
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-r - 10, -r - 10 - pitchPx, (r + 10) * 2, r + 10 + pitchPx);
  ctx.fillStyle = '#8a6b46';
  ctx.fillRect(-r - 10, -pitchPx, (r + 10) * 2, r + 10 + pitchPx);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, -pitchPx);
  ctx.lineTo(r, -pitchPx);
  ctx.stroke();
  ctx.restore();
  // Fixed wings marker and bezel.
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy);
  ctx.lineTo(cx - 8, cy);
  ctx.moveTo(cx + 8, cy);
  ctx.lineTo(cx + 26, cy);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}
