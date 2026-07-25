import * as THREE from 'three';
import { WORLD, PLAYER } from './config.js';

// First-person controller: pointer-lock mouse look, WASD with acceleration,
// and swept-ish AABB resolution against the world colliders.
export class Player {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;

    this.pos = new THREE.Vector3(0, WORLD.eyeHeight, WORLD.cage.z);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;

    this.safe = new THREE.Vector3();   // last position known to be clear
    this._hit = { x: false, z: false };
    this.keys = new Set();
    this.locked = false;
    this.enabled = true;
    this.bob = 0;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onKeyDown = e => {
      if (e.repeat) return;
      this.keys.add(e.code);
    };
    this._onKeyUp = e => this.keys.delete(e.code);

    document.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    });
  }

  requestLock() {
    if (document.pointerLockElement === this.dom) return;
    // Browsers rate-limit re-locking right after an exit; a rejection is harmless.
    try { Promise.resolve(this.dom.requestPointerLock?.()).catch(() => {}); } catch { /* ignore */ }
  }
  releaseLock() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock?.();
  }

  _onMouseMove(e) {
    if (!this.locked || !this.enabled) return;
    this.yaw -= e.movementX * PLAYER.lookSens;
    this.pitch -= e.movementY * PLAYER.lookSens;
    const lim = Math.PI / 2 - 0.06;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  teleport(x, z, yaw = 0) {
    this.pos.set(x, WORLD.eyeHeight, z);
    this.safe.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
  }

  get sprinting() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  forward(out = new THREE.Vector3()) {
    return out.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();
  }

  update(dt, world, speed) {
    if (!this.enabled) { this.vel.set(0, 0, 0); return; }

    let ix = 0, iz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;

    const len = Math.hypot(ix, iz);
    let wishX = 0, wishZ = 0;
    if (len > 0) {
      ix /= len; iz /= len;
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      // forward (iz = -1) is (-sin yaw, -cos yaw); right (ix = +1) is (cos yaw, -sin yaw)
      wishX = ix * c + iz * s;
      wishZ = -ix * s + iz * c;
    }

    const target = speed * (this.sprinting && len > 0 ? PLAYER.sprintMul : 1);
    const ax = wishX * target, az = wishZ * target;

    // accelerate toward the wish velocity, decelerate when idle
    const rate = len > 0 ? PLAYER.accel : PLAYER.friction;
    this.vel.x += (ax - this.vel.x) * Math.min(1, rate * dt);
    this.vel.z += (az - this.vel.z) * Math.min(1, rate * dt);
    if (Math.abs(this.vel.x) < 0.01) this.vel.x = 0;
    if (Math.abs(this.vel.z) < 0.01) this.vel.z = 0;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    const lim = WORLD.half - 1.2;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));

    const clear = world.resolveCircle(this.pos, WORLD.playerRadius, this._hit);
    if (this._hit.x) this.vel.x = 0;
    if (this._hit.z) this.vel.z = 0;

    // Colliders that overlap each other can shove a body back and forth forever.
    // Rewinding to the last spot known to be clear makes being stuck impossible.
    if (clear) {
      this.safe.set(this.pos.x, 0, this.pos.z);
    } else if (this.safe.lengthSq()) {
      this.pos.x = this.safe.x;
      this.pos.z = this.safe.z;
      this.vel.set(0, 0, 0);
    }

    // head bob
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.bob += dt * moving * 1.5;
    const bobY = Math.sin(this.bob * 4) * Math.min(0.07, moving * 0.012);

    this.camera.position.set(this.pos.x, this.pos.y + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bob * 2) * 0.004, 'YXZ');
  }

  get speed2D() { return Math.hypot(this.vel.x, this.vel.z); }
}
