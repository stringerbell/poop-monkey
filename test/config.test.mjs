import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LEVEL, levelConfig, upgradeCost, derive, scolding,
  WEAPONS, DISGUISES, UPGRADES,
} from '../js/config.js';
import { defaultSave } from '../js/save.js';
import { seeded } from './helpers.mjs';

const levels = Array.from({ length: MAX_LEVEL }, (_, i) => levelConfig(i + 1));

test('level 1 matches the designed opening: one padlock, three rungs', () => {
  const c = levelConfig(1);
  assert.equal(c.locks, 1);
  assert.equal(c.rungs, 3);
  assert.equal(c.decoys, 0);
  assert.equal(c.reversals, false);
});

test('difficulty only ever ratchets up across the 50 levels', () => {
  for (let i = 1; i < levels.length; i++) {
    const a = levels[i - 1], b = levels[i];
    assert.ok(b.locks >= a.locks, `locks dipped at level ${i + 1}`);
    assert.ok(b.rungs >= a.rungs, `rungs dipped at level ${i + 1}`);
    assert.ok(b.lockSpeed > a.lockSpeed, `lock speed dipped at level ${i + 1}`);
    assert.ok(b.lockArc < a.lockArc, `target arc grew at level ${i + 1}`);
    assert.ok(b.guards >= a.guards, `guard count dipped at level ${i + 1}`);
    assert.ok(b.guardSpeed > a.guardSpeed, `guard speed dipped at level ${i + 1}`);
    assert.ok(b.detect > a.detect, `detection dipped at level ${i + 1}`);
    assert.ok(b.attack > a.attack, `attack zone shrank at level ${i + 1}`);
    assert.ok(b.food <= a.food, `food got more plentiful at level ${i + 1}`);
    assert.ok(b.coinValue >= a.coinValue, `coin value dipped at level ${i + 1}`);
  }
});

test('every level stays inside playable bounds', () => {
  for (const c of levels) {
    assert.ok(c.locks >= 1 && c.locks <= 5, `locks out of range at ${c.level}`);
    assert.ok(c.rungs >= 3 && c.rungs <= 8, `rungs out of range at ${c.level}`);
    // the target must stay wide enough to actually be hit by a human
    assert.ok(c.lockArc > 0.2, `lock arc unhittable (${c.lockArc}) at level ${c.level}`);
    assert.ok(c.food >= 7, `not enough food at level ${c.level}`);
    assert.ok(c.guards >= 3 && c.guards <= 14, `guard count out of range at ${c.level}`);
    assert.ok(c.taze < c.attack && c.attack < c.detect,
      `zones must nest taze < attack < detect at level ${c.level}`);
    assert.ok(c.stunTime >= 2, `stun too short at level ${c.level}`);
  }
});

test('shrinking arc over the rungs never collapses to zero', () => {
  for (const c of levels) {
    let arc = c.lockArc;
    for (let r = 1; r < c.rungs; r++) arc = Math.max(0.12, arc * c.lockShrink);
    assert.ok(arc >= 0.12, `arc collapsed at level ${c.level}`);
  }
});

test('upgrade costs rise with each level bought', () => {
  for (const key of Object.keys(UPGRADES)) {
    let prev = 0;
    for (let lvl = 0; lvl < UPGRADES[key].max; lvl++) {
      const cost = upgradeCost(key, lvl);
      assert.ok(cost > prev, `${key} cost did not rise at level ${lvl}`);
      prev = cost;
    }
  }
});

test('launchers form a strict upgrade ladder starting free', () => {
  assert.equal(WEAPONS[0].cost, 0);
  for (let i = 1; i < WEAPONS.length; i++) {
    assert.ok(WEAPONS[i].cost > WEAPONS[i - 1].cost, `weapon ${i} is not pricier`);
    assert.ok(WEAPONS[i].speed > WEAPONS[i - 1].speed, `weapon ${i} is not faster`);
    assert.ok(WEAPONS[i].gravity < WEAPONS[i - 1].gravity, `weapon ${i} does not fly flatter`);
    assert.ok(WEAPONS[i].splash >= WEAPONS[i - 1].splash, `weapon ${i} splashes less`);
  }
  assert.match(WEAPONS.at(-1).name, /R\.P\.P/);
});

