# 🐒 Poop Monkey

A first-person browser game. You are a monkey in a zoo. You have a plan.

**Day (3:00)** — find the cage door, pick the padlock in a *Pop the Lock*-style timing puzzle,
then raid the zoo for half-eaten food. Everything you eat becomes ammunition.

**Night** — your door is already open. Splatter the night-shift guards, stay out of their
attack zones, and hoover up the coins they drop. Get tazed and you get carried back to your
cage and lectured about it.

Spend your coins in the gift shop on speed, stealth, disguises, and launcher upgrades —
all the way from your bare arm to the R.P.P. (Rocket Propelled Poop). Clear all **50 levels** to win.

## Controls

| | |
|---|---|
| `W A S D` | Move |
| `Shift` | Sprint |
| Mouse | Look (click to capture, `Esc` to release) |
| Left click | Throw |
| `E` | Pick the cage lock (stand at the door) |
| `Space` / click | Time your hit in the lock puzzle |
| `B` | Gift shop (daytime only) |

## Running it locally

Pure static files with no build step — but it uses ES modules, so it needs to be served
over HTTP rather than opened as a `file://` URL:

```bash
make serve           # http://localhost:8123
```

`window.__game` is exposed in the console as a debug handle — handy for skipping ahead
(`__game._startLevel(30)`) or inspecting state.

## Tests

```bash
npm install          # only needed once: pulls three.js for the physics tests
make test            # or: npm test
make check           # parse every module
```

`node --test` only, no framework. The suite covers the level curve and economy, save
migration, the lock puzzle state machine, and projectile ballistics — including
regression tests for the two bugs that bit during development: stealth stacking
inverting the detect/attack radii, and fast launchers tunnelling through guards
between frames. The projectile tests skip themselves if `three` isn't installed;
the game itself always loads three.js from the CDN and has no runtime dependencies.

## Publishing to GitHub Pages

```bash
git init && git add -A && git commit -m "Poop Monkey"
git branch -M main
git remote add origin git@github.com:<you>/poop-monkey.git
git push -u origin main
```

Then in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**. The included
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) publishes the repo root on every
push to `main`.

Prefer the `gh-pages` branch instead? Set **Source** to *Deploy from a branch* → `main` → `/ (root)`.
Everything uses relative paths, so it works fine from a `/<repo>/` sub-path either way.

## Layout

```
index.html          markup, HUD, overlays, three.js importmap
css/style.css       all styling
js/config.js        tuning: level curve, upgrades, weapons, scoldings
js/main.js          game loop and day/night state machine
js/world.js         procedural zoo, cage, colliders, lighting
js/player.js        first-person controller + collision
js/lock.js          Pop-the-Lock cage puzzle
js/guards.js        guard AI, attack zones, dropped coins
js/projectiles.js   flying poop, splatter, food pickups
js/ui.js            HUD, shop, summary screens
js/audio.js         WebAudio bleep synth (no audio assets)
js/save.js          localStorage progression
```

Three.js is loaded from a CDN via an import map — there is nothing to install and nothing to build.

Progress saves to `localStorage`; "erase save" on the title screen wipes it.
