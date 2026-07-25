import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs } from './helpers.mjs';
import { WORLD, PLAYER, JANITOR_REACH, MAX_LEVEL, levelConfig } from '../js/config.js';

installBrowserStubs();

// three is a test-only dependency (the game itself loads it from a CDN).
let THREE, World, makeRng;
try {
  THREE = await import('three');
  ({ World, makeRng } = await import('../js/world.js'));
} catch {
  test.skip('world tests need three installed — run `npm install`', () => {});
}
const run = THREE ? test : test.skip;

const build = level => {
  const w = new World(new THREE.Scene());
  w.build(level);
  return w;
};

/** Closest a body of radius r can actually stand to a point, by brute force. */
function closestApproach(world, x, z, r) {
  let best = Infinity;
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    for (let d = 0.2; d < 8; d += 0.1) {
      if (world.standable(x + Math.cos(a) * d, z + Math.sin(a) * d, r)) {
        best = Math.min(best, d);
        break;
      }
    }
  }
  return best;
}

run('the zoo builds with colliders, food spots and patrol waypoints', () => {
  const w = build(1);
  assert.ok(w.colliders.length > 50, 'expected a populated zoo');
  assert.ok(w.foodSpots.length > 30, 'not enough places to hide food');
  assert.ok(w.waypoints.length > 10, 'nowhere for guards to patrol');
  assert.ok(w.doorCollider, 'the cage door should start closed');
  assert.equal(w.doorOpen, false);
});

// Regression: food on a picnic table sat at the table's *centre*, but the table
// collider also covers both benches — so the player was pushed 2.0-2.8m away and
// could never pick it up. The janitor fared worse: he claimed the scrap, walked
// into the table, and stood there for the rest of the night.
run('every food spot can actually be reached by the player and the janitor', () => {
  for (const level of [1, 10, 25, 40, 50]) {
    const w = build(level);
    for (const s of w.foodSpots) {
      if (!w.reachable(s.x, s.z, PLAYER.pickupRange)) continue;   // dropped at spawn time
      const d = closestApproach(w, s.x, s.z, WORLD.playerRadius);
      assert.ok(d <= PLAYER.pickupRange,
        `level ${level}: spot (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) needs ${d.toFixed(2)}m ` +
        `of reach but the player only has ${PLAYER.pickupRange}m`);
    }
  }
});

run('table tops in particular are usable, not decorative', () => {
  const w = build(1);
  const tables = w.foodSpots.filter(s => s.y > 1.0);
  assert.ok(tables.length >= 10, 'expected picnic tables to be food spots');
  const usable = tables.filter(s => w.reachable(s.x, s.z, PLAYER.pickupRange));
  assert.equal(usable.length, tables.length,
    `${tables.length - usable.length} of ${tables.length} table spots are out of reach`);
});

run('the janitor can work anything the player can take', () => {
  // he is bulkier, so he must be given more reach or he gets stuck on scraps
  assert.ok(JANITOR_REACH > PLAYER.pickupRange, 'the janitor needs more reach than the player');
  for (const level of [1, 25, 50]) {
    const w = build(level);
    for (const s of w.foodSpots) {
      if (!w.reachable(s.x, s.z, PLAYER.pickupRange)) continue;
      const d = closestApproach(w, s.x, s.z, 0.55);
      assert.ok(d <= JANITOR_REACH,
        `level ${level}: janitor needs ${d.toFixed(2)}m of reach, has ${JANITOR_REACH}m`);
    }
  }
});

run('enough reachable food survives the filter to make a night worth playing', () => {
  for (let level = 1; level <= MAX_LEVEL; level += 7) {
    const w = build(level);
    const ok = w.foodSpots.filter(s => w.reachable(s.x, s.z, PLAYER.pickupRange));
    assert.ok(ok.length >= levelConfig(level).food,
      `level ${level}: only ${ok.length} reachable spots for ${levelConfig(level).food} scraps`);
  }
});

run('the cage door blocks movement until it is picked, then does not', () => {
  const w = build(1);
  const C = WORLD.cage;
  const doorway = { x: C.x, z: C.z + C.d / 2 };
  assert.equal(w.standable(doorway.x, doorway.z), false, 'a locked door should block the gap');

  w.openDoor();
  assert.equal(w.doorOpen, true);
  assert.equal(w.standable(doorway.x, doorway.z), true, 'an open door should let you through');

  w.closeDoor();
  assert.equal(w.doorOpen, false);
  assert.equal(w.standable(doorway.x, doorway.z), false, 'the janitor re-locks it behind you');
});

