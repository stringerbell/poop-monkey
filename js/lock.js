import { sfx } from './audio.js';
import { MIN_LOCK_WINDOW, MAX_LOCK_SPEED } from './config.js';

const TAU = Math.PI * 2;
export const norm = a => ((a % TAU) + TAU) % TAU;

// Is angle `a` inside the arc starting at `start` with width `w` (travelling CCW)?
export function inArc(a, start, w) {
  return norm(a - start) <= w;
}

/**
 * "Pop the Lock" style timing puzzle.
 * A bar sweeps the ring; press while it is over the green target to advance a rung.
 * Miss (or hit a red decoy) and the whole lock restarts.
 */
export class LockPuzzle {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.active = false;
    this.cfg = null;

    this.onRung = null;      // (rungIndex, totalRungs)
    this.onLockDone = null;  // (lockIndex, totalLocks)
    this.onComplete = null;
    this.onFail = null;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = 420;
    canvas.width = this.size * dpr;
    canvas.height = this.size * dpr;
    this.ctx.scale(dpr, dpr);
  }

  start(cfg) {
    this.cfg = cfg;
    this.active = true;
    this.lockIndex = 0;
    this._resetLock(true);
  }

  stop() { this.active = false; }

  /**
   * Difficulty lives in `win` — the seconds the bar spends inside the target.
   * Speed and window are clamped independently, then the drawn arc is derived
   * from both, so no combination of level curve values can produce a rung that
   * is physically unhittable or a target too small to see.
   */
  _applyDifficulty() {
    this.win = Math.max(MIN_LOCK_WINDOW, this.win);
    this.speed = Math.min(MAX_LOCK_SPEED, this.speed);
    this.arc = this.win * this.speed;
  }

  /** How long the bar spends inside the current target, in seconds. */
  get window() { return this.win; }

  _resetLock(silent) {
    const c = this.cfg;
    this.rung = 0;
    this.speed = c.speed;
    this.win = c.window;
    this._applyDifficulty();
    this.angle = 0;
    this.dir = 1;
    this.hits = [];
    this.failTimer = silent ? 0 : 0.75;
    this.flash = silent ? 0 : 1;
    this.decoys = [];
    this._placeTarget(true);
    this._placeDecoys();
  }

  _placeTarget(first) {
    const gap = first ? 1.4 : 0.85 + Math.random() * 1.7;
    const start = norm(this.angle + this.dir * gap - (this.dir > 0 ? 0 : this.arc));
    this.target = { start, w: this.arc };
  }

  _placeDecoys() {
    this.decoys = [];
    const n = this.cfg.decoys || 0;
    let guard = 0;
    while (this.decoys.length < n && guard++ < 80) {
      const w = this.arc * 0.9;
      const start = Math.random() * TAU;
      const clashes =
        inArc(start, this.target.start - 0.5, this.target.w + 1.0) ||
        inArc(start + w, this.target.start - 0.5, this.target.w + 1.0) ||
        this.decoys.some(d => inArc(start, d.start - 0.4, d.w + 0.8));
      if (!clashes) this.decoys.push({ start, w });
    }
  }

  update(dt) {
    if (!this.active) return;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
    if (this.failTimer > 0) { this.failTimer -= dt; this.draw(); return; }

    const prev = this.angle;
    this.angle = norm(this.angle + this.dir * this.speed * dt);

    // subtle tick as the bar crosses the target, for audio feedback
    if (!inArc(prev, this.target.start, this.target.w) && inArc(this.angle, this.target.start, this.target.w)) {
      sfx.tick();
    }
    this.draw();
  }

  press() {
    if (!this.active || this.failTimer > 0) return;

    for (const d of this.decoys) {
      if (inArc(this.angle, d.start, d.w)) return this._fail();
    }
    if (!inArc(this.angle, this.target.start, this.target.w)) return this._fail();

    // hit
    this.hits.push(this.angle);
    this.rung++;
    sfx.lockHit(this.rung);
    this.onRung?.(this.rung, this.cfg.rungs);

    if (this.rung >= this.cfg.rungs) {
      this.lockIndex++;
      if (this.lockIndex >= this.cfg.locks) {
        this.active = false;
        sfx.lockOpen();
        this.onComplete?.();
        return;
      }
      sfx.lockOpen();
      this.onLockDone?.(this.lockIndex, this.cfg.locks);
      this._resetLock(true);
      // each successive lock on the same door starts a notch faster
      this.speed = this.cfg.speed * (1 + this.lockIndex * 0.18);
      this.win = this.cfg.window * Math.pow(0.94, this.lockIndex);
      this._applyDifficulty();
      this._placeTarget(true);
      this._placeDecoys();
      return;
    }

    this.speed *= this.cfg.ramp;
    this.win *= this.cfg.windowShrink;
    this._applyDifficulty();
    if (this.cfg.reversals && Math.random() < 0.32) this.dir *= -1;
    this._placeTarget(false);
    this._placeDecoys();
  }

  _fail() {
    sfx.lockFail();
    const reached = this.rung;
    this._resetLock(false);
    this.onFail?.(reached);
  }

  // ------------------------------------------------------------ render
  draw() {
    const ctx = this.ctx;
    const S = this.size, c = S / 2, R = S * 0.36;
    ctx.clearRect(0, 0, S, S);

    // backdrop disc
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(c, c, R + 34, 0, TAU); ctx.fill();

    // track
    ctx.strokeStyle = this.flash > 0 ? `rgba(255,80,80,${0.3 + this.flash * 0.5})` : 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 26;
    ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.stroke();

    // decoys
    for (const d of this.decoys) {
      ctx.strokeStyle = '#ff4d4d';
      ctx.lineWidth = 26;
      ctx.beginPath(); ctx.arc(c, c, R, d.start, d.start + d.w); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,120,120,0.35)';
      ctx.lineWidth = 40;
      ctx.beginPath(); ctx.arc(c, c, R, d.start, d.start + d.w); ctx.stroke();
    }

    // target
    if (this.failTimer <= 0) {
      const t = this.target;
      ctx.strokeStyle = 'rgba(111,220,111,0.28)';
      ctx.lineWidth = 44;
      ctx.beginPath(); ctx.arc(c, c, R, t.start, t.start + t.w); ctx.stroke();
      ctx.strokeStyle = '#6fdc6f';
      ctx.lineWidth = 26;
      ctx.beginPath(); ctx.arc(c, c, R, t.start, t.start + t.w); ctx.stroke();
    }

    // previous successful hits
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    for (const h of this.hits) {
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(h) * (R - 16), c + Math.sin(h) * (R - 16));
      ctx.lineTo(c + Math.cos(h) * (R + 16), c + Math.sin(h) * (R + 16));
      ctx.stroke();
    }

    // the sweeping bar
    const a = this.angle;
    ctx.save();
    ctx.translate(c + Math.cos(a) * R, c + Math.sin(a) * R);
    ctx.rotate(a);
    ctx.shadowColor = '#ffc93c';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffc93c';
    ctx.fillRect(-22, -5, 44, 10);   // radial tick, so it reads as a pointer
    ctx.restore();

    // hub text
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.flash > 0 ? '#ff5555' : '#f6efdd';
    ctx.font = '900 62px "Trebuchet MS", sans-serif';
    ctx.fillText(`${this.rung}`, c, c + 8);
    ctx.fillStyle = 'rgba(246,239,221,0.5)';
    ctx.font = '700 17px "Trebuchet MS", sans-serif';
    ctx.fillText(`/ ${this.cfg.rungs} RUNGS`, c, c + 36);
    if (this.failTimer > 0) {
      ctx.fillStyle = '#ff5555';
      ctx.font = '900 24px "Trebuchet MS", sans-serif';
      ctx.fillText('CLUNK.', c, c - 46);
    }
  }
}