test('disguises get strictly better as they get pricier', () => {
  for (let i = 1; i < DISGUISES.length; i++) {
    assert.ok(DISGUISES[i].cost > DISGUISES[i - 1].cost);
    assert.ok(DISGUISES[i].detect < DISGUISES[i - 1].detect);
    assert.ok(DISGUISES[i].attack < DISGUISES[i - 1].attack);
  }
  assert.equal(DISGUISES[0].cost, 0, 'the starting disguise must be free');
});

test('derive() turns purchases into real stat changes', () => {
  const base = derive(defaultSave());

  const fast = defaultSave();
  fast.upgrades.speed = 5;
  assert.ok(derive(fast).speed > base.speed);

  const roomy = defaultSave();
  roomy.upgrades.capacity = 5;
  assert.ok(derive(roomy).capacity > base.capacity);

  const strong = defaultSave();
  strong.upgrades.power = 5;
  const s = derive(strong);
  assert.ok(s.shotSpeed > base.shotSpeed);
  assert.ok(s.cooldown < base.cooldown);

  const sneaky = defaultSave();
  sneaky.upgrades.stealth = 5;
  sneaky.equipped = 'shadow';
  const sn = derive(sneaky);
  assert.ok(sn.detectMul < base.detectMul);
  assert.ok(sn.detectMul > 0, 'stealth must never make you fully invisible');
  assert.ok(sn.attackMul < base.attackMul);
});

// Regression: stacking the Shadow Cloak with maxed Silent Paws used to pull the
// spotted-range *inside* the attack ring, so the red circle drawn on the ground
// covered space the guard could not actually see into.
test('you are always spotted before you can be grabbed, at every stealth build', () => {
  for (let level = 1; level <= MAX_LEVEL; level++) {
    for (const dis of DISGUISES) {
      for (let stealth = 0; stealth <= UPGRADES.stealth.max; stealth++) {
        const s = defaultSave();
        s.level = level;
        s.equipped = dis.id;
        s.owned = [dis.id];
        s.upgrades.stealth = stealth;
        const d = derive(s);
        const detectR = d.cfg.detect * d.detectMul;
        const attackR = d.cfg.attack * d.attackMul;
        const tazeR = d.cfg.taze * d.attackMul;
        assert.ok(detectR > attackR,
          `level ${level} / ${dis.id} / stealth ${stealth}: detect ${detectR.toFixed(2)} <= attack ${attackR.toFixed(2)}`);
        assert.ok(attackR > tazeR,
          `level ${level} / ${dis.id} / stealth ${stealth}: attack ring is inside the taze range`);
      }
    }
  }
});

test('stealth still meaningfully shrinks the spotted-range', () => {
  const bare = defaultSave();
  const sneaky = defaultSave();
  sneaky.equipped = 'shadow';
  sneaky.owned = ['none', 'shadow'];
  sneaky.upgrades.stealth = UPGRADES.stealth.max;
  for (const level of [1, 25, 50]) {
    bare.level = sneaky.level = level;
    const b = derive(bare), s = derive(sneaky);
    assert.ok(s.detectMul < b.detectMul * 0.6,
      `a full stealth build should at least 40% the spotted-range at level ${level}`);
  }
});

test('derive() survives a save that predates a stat and an unknown disguise', () => {
  const s = defaultSave();
  delete s.upgrades.digest;
  s.equipped = 'a-costume-that-no-longer-exists';
  const d = derive(s);
  assert.ok(Number.isFinite(d.poopPerFood) && d.poopPerFood > 0);
  assert.equal(d.disguise.id, 'none');
});

test('scoldings escalate by performance and always read as a quote', () => {
  const rng = seeded(7);
  const seen = new Set();
  for (const hits of [0, 1, 2, 5, 9, 30]) {
    for (let i = 0; i < 20; i++) {
      const s = scolding(hits, true, rng);
      assert.ok(s.text.length > 40, `scolding too short for ${hits} hits`);
      assert.ok(s.who.length > 0);
      seen.add(s.text);
    }
  }
  assert.ok(seen.size >= 12, 'expected a varied pool of scoldings');

  // escaping without being caught gets its own (non-scolding) flavour
  const escaped = scolding(4, false, rng);
  assert.ok(!seen.has(escaped.text), 'escape lines must differ from capture lines');
});
