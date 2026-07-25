import * as THREE from 'three';
import {
  MAX_LEVEL, DAY_SECONDS, NIGHT_SECONDS, WORLD, PLAYER,
  WEAPONS, DISGUISES, UPGRADES, upgradeCost, derive, scolding,
} from './config.js';
import * as Save from './save.js';
import { sfx, unlock as unlockAudio } from './audio.js';
import { World, makeRng } from './world.js';
import { Player } from './player.js';
import { LockPuzzle } from './lock.js';
import { Guard, Coin } from './guards.js';
import { ProjectileSystem, FoodItem } from './projectiles.js';
import { UI } from './ui.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = id => document.getElementById(id);
const article = name => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`);

class Game {
  constructor() {
    this.canvas = $('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(76, 1, 0.1, 420);

    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.canvas);
    this.projectiles = new ProjectileSystem(this.world);
    this.ui = new UI();
    this.lock = new LockPuzzle($('lock-canvas'));

    this.state = 'menu';
    this.save = Save.load() || Save.defaultSave();
    this.stats = derive(this.save);

    this.guards = [];
    this.coins = [];
    this.food = [];
    this.timer = 0;
    this.cooldown = 0;
    this.eaten = 0;
    this.ammo = 0;
    this.hits = 0;
    this.nightCoins = 0;
    this.doorUnlocked = false;
    this.clock = new THREE.Clock();
    this.time = 0;

    this._bindEvents();
    this._resize();
    this._showMenu();

    this.renderer.setAnimationLoop(() => this._tick());
    $('loading').classList.remove('show');
  }

  // ================================================================ setup
  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _bindEvents() {
    window.addEventListener('resize', () => this._resize());

    $('btn-play').addEventListener('click', () => {
      unlockAudio();
      this.save = Save.defaultSave();
      Save.save(this.save);
      this._startLevel(1);
    });
    $('btn-continue').addEventListener('click', () => {
      unlockAudio();
      this._startLevel(this.save.level);
    });
    $('btn-reset').addEventListener('click', () => {
      Save.wipe();
      this.save = Save.defaultSave();
      this._showMenu();
    });
    $('win-again').addEventListener('click', () => {
      this.save.level = 1;
      this.save.completed = true;
      Save.save(this.save);
      this.ui.hide('win');
      this._startLevel(1);
    });
    $('sum-next').addEventListener('click', () => {
      this.ui.hide('summary');
      if (this.save.level > MAX_LEVEL) this._win();
      else this._startLevel(this.save.level);
    });

    // ---- shop
    this.ui.bindShop(() => this.save, {
      buyUpgrade: key => {
        const lvl = this.save.upgrades[key] || 0;
        const cost = upgradeCost(key, lvl);
        if (lvl >= UPGRADES[key].max || this.save.coins < cost) return sfx.deny();
        this.save.coins -= cost;
        this.save.upgrades[key] = lvl + 1;
        this._afterPurchase(`${UPGRADES[key].name} → ${lvl + 1}`);
      },
      buyWeapon: i => {
        const w = WEAPONS[i];
        if (i !== this.save.weapon + 1 || this.save.coins < w.cost) return sfx.deny();
        this.save.coins -= w.cost;
        this.save.weapon = i;
        this._afterPurchase(`${w.name} equipped!`);
      },
      buyDisguise: id => {
        const d = DISGUISES.find(x => x.id === id);
        if (!d || this.save.owned.includes(id) || this.save.coins < d.cost) return sfx.deny();
        this.save.coins -= d.cost;
        this.save.owned.push(id);
        this.save.equipped = id;
        this._afterPurchase(`${d.name} on.`);
      },
      equip: id => {
        if (!this.save.owned.includes(id)) return sfx.deny();
        this.save.equipped = id;
        this._afterPurchase(`${DISGUISES.find(x => x.id === id).name} on.`);
      },
    });

    $('shop-btn').addEventListener('click', () => this._openShop());
    $('shop-close').addEventListener('click', () => this._closeShop());
    $('lock-close').addEventListener('click', () => this._closeLock());

    // ---- lock puzzle input
    const press = e => {
      if (!this.ui.isOpen('lock')) return;
      e.preventDefault();
      this.lock.press();
    };
    $('lock-canvas').addEventListener('mousedown', press);
    $('lock-canvas').addEventListener('touchstart', press, { passive: false });

    this.lock.onRung = done => {
      this.ui.lockPips(done);
      this.ui.lockStatus(`Rung ${done} — it is speeding up.`);
    };
    this.lock.onFail = () => {
      this.ui.lockPips(0);
      this.ui.lockStatus('CLUNK. The whole lock resets. Try again.', 'fail');
    };
    this.lock.onLockDone = (idx, total) => {
      this.ui.lockHeader(idx, total, this.stats.cfg.rungs);
      this.ui.lockPips(0);
      this.ui.lockStatus(`Padlock ${idx} popped! ${total - idx} to go — and this one is stiffer.`, 'win');
    };
    this.lock.onComplete = () => this._lockOpened();

    // ---- global keys
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && this.ui.isOpen('lock')) { e.preventDefault(); this.lock.press(); return; }
      if (e.code === 'Escape') {
        if (this.ui.isOpen('lock')) this._closeLock();
        else if (this.ui.isOpen('shop')) this._closeShop();
        return;
      }
      if (e.code === 'KeyB' && (this.state === 'day' || this.state === 'night')) {
        if (this.ui.isOpen('shop')) this._closeShop();
        else if (this.state === 'day') this._openShop();
        else this.ui.toast('The gift shop is shut. It is the middle of the night.', 'bad');
        return;
      }
      if (e.code === 'KeyE') this._interact();
    });

    // ---- mouse
    this.canvas.addEventListener('mousedown', e => {
      unlockAudio();
      if (this.state === 'menu' || this.ui.anyOpen()) return;
      if (!this.player.locked) { this.player.requestLock(); return; }
      if (e.button === 0) this._throw();
    });

    this.player.onLockChange = locked => {
      if (!locked && (this.state === 'day' || this.state === 'night') && !this.ui.anyOpen()) {
        this.ui.prompt('CLICK TO RESUME');
      }
    };
  }

  _afterPurchase(msg) {
    sfx.buy();
    this.stats = derive(this.save);
    Save.save(this.save);
    this.ui.setCoins(this.save.coins);
    this.ui.setWeapon(this.stats.weapon.name.toUpperCase());
    this.ui.toast(msg, 'good');
  }

  // ================================================================ flow
  _showMenu() {
    this.state = 'menu';
    this.ui.hideAll();
    this.ui.showHud(false);
    this.ui.show('menu');
    this.ui.fade(false, true);
    this.ui.fadeCaption('');
    this.player.releaseLock();

    const has = this.save.level > 1 || this.save.coins > 0 || this.save.weapon > 0;
    $('btn-continue').classList.toggle('hidden', !has);
    $('btn-reset').classList.toggle('hidden', !has);
    $('continue-level').textContent = this.save.level;
    $('btn-play').textContent = has ? 'NEW GAME' : 'START';

    // idle backdrop so the menu isn't sitting on a black void
    if (!this.world.root.children.length) {
      this.world.build(1);
      this.world.setPhase('day');
      this.camera.position.set(0, 3.2, 20);
      this.camera.lookAt(0, 3, -40);
    }
  }

  _startLevel(level) {
    this.save.level = Math.min(MAX_LEVEL, level);
    this.stats = derive(this.save);
    Save.save(this.save);

    this.ui.hideAll();
    this.ui.showHud(true);
    this.world.build(this.save.level);
    this._clearActors();

    this.hits = 0;
    this.nightCoins = 0;
    this.eaten = 0;
    this.ammo = 0;
    this.doorUnlocked = false;

    this._startDay();
  }

  _startDay() {
    const C = WORLD.cage;
    this.state = 'day';
    this.timer = DAY_SECONDS;
    this.world.setPhase('day');
    this.player.teleport(C.x, C.z - 3, Math.PI); // facing the door end of the cage
    this.player.enabled = true;
    this._spawnFood();

    this.ui.setLevel(this.save.level);
    this.ui.setPhase('day');
    this.ui.setCoins(this.save.coins);
    this.ui.setHits(this.hits);
    this.ui.setWeapon(this.stats.weapon.name.toUpperCase());
    this.ui.setAmmo(0, this.food.length, '🍔');
    this.ui.fade(false);
    this.ui.fadeCaption('');
    this.ui.vignette(false);
    this.ui.prompt('CLICK TO CAPTURE YOUR MOUSE');
    sfx.dawn();

    const cfg = this.stats.cfg;
    this.ui.toast(`Level ${this.save.level} — ${cfg.locks} padlock${cfg.locks > 1 ? 's' : ''}, ${cfg.rungs} rungs each.`);
    setTimeout(() => this.ui.toast('Find the cage door. Press E at the lock.'), 1400);
  }

  /** Kill any overlay that happened to be open when the clock ran out. */
  _dismissOverlays() {
    this.lock.stop();
    this.ui.hide('lock');
    this.ui.hide('shop');
  }

  async _beginNight() {
    this.state = 'transition';
    this._dismissOverlays();
    this.player.enabled = false;
    this.player.releaseLock();
    this.ui.prompt(null);
    this.ui.fadeCaption('NIGHTFALL');
    this.ui.fade(true);
    sfx.night();
    await sleep(1500);

    this._clearFood();
    this.projectiles.clear();
    this.world.setPhase('night');
    if (this.doorUnlocked) this.world.openDoor();

    const C = WORLD.cage;
    this.player.teleport(C.x, C.z - 3, Math.PI); // facing the door end of the cage
    this.player.enabled = true;

    this.ammo = Math.min(this.stats.capacity, this.eaten * this.stats.poopPerFood);
    this._spawnGuards();

    this.state = 'night';
    this.timer = NIGHT_SECONDS;
    this.ui.setPhase('night');
    this.ui.setAmmo(this.ammo, this.stats.capacity, '💩');
    this.ui.fadeCaption('');
    this.ui.fade(false);
    if (!this.player.locked) this.ui.prompt('CLICK TO CAPTURE YOUR MOUSE');
    await sleep(600);

    this.ui.toast(this.doorUnlocked
      ? `Your door is still open. ${this.ammo} rounds loaded.`
      : 'You never picked the lock. Do it now — in the dark.', this.doorUnlocked ? 'good' : 'bad');
  }

  async _endNight(caught, byGuard) {
    if (this.state !== 'night') return;
    this.state = 'transition';
    this._dismissOverlays();
    this.player.enabled = false;
    this.player.releaseLock();
    this.ui.vignette(false);
    this.ui.prompt(null);

    if (caught) sfx.taze();
    this.ui.fadeCaption(caught ? 'CAUGHT' : 'DAWN');
    this.ui.fade(true);
    await sleep(1600);

    // back in the cage either way
    const C = WORLD.cage;
    this.player.teleport(C.x, C.z - 3, Math.PI); // facing the door end of the cage
    this._clearActors();

    const rng = makeRng(this.save.level * 31 + this.hits * 7 + (caught ? 3 : 0));
    const scold = scolding(this.hits, caught, rng);
    const bonus = caught ? 0 : Math.round(40 + this.save.level * 4);

    this.save.coins += this.nightCoins + bonus;
    this.save.totalHits += this.hits;
    this.save.bestNight = Math.max(this.save.bestNight, this.hits);
    this.save.level += 1;
    Save.save(this.save);
    this.stats = derive(this.save);
    this.ui.setCoins(this.save.coins);

    this.ui.fade(false);
    this.ui.fadeCaption('');
    this.ui.showHud(false);
    this.ui.showSummary({
      title: caught ? `TAZED BY ${(byGuard?.name || 'A GUARD')}` : 'YOU MADE IT TO DAWN',
      scold,
      calm: !caught,
      stats: [
        { k: 'Guards hit', v: this.hits },
        { k: 'Coins grabbed', v: this.nightCoins },
        { k: 'Escape bonus', v: bonus },
        { k: 'Wallet', v: this.save.coins },
      ],
    });
    $('sum-next').textContent = this.save.level > MAX_LEVEL ? 'SEE THE ENDING' : `NEXT DAY — LEVEL ${this.save.level}`;
  }

  _win() {
    this.state = 'win';
    sfx.win();
    this.save.completed = true;
    Save.save(this.save);
    this.ui.showHud(false);
    this.ui.showWin([
      { k: 'Levels cleared', v: MAX_LEVEL },
      { k: 'Total hits', v: this.save.totalHits },
      { k: 'Best night', v: this.save.bestNight },
      { k: 'Coins', v: this.save.coins },
    ]);
  }

  // ================================================================ actors
  _clearActors() {
    for (const g of this.guards) g.dispose();
    for (const c of this.coins) c.dispose();
    this.guards.length = 0;
    this.coins.length = 0;
    this._clearFood();
    this.projectiles.clear();
  }

  _clearFood() {
    for (const f of this.food) f.dispose();
    this.food.length = 0;
  }

  _spawnFood() {
    this._clearFood();
    const cfg = this.stats.cfg;
    const rng = makeRng(this.save.level * 5171 + 7);
    // later levels push the scraps out to the far corners of the zoo
    const spots = this.world.foodSpots
      .map(s => ({ s, key: s.far * cfg.foodSpread + rng() * 55 }))
      .sort((a, b) => b.key - a.key)
      .map(o => o.s);

    const picked = [];
    for (const s of spots) {
      if (picked.length >= cfg.food) break;
      if (picked.some(p => Math.hypot(p.x - s.x, p.z - s.z) < 6)) continue;
      picked.push(s);
    }
    for (const s of picked) this.food.push(new FoodItem(this.world, s, rng));
  }

  _spawnGuards() {
    const cfg = this.stats.cfg;
    const rng = makeRng(this.save.level * 977 + 41);
    const wps = this.world.waypoints.filter(w => Math.hypot(w.x - WORLD.cage.x, w.z - WORLD.cage.z) > 26);
    const pool = wps.length ? wps : this.world.waypoints;
    for (let i = 0; i < cfg.guards; i++) {
      const spawn = pool[(rng() * pool.length) | 0];
      this.guards.push(new Guard(this.world, cfg, i, spawn));
    }
  }

  // ================================================================ actions
  _interact() {
    if (this.state !== 'day' && this.state !== 'night') return;
    if (this.ui.anyOpen()) return;
    if (this.doorUnlocked) return;
    if (!this._nearDoor()) return;
    this._openLock();
  }

  _nearDoor() {
    const C = WORLD.cage;
    const dx = this.player.pos.x - C.x;
    const dz = this.player.pos.z - (C.z + C.d / 2);
    return Math.hypot(dx, dz) < PLAYER.interactRange;
  }

  _openLock() {
    const cfg = this.stats.cfg;
    this.player.releaseLock();
    this.player.enabled = false;
    this.ui.prompt(null);
    this.ui.lockHeader(0, cfg.locks, cfg.rungs);
    this.ui.lockPips(0);
    this.ui.lockStatus('Hit <kbd>SPACE</kbd> or click when the bar is in the green.');
    this.ui.show('lock');
    this.lock.start({
      locks: cfg.locks, rungs: cfg.rungs,
      speed: cfg.lockSpeed, ramp: cfg.lockRamp,
      arc: cfg.lockArc, shrink: cfg.lockShrink,
      reversals: cfg.reversals, decoys: cfg.decoys,
    });
  }

  _closeLock() {
    this.lock.stop();
    this.ui.hide('lock');
    this.player.enabled = true;
    if (this.state === 'day' || this.state === 'night') this.player.requestLock();
  }

  _lockOpened() {
    this.doorUnlocked = true;
    this.world.openDoor();
    this._closeLock();
    this.ui.toast('The cage door swings open. Go.', 'good');
    if (this.world.doorPivot) this._swingDoor = true;
  }

  _openShop() {
    if (this.state !== 'day') return;
    this.player.releaseLock();
    this.player.enabled = false;
    this.ui.renderShop();
    this.ui.show('shop');
  }

  _closeShop() {
    this.ui.hide('shop');
    if (this.state === 'day') {
      this.player.enabled = true;
      this.player.requestLock();
    }
  }

  _throw() {
    if (this.state !== 'night') {
      if (this.state === 'day') this.ui.toast('Nothing to throw yet. Eat first.', 'bad');
      return;
    }
    if (this.cooldown > 0) return;
    if (this.ammo <= 0) { sfx.empty(); this.ui.toast('Out of ammo. Should have eaten more.', 'bad'); return; }

    this.ammo--;
    this.cooldown = this.stats.cooldown;
    this.ui.setAmmo(this.ammo, this.stats.capacity, '💩');
    this.ui.throwAnim();
    sfx.throw();

    // Spawn from the player's authoritative position, not the camera — the camera
    // only catches up during update(), so it can be a frame stale on click.
    const dir = this.player.forward();
    const origin = this.player.pos.clone()
      .addScaledVector(dir, 0.8)
      .add(new THREE.Vector3(0, -0.18, 0));
    this.projectiles.fire(origin, dir, {
      speed: this.stats.shotSpeed,
      gravity: this.stats.shotGravity,
      splash: this.stats.splash,
      size: this.stats.weapon.size,
    });
  }

  _onSplat(hitGuards, shot, direct) {
    if (!hitGuards.length) { sfx.splat(); return; }
    if (this.stats.splash > 2) sfx.boom(); else sfx.splat();

    for (const g of hitGuards) {
      g.splat();
      this.hits++;
      const value = this.stats.cfg.coinValue;
      this.coins.push(new Coin(this.world, g.pos.x + (Math.random() - 0.5) * 1.5, g.pos.z + (Math.random() - 0.5) * 1.5, value));
    }
    this.ui.setHits(this.hits);
    const n = hitGuards.length;
    this.ui.toast(n > 1 ? `${n} GUARDS SPLATTERED!` : `DIRECT HIT — ${hitGuards[0].name}!`, 'good');
  }

  // ================================================================ loop
  _tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;

    if (this.state === 'menu') {
      // slow orbit over the zoo behind the menu
      const a = this.time * 0.06;
      this.camera.position.set(Math.sin(a) * 46, 16 + Math.sin(a * 0.7) * 3, Math.cos(a) * 46 - 12);
      this.camera.lookAt(0, 2, -30);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.ui.isOpen('lock')) this.lock.update(dt);

    const playing = (this.state === 'day' || this.state === 'night');
    const paused = this.ui.isOpen('shop') || this.state === 'transition';

    if (playing && !paused) {
      // the day clock keeps ticking while you fumble with the padlock
      this.timer -= dt;
      this.ui.setTimer(this.timer);
      if (this.timer <= 0) {
        if (this.state === 'day') { this._beginNight(); }
        else { this._endNight(false, null); }
        return;
      }
    }

    if (!this.ui.anyOpen() && this.state !== 'transition') {
      this.player.update(dt, this.world, this.stats.speed);
    }

    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    this.ui.crosshair(this.state === 'night' ? (this.cooldown > 0 ? 'cooling' : 'hot') : '');

    if (this._swingDoor && this.world.doorPivot) {
      const p = this.world.doorPivot;
      p.rotation.y = THREE.MathUtils.lerp(p.rotation.y, -1.35, dt * 3);
      if (p.rotation.y < -1.3) this._swingDoor = false;
    }

    if (this.state === 'day') this._updateDay(dt);
    if (this.state === 'night') this._updateNight(dt);

    this.projectiles.update(dt, this.guards, (hits, shot, direct) => this._onSplat(hits, shot, direct));

    this.renderer.render(this.scene, this.camera);
  }

  _updateDay(dt) {
    for (let i = this.food.length - 1; i >= 0; i--) {
      const f = this.food[i];
      f.update(dt, this.time);
      const d = Math.hypot(f.pos.x - this.player.pos.x, f.pos.z - this.player.pos.z);
      if (d < PLAYER.pickupRange && Math.abs(f.pos.y - 1) < 2.2) {
        f.dispose();
        this.food.splice(i, 1);
        this.eaten++;
        sfx.eat();
        this.ui.setAmmo(this.eaten, this.eaten + this.food.length, '🍔');
        this.ui.toast(`Ate ${article(f.type.name)} ${f.type.emoji}  (+${this.stats.poopPerFood} 💩 tonight)`, 'good');
      }
    }

    if (!this.doorUnlocked && this._nearDoor() && !this.ui.anyOpen()) {
      this.ui.prompt('PRESS <kbd>E</kbd> TO PICK THE LOCK');
    } else if (this.player.locked || this.ui.anyOpen()) {
      this.ui.prompt(null);
    }
  }

  _updateNight(dt) {
    let anyChasing = false, anyZone = false;
    for (const g of this.guards) {
      const r = g.update(
        dt, this.player, this.stats.detectMul, this.stats.attackMul,
        guard => this._endNight(true, guard),
        guard => { if (!this._alertCooldown) { sfx.alert(); this._alertCooldown = 0.9; } }
      );
      if (r.chasing) anyChasing = true;
      if (r.inZone) anyZone = true;
    }
    if (this._alertCooldown > 0) this._alertCooldown = Math.max(0, this._alertCooldown - dt);
    this.ui.vignette(anyChasing && anyZone);

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (c.update(dt, this.player, PLAYER.coinRange)) {
        this.nightCoins += c.value;
        this.save.coins += c.value;
        this.ui.setCoins(this.save.coins);
        this.ui.toast(`+${c.value} 🪙`, 'coin');
        c.dispose();
        this.coins.splice(i, 1);
      }
    }

    if (!this.doorUnlocked && this._nearDoor() && !this.ui.anyOpen()) {
      this.ui.prompt('PRESS <kbd>E</kbd> TO PICK THE LOCK');
    } else if (this.player.locked || this.ui.anyOpen()) {
      this.ui.prompt(null);
    }
  }
}

// Exposed as a debug handle: poke at `__game` in the console to inspect or skip ahead.
window.__game = new Game();
