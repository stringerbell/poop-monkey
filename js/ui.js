import { WEAPONS, DISGUISES, UPGRADES, SHOP_TABS, upgradeCost, MAX_LEVEL } from './config.js';
import { sfx } from './audio.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), level: $('hud-level'), phase: $('hud-phase'), timer: $('hud-timer'),
      coins: $('hud-coins'), hits: $('hud-hits'), weapon: $('hud-weapon'),
      ammo: $('hud-ammo'), ammoBox: document.querySelector('.ammo'),
      ammoMax: document.querySelector('.ammo-max'), ammoIcon: document.querySelector('.ammo .ico'),
      crosshair: $('crosshair'), prompt: $('prompt'), toasts: $('toast-wrap'),
      crowd: $('crowd'), crowdCount: $('crowd-count'), crowdFill: $('crowd-fill'),
      vignette: $('alert-vignette'), viewmodel: $('viewmodel'), fade: $('fade'),
      shopBody: $('shop-body'), shopCoins: $('shop-coins'),
      sumTitle: $('sum-title'), sumScold: $('sum-scold'), sumStats: $('sum-stats'),
      winStats: $('win-stats'), lockTitle: $('lock-title'), lockStatus: $('lock-status'), lockPips: $('lock-pips'),
    };
    this.shopTab = 'weapons';
    this._lastPrompt = null;

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.shopTab = tab.dataset.tab;
        this.renderShop();
      });
    });
  }

  // ------------------------------------------------------------ overlays
  show(id) { $(id).classList.add('show'); }
  hide(id) { $(id).classList.remove('show'); }
  hideAll() { document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show')); }
  isOpen(id) { return $(id).classList.contains('show'); }
  anyOpen() { return !!document.querySelector('.overlay.show'); }

  showHud(on) {
    this.el.hud.classList.toggle('hidden', !on);
    this.el.viewmodel.classList.toggle('hidden', !on);
  }

  fade(on, instant = false) {
    this.el.fade.classList.toggle('instant', instant);
    this.el.fade.classList.toggle('on', on);
    if (instant) requestAnimationFrame(() => this.el.fade.classList.remove('instant'));
  }

  fadeCaption(text) {
    this.el.fade.innerHTML = text ? `<div class="caption">${text}</div>` : '';
  }

  // ------------------------------------------------------------ hud
  setLevel(n) { this.el.level.textContent = `LEVEL ${n} / ${MAX_LEVEL}`; }
  setPhase(p) {
    this.el.phase.textContent = p === 'day' ? '☀️ OPEN TO THE PUBLIC' : '🌙 NIGHT — FORAGE';
  }

  /**
   * The public closing in on you.
   * @param count how many alarmed patrons are within arm's reach
   * @param need  how many it takes to pin you (0 hides the meter entirely)
   * @param frac  0..1 progress towards being held
   */
  crowd(count, need, frac = 0) {
    const show = need > 0 && count > 0;
    this.el.crowd.classList.toggle('hidden', !show);
    if (!show) return;
    const pinned = count >= need;
    this.el.crowd.classList.toggle('pinned', pinned);
    this.el.crowdCount.textContent = `${count}/${need}`;
    this.el.crowdFill.style.width = `${Math.min(100, frac * 100)}%`;
  }
  setTimer(sec) {
    const s = Math.max(0, Math.ceil(sec));
    if (s === this._lastSec) return;   // only touch the DOM once a second
    this._lastSec = s;
    this.el.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.el.timer.classList.toggle('urgent', s <= 20);
  }
  setCoins(n) {
    this.el.coins.innerHTML = `<span class="ico">🪙</span> ${n}`;
    this.el.shopCoins.textContent = n;
  }
  setHits(n) { this.el.hits.innerHTML = `<span class="ico">🎯</span> ${n}`; }
  setWeapon(name) { this.el.weapon.textContent = name; }
  /**
   * @param holding whether the monkey has a round in its paw. At night the
   *        counter is scraps eaten, not ammo — there is nothing to hold yet.
   */
  setAmmo(n, max, icon, holding = true) {
    this.el.ammo.textContent = n;
    this.el.ammoMax.textContent = `/${max}`;
    if (icon) this.el.ammoIcon.textContent = icon;
    this.el.ammoBox.classList.toggle('empty', n <= 0);
    this.el.viewmodel.classList.toggle('empty', !holding || n <= 0);
  }

  prompt(text) {
    if (text === this._lastPrompt) return;
    this._lastPrompt = text;
    this.el.prompt.classList.toggle('hidden', !text);
    if (text) this.el.prompt.innerHTML = text;
  }

  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 1900);
  }

  crosshair(state) {
    this.el.crosshair.classList.toggle('hot', state === 'hot');
    this.el.crosshair.classList.toggle('cooling', state === 'cooling');
  }

  vignette(on) { this.el.vignette.classList.toggle('on', on); }

  throwAnim() {
    this.el.viewmodel.classList.add('throwing');
    setTimeout(() => this.el.viewmodel.classList.remove('throwing'), 130);
  }

  // ------------------------------------------------------------ lock
  lockHeader(lockIndex, locks, rungs) {
    this.el.lockTitle.textContent = locks > 1
      ? `PADLOCK ${lockIndex + 1} OF ${locks}`
      : 'CAGE PADLOCK';
    this.el.lockPips.innerHTML = Array.from({ length: rungs }, () => '<div class="pip"></div>').join('');
  }
  lockPips(done) {
    [...this.el.lockPips.children].forEach((p, i) => p.classList.toggle('on', i < done));
  }
  lockStatus(text, cls = '') {
    this.el.lockStatus.className = cls;
    this.el.lockStatus.innerHTML = text;
  }

  // ------------------------------------------------------------ shop
  // getSave is a function, not a snapshot — starting a new game swaps the object out.
  bindShop(getSave, handlers) {
    this.getSave = getSave;
    this.handlers = handlers;
  }

  renderShop() {
    const save = this.getSave?.();
    if (!save) return;
    this.setCoins(save.coins);
    const body = this.el.shopBody;
    body.innerHTML = '';

    const card = ({ emoji, name, desc, footer, cls = '' }) => {
      const d = document.createElement('div');
      d.className = `item ${cls}`;
      d.innerHTML = `
        <div class="item-top"><div class="item-emoji">${emoji}</div><div class="item-name">${name}</div></div>
        <div class="item-desc">${desc}</div>`;
      d.appendChild(footer);
      body.appendChild(d);
      return d;
    };

    const buyBtn = (label, cost, afford, onClick, extraClass = '') => {
      const b = document.createElement('button');
      b.className = `buy ${extraClass}`;
      b.textContent = cost == null ? label : `${label} — 🪙 ${cost}`;
      b.disabled = cost != null && !afford;
      b.addEventListener('click', () => {
        if (b.disabled) { sfx.deny(); return; }
        onClick();
        this.renderShop();
      });
      return b;
    };

    const bar = (n, max) => {
      const d = document.createElement('div');
      d.className = 'item-bar';
      d.innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
      return d;
    };

    if (this.shopTab === 'weapons') {
      WEAPONS.forEach((w, i) => {
        const owned = i <= save.weapon;
        const next = i === save.weapon + 1;
        const wrap = document.createElement('div');
        if (owned) {
          wrap.appendChild(buyBtn(i === save.weapon ? 'EQUIPPED' : 'OWNED', null, true, () => {}, 'is-equipped'));
        } else if (next) {
          wrap.appendChild(buyBtn('UPGRADE', w.cost, save.coins >= w.cost, () => this.handlers.buyWeapon(i)));
        } else {
          wrap.appendChild(buyBtn('LOCKED', null, false, () => {}));
          wrap.firstChild.disabled = true;
        }
        card({ emoji: w.emoji, name: w.name, desc: w.desc, footer: wrap,
               cls: i === save.weapon ? 'equipped' : owned ? 'owned' : next ? '' : 'locked' });
      });

      for (const key of SHOP_TABS.weapons) this._upgradeCard(card, buyBtn, bar, key);
    }

    if (this.shopTab === 'movement') {
      for (const key of SHOP_TABS.movement) this._upgradeCard(card, buyBtn, bar, key);
    }

    if (this.shopTab === 'cosmetics') {
      DISGUISES.forEach(d => {
        const owned = save.owned.includes(d.id);
        const equipped = save.equipped === d.id;
        const wrap = document.createElement('div');
        const stats = document.createElement('div');
        stats.className = 'item-desc';
        stats.innerHTML = `<b>−${Math.round((1 - d.detect) * 100)}%</b> spotted range &middot; <b>−${Math.round((1 - d.attack) * 100)}%</b> attack zone`;
        wrap.appendChild(stats);
        if (!owned) {
          wrap.appendChild(buyBtn('BUY', d.cost, save.coins >= d.cost, () => this.handlers.buyDisguise(d.id)));
        } else if (equipped) {
          wrap.appendChild(buyBtn('WEARING IT', null, true, () => {}, 'is-equipped'));
        } else {
          wrap.appendChild(buyBtn('WEAR', null, true, () => this.handlers.equip(d.id), 'equip'));
        }
        card({ emoji: d.emoji, name: d.name, desc: d.desc, footer: wrap,
               cls: equipped ? 'equipped' : owned ? 'owned' : '' });
      });
    }
  }

  _upgradeCard(card, buyBtn, bar, key) {
    const save = this.getSave();
    const u = UPGRADES[key];
    const lvl = save.upgrades[key] || 0;
    const maxed = lvl >= u.max;
    const cost = upgradeCost(key, lvl);
    const wrap = document.createElement('div');
    wrap.appendChild(bar(lvl, u.max));
    wrap.appendChild(maxed
      ? buyBtn('MAXED OUT', null, true, () => {}, 'is-equipped')
      : buyBtn(`LEVEL ${lvl + 1}`, cost, save.coins >= cost, () => this.handlers.buyUpgrade(key)));
    card({ emoji: u.emoji, name: `${u.name} ${lvl}/${u.max}`, desc: u.desc, footer: wrap,
           cls: maxed ? 'equipped' : lvl > 0 ? 'owned' : '' });
  }

  // ------------------------------------------------------------ summary
  showSummary({ title, scold, stats, calm }) {
    this.el.sumTitle.textContent = title;
    this.el.sumScold.className = `scold ${calm ? 'calm' : ''}`;
    this.el.sumScold.innerHTML = `&ldquo;${scold.text}&rdquo;<span class="who">— ${scold.who}</span>`;
    this.el.sumStats.innerHTML = stats.map(s => `<div class="stat"><b>${s.v}</b><span>${s.k}</span></div>`).join('');
    this.show('summary');
  }

  showWin(stats) {
    this.el.winStats.innerHTML = stats.map(s => `<div class="stat"><b>${s.v}</b><span>${s.k}</span></div>`).join('');
    this.show('win');
  }
}
