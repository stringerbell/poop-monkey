import * as THREE from 'three';
import { FOOD_TYPES } from './config.js';

export const HIT_R = 0.85;    // guard hit cylinder radius
export const MAX_STEP = 0.25; // longest distance a shot may advance between collision checks

const POOP_MAT = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
const SPLAT_MAT = new THREE.MeshBasicMaterial({ color: 0x4a2f16, transparent: true, opacity: 0.85, depthWrite: false });

/** Flying poop, splatter decals and the little debris burst. */
export class ProjectileSystem {
  constructor(world) {
    this.world = world;
    this.shots = [];
    this.debris = [];
    this.decals = [];
  }

  fire(origin, dir, opts) {
    const geo = new THREE.SphereGeometry(opts.size, 8, 6);
    const mesh = new THREE.Mesh(geo, POOP_MAT);
    mesh.castShadow = true;
    mesh.position.copy(origin);
    this.world.root.add(mesh);

    this.shots.push({
      mesh,
      pos: origin.clone(),
      // The lob assist is tied to the weapon's gravity, not its speed: a bare arm
      // needs a big arc to reach anything, the RPP is meant to fly nearly flat.
      vel: dir.clone().multiplyScalar(opts.speed).add(new THREE.Vector3(0, opts.gravity * 0.17, 0)),
      gravity: opts.gravity,
      splash: opts.splash,
      life: 0,
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
    });
  }

  update(dt, guards, onHit) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life += dt;
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;

      // Integrate in short hops. An R.P.P. round covers ~1.7m in a single 60fps
      // frame, which is twice a guard's hit radius — a plain per-frame position
      // check would fly straight through people and walls.
      const travel = Math.hypot(s.vel.x, s.vel.y, s.vel.z) * dt;
      const steps = Math.max(1, Math.min(12, Math.ceil(travel / MAX_STEP)));
      const h = dt / steps;

      let hitGuard = null, hitWorld = false;
      for (let k = 0; k < steps && !hitGuard && !hitWorld; k++) {
        s.vel.y -= s.gravity * h;
        s.pos.addScaledVector(s.vel, h);

        for (const g of guards) {
          if (g.stun > 0) continue;
          const dx = s.pos.x - g.pos.x, dz = s.pos.z - g.pos.z;
          if (dx * dx + dz * dz < HIT_R * HIT_R && s.pos.y > -0.1 && s.pos.y < 2.3) { hitGuard = g; break; }
        }
        if (hitGuard) break;

        if (s.pos.y <= 0.12) hitWorld = true;
        else if (Math.abs(s.pos.x) > 69 || Math.abs(s.pos.z) > 69) hitWorld = true;
        else {
          for (const c of this.world.colliders) {
            if (s.pos.y < (c.top ?? 12) &&
                Math.abs(s.pos.x - c.x) < c.hx && Math.abs(s.pos.z - c.z) < c.hz) { hitWorld = true; break; }
          }
        }
      }
      s.mesh.position.copy(s.pos);

      if (hitGuard || hitWorld || s.life > 6) {
        const splashHits = [];
        if (hitGuard) splashHits.push(hitGuard);
        if (s.splash > 0) {
          for (const g of guards) {
            if (g === hitGuard || g.stun > 0) continue;
            if (Math.hypot(s.pos.x - g.pos.x, s.pos.z - g.pos.z) < s.splash) splashHits.push(g);
          }
        }
        this._burst(s.pos, s.splash > 0 ? 14 : 7);
        if (s.pos.y <= 0.6) this._decal(s.pos, 0.5 + s.splash * 0.35);
        onHit?.(splashHits, s, !!hitGuard);

        s.mesh.geometry.dispose();
        this.world.root.remove(s.mesh);
        this.shots.splice(i, 1);
      }
    }

    // debris
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life += dt;
      d.vel.y -= 22 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      if (d.mesh.position.y < 0.05) { d.mesh.position.y = 0.05; d.vel.set(0, 0, 0); }
      d.mesh.material.opacity = Math.max(0, 1 - d.life / 1.6);
      if (d.life > 1.6) {
        d.mesh.geometry.dispose(); d.mesh.material.dispose();
        this.world.root.remove(d.mesh);
        this.debris.splice(i, 1);
      }
    }

    // fade the oldest decals out so we never leak geometry
    while (this.decals.length > 60) {
      const old = this.decals.shift();
      old.geometry.dispose();
      this.world.root.remove(old);
    }
  }

  _burst(pos, n) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.07 + Math.random() * 0.09, 5, 4),
        new THREE.MeshBasicMaterial({ color: 0x5c3a1c, transparent: true, opacity: 1 })
      );
      m.position.copy(pos);
      this.world.root.add(m);
      this.debris.push({
        mesh: m, life: 0,
        vel: new THREE.Vector3((Math.random() - 0.5) * 9, Math.random() * 6 + 1, (Math.random() - 0.5) * 9),
      });
    }
  }

  _decal(pos, r) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(r * (0.7 + Math.random() * 0.6), 10), SPLAT_MAT);
    d.rotation.x = -Math.PI / 2;
    d.position.set(pos.x, 0.045, pos.z);
    this.world.root.add(d);
    this.decals.push(d);
  }

  clear() {
    for (const s of this.shots) { s.mesh.geometry.dispose(); this.world.root.remove(s.mesh); }
    for (const d of this.debris) { d.mesh.geometry.dispose(); this.world.root.remove(d.mesh); }
    for (const d of this.decals) { d.geometry.dispose(); this.world.root.remove(d); }
    this.shots.length = 0; this.debris.length = 0; this.decals.length = 0;
  }
}

// ------------------------------------------------------------------ food
export class FoodItem {
  constructor(world, spot, rng) {
    this.type = FOOD_TYPES[(rng() * FOOD_TYPES.length) | 0];
    this.pos = new THREE.Vector3(spot.x, spot.y, spot.z);
    this.phase = rng() * 6;
    this.eaten = false;

    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.16, 0.3, 4, 8),
      new THREE.MeshLambertMaterial({ color: this.type.color, emissive: this.type.color, emissiveIntensity: 0.22 })
    );
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    g.add(body);

    // a nibbled bite taken out, so it reads as leftovers
    const bite = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 5),
      new THREE.MeshLambertMaterial({ color: 0x2b1d10 })
    );
    bite.position.set(0.24, 0.03, 0);
    g.add(bite);

    // faint ground marker so scraps are findable without being obvious
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.44, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -this.pos.y + 0.05;
    g.add(halo);
    this.halo = halo;

    g.position.copy(this.pos);
    world.root.add(g);
    this.group = g;
  }

  update(dt, t) {
    this.group.position.y = this.pos.y + Math.sin(t * 2 + this.phase) * 0.09;
    this.group.rotation.y += dt * 0.9;
    this.halo.material.opacity = 0.25 + Math.sin(t * 3 + this.phase) * 0.15;
  }

  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.group.parent?.remove(this.group);
  }
}
