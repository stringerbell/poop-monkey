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
