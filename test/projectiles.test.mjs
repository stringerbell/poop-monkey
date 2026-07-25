import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs } from './helpers.mjs';
import { derive, WEAPONS } from '../js/config.js';
import { defaultSave } from '../js/save.js';

installBrowserStubs();

// three is a test-only dependency (the game itself loads it from a CDN).
let THREE, ProjectileSystem, HIT_R;
try {
  THREE = await import('three');
  ({ ProjectileSystem, HIT_R } = await import('../js/projectiles.js'));
} catch {
  test.skip('projectile tests need three installed — run `npm install`', () => {});
}

const run = THREE ? test : test.skip;

function stubWorld(colliders = []) {
  return { root: new THREE.Group(), colliders };
}
const guardAt = (x, z) => ({ pos: new THREE.Vector3(x, 0, z), stun: 0, splat() { this.stun = 5; } });

/** Fire one shot down -Z and simulate until it resolves. Returns what it hit. */
function simulate({ weaponIndex = 0, upgrades = {}, guards = [], colliders = [], from = [0, 1.44, 0], dt = 1 / 60, pitch = 0.1 }) {
  const world = stubWorld(colliders);
  const sys = new ProjectileSystem(world);

  const save = defaultSave();
  save.weapon = weaponIndex;
  Object.assign(save.upgrades, upgrades);
  const stats = derive(save);

  const dir = new THREE.Vector3(0, Math.sin(pitch), -Math.cos(pitch)).normalize();
  sys.fire(new THREE.Vector3(...from), dir, {
    speed: stats.shotSpeed, gravity: stats.shotGravity, splash: stats.splash, size: stats.weapon.size,
  });

  let result = null;
  const path = [];
  for (let i = 0; i < 3000 && !result; i++) {
    if (sys.shots[0]) path.push(sys.shots[0].pos.clone());
    sys.update(dt, guards, (hits, shot, direct) => {
      result = { hits, at: shot.pos.clone(), direct, life: shot.life };
    });
  }
  return { result, path, stats };
}

/** The steepest-to-shallowest launch angle that connects, simulated near-continuously. */
function findHittingPitch(weaponIndex, range, upgrades = {}) {
  for (let p = -0.25; p <= 0.75; p += 0.02) {
    const g = guardAt(0, -range);
    const r = simulate({ weaponIndex, upgrades, guards: [g], dt: 1 / 240, pitch: p });
    if (r.result?.hits.includes(g)) return p;
  }
  return null;
}

run('a lobbed shot from the bare arm hits a guard standing in front of you', () => {
  const g = guardAt(0, -9);
  const { result } = simulate({ guards: [g] });
  assert.ok(result, 'the shot never resolved');
  assert.equal(result.direct, true, 'expected a direct hit');
  assert.deepEqual(result.hits, [g]);
});

// Regression: the R.P.P. covers ~1.7m per 60fps frame — twice a guard's hit radius —
// so a naive per-frame position check flew straight through people at normal frame
// rates while still connecting in slow motion.
run('hit detection is frame-rate independent — nothing tunnels through a guard', () => {
  for (let w = 0; w < WEAPONS.length; w++) {
    for (const range of [6, 10, 14, 18]) {
      const pitch = findHittingPitch(w, range, { power: 5 });
      assert.ok(pitch !== null, `${WEAPONS[w].name} cannot reach ${range}m at any angle`);
      for (const dt of [1 / 60, 1 / 30, 0.05]) {
        const g = guardAt(0, -range);
        const { result } = simulate({ weaponIndex: w, upgrades: { power: 5 }, guards: [g], dt, pitch });
        assert.ok(result, `${WEAPONS[w].name} @ ${range}m, dt=${dt}: shot never resolved`);
        assert.ok(result.hits.includes(g),
          `${WEAPONS[w].name} @ ${range}m: connects at 240fps but tunnels past at dt=${dt} (stopped at z=${result.at.z.toFixed(1)})`);
      }
    }
  }
});

run('a shot cannot tunnel through a thin wall either', () => {
  // 0.6m deep — thinner than one frame of R.P.P. travel
  const wall = { x: 0, z: -10, hx: 8, hz: 0.3, top: 9 };
  const g = guardAt(0, -30);   // parked well beyond the blast radius
  const { result } = simulate({ weaponIndex: 4, upgrades: { power: 5 }, guards: [g], colliders: [wall], pitch: 0.03 });
  assert.ok(result);
  assert.deepEqual(result.hits, [], 'the wall should have stopped it');
  assert.ok(result.at.z > -11 && result.at.z < -9, `expected impact at the wall, got z=${result.at.z.toFixed(2)}`);
});

run('poop arcs over low props but splats against tall ones', () => {
  const bench = { x: 0, z: -6, hx: 1.3, hz: 0.7, top: 1.25 };
  const cafe = { x: 0, z: -6, hx: 8, hz: 6, top: 7 };
  const g = guardAt(0, -14);

  const over = simulate({ weaponIndex: 0, guards: [g], colliders: [bench], pitch: findHittingPitch(0, 14) });
  assert.ok(over.result.hits.includes(g), 'a lobbed shot should clear a 1.25m bench');

  const into = simulate({ weaponIndex: 0, guards: [g], colliders: [cafe], pitch: findHittingPitch(0, 14) });
  assert.deepEqual(into.result.hits, [], 'the same shot should splat against a building');
});

