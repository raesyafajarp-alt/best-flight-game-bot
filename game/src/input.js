// Keyboard + mouse. Keys map through config.KEYS; mouse drag orbits the
// chase camera a little, clicks hit the menu buttons. The same object feeds
// the flight model every frame and the autopilot in screenshots.
import { KEYS } from './config.js';

export class Input {
  constructor() {
    this.keys = new Set();
    this.dragX = 0; // accumulated mouse-drag offset, decays back to 0
    this.dragY = 0;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.onPause = null;
    this.onRestart = null;
    this.onMute = null;
    this.onAnyKey = null;
    this._down = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.onAnyKey) this.onAnyKey();
      if (KEYS.pause.includes(e.code) && this.onPause) this.onPause();
      if (KEYS.restart.includes(e.code) && this.onRestart) this.onRestart();
      if (KEYS.mute.includes(e.code) && this.onMute) this.onMute();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._up = (e) => this.keys.delete(e.code);
    this._blur = () => this.keys.clear();
    this._mouseDown = (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    this._mouseMove = (e) => {
      if (!this.dragging) return;
      this.dragX += (e.clientX - this.lastX) * 0.003;
      this.dragY += (e.clientY - this.lastY) * 0.003;
      this.dragX = Math.max(-0.9, Math.min(0.9, this.dragX));
      this.dragY = Math.max(-0.5, Math.min(0.5, this.dragY));
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    this._mouseUp = () => {
      this.dragging = false;
    };
  }

  attach() {
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);
    window.addEventListener('mousedown', this._mouseDown);
    window.addEventListener('mousemove', this._mouseMove);
    window.addEventListener('mouseup', this._mouseUp);
  }

  detach() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._blur);
    window.removeEventListener('mousedown', this._mouseDown);
    window.removeEventListener('mousemove', this._mouseMove);
    window.removeEventListener('mouseup', this._mouseUp);
  }

  has(codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** Read the current control state into a flight input object. */
  readFlightInput() {
    const throttle = (this.has(KEYS.throttleUp) ? 1 : 0) - (this.has(KEYS.throttleDown) ? 1 : 0);
    const bank = (this.has(KEYS.bankRight) ? 1 : 0) - (this.has(KEYS.bankLeft) ? 1 : 0);
    const pitch = (this.has(KEYS.pitchUp) ? 1 : 0) - (this.has(KEYS.pitchDown) ? 1 : 0);
    return { throttle, bank, pitch };
  }

  /** Ease the camera drag offset back toward centre when the mouse is idle. */
  decayDrag(dt) {
    const k = Math.max(0, 1 - dt * 1.5);
    this.dragX *= k;
    this.dragY *= k;
  }
}
