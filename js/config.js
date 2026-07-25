// Tuning constants, level curves, upgrade catalogue and flavour text.

export const MAX_LEVEL = 50;

// A level runs NIGHT first, then DAY.
//   night — the zoo is shut. Pick the padlock, sneak out, and forage before the
//           janitor bags the leftovers. Short and frantic; grows with the level.
//   day   — the zoo is open. Your food is now ammunition, the guards are on shift
//           and the place is full of patrons who will happily point you out.
export const DAY_SECONDS = 180;          // spec: daytime lasts 3 real minutes
export const NIGHT_BASE_SECONDS = 60;    // level 1 night; later levels get longer

export const WORLD = {
  half: 70,          // arena spans -70..70 on X and Z
  wallHeight: 9,
  cage: { x: 0, z: -50, w: 18, d: 14, h: 6 },
  playerRadius: 0.45,
  eyeHeight: 1.62,
};

export const PLAYER = {
  baseSpeed: 6.0,
  sprintMul: 1.45,
  accel: 42,
  friction: 12,
  lookSens: 0.0022,
  pickupRange: 1.9,
  coinRange: 2.6,
  interactRange: 3.4,
};

// The lock's difficulty is expressed as a *window* — how long the bar spends
// inside the target — rather than as a raw arc width. The drawn arc is then
// derived as window x speed, which keeps the two honest: a faster bar
// automatically needs a wider target for the same difficulty, so speeding the
// bar up can never silently make a rung physically unhittable.
export const MIN_LOCK_WINDOW = 0.09;   // seconds (~5 frames at 60fps)
export const MAX_LOCK_SPEED = 7;       // rad/s, ~1.1 revolutions per second

// ---------------------------------------------------------------- weapons
export const WEAPONS = [
  { name: 'Bare Arm',        emoji: '💪', cost: 0,    speed: 24, gravity: 20, cooldown: 0.55, splash: 0,   size: 0.22,
    desc: 'The classic. Shoulder-powered, wildly inaccurate, always available.' },
  { name: 'Slingshot',       emoji: '🪃', cost: 180,  speed: 33, gravity: 17, cooldown: 0.45, splash: 0,   size: 0.2,
    desc: 'Elastic waistband from a zookeeper who will not miss it.' },
  { name: 'Dung Bow',        emoji: '🏹', cost: 520,  speed: 44, gravity: 13, cooldown: 0.38, splash: 1.2, size: 0.24,
    desc: 'Flat arc, quick draw, and a satisfying splatter radius.' },
  { name: 'Fecal Cannon',    emoji: '💣', cost: 1250, speed: 55, gravity: 10, cooldown: 0.5,  splash: 3.0, size: 0.34,
    desc: 'Compressed air. Compressed dignity. Hits a whole patrol at once.' },
  { name: 'R.P.P. Launcher', emoji: '🚀', cost: 3000, speed: 78, gravity: 3,  cooldown: 0.62, splash: 5.5, size: 0.42,
    desc: 'Rocket Propelled Poop. Nearly flat trajectory. Absolutely a war crime.' },
];

// ---------------------------------------------------------------- disguises
export const DISGUISES = [
  { id: 'none',   name: 'Bare Monkey',    emoji: '🐒', cost: 0,    detect: 1.0,  attack: 1.0,
    desc: 'Just you, your fur, and your terrible intentions.' },
  { id: 'vest',   name: 'Keeper Vest',    emoji: '🦺', cost: 300,  detect: 0.85, attack: 0.9,
    desc: 'High-vis orange. Guards assume you are new and briefly ignore you.' },
  { id: 'bush',   name: 'Shrubbery Suit', emoji: '🌳', cost: 750,  detect: 0.7,  attack: 0.8,
    desc: 'Stand still and you are simply landscaping.' },
  { id: 'penguin',name: 'Penguin Costume',emoji: '🐧', cost: 1500, detect: 0.58, attack: 0.72,
    desc: 'Nobody questions a penguin outside the penguin enclosure. Nobody.' },
  { id: 'shadow', name: 'Shadow Cloak',   emoji: '🥷', cost: 2800, detect: 0.44, attack: 0.6,
    desc: 'Night-shift guards report seeing "a bad feeling" instead of a monkey.' },
];

