import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs, fakeCanvas, seeded } from './helpers.mjs';

installBrowserStubs();
const { LockPuzzle, norm, inArc } = await import('../js/lock.js');

const TAU = Math.PI * 2;
const CFG = { locks: 1, rungs: 3, speed: 2, ramp: 1.5, arc: 0.5, shrink: 0.5, reversals: false, decoys: 0 };

function makePuzzle(over = {}) {
  const p = new LockPuzzle(fakeCanvas());
  p.start({ ...CFG, ...over });
  return p;
}

/** Park the sweeping bar in the middle of the current target and press. */
function hit(p) {
  p.angle = norm(p.target.start + p.target.w / 2);
  p.press();
}

/** Park the bar well outside every arc and press. */
function miss(p) {
  p.angle = norm(p.target.start - 1.0);
  p.press();
}

test('inArc handles arcs that wrap past zero', () => {
  assert.equal(inArc(0.1, 6.0, 0.5), true, 'just past the wrap point is inside');
  assert.equal(inArc(6.1, 6.0, 0.5), true);
  assert.equal(inArc(5.9, 6.0, 0.5), false, 'just before the arc is outside');
  assert.equal(inArc(0.6, 6.0, 0.5), false, 'past the far edge is outside');
  assert.equal(norm(-0.2).toFixed(4), (TAU - 0.2).toFixed(4));
});

test('a well-timed press climbs a rung and speeds the lock up', () => {
  const p = makePuzzle();
  const rungs = [];
  p.onRung = done => rungs.push(done);

  hit(p);
  assert.equal(p.rung, 1);
  assert.deepEqual(rungs, [1]);
  assert.equal(p.speed, CFG.speed * CFG.ramp, 'the bar must accelerate each rung');
  assert.equal(p.arc, CFG.arc * CFG.shrink, 'the target must shrink each rung');
  assert.equal(p.hits.length, 1, 'the successful angle is marked on the ring');
});

test('a mistimed press resets the whole lock back to the start', () => {
  const p = makePuzzle();
  let failedAt = null;
  p.onFail = reached => { failedAt = reached; };

  hit(p);
  hit(p);
  assert.equal(p.rung, 2);

  miss(p);
  assert.equal(failedAt, 2, 'onFail reports how far you got');
  assert.equal(p.rung, 0);
  assert.equal(p.speed, CFG.speed, 'speed must return to the level baseline');
  assert.equal(p.arc, CFG.arc, 'the target must return to full width');
  assert.deepEqual(p.hits, [], 'previous marks are wiped');
  assert.ok(p.failTimer > 0, 'a short lockout plays the CLUNK before resuming');
});

test('presses are ignored during the post-failure lockout', () => {
  const p = makePuzzle();
  miss(p);
  const before = p.rung;
  hit(p);
  assert.equal(p.rung, before, 'you cannot bank a rung while the lock is re-seating');

  p.update(1.0);            // wait out the lockout
  assert.ok(p.failTimer <= 0);
  hit(p);
  assert.equal(p.rung, 1);
});

test('clearing every rung of every padlock completes the puzzle exactly once', () => {
  const p = makePuzzle({ locks: 3, rungs: 2 });
  let done = 0;
  const lockEvents = [];
  p.onComplete = () => done++;
  p.onLockDone = (idx, total) => lockEvents.push([idx, total]);

  for (let i = 0; i < 3 * 2; i++) {
    assert.equal(p.active, true, `puzzle ended early at press ${i}`);
    hit(p);
  }
  assert.equal(done, 1);
  assert.equal(p.active, false, 'the puzzle closes itself once the last lock pops');
  assert.deepEqual(lockEvents, [[1, 3], [2, 3]], 'intermediate padlocks announce progress');

  // pressing after completion must not re-fire onComplete
  p.press();
  assert.equal(done, 1);
});

test('each successive padlock on the same door starts harder', () => {
  const p = makePuzzle({ locks: 2, rungs: 1 });
  hit(p);
  assert.equal(p.lockIndex, 1);
  assert.ok(p.speed > CFG.speed, 'padlock 2 sweeps faster than padlock 1');
  assert.ok(p.arc < CFG.arc, 'padlock 2 has a tighter target');
  assert.equal(p.rung, 0, 'rung progress restarts for the new padlock');
});

test('pressing on a decoy fails even though the bar is not on the target', () => {
  const rng = seeded(3);
  const orig = Math.random;
  Math.random = rng;
  try {
    const p = makePuzzle({ decoys: 2 });
    assert.equal(p.decoys.length, 2);
    for (const d of p.decoys) {
      assert.equal(inArc(d.start, p.target.start, p.target.w), false,
        'a decoy must never overlap the real target');
    }
    let failed = false;
    p.onFail = () => { failed = true; };
    p.angle = norm(p.decoys[0].start + p.decoys[0].w / 2);
    p.press();
    assert.equal(failed, true);
    assert.equal(p.rung, 0);
  } finally {
    Math.random = orig;
  }
});

test('a reversed sweep still places the target ahead of the bar', () => {
  const orig = Math.random;
  Math.random = () => 0.5;                     // gap = 0.85 + 0.5 * 1.7 = 1.7
  try {
    const p = makePuzzle();
    p.dir = -1;
    p.angle = 3.0;
    p._placeTarget(false);
    // travelling backwards, the bar reaches the far edge of the arc first
    const gap = norm(p.angle - (p.target.start + p.target.w));
    assert.ok(Math.abs(gap - 1.7) < 1e-6, `expected a 1.7rad run-up, got ${gap}`);
    assert.equal(inArc(p.angle, p.target.start, p.target.w), false,
      'the target must never spawn under the bar');
  } finally {
    Math.random = orig;
  }
});

test('the bar sweeps at the configured speed and wraps around the ring', () => {
  const p = makePuzzle({ speed: 2 });
  p.update(1.0);
  assert.ok(Math.abs(p.angle - 2) < 1e-9);
  p.update(3.0);                                // 8 rad total > TAU
  assert.ok(p.angle >= 0 && p.angle < TAU, 'angle stays normalised after wrapping');
  assert.ok(Math.abs(p.angle - norm(8)) < 1e-9);
});

test('stop() freezes the puzzle so a background update cannot advance it', () => {
  const p = makePuzzle();
  p.stop();
  const a = p.angle;
  p.update(1.0);
  assert.equal(p.angle, a);
  hit(p);
  assert.equal(p.rung, 0);
});
