import * as THREE from 'three';
import { WORLD } from './config.js';

// Deterministic RNG so a given level always builds the same zoo.
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });

const MATS = {
  grass:   mat(0x4f7a35),
  path:    mat(0xbCA987),
  wall:    mat(0x8d8477),
  brick:   mat(0xa8654a),
  roof:    mat(0x5b3a2e),
  bar:     mat(0x9aa3ad),
  cageFlr: mat(0x6b5c46),
  wood:    mat(0x8a6236),
  woodDk:  mat(0x63451f),
  hedge:   mat(0x3f6b2c),
  rock:    mat(0x7c7a74),
  trunk:   mat(0x5a3f26),
  leaf1:   mat(0x3e7a30),
  leaf2:   mat(0x4f8f3a),
  metal:   mat(0x5a6068),
  glass:   mat(0x7fb6c9),
  water:   mat(0x3f7ea8),
  bin:     mat(0x2f4f3a),
  sign:    mat(0xd8b44a),
};

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);

    this.colliders = [];       // {x, z, hx, hz}
    this.foodSpots = [];       // {x, y, z, far}
    this.waypoints = [];       // {x, z}
    this.lamps = [];           // {mesh, light}
    this.doorCollider = null;
    this.doorPivot = null;
    this.doorOpen = false;
    this.phase = 'day';

    this._setupLights();
  }

  // ------------------------------------------------------------ lighting
  _setupLights() {
    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4a5a35, 1.0);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.5);
    this.sun.position.set(46, 70, 28);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -80; s.right = 80; s.top = 80; s.bottom = -80;
    s.near = 1; s.far = 220;
    this.sun.shadow.bias = -0.0009;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(this.ambient);
  }

  setPhase(phase) {
    this.phase = phase;
    const day = phase === 'day';

    this.scene.background = new THREE.Color(day ? 0x87c7e8 : 0x080c18);
    this.scene.fog = new THREE.Fog(day ? 0x9fd0e6 : 0x0a1020, day ? 60 : 16, day ? 260 : 92);

    this.hemi.color.set(day ? 0xbfe3ff : 0x2a3a5c);
    this.hemi.groundColor.set(day ? 0x4a5a35 : 0x0d1220);
    this.hemi.intensity = day ? 1.0 : 0.42;

    this.sun.color.set(day ? 0xfff2d0 : 0x9fb4e8);
    this.sun.intensity = day ? 1.5 : 0.26;
    this.sun.position.set(day ? 46 : -60, day ? 70 : 90, day ? 28 : -40);
    this.sun.castShadow = day;

    this.ambient.intensity = day ? 0.18 : 0.15;

    for (const l of this.lamps) {
      if (l.light) l.light.visible = !day;
      l.bulb.material = day ? MATS.glass : this._lampOnMat();
    }
    if (this.skyDome) this.skyDome.visible = !day;
  }

  _lampOnMat() {
    if (!this._lampMat) this._lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    return this._lampMat;
  }

  // ------------------------------------------------------------ build
  build(level) {
    this.dispose();
    const rng = makeRng(level * 7919 + 13);

    this._ground();
    this._perimeter();
    this._cage();
    this._paths();
    this._buildings();
    this._enclosures(rng);
    this._scatter(rng);
    this._lampPosts();
    this._stars();
    this._waypoints();

    return this;
  }

  dispose() {
    while (this.root.children.length) {
      const c = this.root.children.pop();
      c.traverse?.(o => { if (o.geometry) o.geometry.dispose(); });
    }
    this.colliders.length = 0;
    this.foodSpots.length = 0;
    this.waypoints.length = 0;
    this.lamps.length = 0;
    this.doorCollider = null;
    this.doorPivot = null;
    this.doorOpen = false;
    this.skyDome = null;
  }

  // ------------------------------------------------------------ helpers
  box(w, h, d, material, x, y, z, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = opts.cast !== false;
    m.receiveShadow = true;
    if (opts.rotY) m.rotation.y = opts.rotY;
    this.root.add(m);
    if (opts.collide) this.addCollider(x, z, w / 2, d / 2, opts.rotY, y + h / 2);
    return m;
  }

  // `top` is how high the obstacle reaches — projectiles use it so poop can arc
  // over a bench but still splat against the cafe. Ground movement ignores it.
  addCollider(x, z, hx, hz, rotY = 0, top = 12) {
    // Rotated boxes get an axis-aligned bound; good enough at this scale.
    if (rotY) {
      const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
      this.colliders.push({ x, z, hx: hx * c + hz * s, hz: hx * s + hz * c, top });
    } else {
      this.colliders.push({ x, z, hx, hz, top });
    }
  }

  isOpen(x, z, pad = 1.4) {
    if (Math.abs(x) > WORLD.half - 2 || Math.abs(z) > WORLD.half - 2) return false;
    for (const c of this.colliders) {
      if (Math.abs(x - c.x) < c.hx + pad && Math.abs(z - c.z) < c.hz + pad) return false;
    }
    return true;
  }

  // ------------------------------------------------------------ pieces
  _ground() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2, WORLD.half * 2), MATS.grass);
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    this.root.add(g);
  }

  _perimeter() {
    const H = WORLD.wallHeight, R = WORLD.half;
    const spec = [
      [R * 2, H, 2, 0, H / 2, -R],
      [R * 2, H, 2, 0, H / 2, R],
      [2, H, R * 2, -R, H / 2, 0],
      [2, H, R * 2, R, H / 2, 0],
    ];
    for (const [w, h, d, x, y, z] of spec) this.box(w, h, d, MATS.wall, x, y, z, { collide: true });
  }

  _cage() {
    const C = WORLD.cage;
    const hx = C.w / 2, hz = C.d / 2;
    const zFront = C.z + hz, zBack = C.z - hz;
    const doorHalf = 1.7;

    // floor
    const f = new THREE.Mesh(new THREE.BoxGeometry(C.w, 0.2, C.d), MATS.cageFlr);
    f.position.set(C.x, 0.1, C.z);
    f.receiveShadow = true;
    this.root.add(f);

    // straw + a sad tyre swing, for character
    this.box(3.4, 0.12, 3.4, MATS.wood, C.x - 5, 0.22, C.z - 3.6, { cast: false });
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.28, 8, 18), MATS.metal);
    tyre.position.set(C.x + 5.5, 1.6, C.z - 4);
    tyre.rotation.x = Math.PI / 2;
    tyre.castShadow = true;
    this.root.add(tyre);
    this.box(0.1, 3.2, 0.1, MATS.metal, C.x + 5.5, 3.4, C.z - 4, { cast: false });

    // vertical bars via one instanced mesh
    const spacing = 0.95;
    const positions = [];
    const addRun = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(2, Math.round(len / spacing));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        positions.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
      }
    };
    addRun(-hx + C.x, zBack, hx + C.x, zBack);
    addRun(-hx + C.x, zBack, -hx + C.x, zFront);
    addRun(hx + C.x, zBack, hx + C.x, zFront);
    addRun(-hx + C.x, zFront, C.x - doorHalf, zFront);
    addRun(C.x + doorHalf, zFront, hx + C.x, zFront);

    const barGeo = new THREE.CylinderGeometry(0.09, 0.09, C.h, 6);
    const bars = new THREE.InstancedMesh(barGeo, MATS.bar, positions.length);
    bars.castShadow = true;
    const dummy = new THREE.Object3D();
    positions.forEach((p, i) => {
      dummy.position.set(p[0], C.h / 2, p[1]);
      dummy.updateMatrix();
      bars.setMatrixAt(i, dummy.matrix);
    });
    bars.instanceMatrix.needsUpdate = true;
    this.root.add(bars);

    // rails + roof bars
    for (const y of [0.4, C.h - 0.3]) {
      this.box(C.w + 0.4, 0.16, 0.16, MATS.bar, C.x, y, zBack, { cast: false });
      this.box(0.16, 0.16, C.d, MATS.bar, C.x - hx, y, C.z, { cast: false });
      this.box(0.16, 0.16, C.d, MATS.bar, C.x + hx, y, C.z, { cast: false });
      this.box(C.w + 0.4, 0.16, 0.16, MATS.bar, C.x, y, zFront, { cast: false });
    }
    for (let x = -hx + 1; x < hx; x += 2.2) {
      this.box(0.1, 0.1, C.d, MATS.bar, C.x + x, C.h, C.z, { cast: false });
    }

    // cage colliders (walls thin, door separate so it can be removed)
    this.addCollider(C.x, zBack, hx, 0.3, 0, C.h);
    this.addCollider(C.x - hx, C.z, 0.3, hz, 0, C.h);
    this.addCollider(C.x + hx, C.z, 0.3, hz, 0, C.h);
    const sideW = (hx - doorHalf) / 2;
    this.addCollider(C.x - doorHalf - sideW, zFront, sideW, 0.3, 0, C.h);
    this.addCollider(C.x + doorHalf + sideW, zFront, sideW, 0.3, 0, C.h);

    this.doorCollider = { x: C.x, z: zFront, hx: doorHalf, hz: 0.3, top: C.h };
    this.colliders.push(this.doorCollider);

    // swinging door + padlock
    const pivot = new THREE.Group();
    pivot.position.set(C.x - doorHalf, 0, zFront);
    this.root.add(pivot);
    const leaf = new THREE.Group();
    for (let i = 0; i <= 4; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, C.h - 0.4, 6), MATS.bar);
      b.position.set((doorHalf * 2) * (i / 4), (C.h - 0.4) / 2, 0);
      b.castShadow = true;
      leaf.add(b);
    }
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2, 0.14, 0.14), MATS.bar);
    frameTop.position.set(doorHalf, C.h - 0.5, 0);
    leaf.add(frameTop);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.28), MATS.sign);
    lock.position.set(doorHalf * 2 - 0.15, 1.35, 0.16);
    lock.castShadow = true;
    leaf.add(lock);
    pivot.add(leaf);
    this.doorPivot = pivot;
    this.lockMesh = lock;

    // "DO NOT FEED" sign
    this.box(3.2, 1.0, 0.12, MATS.sign, C.x + 6.4, 4.6, zFront - 0.2, { cast: false });
  }

  openDoor() {
    if (this.doorOpen) return;
    this.doorOpen = true;
    const i = this.colliders.indexOf(this.doorCollider);
    if (i >= 0) this.colliders.splice(i, 1);
    if (this.lockMesh) this.lockMesh.visible = false;
  }

  _paths() {
    const P = MATS.path;
    const strip = (w, d, x, z, rotY = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), P);
      m.position.set(x, 0.03, z);
      m.rotation.y = rotY;
      m.receiveShadow = true;
      this.root.add(m);
    };
    strip(6, 96, 0, 6);            // spine out of the cage
    strip(120, 6, 0, 10);          // main east-west boulevard
    strip(6, 60, -34, 26);
    strip(6, 60, 34, 26);
    strip(80, 5, 0, 48);
  }

  _buildings() {
    const B = [
      { x: -36, z: 4,   w: 18, d: 13, h: 6.5, c: MATS.brick, roof: 0x7d4a3a, label: 'GIFT SHOP' },
      { x: 34,  z: -4,  w: 20, d: 13, h: 7,   c: MATS.brick, roof: 0x6a4436, label: 'CAFE' },
      { x: -10, z: 36,  w: 11, d: 9,  h: 4.6, c: MATS.wall,  roof: 0x4a4a4a, label: 'TOILETS' },
      { x: 48,  z: 34,  w: 13, d: 11, h: 5.4, c: MATS.wood,  roof: 0x3f3a30, label: 'KEEPER HUT' },
      { x: -46, z: -24, w: 19, d: 15, h: 7.6, c: MATS.wall,  roof: 0x5a4a3a, label: 'REPTILES' },
      { x: 44,  z: -32, w: 17, d: 15, h: 9,   c: MATS.metal, roof: 0x3a4048, label: 'AVIARY' },
      { x: -24, z: 54,  w: 14, d: 11, h: 5.2, c: MATS.wall,  roof: 0x4a4a4a, label: 'STORAGE' },
      { x: 16,  z: 60,  w: 9,  d: 7,  h: 4.4, c: MATS.wood,  roof: 0x6a4436, label: 'TICKETS' },
    ];
    for (const b of B) {
      this.box(b.w, b.h, b.d, b.c, b.x, b.h / 2, b.z, { collide: true });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 1.4, 0.5, b.d + 1.4), mat(b.roof));
      roof.position.set(b.x, b.h + 0.25, b.z);
      roof.castShadow = true;
      this.root.add(roof);
      // door + windows so they read as buildings, not crates
      this.box(2.2, 3.0, 0.2, MATS.woodDk, b.x, 1.5, b.z + b.d / 2 + 0.02, { cast: false });
      for (const dx of [-b.w / 3, b.w / 3]) {
        this.box(2.4, 1.8, 0.16, MATS.glass, b.x + dx, b.h * 0.62, b.z + b.d / 2 + 0.02, { cast: false });
      }
      this.box(b.w * 0.55, 0.9, 0.16, MATS.sign, b.x, b.h + 1.1, b.z + b.d / 2, { cast: false });
    }
  }

  _enclosures(rng) {
    const spots = [
      { x: -20, z: -20, r: 9 },
      { x: 14,  z: -24, r: 8 },
      { x: -50, z: 26,  r: 9 },
      { x: 26,  z: 22,  r: 8 },
      { x: 0,   z: 66 - 12, r: 7 },
    ];
    for (const s of spots) {
      const segs = 12;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const x = s.x + Math.cos(a) * s.r;
        const z = s.z + Math.sin(a) * s.r;
        const seg = this.box(3.0, 1.15, 0.7, MATS.hedge, x, 0.58, z, { rotY: -a + Math.PI / 2 });
        this.addCollider(x, z, 1.4, 1.4, 0, 1.15);
        seg.receiveShadow = true;
      }
      // a lumpy rock and a lonely tree inside
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2 + rng() * 1.4, 0), MATS.rock);
      rock.position.set(s.x + (rng() - 0.5) * 3, 1.3, s.z + (rng() - 0.5) * 3);
      rock.castShadow = true; rock.receiveShadow = true;
      this.root.add(rock);
      this._tree(s.x - 2 + rng() * 4, s.z - 2 + rng() * 4, rng, false);
    }
  }

  _tree(x, z, rng, collide = true) {
    const h = 4 + rng() * 3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, h, 6), MATS.trunk);
    trunk.position.set(x, h / 2, z);
    trunk.castShadow = true;
    this.root.add(trunk);
    for (let i = 0; i < 3; i++) {
      const r = 2.2 + rng() * 1.5 - i * 0.35;
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), i % 2 ? MATS.leaf1 : MATS.leaf2);
      leaf.position.set(x + (rng() - 0.5) * 1.6, h + 0.4 + i * 1.1, z + (rng() - 0.5) * 1.6);
      leaf.castShadow = true;
      this.root.add(leaf);
    }
    if (collide) this.addCollider(x, z, 0.6, 0.6, 0, h);
  }

  _picnicTable(x, z, rotY) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.16, 1.5), MATS.wood);
    top.position.y = 0.95; top.castShadow = true; top.receiveShadow = true;
    g.add(top);
    for (const dz of [-1.15, 1.15]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.14, 0.6), MATS.woodDk);
      bench.position.set(0, 0.52, dz); bench.castShadow = true;
      g.add(bench);
    }
    for (const dx of [-1.2, 1.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 2.6), MATS.woodDk);
      leg.position.set(dx, 0.47, 0);
      g.add(leg);
    }
    this.root.add(g);
    this.addCollider(x, z, 1.7, 1.5, rotY, 1.05);
    return { x, y: 1.15, z };
  }

  _scatter(rng) {
    // picnic tables — the prime food surfaces
    const tableSpots = [
      [-16, 12], [-8, 16], [4, 14], [12, 18], [22, 12], [-26, 18],
      [-40, 20], [40, 14], [30, 40], [-30, 38], [8, 46], [-6, 52],
      [52, 6], [-56, 6], [20, -12], [-16, -34], [56, 46], [-52, 44],
    ];
    for (const [x, z] of tableSpots) {
      const spot = this._picnicTable(x, z, rng() * Math.PI);
      this.foodSpots.push({ ...spot, far: Math.hypot(x - WORLD.cage.x, z - WORLD.cage.z) });
    }

    // benches
    for (let i = 0; i < 14; i++) {
      const x = (rng() - 0.5) * 118, z = (rng() - 0.4) * 110;
      if (!this.isOpen(x, z, 3)) continue;
      const rotY = rng() * Math.PI;
      this.box(2.4, 0.16, 0.7, MATS.wood, x, 0.55, z, { rotY });
      this.box(2.4, 0.7, 0.14, MATS.woodDk, x, 0.9, z + 0.3, { rotY, cast: false });
      this.addCollider(x, z, 1.3, 0.7, rotY, 1.25);
      this.foodSpots.push({ x, y: 0.75, z, far: Math.hypot(x - WORLD.cage.x, z - WORLD.cage.z) });
    }

    // bins — food hides behind them
    for (let i = 0; i < 16; i++) {
      const x = (rng() - 0.5) * 122, z = (rng() - 0.4) * 118;
      if (!this.isOpen(x, z, 2.4)) continue;
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 1.2, 8), MATS.bin);
      bin.position.set(x, 0.6, z); bin.castShadow = true;
      this.root.add(bin);
      this.addCollider(x, z, 0.6, 0.6, 0, 1.2);
      this.foodSpots.push({ x: x + 1.4, y: 0.3, z: z + 0.8, far: Math.hypot(x - WORLD.cage.x, z - WORLD.cage.z) });
    }

    // trees + bushes
    for (let i = 0; i < 46; i++) {
      const x = (rng() - 0.5) * 128, z = (rng() - 0.42) * 126;
      if (!this.isOpen(x, z, 3.2)) continue;
      this._tree(x, z, rng);
    }
    for (let i = 0; i < 40; i++) {
      const x = (rng() - 0.5) * 130, z = (rng() - 0.42) * 128;
      if (!this.isOpen(x, z, 2.2)) continue;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + rng() * 0.7, 0), MATS.hedge);
      b.position.set(x, 0.7, z); b.castShadow = true; b.receiveShadow = true;
      this.root.add(b);
      this.foodSpots.push({ x: x + 1.2, y: 0.3, z, far: Math.hypot(x - WORLD.cage.x, z - WORLD.cage.z) });
    }

    // plaza fountain
    const fx = 0, fz = 10;
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 1.0, 16), MATS.rock);
    basin.position.set(fx, 0.5, fz); basin.castShadow = true; basin.receiveShadow = true;
    this.root.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.2, 16), MATS.water);
    water.position.set(fx, 1.0, fz);
    this.root.add(water);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 8), MATS.rock);
    spout.position.set(fx, 2.2, fz); spout.castShadow = true;
    this.root.add(spout);
    this.addCollider(fx, fz, 4.6, 4.6, 0, 1.05);

    // pure ground scraps, spread across the open lawn
    for (let i = 0; i < 34; i++) {
      const x = (rng() - 0.5) * 124, z = (rng() - 0.4) * 120;
      if (!this.isOpen(x, z, 1.8)) continue;
      this.foodSpots.push({ x, y: 0.28, z, far: Math.hypot(x - WORLD.cage.x, z - WORLD.cage.z) });
    }
  }

  _lampPosts() {
    const spots = [
      [-14, 10], [14, 10], [0, 34], [0, -30], [-34, 12], [34, 12],
      [-30, 42], [30, 42], [0, 58], [-52, -10], [52, -10], [-8, -14],
    ];
    spots.forEach(([x, z], i) => {
      if (!this.isOpen(x, z, 1.2)) return;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 6.4, 6), MATS.metal);
      pole.position.set(x, 3.2, z); pole.castShadow = true;
      this.root.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), MATS.glass);
      bulb.position.set(x, 6.6, z);
      this.root.add(bulb);
      this.addCollider(x, z, 0.35, 0.35, 0, 6.6);
      // Only the first few posts get a real light — every live light costs shader
      // uniforms on every material in the scene, so the rest are glowing props.
      let light = null;
      if (i < 6) {
        light = new THREE.PointLight(0xffdc9a, 22, 34, 2);
        light.position.set(x, 6.4, z);
        light.visible = false;
        this.root.add(light);
      }
      this.lamps.push({ bulb, light });
    });
  }

  _stars() {
    const N = 500;
    const pos = new Float32Array(N * 3);
    const rng = makeRng(99);
    for (let i = 0; i < N; i++) {
      const a = rng() * Math.PI * 2;
      const y = 0.15 + rng() * 0.85;
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * r * 300;
      pos[i * 3 + 1] = y * 300;
      pos[i * 3 + 2] = Math.sin(a) * r * 300;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.skyDome = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false }));
    this.skyDome.visible = false;
    this.root.add(this.skyDome);
  }

  _waypoints() {
    for (let x = -60; x <= 60; x += 11) {
      for (let z = -34; z <= 62; z += 11) {
        if (this.isOpen(x, z, 2.4)) this.waypoints.push({ x, z });
      }
    }
  }
}