// ---------------------------------------------------------------- upgrades
export const UPGRADES = {
  speed:    { name: 'Sprinter Feet', emoji: '👟', max: 5, base: 120, step: 1.65,
              desc: 'Move faster on foot and hold sprint for longer strides.' },
  stealth:  { name: 'Silent Paws',   emoji: '🤫', max: 5, base: 150, step: 1.7,
              desc: 'Guards notice you from much shorter range.' },
  capacity: { name: 'Bowel Capacity',emoji: '🛢️', max: 5, base: 100, step: 1.55,
              desc: 'Carry more ammo out of the day and into the night.' },
  power:    { name: 'Throwing Arm',  emoji: '🦾', max: 5, base: 140, step: 1.6,
              desc: 'Flatter, faster shots and a wider splatter.' },
  digest:   { name: 'Fast Digestion',emoji: '⚡', max: 5, base: 130, step: 1.6,
              desc: 'Each scrap of food converts into more poop.' },
  slip:     { name: 'Grease Fur',    emoji: '🧴', max: 5, base: 190, step: 1.72,
              desc: 'Wriggle out of a grabbing crowd before a guard reaches you.' },
};

// Which upgrades appear under which shop tab. Kept here rather than inline in the
// shop so it can be checked: every upgrade must be purchasable somewhere.
export const SHOP_TABS = {
  weapons:  ['power', 'capacity', 'digest'],
  movement: ['speed', 'stealth', 'slip'],
};

export function upgradeCost(key, ownedLevel) {
  const u = UPGRADES[key];
  return Math.round(u.base * Math.pow(u.step, ownedLevel));
}

// ---------------------------------------------------------------- level curve
export function levelConfig(level) {
  const t = (level - 1) / (MAX_LEVEL - 1); // 0..1 across the campaign

  return {
    level,

    // --- night length. The padlock alone can eat most of a level-1 night, so the
    //     clock grows roughly in step with how much lock there is to pick.
    night:      Math.round(NIGHT_BASE_SECONDS + t * 90),   // 60s -> 150s

    // --- lock puzzle (night). More taps, sooner, and a steeper per-rung ramp.
    locks:       Math.min(4, 1 + Math.floor((level - 1) / 12)),
    rungs:       Math.min(8, 3 + Math.floor((level - 1) / 5)),   // spec: 3 layers at level 1
    lockWindow:  0.30 - t * 0.14,     // seconds inside the target, at rung 1
    windowShrink: 0.86 - t * 0.06,    // per rung
    lockSpeed:   1.8 + t * 1.8,       // rad/s at rung 1
    lockRamp:    1.09 + t * 0.05,     // speed multiplier per rung
    reversals:   level >= 5,
    decoys:      level >= 9 ? Math.min(3, 1 + Math.floor((level - 9) / 14)) : 0,

    // --- night / food
    food:       Math.max(7, Math.round(22 - t * 13)),
    foodSpread: 0.55 + t * 0.45,   // higher = pushed further into awkward corners
    foodPoop:   2,

    // --- night / janitors. Softer than guards: shorter sight, slower, and being
    //     caught costs you progress rather than the level. Their real threat is
    //     that they are binning the leftovers while you fumble with the lock.
    janitors:      Math.min(5, 1 + Math.floor(level / 11)),
    janitorSpeed:  2.6 + t * 2.2,
    janitorDetect: 8.5 + t * 6.5,
    janitorFov:    Math.PI * (0.5 + t * 0.25),
    janitorCatch:  1.7 + t * 0.5,
    cleanTime:     Math.max(1.1, 3.6 - t * 2.4),   // seconds to bag one scrap
    foodLossOnCatch: 0.3,                          // fraction of your haul confiscated

    // --- day / guards
    guards:     Math.min(14, 3 + Math.floor(level / 3.2)),
    guardSpeed: 3.0 + t * 3.4,
    guardTurn:  2.2 + t * 1.8,
    detect:     13 + t * 13,       // radius at which a guard spots you
    attack:     5.5 + t * 5.0,     // the "attack zone" — inside it they close in fast
    taze:       1.9 + t * 0.9,     // contact radius that ends the level
    guardFov:   Math.PI * (0.62 + t * 0.30),
    stunTime:   Math.max(2.2, 5.0 - t * 2.6),
    coinValue:  12 + Math.round(level * 1.6),

    // --- day / patrons
    patrons:      Math.min(24, 7 + Math.round(t * 17)),
    patronSpeed:  1.7 + t * 1.4,
    patronAlert:  9 + t * 7,       // range at which a patron notices a loose monkey
    patronFov:    Math.PI * (0.7 + t * 0.3),
    patronShout:  16 + t * 12,     // how far their shouting carries to a guard
    crowdSize:    3 - Math.round(t),  // patrons needed to pin you: 3 early, 2 late
    crowdRadius:  3.2 + t * 1.3,
  };
}

