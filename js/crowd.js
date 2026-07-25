import * as THREE from 'three';
import { PATRON_SHOUTS, JANITOR_REACH } from './config.js';

// Night shift: one man, a litter picker, and a grim sense of duty.
// Day shift: the paying public, who are worse.

const M = {
  overall:  new THREE.MeshLambertMaterial({ color: 0x2f5fa8 }),
  overallD: new THREE.MeshLambertMaterial({ color: 0x24487d }),
  skin:     new THREE.MeshLambertMaterial({ color: 0xc79a6b }),
  cap:      new THREE.MeshLambertMaterial({ color: 0x1f1f24 }),
  boot:     new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  picker:   new THREE.MeshLambertMaterial({ color: 0x8a8f96 }),
  bag:      new THREE.MeshLambertMaterial({ color: 0x22262b }),
  hiviz:    new THREE.MeshLambertMaterial({ color: 0xd8e84a }),
};

const SKINS = [0xc79a6b, 0x8d5a3b, 0xefc9a4, 0x6b4227, 0xa9784f, 0xd9ab84];
const SHIRTS = [0xd94f4f, 0x4f7fd9, 0x4fd97f, 0xd9c14f, 0xa14fd9, 0xd97f4f, 0xe8e8e8, 0x3b3b46];
const LEGS = [0x2b3a55, 0x4a4a52, 0x6b5030, 0x30506b, 0x8a3f5a];

/** Shared humanoid body used by both the janitor and the patrons. */
function buildBody(group, { scale = 1, shirt, legs, skin, hat = null }) {
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
    return m;
  };
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const legMat = new THREE.MeshLambertMaterial({ color: legs });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });

  const parts = {};
  parts.legL = add(new THREE.BoxGeometry(0.24, 0.82, 0.24), legMat, -0.16, 0.44, 0);
  parts.legR = add(new THREE.BoxGeometry(0.24, 0.82, 0.24), legMat, 0.16, 0.44, 0);
  add(new THREE.BoxGeometry(0.28, 0.13, 0.4), M.boot, -0.16, 0.06, 0.04);
  add(new THREE.BoxGeometry(0.28, 0.13, 0.4), M.boot, 0.16, 0.06, 0.04);
  parts.torso = add(new THREE.BoxGeometry(0.58, 0.7, 0.34), shirtMat, 0, 1.2, 0);
  parts.armL = add(new THREE.BoxGeometry(0.17, 0.6, 0.19), shirtMat, -0.38, 1.22, 0);
  parts.armR = add(new THREE.BoxGeometry(0.17, 0.6, 0.19), shirtMat, 0.38, 1.22, 0);
  parts.head = add(new THREE.BoxGeometry(0.34, 0.34, 0.32), skinMat, 0, 1.74, 0);
  if (hat) add(new THREE.BoxGeometry(0.4, 0.12, 0.38), hat, 0, 1.95, 0);

  group.scale.setScalar(scale);
  return parts;
}

