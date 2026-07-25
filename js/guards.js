import * as THREE from 'three';
import { sfx } from './audio.js';

const GUARD_NAMES = ['DALE', 'BRENDA', 'KEV', 'MO', 'SANDRA', 'PETE', 'YUSUF', 'GAIL', 'RAY', 'NIA', 'TOM', 'ELS', 'BAZ', 'JUNO'];

const M = {
  trouser: new THREE.MeshLambertMaterial({ color: 0x2b3a55 }),
  shirt:   new THREE.MeshLambertMaterial({ color: 0x3f6b4a }),
  vest:    new THREE.MeshLambertMaterial({ color: 0xf2a52c }),
  skin:    new THREE.MeshLambertMaterial({ color: 0xc79a6b }),
  cap:     new THREE.MeshLambertMaterial({ color: 0x22303f }),
  boot:    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  taser:   new THREE.MeshLambertMaterial({ color: 0x111111 }),
  dirty:   new THREE.MeshLambertMaterial({ color: 0x6b4a24 }),
};

export class Guard {
  constructor(world, cfg, index, spawn) {
    this.world = world;
    this.cfg = cfg;
    this.name = GUARD_NAMES[index % GUARD_NAMES.length];
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.facing = Math.random() * Math.PI * 2;
    this.state = 'patrol';
    this.stateTime = 0;
    this.stun = 0;
    this.target = null;
    this.tazeCharge = 0;
    this.splatted = false;
    this.walk = Math.random() * 10;

    this.group = new THREE.Group();
    this._buildMesh();
    this.group.position.copy(this.pos);
    world.root.add(this.group);
  }

  _buildMesh() {
    const g = this.group;
    const add = (geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };

    this.legL = add(new THREE.BoxGeometry(0.26, 0.85, 0.26), M.trouser, -0.17, 0.45, 0);
    this.legR = add(new THREE.BoxGeometry(0.26, 0.85, 0.26), M.trouser, 0.17, 0.45, 0);
    add(new THREE.BoxGeometry(0.3, 0.14, 0.42), M.boot, -0.17, 0.07, 0.05);
    add(new THREE.BoxGeometry(0.3, 0.14, 0.42), M.boot, 0.17, 0.07, 0.05);

    this.torso = add(new THREE.BoxGeometry(0.62, 0.72, 0.36), M.shirt, 0, 1.22, 0);
    this.vest = add(new THREE.BoxGeometry(0.68, 0.52, 0.42), M.vest, 0, 1.26, 0);
    this.armL = add(new THREE.BoxGeometry(0.18, 0.62, 0.2), M.shirt, -0.4, 1.24, 0);
    this.armR = add(new THREE.BoxGeometry(0.18, 0.62, 0.2), M.shirt, 0.4, 1.24, 0);
    add(new THREE.BoxGeometry(0.12, 0.22, 0.1), M.taser, 0.4, 0.92, 0.05); // taser on the hip

    this.head = add(new THREE.BoxGeometry(0.36, 0.36, 0.34), M.skin, 0, 1.78, 0);
    add(new THREE.BoxGeometry(0.4, 0.1, 0.38), M.cap, 0, 1.98, 0);
    add(new THREE.BoxGeometry(0.4, 0.06, 0.18), M.cap, 0, 1.94, -0.24);

    // torch beam (cheap cone, no extra light)
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 12, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.11, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    cone.rotation.x = Math.PI / 2;
    cone.position.set(0, 1.5, -6.2);
    this.torch = cone;
    g.add(cone);

    // attack-zone footprint
    const r = this.cfg.attack;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.35, r, 40),
      new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    this.zone = ring;
    g.add(ring);

