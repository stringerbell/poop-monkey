import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LEVEL, levelConfig, upgradeCost, derive, scolding, janitorLine,
  WEAPONS, DISGUISES, UPGRADES, SHOP_TABS, NIGHT_BASE_SECONDS, DAY_BASE_SECONDS,
} from '../js/config.js';
import { defaultSave } from '../js/save.js';
import { seeded } from './helpers.mjs';

const levels = Array.from({ length: MAX_LEVEL }, (_, i) => levelConfig(i + 1));

test('level 1 matches the designed opening', () => {
  const c = levelConfig(1);
  assert.equal(c.locks, 1);
  assert.equal(c.rungs, 3);
  assert.equal(c.decoys, 0);
  assert.equal(c.reversals, false);
  assert.equal(c.night, NIGHT_BASE_SECONDS, 'the first night is one minute');
  assert.equal(NIGHT_BASE_SECONDS, 60);
  assert.equal(c.day, DAY_BASE_SECONDS);
});

test('both phases grow with the level and stay briskly paced', () => {
  for (let i = 2; i <= MAX_LEVEL; i++) {
    assert.ok(levelConfig(i).night >= levelConfig(i - 1).night, `night shrank at level ${i}`);
    assert.ok(levelConfig(i).day >= levelConfig(i - 1).day, `day shrank at level ${i}`);
  }
  assert.ok(levelConfig(MAX_LEVEL).night > NIGHT_BASE_SECONDS * 2,
    'the last night should be meaningfully longer than the first');
  for (const c of levels) {
    assert.ok(c.day <= 150, `level ${c.level}: a ${c.day}s day drags`);
    assert.ok(c.day > c.night * 0.9, `level ${c.level}: the day should not be shorter than the night`);
  }
});

// The user asked for more taps and a quicker ramp than the original curve.
test('the lock demands more taps, sooner', () => {
  const taps = l => levelConfig(l).locks * levelConfig(l).rungs;
  assert.equal(taps(1), 3);
  assert.ok(taps(10) > taps(1), 'level 10 should need more taps than level 1');
  assert.ok(taps(25) >= 2 * taps(1));
  assert.ok(levelConfig(MAX_LEVEL).rungs >= 8);
  // and the extra wrinkles arrive early
  assert.ok(levelConfig(5).reversals, 'direction reversals by level 5');
  assert.ok(levelConfig(9).decoys > 0, 'decoy arcs by level 9');
});

test('difficulty only ever ratchets up across the 50 levels', () => {
  for (let i = 1; i < levels.length; i++) {
    const a = levels[i - 1], b = levels[i];
    assert.ok(b.locks >= a.locks, `locks dipped at level ${i + 1}`);
    assert.ok(b.rungs >= a.rungs, `rungs dipped at level ${i + 1}`);
    assert.ok(b.lockSpeed > a.lockSpeed, `lock speed dipped at level ${i + 1}`);
    assert.ok(b.lockWindow < a.lockWindow, `lock window widened at level ${i + 1}`);
    assert.ok(b.windowShrink <= a.windowShrink, `per-rung ramp eased off at level ${i + 1}`);
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
    assert.ok(c.food >= 7, `not enough food at level ${c.level}`);
    assert.ok(c.guards >= 3 && c.guards <= 14, `guard count out of range at ${c.level}`);
    assert.ok(c.taze < c.attack && c.attack < c.detect,
      `zones must nest taze < attack < detect at level ${c.level}`);
    assert.ok(c.stunTime >= 2, `stun too short at level ${c.level}`);
  }
});

test('the janitor stays gentler than a guard at every level', () => {
  for (const c of levels) {
    assert.ok(c.janitorDetect < c.detect,
      `level ${c.level}: the janitor sees as far as a guard (${c.janitorDetect} vs ${c.detect})`);
    assert.ok(c.janitorSpeed < c.guardSpeed,
      `level ${c.level}: the janitor is as fast as a guard`);
    assert.ok(c.janitorFov < c.guardFov, `level ${c.level}: the janitor has a guard's field of view`);
    assert.ok(c.janitors >= 1 && c.janitors <= 5, `janitor count out of range at ${c.level}`);
    assert.ok(c.cleanTime >= 1, `level ${c.level}: scraps vanish faster than you can reach them`);
    assert.ok(c.foodLossOnCatch > 0 && c.foodLossOnCatch < 1, 'being nabbed must cost some, not all');
  }
});