run('the R.P.P. drops far less over distance than a bare arm', () => {
  // fired dead level, how far has each round fallen by the time it has gone 12m?
  const dropAt12m = i => {
    const { path } = simulate({ weaponIndex: i, guards: [], from: [0, 1.44, 0], pitch: 0 });
    const p = path.find(pt => pt.z <= -12);
    return p ? 1.44 - p.y : null;   // null = never got that far
  };
  const arm = dropAt12m(0);
  const rpp = dropAt12m(WEAPONS.length - 1);
  assert.ok(arm !== null && rpp !== null, 'both should reach 12m when fired level');
  assert.ok(rpp < arm * 0.35, `the R.P.P. should shoot much flatter (dropped ${rpp.toFixed(2)}m vs the arm's ${arm.toFixed(2)}m)`);
});

run('the lob assist scales with the weapon, so the bare arm can still reach', () => {
  // The assist is keyed to gravity: without it, a heavy slow round fired level
  // face-plants at your feet and short range becomes unplayable.
  const { result } = simulate({ weaponIndex: 0, guards: [guardAt(0, -8)], pitch: 0 });
  assert.equal(result.hits.length, 1, 'a level shot from the bare arm should still reach 8m');
});

// The whole point of the launcher ladder: better gear lets you hit from further
// out, which is what keeps you clear of the guards' attack zones.
run('each launcher connects from further away than the last, with no close-range dead zone', () => {
  const bands = WEAPONS.map((_, w) => {
    const ranges = [];
    for (let range = 3; range <= 40; range++) {
      const g = guardAt(0, -range);
      const { result } = simulate({ weaponIndex: w, guards: [g], pitch: 0 });
      if (result?.hits.includes(g)) ranges.push(range);
    }
    return ranges;
  });

  bands.forEach((ranges, w) => {
    assert.ok(ranges.length, `${WEAPONS[w].name} cannot hit anything when aimed level`);
    assert.equal(ranges[0], 3, `${WEAPONS[w].name} has a close-range dead zone (starts at ${ranges[0]}m)`);
    // no gaps: the band must be contiguous, or aiming becomes guesswork
    assert.equal(ranges.at(-1) - ranges[0] + 1, ranges.length,
      `${WEAPONS[w].name} has holes in its effective range: ${ranges.join(',')}`);
  });

  for (let w = 1; w < bands.length; w++) {
    assert.ok(bands[w].at(-1) >= bands[w - 1].at(-1),
      `${WEAPONS[w].name} reaches ${bands[w].at(-1)}m, less than ${WEAPONS[w - 1].name}'s ${bands[w - 1].at(-1)}m`);
  }
  assert.ok(bands.at(-1).at(-1) > bands[0].at(-1) * 2,
    'the R.P.P. should at least double the bare arm’s reach');
});

run('splash weapons catch the crowd, single-shot weapons do not', () => {
  const near = guardAt(0, -9);
  const bystander = guardAt(2.2, -9);

  const arm = simulate({ weaponIndex: 0, guards: [near, bystander] });
  assert.deepEqual(arm.result.hits, [near], 'the bare arm has no splash');

  const rpp = simulate({ weaponIndex: 4, guards: [near, bystander], pitch: 0.03 });
  assert.ok(rpp.result.hits.includes(near) && rpp.result.hits.includes(bystander),
    'the R.P.P. should catch both');
});

run('a stunned guard is not hit again while they are wiping themselves down', () => {
  const g = guardAt(0, -9);
  g.stun = 3;
  const { result } = simulate({ guards: [g] });
  assert.deepEqual(result.hits, [], 'already-splatted guards are not valid targets');
});

run('a shot that hits nothing lands on the ground rather than flying forever', () => {
  const { result } = simulate({ guards: [] });
  assert.ok(result, 'the shot never resolved');
  assert.deepEqual(result.hits, []);
  assert.ok(result.at.y <= 0.13, `expected a ground splat, ended at y=${result.at.y.toFixed(2)}`);
  assert.ok(result.life < 6, 'it should land well before the lifetime cutoff');
});

run('spent shots and their debris are cleaned up, not leaked', () => {
  const world = stubWorld();
  const sys = new ProjectileSystem(world);
  const save = defaultSave();
  const stats = derive(save);
  for (let i = 0; i < 5; i++) {
    sys.fire(new THREE.Vector3(0, 1.44, 0), new THREE.Vector3(0, 0.1, -1).normalize(), {
      speed: stats.shotSpeed, gravity: stats.shotGravity, splash: 0, size: 0.22,
    });
  }
  assert.equal(sys.shots.length, 5);
  for (let i = 0; i < 400; i++) sys.update(1 / 60, [], () => {});
  assert.equal(sys.shots.length, 0, 'every shot should have resolved');
  assert.equal(sys.debris.length, 0, 'debris should expire');
  assert.ok(sys.decals.length <= 60, 'decals are capped so geometry cannot leak');
  sys.clear();
  assert.equal(world.root.children.length, 0, 'clear() empties the scene graph');
});