    // alert bulb
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
    bulb.position.set(0, 2.5, 0);
    bulb.visible = false;
    this.bulb = bulb;
    g.add(bulb);
  }

  setZoneRadius(r) {
    this.zoneRadius = r;
    this.zone.geometry.dispose();
    this.zone.geometry = new THREE.RingGeometry(Math.max(0.4, r - 0.35), r, 40);
  }

  splat() {
    if (!this.splatted) {
      this.splatted = true;
      this.torso.material = M.dirty;
      this.vest.material = M.dirty;
      this.head.material = M.dirty;
    }
    this.stun = this.cfg.stunTime;
    this.state = 'stunned';
    this.tazeCharge = 0;
  }

  _pickWaypoint(playerPos, hunt) {
    const wp = this.world.waypoints;
    if (!wp.length) return;
    if (hunt && playerPos) {
      // head for somewhere near where the player was last seen
      let best = null, bestD = Infinity;
      for (let i = 0; i < 14; i++) {
        const c = wp[(Math.random() * wp.length) | 0];
        const d = Math.hypot(c.x - playerPos.x, c.z - playerPos.z);
        if (d < bestD) { bestD = d; best = c; }
      }
      this.target = best;
    } else {
      this.target = wp[(Math.random() * wp.length) | 0];
    }
  }

  update(dt, player, detectMul, attackMul, onCaught, onAlert) {
    this.stateTime += dt;
    const px = player.pos.x, pz = player.pos.z;
    const dx = px - this.pos.x, dz = pz - this.pos.z;
    const dist = Math.hypot(dx, dz);

    const detectR = this.cfg.detect * detectMul;
    const attackR = this.cfg.attack * attackMul;
    const tazeR = this.cfg.taze * attackMul;
    if (this.zoneRadius !== attackR) this.setZoneRadius(attackR);

    // --- perception
    let sees = false;
    if (this.state !== 'stunned') {
      const toA = Math.atan2(dx, dz);
      let delta = Math.abs(((toA - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const moving = player.speed2D > 3.2;
      const effR = detectR * (moving ? 1.15 : 0.82);
      if (dist < effR && delta < this.cfg.guardFov / 2) sees = true;
      if (dist < attackR * 0.75) sees = true;         // you are simply too close
      if (dist < effR * 0.45 && moving) sees = true;  // heard you sprinting
    }

    // --- state machine
    if (this.stun > 0) {
      this.stun -= dt;
      if (this.stun <= 0) { this.state = 'patrol'; this.target = null; }
    } else if (sees) {
      if (this.state !== 'chase') {
        this.state = 'chase';
        this.stateTime = 0;
        onAlert?.(this);
      }
      this.lastSeen = { x: px, z: pz };
    } else if (this.state === 'chase' && this.stateTime > 2.6) {
      this.state = 'search';
      this.stateTime = 0;
      this.target = this.lastSeen || null;
    } else if (this.state === 'search' && this.stateTime > 6) {
      this.state = 'patrol';
      this.target = null;
    }

    // --- movement
    let speed = 0, aimX = 0, aimZ = 0;
    if (this.state === 'chase') {
      speed = this.cfg.guardSpeed * 1.18;
      aimX = dx; aimZ = dz;
    } else if (this.state === 'search') {
      speed = this.cfg.guardSpeed * 0.9;
      if (!this.target || Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 2)
        this._pickWaypoint(this.lastSeen, true);
      if (this.target) { aimX = this.target.x - this.pos.x; aimZ = this.target.z - this.pos.z; }
    } else if (this.state === 'patrol') {
      speed = this.cfg.guardSpeed * 0.55;
      if (!this.target || Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 2)
        this._pickWaypoint(null, false);
      if (this.target) { aimX = this.target.x - this.pos.x; aimZ = this.target.z - this.pos.z; }
    } else {
      speed = 0; // stunned: wiping themselves down
    }

    const aimLen = Math.hypot(aimX, aimZ);
    if (aimLen > 0.001 && speed > 0) {
      const wantFacing = Math.atan2(aimX, aimZ);
      let d = ((wantFacing - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.facing += Math.max(-this.cfg.guardTurn * dt, Math.min(this.cfg.guardTurn * dt, d));

      const stepX = (aimX / aimLen) * speed * dt;
      const stepZ = (aimZ / aimLen) * speed * dt;
      this._move(stepX, stepZ);
      this.walk += dt * speed * 1.6;
    }

    // --- taze check
    if (this.state === 'chase' && dist < tazeR) {
      this.tazeCharge += dt;
      if (this.tazeCharge > 0.42) onCaught?.(this);
    } else {
      this.tazeCharge = Math.max(0, this.tazeCharge - dt * 1.5);
    }

    // --- visuals
    this.group.position.set(this.pos.x, this.stun > 0 ? -0.12 : 0, this.pos.z);
    this.group.rotation.y = this.facing + Math.PI;
    const swing = Math.sin(this.walk * 3) * (speed > 0 ? 0.5 : 0);
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    if (this.stun > 0) this.group.rotation.z = Math.sin(this.stun * 22) * 0.1;
    else this.group.rotation.z = 0;

    this.bulb.visible = this.state === 'chase';
    this.torch.visible = this.stun <= 0;
    const inZone = dist < attackR;
    this.zone.material.opacity = this.stun > 0 ? 0.05
      : inZone ? 0.42 + Math.sin(performance.now() * 0.012) * 0.18
      : 0.16;
    this.zone.material.color.setHex(this.state === 'chase' ? 0xff2222 : 0xff8844);

    return { dist, inZone: inZone && this.stun <= 0, chasing: this.state === 'chase' && this.stun <= 0 };
  }

  _move(sx, sz) {
    const r = 0.55;
    this.pos.x += sx;
    this._resolve('x', r);
    this.pos.z += sz;
    this._resolve('z', r);
  }

  _resolve(axis, r) {
    for (const c of this.world.colliders) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const ox = c.hx + r - Math.abs(dx), oz = c.hz + r - Math.abs(dz);
      if (ox <= 0 || oz <= 0) continue;
      if (axis === 'x') this.pos.x += dx >= 0 ? ox : -ox;
      else this.pos.z += dz >= 0 ? oz : -oz;
      // bumping a wall while patrolling? pick a new destination
      if (this.state === 'patrol' || this.state === 'search') this.target = null;
    }
  }

  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.group.parent?.remove(this.group);
  }
}

// ------------------------------------------------------------------ coins
export class Coin {
  constructor(world, x, z, value) {
    this.value = value;
    this.pos = new THREE.Vector3(x, 0.8, z);
    this.spin = Math.random() * 6;
    this.life = 0;
    this.collected = false;

    // Emissive rather than a real PointLight: a pile of dropped coins would
    // otherwise recompile every material in the scene.
    const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.13, 16);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xffc93c, emissive: 0xc48a10 }));
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.castShadow = true;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.group.position.copy(this.pos);
    world.root.add(this.group);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.1, 18),
      new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.7;
    this.group.add(halo);
    this.halo = halo;
  }

  update(dt, player, range) {
    this.life += dt;
    this.spin += dt * 3;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < range * 2.6 && d > 0.01) {
      const pull = Math.min(14, 26 / Math.max(1, d)) * dt;
      this.pos.x += (dx / d) * pull;
      this.pos.z += (dz / d) * pull;
    }
    this.group.position.set(this.pos.x, 0.75 + Math.sin(this.life * 3) * 0.18, this.pos.z);
    this.mesh.rotation.z = this.spin;
    if (d < range) {
      this.collected = true;
      sfx.coin();
    }
    return this.collected;
  }

  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.group.parent?.remove(this.group);
  }
}