// ==================================================================== janitor
export class Janitor {
  constructor(world, cfg, index, spawn) {
    this.world = world;
    this.cfg = cfg;
    this.name = 'Ron';
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.facing = Math.random() * Math.PI * 2;
    this.state = 'sweep';       // sweep | clean | chase | grumble
    this.stateTime = 0;
    this.walk = Math.random() * 10;
    this.cleanProgress = 0;
    this.targetFood = null;
    this.wander = null;
    this.cooldown = 0;          // after nabbing you he loses interest briefly
    this.stuckT = 0;            // how long he has failed to close on his target
    this.bestFd = Infinity;

    this.group = new THREE.Group();
    this.parts = buildBody(this.group, {
      scale: 1.02, shirt: 0x2f5fa8, legs: 0x24487d, skin: SKINS[index % SKINS.length], hat: M.cap,
    });
    // hi-viz stripe, litter picker and a bin bag
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.38), M.hiviz);
    stripe.position.set(0, 1.32, 0);
    this.group.add(stripe);

    const picker = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 5), M.picker);
    picker.position.set(0.44, 0.85, 0.22);
    picker.rotation.x = 0.35;
    picker.castShadow = true;
    this.group.add(picker);
    this.picker = picker;

    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), M.bag);
    bag.position.set(-0.46, 0.75, -0.1);
    bag.scale.set(1, 1.25, 1);
    bag.castShadow = true;
    this.group.add(bag);
    this.bag = bag;

    // a dim head torch — much weaker than a guard's, and that is the point
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 7, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    cone.rotation.x = Math.PI / 2;
    cone.position.set(0, 1.5, -3.6);
    this.group.add(cone);
    this.torch = cone;

    // his notice-me ring, drawn much softer than a guard's attack zone
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(cfg.janitorCatch - 0.25, cfg.janitorCatch, 28),
      new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    this.group.add(ring);
    this.ring = ring;

    this.group.position.copy(this.pos);
    world.root.add(this.group);
  }

  /** Nearest uncollected scrap — his actual job, and your competition. */
  _pickFood(food) {
    let best = null, bestD = Infinity;
    for (const f of food) {
      if (f.eaten || f.unreachable) continue;
      if (f.claimedBy && f.claimedBy !== this) continue;
      const d = Math.hypot(f.pos.x - this.pos.x, f.pos.z - this.pos.z);
      if (d < bestD) { bestD = d; best = f; }
    }
    if (this.targetFood) this.targetFood.claimedBy = null;
    this.targetFood = best;
    if (best) best.claimedBy = this;
    this.stuckT = 0;
    this.bestFd = Infinity;
  }

  /** Give up on a scrap he cannot physically get to, rather than standing in a wall. */
  _abandonTarget() {
    if (!this.targetFood) return;
    this.targetFood.unreachable = true;
    this.targetFood.claimedBy = null;
    this.targetFood = null;
    this.stuckT = 0;
    this.bestFd = Infinity;
  }

  update(dt, player, food, onCatch, onBag) {
    this.stateTime += dt;
    if (this.cooldown > 0) this.cooldown -= dt;

    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    // --- perception: short-sighted, and he genuinely does not look up much
    let sees = false;
    if (this.cooldown <= 0) {
      const toA = Math.atan2(dx, dz);
      const delta = Math.abs(((toA - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const moving = player.speed2D > 3.2;
      const r = this.cfg.janitorDetect * (moving ? 1.2 : 0.75);
      if (dist < r && delta < this.cfg.janitorFov / 2) sees = true;
      if (dist < this.cfg.janitorCatch * 1.8) sees = true;
    }

    if (sees) {
      this.state = 'chase';
    } else if (this.state === 'chase' && this.stateTime > 3.2) {
      this.state = 'sweep';
      this.targetFood = null;
    }

    let speed = 0, aimX = 0, aimZ = 0;

    if (this.state === 'chase') {
      speed = this.cfg.janitorSpeed * 1.1;
      aimX = dx; aimZ = dz;
      if (dist < this.cfg.janitorCatch) {
        this.cooldown = 6;
        this.state = 'grumble';
        this.stateTime = 0;
        onCatch?.(this);
      }
    } else if (this.state === 'grumble') {
      if (this.stateTime > 1.6) this.state = 'sweep';
    } else {
      // sweeping: walk to the nearest scrap and bag it
      if (!this.targetFood || this.targetFood.eaten) this._pickFood(food);

      if (this.targetFood) {
        const fx = this.targetFood.pos.x - this.pos.x, fz = this.targetFood.pos.z - this.pos.z;
        const fd = Math.hypot(fx, fz);
        if (fd < JANITOR_REACH) {
          this.state = 'clean';
          this.cleanProgress += dt;
          aimX = fx; aimZ = fz;
          if (this.cleanProgress >= this.cfg.cleanTime) {
            this.cleanProgress = 0;
            const bagged = this.targetFood;
            this.targetFood = null;
            onBag?.(bagged, this);
          }
        } else {
          this.state = 'sweep';
          this.cleanProgress = 0;
          speed = this.cfg.janitorSpeed;
          aimX = fx; aimZ = fz;

          // Watchdog: if he stops closing on it, it is behind something solid.
          // Without this one bad target parks a janitor in a wall all night.
          if (fd < this.bestFd - 0.2) { this.bestFd = fd; this.stuckT = 0; }
          else { this.stuckT += dt; if (this.stuckT > 3.5) this._abandonTarget(); }
        }
      } else {
        // nothing left to bag — potter about
        if (!this.wander || Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z) < 2) {
          const wp = this.world.waypoints;
          this.wander = wp.length ? wp[(Math.random() * wp.length) | 0] : null;
        }
        if (this.wander) {
          speed = this.cfg.janitorSpeed * 0.6;
          aimX = this.wander.x - this.pos.x; aimZ = this.wander.z - this.pos.z;
        }
      }
    }

    this._steer(dt, aimX, aimZ, speed);
    this._render(dt, speed, dist);

    return { dist, chasing: this.state === 'chase' };
  }

  _steer(dt, aimX, aimZ, speed) {
    const len = Math.hypot(aimX, aimZ);
    if (len < 0.001) return;
    const want = Math.atan2(aimX, aimZ);
    let d = ((want - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.facing += Math.max(-2.6 * dt, Math.min(2.6 * dt, d));
    if (speed <= 0) return;

    const r = 0.5;
    this.pos.x += (aimX / len) * speed * dt;
    this._resolve('x', r);
    this.pos.z += (aimZ / len) * speed * dt;
    this._resolve('z', r);
    this.walk += dt * speed * 1.7;
  }

  _resolve(axis, r) {
    for (const c of this.world.colliders) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const ox = c.hx + r - Math.abs(dx), oz = c.hz + r - Math.abs(dz);
      if (ox <= 0 || oz <= 0) continue;
      if (axis === 'x') this.pos.x += dx >= 0 ? ox : -ox;
      else this.pos.z += dz >= 0 ? oz : -oz;
      this.wander = null;
    }
  }

  _render(dt, speed, dist) {
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.facing + Math.PI;
    const swing = Math.sin(this.walk * 3) * (speed > 0 ? 0.45 : 0);
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.7;

    // stabbing motion while bagging a scrap
    if (this.state === 'clean') {
      this.picker.rotation.x = 0.35 + Math.sin(this.stateTime * 9) * 0.5;
      this.parts.armR.rotation.x = 0.4 + Math.sin(this.stateTime * 9) * 0.4;
    } else {
      this.picker.rotation.x = 0.35;
      this.parts.armR.rotation.x = swing * 0.7;
    }

    const hot = this.state === 'chase';
    this.ring.material.opacity = hot ? 0.5 : dist < this.cfg.janitorDetect ? 0.28 : 0.14;
    this.ring.material.color.setHex(hot ? 0xffb038 : 0x8fd0ff);
  }

  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.group.parent?.remove(this.group);
  }
}

// ==================================================================== patrons
export class Patron {
  constructor(world, cfg, index, spawn) {
    this.world = world;
    this.cfg = cfg;
    this.kind = 'patron';
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.facing = Math.random() * Math.PI * 2;
    this.state = 'stroll';      // stroll | spotted | mob
    this.stateTime = 99;
    this.walk = Math.random() * 10;
    this.wander = null;
    this.shout = PATRON_SHOUTS[index % PATRON_SHOUTS.length];
    // `stun` is what the projectile system reads to skip spent targets. A
    // splattered patron is done for the day, so it never counts down.
    this.stun = 0;
    this.silenced = false;
    this.name = 'a guest';

    const kid = Math.random() < 0.3;
    this.group = new THREE.Group();
    this.parts = buildBody(this.group, {
      scale: kid ? 0.66 : 0.94 + Math.random() * 0.12,
      shirt: SHIRTS[(Math.random() * SHIRTS.length) | 0],
      legs: LEGS[(Math.random() * LEGS.length) | 0],
      skin: SKINS[(Math.random() * SKINS.length) | 0],
      hat: Math.random() < 0.25 ? M.cap : null,
    });

    // the raised pointing arm, hidden until they clock you
    const point = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.18), this.parts.armR.material);
    point.position.set(0.42, 1.62, 0.24);
    point.rotation.x = -1.15;
    point.visible = false;
    this.group.add(point);
    this.pointArm = point;

    // a floating "!" so an alarmed patron reads at a glance
    const bang = new THREE.Group();
    const bangMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d });
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.34, 0.13), bangMat);
    stem.position.y = 0.22;
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), bangMat);
    dot.position.y = -0.05;
    bang.add(stem, dot);
    bang.position.set(0, 2.3, 0);
    bang.visible = false;
    this.group.add(bang);
    this.bang = bang;

    this.group.position.copy(this.pos);
    world.root.add(this.group);
  }

  /**
   * Took one in the face. They will not be telling anybody anything — they are
   * too busy with their own evening. Silencing a witness costs a round and
   * scores nothing; that trade-off is the point.
   */
  splat() {
    if (this.silenced) return;
    this.silenced = true;
    this.stun = Infinity;
    this.state = 'stroll';
    const dirty = new THREE.MeshLambertMaterial({ color: 0x6b4a24 });
    this.parts.torso.material = dirty;
    this.parts.head.material = dirty;
    this.parts.armL.material = dirty;
    this.pointArm.visible = false;
    this.bang.visible = false;
    this.parts.armR.visible = true;
  }

  update(dt, player, onShout) {
    this.stateTime += dt;

    if (this.silenced) {
      // stood there dripping, contributing nothing to society
      this.parts.legL.rotation.x = 0;
      this.parts.legR.rotation.x = 0;
      this.group.position.set(this.pos.x, 0, this.pos.z);
      return { dist: Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z), alarmed: false };
    }

    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    const toA = Math.atan2(dx, dz);
    const delta = Math.abs(((toA - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const sees = dist < this.cfg.patronAlert &&
      (delta < this.cfg.patronFov / 2 || dist < this.cfg.crowdRadius * 1.4);

    if (sees && this.state === 'stroll') {
      this.state = 'spotted';
      this.stateTime = 0;
      onShout?.(this);
    } else if (this.state === 'spotted' && this.stateTime > 0.9) {
      this.state = 'mob';
    } else if (!sees && this.state === 'mob' && dist > this.cfg.patronAlert * 1.6) {
      this.state = 'stroll';
      this.wander = null;
    }

    let speed = 0, aimX = 0, aimZ = 0;
    if (this.state === 'spotted') {
      aimX = dx; aimZ = dz;                       // stop and point
    } else if (this.state === 'mob') {
      speed = this.cfg.patronSpeed * 1.35;
      aimX = dx; aimZ = dz;
      // stop shuffling once they are already on top of you
      if (dist < this.cfg.crowdRadius * 0.55) speed = 0;
    } else {
      if (!this.wander || Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z) < 2) {
        const wp = this.world.waypoints;
        this.wander = wp.length ? wp[(Math.random() * wp.length) | 0] : null;
      }
      if (this.wander) {
        speed = this.cfg.patronSpeed;
        aimX = this.wander.x - this.pos.x; aimZ = this.wander.z - this.pos.z;
      }
    }

    this._steer(dt, aimX, aimZ, speed);

    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.facing + Math.PI;
    const swing = Math.sin(this.walk * 3.4) * (speed > 0 ? 0.5 : 0);
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    const alarmed = this.state !== 'stroll';
    this.pointArm.visible = alarmed;
    this.parts.armR.visible = !alarmed;
    this.bang.visible = alarmed;
    this.bang.position.y = 2.3 + Math.sin(this.stateTime * 9) * 0.1;

    return { dist, alarmed };
  }

  _steer(dt, aimX, aimZ, speed) {
    const len = Math.hypot(aimX, aimZ);
    if (len < 0.001) return;
    const want = Math.atan2(aimX, aimZ);
    let d = ((want - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.facing += Math.max(-3.2 * dt, Math.min(3.2 * dt, d));
    if (speed <= 0) return;

    const r = 0.45;
    this.pos.x += (aimX / len) * speed * dt;
    this._resolve('x', r);
    this.pos.z += (aimZ / len) * speed * dt;
    this._resolve('z', r);
    this.walk += dt * speed * 1.9;
  }

  _resolve(axis, r) {
    for (const c of this.world.colliders) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const ox = c.hx + r - Math.abs(dx), oz = c.hz + r - Math.abs(dz);
      if (ox <= 0 || oz <= 0) continue;
      if (axis === 'x') this.pos.x += dx >= 0 ? ox : -ox;
      else this.pos.z += dz >= 0 ? oz : -oz;
      this.wander = null;
    }
  }

  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.group.parent?.remove(this.group);
  }
}

/**
 * How tightly the public has you pinned.
 * @returns {{count:number, pinned:boolean}} pinned once `crowdSize` of them are
 *          inside `crowdRadius` and actively mobbing you.
 */
export function crowdPressure(patrons, player, cfg) {
  let count = 0;
  for (const p of patrons) {
    if (p.silenced || p.state === 'stroll') continue;
    if (Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z) <= cfg.crowdRadius) count++;
  }
  return { count, pinned: count >= cfg.crowdSize };
}