test('the crowd tightens with the levels but always needs a pack', () => {
  for (const c of levels) {
    assert.ok(c.crowdSize >= 2, `level ${c.level}: a single patron should never pin you`);
    assert.ok(c.patrons > c.crowdSize, `level ${c.level}: not enough patrons to ever form a ring`);
    assert.ok(c.patronSpeed < c.guardSpeed, `level ${c.level}: patrons should not outrun guards`);
    assert.ok(c.crowdRadius > 2, `level ${c.level}: crowd radius too tight to read`);
  }
  assert.ok(levelConfig(MAX_LEVEL).patrons > levelConfig(1).patrons, 'the zoo should get busier');
  assert.ok(levelConfig(MAX_LEVEL).crowdSize <= levelConfig(1).crowdSize, 'and easier to get ringed in');
});

test('Grease Fur is what turns a crowd from fatal to survivable', () => {
  const none = defaultSave();
  const greased = defaultSave();
  greased.upgrades.slip = UPGRADES.slip.max;
  const a = derive(none), b = derive(greased);
  assert.ok(a.grabLimit < 2, 'ungreased, a crowd should pin you within a couple of seconds');
  assert.ok(a.grabLimit > 1, 'but with enough of a beat to see the meter and try to run');
  assert.ok(a.grabSpeed < 0.25, 'ungreased, you should barely be able to shuffle');
  assert.ok(b.grabLimit > a.grabLimit * 3, 'fully greased should buy real time');
  assert.equal(b.grabSpeed, 1, 'fully greased you simply walk out of the ring');
  for (let i = 1; i <= UPGRADES.slip.max; i++) {
    const s = defaultSave();
    s.upgrades.slip = i;
    const prev = defaultSave();
    prev.upgrades.slip = i - 1;
    assert.ok(derive(s).grabLimit > derive(prev).grabLimit, `slip ${i} did not improve grabLimit`);
    assert.ok(derive(s).grabSpeed >= derive(prev).grabSpeed, `slip ${i} did not improve grabSpeed`);
  }
});

// Regression: Grease Fur shipped in UPGRADES but was missing from every shop tab,
// so the one counter to being mobbed could not actually be bought.
test('every upgrade is purchasable from exactly one shop tab', () => {
  const listed = Object.values(SHOP_TABS).flat();
  for (const key of Object.keys(UPGRADES)) {
    const seen = listed.filter(k => k === key).length;
    assert.equal(seen, 1, `${key} appears in ${seen} shop tabs, expected exactly 1`);
  }
  for (const key of listed) {
    assert.ok(UPGRADES[key], `shop lists "${key}", which is not a real upgrade`);
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
      const s = scolding(hits, 'guard', rng);
      assert.ok(s.text.length > 40, `scolding too short for ${hits} hits`);
      assert.ok(s.who.length > 0);
      seen.add(s.text);
    }
  }
  assert.ok(seen.size >= 12, 'expected a varied pool of scoldings');

  // each way the day can end gets its own distinct flavour
  const crowd = new Set();
  for (let i = 0; i < 40; i++) crowd.add(scolding(4, 'crowd', rng).text);
  const escaped = new Set();
  for (let i = 0; i < 40; i++) escaped.add(scolding(4, null, rng).text);

  for (const t of crowd) assert.ok(!seen.has(t), 'crowd lines must differ from guard lines');
  for (const t of escaped) assert.ok(!seen.has(t) && !crowd.has(t), 'escape lines must be their own pool');
  assert.ok(crowd.size >= 3 && escaped.size >= 2, 'each pool needs some variety');
});

test('the janitor gets his own short, softer lines', () => {
  const rng = seeded(11);
  const lines = new Set();
  for (let i = 0; i < 40; i++) {
    const l = janitorLine(rng);
    assert.ok(l.text.length > 10, 'janitor line too short');
    assert.ok(l.text.length < 160, 'janitor lines are toasts, not lectures — keep them short');
    assert.match(l.who, /Ron/);
    lines.add(l.text);
  }
  assert.ok(lines.size >= 4, 'expected a few janitor lines');
});
