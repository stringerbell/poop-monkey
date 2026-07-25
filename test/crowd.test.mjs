import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs } from './helpers.mjs';
import { levelConfig } from '../js/config.js';

installBrowserStubs();

let THREE, crowdPressure;
try {
  THREE = await import('three');
  ({ crowdPressure } = await import('../js/crowd.js'));
} catch {
  test.skip('crowd tests need three installed — run `npm install`', () => {});
}
const run = THREE ? test : test.skip;

const cfg = levelConfig(1);
const at = (x, z, state = 'mob', silenced = false) => ({ pos: { x, z }, state, silenced });
const player = { pos: { x: 0, z: 0 } };

run('it takes a pack inside arm’s reach to pin you', () => {
  const near = d => at(d, 0);
  assert.equal(crowdPressure([near(1)], player, cfg).pinned, false, 'one patron is not a crowd');
  assert.equal(crowdPressure(Array.from({ length: cfg.crowdSize - 1 }, () => near(1)), player, cfg).pinned,
    false, 'one short of the threshold must not pin');

  const full = Array.from({ length: cfg.crowdSize }, () => near(1));
  const r = crowdPressure(full, player, cfg);
  assert.equal(r.pinned, true);
  assert.equal(r.count, cfg.crowdSize);
});

run('patrons outside the ring radius do not count', () => {
  const far = Array.from({ length: 8 }, () => at(cfg.crowdRadius + 0.5, 0));
  assert.equal(crowdPressure(far, player, cfg).count, 0);
});

run('a calm patron standing next to you is just a member of the public', () => {
  const strollers = Array.from({ length: 8 }, () => at(1, 0, 'stroll'));
  assert.equal(crowdPressure(strollers, player, cfg).pinned, false);
});

// Hitting a guest with poop scores nothing; its whole value is that they stop
// tattling and stop being part of the mob holding you.
run('a silenced patron neither counts towards the crowd nor blocks you', () => {
  const mob = Array.from({ length: cfg.crowdSize }, () => at(1, 0, 'mob'));
  assert.equal(crowdPressure(mob, player, cfg).pinned, true);

  mob[0].silenced = true;
  const after = crowdPressure(mob, player, cfg);
  assert.equal(after.count, cfg.crowdSize - 1, 'the splattered one should drop out of the count');
  assert.equal(after.pinned, false, 'silencing one of a minimum ring should break the hold');
});

run('every level needs at least two people to pin you', () => {
  for (let l = 1; l <= 50; l++) {
    const c = levelConfig(l);
    const solo = crowdPressure([at(0.5, 0)], player, c);
    assert.equal(solo.pinned, false, `level ${l}: a lone patron pinned the player`);
  }
});