// Regression: enclosures were a ring of twelve overlapping box colliders. You
// could squeeze between two of them, and once inside, adjacent boxes shoved you
// back and forth forever. They are one solid disc now.
run('you cannot get inside a hedge enclosure', () => {
  const w = build(1);
  const rings = w.colliders.filter(c => c.circle);
  assert.ok(rings.length >= 4, 'expected the enclosures to collide as circles');
  for (const ring of rings) {
    assert.equal(w.standable(ring.x, ring.z), false, 'the middle of an enclosure must be solid');
    // and no radial approach may pass straight through the hedge
    for (let deg = 0; deg < 360; deg += 3) {
      const a = deg * Math.PI / 180;
      let crossed = true;
      for (let d = ring.r + 2; d > ring.r - 2; d -= 0.2) {
        if (!w.standable(ring.x + Math.cos(a) * d, ring.z + Math.sin(a) * d)) { crossed = false; break; }
      }
      assert.equal(crossed, false, `a gap at ${deg}deg lets you walk into the enclosure`);
    }
  }
});

run('a body that starts clear can never end up embedded in geometry', () => {
  const w = build(1);
  const r = WORLD.playerRadius;
  const rings = w.colliders.filter(c => c.circle);

  // walk hard into every enclosure from all around it
  let checked = 0;
  for (const ring of rings) {
    for (let deg = 0; deg < 360; deg += 7) {
      const a = deg * Math.PI / 180;
      const pos = { x: ring.x + Math.cos(a) * (ring.r + 5), z: ring.z + Math.sin(a) * (ring.r + 5) };
      if (!w.standable(pos.x, pos.z, r)) continue;
      let safe = { x: pos.x, z: pos.z };
      checked++;
      for (let f = 0; f < 80; f++) {
        pos.x -= Math.cos(a) * 0.12;
        pos.z -= Math.sin(a) * 0.12;
        if (w.resolveCircle(pos, r)) safe = { x: pos.x, z: pos.z };
        else { pos.x = safe.x; pos.z = safe.z; }
      }
      assert.ok(w.standable(pos.x, pos.z, r),
        `walked into the enclosure at ${deg}deg and ended inside geometry`);
    }
  }
  assert.ok(checked > 100, 'expected to have actually run the sweep');
});

run('resolveCircle pushes a body clear of a solid disc from any angle', () => {
  const w = build(1);
  const ring = w.colliders.find(c => c.circle);
  const r = WORLD.playerRadius;
  for (let deg = 0; deg < 360; deg += 11) {
    for (const frac of [0, 0.01, 0.4, 0.9, 1.05]) {
      const a = deg * Math.PI / 180;
      const pos = { x: ring.x + Math.cos(a) * ring.r * frac, z: ring.z + Math.sin(a) * ring.r * frac };
      w.resolveCircle(pos, r);
      const d = Math.hypot(pos.x - ring.x, pos.z - ring.z);
      assert.ok(d >= ring.r + r - 1e-6,
        `left at ${d.toFixed(3)} from a disc of radius ${ring.r} (needs ${(ring.r + r).toFixed(3)})`);
    }
  }
});

run('nowhere walkable leaves you unable to move in any direction', () => {
  const w = build(1);
  const r = WORLD.playerRadius;
  const stuck = [];
  for (let x = -64; x <= 64; x += 4) {
    for (let z = -64; z <= 64; z += 4) {
      if (!w.standable(x, z, r)) continue;
      let moved = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const pos = { x, z };
        let safe = { x, z };
        for (let f = 0; f < 20; f++) {
          pos.x += Math.cos(a) * 0.12;
          pos.z += Math.sin(a) * 0.12;
          if (w.resolveCircle(pos, r)) safe = { x: pos.x, z: pos.z };
          else { pos.x = safe.x; pos.z = safe.z; }
        }
        if (Math.hypot(pos.x - x, pos.z - z) > 0.6) moved++;
      }
      if (moved === 0) stuck.push([x, z]);
    }
  }
  assert.deepEqual(stuck, [], `immobile spots found: ${JSON.stringify(stuck.slice(0, 5))}`);
});

run('guards get somewhere open to patrol, clear of the cage', () => {
  const w = build(1);
  for (const p of w.waypoints) {
    assert.ok(w.standable(p.x, p.z, 0.55), `waypoint (${p.x}, ${p.z}) is inside geometry`);
  }
});

run('the same level always builds the same zoo', () => {
  const a = build(7), b = build(7), c = build(8);
  assert.equal(a.colliders.length, b.colliders.length);
  assert.deepEqual(a.foodSpots.map(s => [s.x, s.z]), b.foodSpots.map(s => [s.x, s.z]));
  assert.notDeepEqual(a.foodSpots.map(s => [s.x, s.z]), c.foodSpots.map(s => [s.x, s.z]));
});

run('makeRng is deterministic and stays in range', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 500; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});