// Effective stats once upgrades and disguise are applied.
export function derive(save) {
  const cfg = levelConfig(save.level);
  const dis = DISGUISES.find(d => d.id === save.equipped) || DISGUISES[0];
  const w = WEAPONS[save.weapon] || WEAPONS[0];
  const power = save.upgrades.power || 0;

  const slip = save.upgrades.slip || 0;
  const slipT = slip / UPGRADES.slip.max;   // exact 1 at max, so grabSpeed lands on 1
  const attackMul = dis.attack;
  // Stacked stealth can otherwise shrink the spotted-range below the attack ring,
  // which makes the red circle on the ground a lie — you'd get grabbed from
  // inside a zone the guard supposedly cannot see into. Keep them ordered.
  const rawDetectMul = dis.detect * (1 - (save.upgrades.stealth || 0) * 0.09);
  const minDetectMul = (cfg.attack * attackMul * 1.35) / cfg.detect;
  const detectMul = Math.max(rawDetectMul, minDetectMul);

  return {
    cfg, disguise: dis, weapon: w,
    speed: PLAYER.baseSpeed + (save.upgrades.speed || 0) * 0.62,
    // Base capacity deliberately sits below a full day's haul, so raiding the
    // whole zoo only pays off once you have bought some bowel.
    capacity: 30 + (save.upgrades.capacity || 0) * 8,
    poopPerFood: cfg.foodPoop + Math.round((save.upgrades.digest || 0) * 0.8),
    shotSpeed: w.speed * (1 + power * 0.07),
    shotGravity: w.gravity * (1 - power * 0.06),
    cooldown: w.cooldown * (1 - power * 0.05),
    splash: w.splash * (1 + power * 0.1),
    detectMul, attackMul,

    // Crowd handling. At Grease Fur 0 a crowd pins you almost instantly and you
    // can barely shuffle; fully greased you keep full speed and walk out of it.
    grabLimit: 1.5 + slip * 0.85,
    grabSpeed: slipT >= 1 ? 1 : 0.12 + slipT * 0.88,
  };
}

// ---------------------------------------------------------------- flavour
const SCOLDINGS = {
  // 0 hits
  none: [
    { who: 'Keeper Dale', text: 'Zero. Zero direct hits. You climbed out of a locked cage, evaded three grown adults, and threw absolutely nothing at anybody. My six-year-old has better aim and she throws with her eyes closed.' },
    { who: 'Night Supervisor Brenda', text: 'Do you know what the worst part is? I filed a hazard report about you. I stood up in a meeting. And you did NOTHING. You have made me look insane, and you have made me look insane for free.' },
    { who: 'Keeper Dale', text: 'Back in the cage, chief. Not one hit. I have started to suspect that the poop is more of a lifestyle than a weapon for you.' },
  ],
  // 1-2 hits
  low: [
    { who: 'Keeper Dale', text: 'Oh, we got a couple in, did we? Congratulations. I will be washing this shirt at 60 degrees and thinking about my degree in zoology the entire time.' },
    { who: 'Trainee Kev', text: 'That is the second time this week. I only started on Monday. This is my whole career now. This is what I am.' },
    { who: 'Night Supervisor Brenda', text: 'A modest showing. A gentleman would have stopped at one. You are not a gentleman, but you are close, and somehow that is worse.' },
  ],
  // 3-6 hits
  mid: [
    { who: 'Keeper Dale', text: 'Right. RIGHT. That is a laundry situation. That is a whole laundry situation you have created for me and I want you to sit in here and think about the tumble dryer.' },
    { who: 'Night Supervisor Brenda', text: 'You hit me. You hit Kev. You hit Kev TWICE, and Kev is nineteen. We are putting a second padlock on this door and I am going to enjoy it.' },
    { who: 'Keeper Dale', text: 'The gift shop CCTV caught all of it. All of it. My mother watches that feed. My MOTHER, monkey.' },
  ],
  // 7-12 hits
  high: [
    { who: 'Night Supervisor Brenda', text: 'I have worked here for eleven years. Eleven. I have been bitten by an otter and I have been kicked by a rhea and NOTHING has prepared me for the sustained artillery campaign you conducted tonight.' },
    { who: 'Keeper Dale', text: 'We are not calling that an incident anymore. Head office has asked us to call it "an event". There is going to be a debrief. There is going to be a slideshow.' },
    { who: 'Trainee Kev', text: 'I have resigned. I want you to know that I have resigned, and that in my exit interview I named you personally, and they wrote it down.' },
  ],
  // 13+ hits
  legend: [
    { who: 'Night Supervisor Brenda', text: 'The insurance company has invented a new category for you. There is a form. The form has your name on it. Somebody typed your name into a form, monkey, and now you exist in a filing system, forever.' },
    { who: 'Keeper Dale', text: 'I want you to know that I dreamed about this. Not tonight — years ago. I dreamed a monkey did this to me and I woke up laughing and told my wife. She is not laughing now. Nobody in my house is laughing.' },
    { who: 'Night Supervisor Brenda', text: 'We are keeping you. Not because we have to. Because if we release you into the wild, you will do this to a town.' },
  ],
};

