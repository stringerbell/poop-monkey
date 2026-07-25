# 🐒 Poop Monkey

A first-person browser game. You are a monkey in a zoo. You have a plan.

Each level runs **night first, then day**.

**Night (1:00, longer as the levels go on)** — the zoo is shut. Find the cage door, pick the
padlock in a *Pop the Lock*-style timing puzzle, then strip the place of half-eaten food.
You are not alone: **Janitor Ron** is doing his rounds with a litter picker, binning the same
scraps you are after. He is short-sighted and slow, but if he collars you he walks you back
to the cage, fits a fresh padlock, and confiscates a third of your haul.

**Day (1:45, also growing)** — the gates open and last night's dinner is now ammunition. Splatter the
guards, dodge their taser zones, and hoover up the coins they drop. The zoo is full of
**patrons** who will point, shout for security, and — if enough of them get around you —
hold you there until a guard arrives. A guard ends your day outright; a crowd is survivable
once you have bought some Grease Fur. A guest who takes a round to the face is silenced for
the rest of the day — no score and no coin, but no shouting either.

Either phase can be handed in early: walk back into your cage and press `E`. Ending the day
that way still counts as getting away with it, so it is a real way to bank a good haul
instead of pushing your luck.

Spend your coins in the gift shop on speed, stealth, crowd-slipping, disguises, and launcher
upgrades — all the way from your bare arm to the R.P.P. (Rocket Propelled Poop).
Clear all **50 levels** to win.

## Controls

| | |
|---|---|
| `W A S D` | Move |
| `Shift` | Sprint |
| Mouse | Look (click to capture, `Esc` to release) |
| Left click | Throw poop (daytime) |
| `E` | Pick the cage lock at the door &middot; or end the phase early from inside your cage |
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
regression tests for the bugs that bit during development: stealth stacking
inverting the detect/attack radii, fast launchers tunnelling through guards between
frames, a lock curve that ramped into unhittable millisecond windows, and an
upgrade that shipped without a shop tab to buy it from. The projectile tests skip themselves if `three` isn't installed;
the game itself always loads three.js from the CDN and has no runtime dependencies.

## Publishing to GitHub Pages

```bash
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
js/main.js          game loop and night/day state machine
js/world.js         procedural zoo, cage, colliders, lighting
js/player.js        first-person controller + collision
js/lock.js          Pop-the-Lock cage puzzle
js/guards.js        guard AI, attack zones, dropped coins
js/crowd.js         Janitor Ron, patrons, and crowd pressure
js/projectiles.js   flying poop, splatter, food pickups
js/ui.js            HUD, shop, summary screens
js/audio.js         WebAudio bleep synth (no audio assets)
js/save.js          localStorage progression
```

Three.js is loaded from a CDN via an import map — there is nothing to install and nothing to build.

Progress saves to `localStorage`; "erase save" on the title screen wipes it.
