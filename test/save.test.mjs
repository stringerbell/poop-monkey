import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs } from './helpers.mjs';

installBrowserStubs();
const { defaultSave, load, save, wipe } = await import('../js/save.js');

test.beforeEach(() => wipe());

test('a fresh save starts the campaign at level 1 with nothing bought', () => {
  const s = defaultSave();
  assert.equal(s.level, 1);
  assert.equal(s.coins, 0);
  assert.equal(s.weapon, 0);
  assert.equal(s.equipped, 'none');
  assert.deepEqual(s.owned, ['none']);
  assert.equal(Object.values(s.upgrades).every(v => v === 0), true);
});

test('load() returns null before anything has been saved', () => {
  assert.equal(load(), null);
});

test('progress round-trips through localStorage', () => {
  const s = defaultSave();
  s.level = 17; s.coins = 4200; s.weapon = 3;
  s.equipped = 'penguin'; s.owned = ['none', 'penguin'];
  s.upgrades.stealth = 4;
  save(s);
  assert.deepEqual(load(), s);
});

// Regression: saves written before a field existed must not come back undefined
// and blow up derive() / the shop on the next release.
test('an older save is merged over current defaults', () => {
  localStorage.setItem('poop-monkey-save-v1', JSON.stringify({
    level: 9, coins: 300, upgrades: { speed: 2 },
  }));
  const s = load();
  assert.equal(s.level, 9);
  assert.equal(s.coins, 300);
  assert.equal(s.upgrades.speed, 2);
  assert.equal(s.upgrades.digest, 0, 'missing upgrade keys must default to 0');
  assert.equal(s.weapon, 0);
  assert.deepEqual(s.owned, ['none'], 'an empty owned list must fall back to the free disguise');
  assert.equal(s.equipped, 'none');
  assert.equal(s.completed, false);
});

test('corrupt save data is discarded instead of crashing the game', () => {
  localStorage.setItem('poop-monkey-save-v1', '{not json at all');
  assert.equal(load(), null);
});

test('wipe() clears the slot', () => {
  save(defaultSave());
  wipe();
  assert.equal(load(), null);
});