const ESCAPED = [
  { who: 'Keeper Dale (over the radio)', text: 'It went back in on its own. It went back in ON ITS OWN. That is somehow the most disrespectful part of the entire day.' },
  { who: 'Night Supervisor Brenda', text: 'Nobody caught it. It simply got bored of us and went home to bed. Log it. Log all of it. I will be in the van.' },
];

// Held by the public until somebody official turned up. Different humiliation.
const CROWDED = [
  { who: 'A man in a bucket hat', text: 'I have got him! I have got the monkey! Everyone, form the ring again, form the RING — Deborah, film it, film it properly, not the floor —' },
  { who: 'A school trip, in unison', text: 'MISS. MISS. MISS. MISS. MISS. MISS. MISS.' },
  { who: 'Keeper Dale, arriving late', text: 'Would everyone please stop holding the animal. Sir. SIR. That is a wild animal and you are holding it like a marrow at a village show.' },
  { who: 'A woman with a pushchair', text: 'I have watched a lot of nature documentaries and I want you to know that I knew exactly what to do, and what I did was scream and put my arms out.' },
];

// Short, softer, night-time. The janitor is an obstacle, not a boss.
export const JANITOR_LINES = [
  { who: 'Janitor Ron', text: 'Nope. Back you go. I have got eleven bins left and I am not doing them twice.' },
  { who: 'Janitor Ron', text: 'You are not even hiding. You are just standing in the open being brown.' },
  { who: 'Janitor Ron', text: 'Every night. Every single night. Go on, in.' },
  { who: 'Janitor Ron', text: 'I do not get paid enough to care, but I do get paid enough to do THIS.' },
  { who: 'Janitor Ron', text: 'Mate. Mate. It is a bin bag. There is nothing in it for you but disappointment and cutlery.' },
];

export const PATRON_SHOUTS = [
  'THERE! THERE IT IS!',
  'IS THAT MEANT TO BE OUT?',
  'SECURITY! SECURITY!',
  'MUM, THE MONKEY IS LOOSE!',
  'GET A PHOTO, GET A PHOTO!',
  'IT IS COMING RIGHT AT US!',
  'SOMEBODY DO A SOMETHING!',
];

/**
 * @param cause 'guard' | 'crowd' | null (null = you survived to closing time)
 */
export function scolding(hits, cause, rng = Math.random) {
  if (!cause) return ESCAPED[Math.floor(rng() * ESCAPED.length)];
  if (cause === 'crowd') return CROWDED[Math.floor(rng() * CROWDED.length)];
  const pool =
      hits === 0 ? SCOLDINGS.none
    : hits <= 2 ? SCOLDINGS.low
    : hits <= 6 ? SCOLDINGS.mid
    : hits <= 12 ? SCOLDINGS.high
    : SCOLDINGS.legend;
  return pool[Math.floor(rng() * pool.length)];
}

export function janitorLine(rng = Math.random) {
  return JANITOR_LINES[Math.floor(rng() * JANITOR_LINES.length)];
}

export const FOOD_TYPES = [
  { name: 'half a hot dog',   emoji: '🌭', color: 0xd4763a },
  { name: 'abandoned churro', emoji: '🥖', color: 0xc99a45 },
  { name: 'melting ice cream',emoji: '🍦', color: 0xf2e2c6 },
  { name: 'gnawed corn dog',  emoji: '🍢', color: 0xb8722c },
  { name: 'soggy fries',      emoji: '🍟', color: 0xe8c05a },
  { name: 'chewed apple',     emoji: '🍎', color: 0xcc3a3a },
  { name: 'suspicious burger',emoji: '🍔', color: 0x9c5f2e },
  { name: 'dropped pizza',    emoji: '🍕', color: 0xdb8a3a },
];
