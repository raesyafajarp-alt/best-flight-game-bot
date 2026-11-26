// Missions: one ring path, one landing strip, one clock. Scoring rewards fast
// ring passes, smooth landings and time left — a sortie is a set of decisions
// about throttle, line and fuel, not a sightseeing tour.
import { MISSIONS, RUNWAYS, SCORE } from './config.js';
import { createFlight, startPose, stepFlight, stripUnder, FLIGHT } from './physics.js';
import { RingField } from './rings.js';

export const MISSION_STATE = {
  READY: 'ready',
  FLYING: 'flying',
  COMPLETE: 'complete',
  FAILED: 'failed',
};

export class Mission {
  constructor(scene, missionDef) {
    this.def = missionDef;
    this.scene = scene;
    this.rings = new RingField(scene, missionDef);
    this.flight = createFlight(missionDef, startPose(missionDef));
    this.state = MISSION_STATE.READY;
    this.score = 0;
    this.ringTimes = [];
    this.timeLeft = missionDef.timeLimit;
    this.landingStrip = null;
    this.smoothLanding = false;
    this.failReason = '';
  }

  start() {
    this.state = MISSION_STATE.FLYING;
    this.flight.status = FLIGHT.FLYING;
  }

  /** Advance the mission by dt; returns an event for the UI/audio layer. */
  step(dt) {
    if (this.state !== MISSION_STATE.FLYING) return '';
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.state = MISSION_STATE.FAILED;
      this.failReason = 'OUT OF TIME';
      return 'timeout';
    }
    const f = this.flight;
    const event = stepFlight(f, dt);
    if (event === 'crash-terrain' || event === 'crash-hard-landing') {
      this.state = MISSION_STATE.FAILED;
      this.failReason = event === 'crash-terrain' ? 'CRASHED INTO TERRAIN' : 'CRASHED ON LANDING';
      return event;
    }
    if (event === 'landed') {
      return this.finishLanding();
    }
    if (event === 'hard-landing') {
      this.smoothLanding = false;
    }
    // Ring passes: score by speed, faster is worth more.
    if (this.rings.checkPass(f.x, f.y, f.z, f.prevX, f.prevZ)) {
      const speedBonus = Math.round((f.speed / 92) * SCORE.ringTimeBonusMax);
      this.score += this.def.ringBonus + speedBonus;
      this.ringTimes.push(f.time);
      if (this.rings.done) {
        this.flight.message = `ALL RINGS — LAND AT ${this.landingStripName()}`;
      }
      return 'ring';
    }
    if (f.damage >= 100 && f.status === FLIGHT.CRASHED) {
      this.state = MISSION_STATE.FAILED;
      this.failReason = 'AIRFRAME DESTROYED';
      return 'crash-terrain';
    }
    return event;
  }

  finishLanding() {
    const f = this.flight;
    this.landingStrip = stripUnder(f.x, f.z);
    this.smoothLanding = Math.abs(f.verticalSpeed) < 3.5 && f.speed < 40;
    if (this.rings.done) {
      this.state = MISSION_STATE.COMPLETE;
      if (this.smoothLanding) this.score += SCORE.smoothLandingBonus;
      this.score += this.def.landingBonus;
      this.score += Math.round(this.timeLeft) * SCORE.timeBonusPerSecond;
      return 'mission-complete';
    }
    // Landed early: the sortie ends, rings unflown stay unscored.
    this.state = MISSION_STATE.FAILED;
    this.failReason = `LANDED EARLY — ${this.rings.total - this.rings.passedCount} RINGS LEFT`;
    return 'landed-early';
  }

  landingStripName() {
    const strip = this.def.id === 'mail-run' ? RUNWAYS[1] : RUNWAYS[0];
    return strip.name.toUpperCase();
  }

  dispose() {
    this.scene.remove(this.rings.group);
  }
}

export { MISSIONS };
