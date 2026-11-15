// Game rules. Pure functions over a plain state object so they can be
// tested in Node and simulated offline. The UI calls these and drains
// `state.events` to show toasts and story panels.

import {
  COST_GROWTH, FOOD_UPKEEP, BASE_CAP, TENT_CAP, HALL_CAP_MULT,
  RESOURCES, GATHER, BUILDINGS, UPGRADES, JOBS, DRAGON_STAGES, STAGE_APPETITE,
  STAGE_XP, LEVEL_CAP_ELDER, NEED_DRAIN, FEEDS, STOKE, ELEMENTS, SKILLS,
  SKILL_GROWTH, TRUST_KEEPER, TRUST_RIDERS, CLUES, SURVIVOR_LINES, SCOUT_AREAS, STORY,
} from './data.js';

export const SAVE_VERSION = 1;
export const SURVIVOR_INTERVAL = 45;
export const KEEPER_INTERVAL = 8;
export const RAID_WARNING = 30;
export const SCOUT_COOLDOWN = 90;
export const ISLAND_COOLDOWN = 300;

export function newState() {
  return {
    version: SAVE_VERSION,
    act: 1,
    time: 0,
    savedAt: 0,
    introSeen: false,
    res: { wood: 0, stone: 0, ore: 0, food: 15, iron: 0, hides: 0, scrap: 0, crystal: 0, bond: 0, trust: 0 },
    buildings: { farm: 0, hut: 0, blacksmith: 0, barracks: 0, tent: 0, dock: 0, den: 0, hall: 0 },
    upgrades: { spear: 0, tools: 0, training: 0 },
    pop: 0,
    jobs: Object.fromEntries(Object.keys(JOBS).map((k) => [k, 0])),
    starving: false,
    survivorTimer: 0,
    scavengerTimer: 90,
    keeperBudget: 0,
    clues: [],
    tapsSinceClue: 0,
    testimonies: [],
    dragon: null,
    skills: {},
    areas: { caves: false, lake: false, oldmine: false },
    raid: { next: 0, warning: false, count: 0, rally: 0, wins: 0, losses: 0 },
    cooldowns: { scout: 0, island: 0 },
    scouts: 0,
    islands: 0,
    stats: { taps: 0, pets: 0 },
    events: [],
  };
}

// ---------- helpers ----------

export function costOf(base, n) {
  const out = {};
  for (const [k, v] of Object.entries(base)) out[k] = Math.ceil(v * Math.pow(COST_GROWTH, n));
  return out;
}

export function scaleCost(cost, mult) {
  const out = {};
  for (const [k, v] of Object.entries(cost)) out[k] = Math.ceil(v * mult);
  return out;
}

export function canAfford(s, cost) {
  return Object.entries(cost).every(([k, v]) => s.res[k] >= v - 1e-9);
}

export function pay(s, cost) {
  if (!canAfford(s, cost)) return false;
  for (const [k, v] of Object.entries(cost)) s.res[k] = Math.max(0, s.res[k] - v);
  return true;
}

function emit(s, ev) {
  s.events.push(ev);
}

function toast(s, text) {
  emit(s, { type: 'toast', text });
}

export function contentment(dr) {
  if (!dr) return 0;
  return (dr.hunger + dr.warmth + dr.affection) / 300;
}

export function rank(s, node) {
  return s.skills[node] || 0;
}

export function workers(s) {
  return Object.values(s.jobs).reduce((a, b) => a + b, 0);
}

export function idle(s) {
  return s.pop - workers(s);
}

export function xpFor(level) {
  return Math.floor(8 * Math.pow(level, 1.5));
}

export function levelCap(dr) {
  return dr.stage < DRAGON_STAGES.length - 1 ? DRAGON_STAGES[dr.stage + 1].level : LEVEL_CAP_ELDER;
}

export function appetite(s) {
  return s.dragon ? STAGE_APPETITE[s.dragon.stage] : 1;
}

export function feedCost(s, kind) {
  return scaleCost(FEEDS[kind].cost, appetite(s));
}

export function stokeCost(s) {
  return scaleCost(STOKE.cost, appetite(s));
}

// Every multiplier in the game, in one place. Production stacks
// multipliers from several systems, which is what ties them together.
export function derive(s) {
  const b = s.buildings;
  const dr = s.dragon;
  const content = contentment(dr);
  const element = dr?.element;
  const elder = dr && dr.stage >= 4 ? 1.5 : 1;
  const morale = dr ? 1 + 0.5 * content : 1;
  const tool = 1 + 0.25 * s.upgrades.tools;
  const storm = element === 'storm' ? 1.2 : 1;
  const sparks = dr ? 1 + 0.03 * dr.level : 1;

  const tapMult = tool * sparks * (1 + 0.15 * rank(s, 'warmHands')) * morale * elder * storm;
  const jobMult = tool * (1 + 0.1 * rank(s, 'steadyWork')) * morale * elder * storm * (s.starving ? 0.5 : 1);
  const foodMult = 1 + 0.15 * rank(s, 'harvestSong');
  const smeltMult = (dr && dr.stage >= 1 ? 2 : 1) * (element === 'fire' ? 1.5 : 1);
  const cap = (b.tent ? TENT_CAP : BASE_CAP) * Math.pow(HALL_CAP_MULT, b.hall);
  const housing = 5 + 2 * b.hut + (b.blacksmith ? 2 : 0) + (b.barracks ? 3 : 0) + (b.tent ? 4 : 0) +
    3 * b.hall + Math.min(20, Math.floor(s.res.trust / 10));

  const drain = Math.pow(0.88, b.den) * Math.pow(0.92, rank(s, 'patientBelly')) * (element === 'frost' ? 0.75 : 1);
  const warmthDrain = drain * (dr && dr.stage >= 1 ? 0.5 : 1);
  const xpRate = dr ? 1.5 * content * STAGE_XP[dr.stage] * (1 + 0.15 * rank(s, 'strongWings')) * elder : 0;
  const bondRate = dr ? 0.05 * content * (0.5 + dr.affection / 100) * (1 + 0.1 * rank(s, 'runeSight')) * elder : 0;
  const trustRate = dr ? 0.02 * content : 0;
  const clueMult = 1 + 0.2 * rank(s, 'runeSight');
  const riders = s.res.trust >= TRUST_RIDERS ? 1.5 : 1;
  const guardPower = s.jobs.guard * 3 * tool * riders;
  const dragonPower = dr && dr.stage >= 2
    ? dr.level * (dr.stage >= 3 ? 2 : 0.5) * (1 + 0.2 * rank(s, 'thickHide')) * (element === 'fire' ? 1.25 : 1) * elder
    : 0;
  const rallyPower = 0.5 * tool;
  const offlineCap = 3600 * (1 + (b.tent ? 1 : 0) + b.hall);

  return {
    content, morale, elder, tool, sparks, tapMult, jobMult, foodMult, smeltMult, cap, housing,
    drain, warmthDrain, xpRate, bondRate, trustRate, clueMult, riders, guardPower, dragonPower,
    rallyPower, offlineCap,
  };
}

// ---------- jobs ----------

export function jobUnlocked(s, job) {
  if (s.buildings.farm < 1) return false;
  const need = JOBS[job].needs;
  if (!need) return true;
  if (need === 'spear') return s.upgrades.spear > 0;
  if (need === 'keeper') return !!s.dragon && s.res.trust >= TRUST_KEEPER;
  return s.buildings[need] > 0;
}

export function jobCap(s, job) {
  const b = s.buildings;
  switch (job) {
    case 'farmer': return 2 * b.farm;
    case 'smith': return b.blacksmith ? 2 : 0;
    case 'guard': return b.barracks ? 3 + 2 * s.upgrades.training : 0;
    case 'fisher': return 3 * b.dock;
    case 'keeper': return 2 + b.den;
    default: return Infinity;
  }
}

export function assign(s, job, delta) {
  if (!jobUnlocked(s, job)) return false;
  if (delta > 0) {
    if (idle(s) < 1 || s.jobs[job] >= jobCap(s, job)) return false;
    s.jobs[job]++;
    return true;
  }
  if (s.jobs[job] < 1) return false;
  s.jobs[job]--;
  return true;
}

// Net resource change per second, plus the smelting parts so the tick can
// limit smelting by the ore on hand.
export function rates(s, d = derive(s)) {
  const net = Object.fromEntries(Object.keys(RESOURCES).map((k) => [k, 0]));
  const b = s.buildings;
  for (const [job, n] of Object.entries(s.jobs)) {
    if (!n || job === 'smith') continue;
    for (const [res, v] of Object.entries(JOBS[job].makes)) {
      net[res] += n * v * d.jobMult * (res === 'food' ? d.foodMult : 1);
    }
  }
  const passive = d.foodMult * d.morale * d.elder;
  net.food += (0.5 * b.farm + 0.3 * b.dock) * passive;
  net.food -= FOOD_UPKEEP * s.pop;

  const smelt = s.jobs.smith * d.jobMult * d.smeltMult;
  const smeltIron = smelt * JOBS.smith.makes.iron;
  const smeltOre = smelt * JOBS.smith.eats.ore;
  net.iron += smeltIron;
  net.ore -= smeltOre;

  net.bond += d.bondRate;
  net.trust += d.trustRate;
  return { net, smeltIron, smeltOre };
}

// ---------- the clock ----------

export function tick(s, dt, rng = Math.random, offline = false) {
  s.time += dt;
  const d = derive(s);
  const { net, smeltIron, smeltOre } = rates(s, d);

  // Everything but smelting first, then smelt what ore there is.
  for (const k of Object.keys(net)) {
    if (k === 'iron') continue;
    const smeltPart = k === 'ore' ? -smeltOre : 0;
    s.res[k] += (net[k] - smeltPart) * dt;
  }
  if (smeltOre > 0) {
    const want = smeltOre * dt;
    const frac = Math.min(1, Math.max(0, s.res.ore) / want);
    s.res.ore -= want * frac;
    s.res.iron += smeltIron * dt * frac;
    if (s.dragon && s.dragon.stage >= 1) s.res.trust += 0.05 * smeltIron * dt * frac; // the village sees the forge fire
  }

  if (s.res.food <= 0) {
    if (!s.starving && !offline) toast(s, 'The stores are empty. Hungry villagers work at half pace.');
    s.res.food = 0;
    s.starving = true;
  } else if (s.res.food > 2) {
    s.starving = false;
  }
  clampToCaps(s, d.cap);

  // Survivors trickle home while there is food and room.
  if (s.buildings.farm > 0 && !s.starving && s.pop < d.housing) {
    s.survivorTimer += dt;
    while (s.survivorTimer >= SURVIVOR_INTERVAL && s.pop < d.housing) {
      s.survivorTimer -= SURVIVOR_INTERVAL;
      s.pop++;
      if (!offline) toast(s, 'A survivor walks in from the hills. Give them a job.');
    }
  } else {
    s.survivorTimer = 0;
  }

  // Scavengers raid the stockpile until the Night Watch is posted.
  if (s.buildings.farm > 0 && !s.buildings.barracks && !offline) {
    s.scavengerTimer -= dt;
    if (s.scavengerTimer <= 0) {
      s.scavengerTimer = 80 + rng() * 60;
      const lost = {};
      for (const k of ['wood', 'stone', 'food']) {
        lost[k] = Math.floor(s.res[k] * 0.08);
        s.res[k] -= lost[k];
      }
      toast(s, `Scavengers slipped into the stockpile at night: -${lost.wood} wood, -${lost.stone} stone, -${lost.food} food. The Barracks would stop them.`);
    }
  }

  if (s.dragon) tickDragon(s, dt, d, offline);

  if (s.act >= 2 && s.dragon && !offline) {
    const r = s.raid;
    r.next -= dt;
    if (!r.warning && r.next <= RAID_WARNING) {
      r.warning = true;
      toast(s, 'Troll riders on the horizon! Rally the guards.');
    }
    if (r.next <= 0) resolveRaid(s, rng);
  }

  s.cooldowns.scout = Math.max(0, s.cooldowns.scout - dt);
  s.cooldowns.island = Math.max(0, s.cooldowns.island - dt);
}

function clampToCaps(s, cap) {
  for (const [k, def] of Object.entries(RESOURCES)) {
    if (s.res[k] < 0) s.res[k] = 0;
    if (def.capped && s.res[k] > cap) s.res[k] = cap;
  }
}

function tickDragon(s, dt, d, offline) {
  const dr = s.dragon;
  const sleep = offline ? 0.25 : 1; // offline, the dragon sleeps
  dr.hunger = Math.max(0, dr.hunger - NEED_DRAIN.hunger * d.drain * sleep * dt);
  dr.warmth = Math.max(0, dr.warmth - NEED_DRAIN.warmth * d.warmthDrain * sleep * dt);
  dr.affection = Math.max(0, dr.affection - NEED_DRAIN.affection * d.drain * sleep * dt);

  // Dragon Keepers feed and stoke the hearth automatically.
  const keepers = s.jobs.keeper;
  if (keepers > 0) {
    s.keeperBudget = Math.min(keepers, s.keeperBudget + (keepers * dt) / KEEPER_INTERVAL);
    while (s.keeperBudget >= 1) {
      let acted = false;
      if (dr.hunger < 70) acted = feed(s, cheapestFeed(s), true);
      if (!acted && dr.warmth < 70) acted = stoke(s, true);
      if (!acted) break;
      s.keeperBudget -= 1;
    }
  }

  addXp(s, d.xpRate * dt * (offline ? 1.5 : 1), offline);
}

function cheapestFeed(s) {
  // Keepers prefer whatever the chief has been feeding, if affordable.
  const dr = s.dragon;
  const order = Object.keys(FEEDS).sort((a, b) => (dr.diet[FEEDS[b].element] || 0) - (dr.diet[FEEDS[a].element] || 0));
  return order.find((k) => canAfford(s, feedCost(s, k))) || 'fish';
}

export function addXp(s, amount, quiet = false) {
  const dr = s.dragon;
  if (!dr) return;
  const cap = levelCap(dr);
  dr.xp += amount;
  while (dr.level < cap && dr.xp >= xpFor(dr.level)) {
    dr.xp -= xpFor(dr.level);
    dr.level++;
    if (!quiet && dr.level === cap && dr.stage < DRAGON_STAGES.length - 1) {
      toast(s, `${dr.name} is ready to evolve!`);
    }
  }
  if (dr.level >= cap) dr.xp = Math.min(dr.xp, xpFor(dr.level));
}

// ---------- manual gathering ----------

export function gatherAvailable(s, key) {
  const need = GATHER[key].needs;
  if (!need) return true;
  if (need === 'spear') return s.upgrades.spear > 0;
  return !!s.areas[need];
}

export function gather(s, key, rng = Math.random) {
  if (!gatherAvailable(s, key)) return null;
  const g = GATHER[key];
  const d = derive(s);
  let chance = g.chance;
  if (key === 'mine' && s.areas.oldmine) chance = Math.min(1, chance * 2);
  const hit = rng() < chance;
  const gained = {};
  if (hit) {
    for (const [k, v] of Object.entries(g.gives)) {
      let amt = k === 'crystal' ? v : v * d.tapMult;
      if (k === 'food') amt *= d.foodMult;
      if (key === 'fish' && s.areas.lake) amt *= 3;
      gained[k] = amt;
      s.res[k] += amt;
    }
    clampToCaps(s, d.cap);
  }
  s.stats.taps++;
  s.tapsSinceClue++;

  let clue = null;
  const next = nextClue(s, 1);
  if (next) {
    const p = (0.01 + 0.0008 * s.tapsSinceClue) * d.clueMult;
    if (rng() < p) clue = findClue(s, next);
  }
  return { hit, gained, clue };
}

function nextClue(s, act) {
  return CLUES.find((c) => (c.act || 1) === act && !s.clues.includes(c.id)) || null;
}

function findClue(s, clue) {
  s.clues.push(clue.id);
  s.tapsSinceClue = 0;
  emit(s, { type: 'clue', clue });
  return clue;
}

// ---------- building ----------

export function buildingUnlocked(s, key) {
  const def = BUILDINGS[key];
  const b = s.buildings;
  if (def.act && s.act < def.act) return false;
  switch (key) {
    case 'farm': return true;
    case 'hut': return b.farm > 0;
    case 'blacksmith': return b.farm > 0;
    case 'barracks': return b.blacksmith > 0;
    case 'tent': return b.barracks > 0;
    default: return true;
  }
}

export function buildingCost(s, key) {
  return costOf(BUILDINGS[key].base, s.buildings[key]);
}

export function canBuild(s, key) {
  const def = BUILDINGS[key];
  if (!buildingUnlocked(s, key)) return false;
  if (!def.repeat && s.buildings[key] > 0) return false;
  return canAfford(s, buildingCost(s, key));
}

export function build(s, key) {
  if (!canBuild(s, key)) return false;
  pay(s, buildingCost(s, key));
  s.buildings[key]++;

  const returning = s.buildings[key] === 1 && SURVIVOR_LINES[key];
  if (returning) {
    s.pop += returning.count;
    for (const [who, line] of returning.lines) s.testimonies.push({ who, line });
    emit(s, { type: 'survivors', building: key, count: returning.count, lines: returning.lines });
  }
  if (key === 'barracks') {
    // The returning guards take their posts and post the Night Watch.
    s.jobs.guard = Math.min(3, idle(s));
  }
  if (key === 'tent') startAct2(s);
  return true;
}

function startAct2(s) {
  s.act = 2;
  s.dragon = {
    name: 'Cinder', stage: 0, level: 1, xp: 0,
    hunger: 60, warmth: 60, affection: 90,
    element: null, diet: { fire: 0, frost: 0, storm: 0 },
  };
  s.raid.next = 300;
  emit(s, { type: 'story', pages: STORY.finale });
}

export function upgradeUnlocked(s, key) {
  return s.buildings[UPGRADES[key].at] > 0;
}

export function upgradeCost(s, key) {
  return costOf(UPGRADES[key].base, s.upgrades[key]);
}

export function canUpgrade(s, key) {
  if (!upgradeUnlocked(s, key)) return false;
  if (!UPGRADES[key].repeat && s.upgrades[key] > 0) return false;
  return canAfford(s, upgradeCost(s, key));
}

export function buyUpgrade(s, key) {
  if (!canUpgrade(s, key)) return false;
  pay(s, upgradeCost(s, key));
  s.upgrades[key]++;
  return true;
}

export const SMELT = { ore: 5, iron: 1 };

export function smelt(s) {
  if (!s.buildings.blacksmith || s.res.ore < SMELT.ore) return false;
  const d = derive(s);
  s.res.ore -= SMELT.ore;
  s.res.iron = Math.min(d.cap, s.res.iron + SMELT.iron * (d.smeltMult > 1 ? 2 : 1));
  return true;
}

// ---------- the dragon ----------

export function feed(s, kind, byKeeper = false) {
  const dr = s.dragon;
  if (!dr || !FEEDS[kind] || dr.hunger >= 98) return false;
  const cost = feedCost(s, kind);
  if (!pay(s, cost)) return false;
  dr.hunger = Math.min(100, dr.hunger + FEEDS[kind].hunger);
  if (dr.stage < 2) dr.diet[FEEDS[kind].element]++;
  if (!byKeeper) addXp(s, 2);
  return true;
}

export function stoke(s, byKeeper = false) {
  const dr = s.dragon;
  if (!dr || dr.warmth >= 98) return false;
  if (!pay(s, stokeCost(s))) return false;
  dr.warmth = Math.min(100, dr.warmth + STOKE.warmth);
  if (!byKeeper) addXp(s, 2);
  return true;
}

export function pet(s) {
  const dr = s.dragon;
  if (!dr) return null;
  const palm = 1 + 0.5 * rank(s, 'glowingPalm');
  const d = derive(s);
  const affection = 3 * palm;
  const bond = 0.1 * palm * (1 + 0.1 * rank(s, 'runeSight')) * d.elder;
  dr.affection = Math.min(100, dr.affection + affection);
  s.res.bond += bond;
  s.stats.pets++;
  addXp(s, 1);
  return { affection, bond };
}

export function leaning(dr) {
  const entries = Object.entries(dr.diet);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (!total) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

export function evolveCost(s) {
  const dr = s.dragon;
  if (!dr || dr.stage >= DRAGON_STAGES.length - 1) return null;
  return DRAGON_STAGES[dr.stage + 1].cost;
}

export function canEvolve(s) {
  const dr = s.dragon;
  const cost = evolveCost(s);
  return !!cost && dr.level >= DRAGON_STAGES[dr.stage + 1].level && canAfford(s, cost);
}

export function evolve(s) {
  if (!canEvolve(s)) return false;
  const dr = s.dragon;
  pay(s, evolveCost(s));
  dr.stage++;
  s.res.trust += 5;
  if (dr.stage === 2) dr.element = leaning(dr) || 'fire';
  emit(s, { type: 'evolve', stage: dr.stage, element: dr.element });
  return true;
}

export function canScout(s) {
  const dr = s.dragon;
  return !!dr && dr.stage >= 2 && s.cooldowns.scout <= 0 && contentment(dr) >= 0.25;
}

export function scout(s, rng = Math.random) {
  if (!canScout(s)) return null;
  const dr = s.dragon;
  const d = derive(s);
  s.cooldowns.scout = SCOUT_COOLDOWN * (dr.element === 'storm' ? 0.7 : 1);
  const result = { gained: {}, area: null, clue: null };
  if (s.scouts < SCOUT_AREAS.length) {
    const area = SCOUT_AREAS[s.scouts];
    s.areas[area.id] = true;
    result.area = area;
  }
  s.scouts++;
  for (const k of ['wood', 'stone', 'ore']) {
    result.gained[k] = Math.round((8 + rng() * 12) * dr.level * (k === 'ore' ? 0.3 : 1));
  }
  if (s.scouts === 1 || rng() < 0.3) result.gained.crystal = 1;
  for (const [k, v] of Object.entries(result.gained)) s.res[k] += v;
  clampToCaps(s, d.cap);
  const next = nextClue(s, 2);
  if (next && rng() < 0.5 * d.clueMult) {
    s.clues.push(next.id);
    result.clue = next;
  }
  emit(s, { type: 'flight', kind: 'scout', ...result });
  return result;
}

export function canIsland(s) {
  const dr = s.dragon;
  return !!dr && dr.stage >= 3 && s.cooldowns.island <= 0 && contentment(dr) >= 0.25;
}

export function islandFlight(s, rng = Math.random) {
  if (!canIsland(s)) return null;
  const d = derive(s);
  s.cooldowns.island = ISLAND_COOLDOWN;
  s.islands++;
  const result = {
    gained: {
      crystal: 1 + Math.floor(rng() * 2),
      scrap: 4 + Math.floor(rng() * 5),
      hides: Math.round((10 + rng() * 15) * (1 + s.islands * 0.1)),
    },
    area: null,
    clue: null,
  };
  for (const [k, v] of Object.entries(result.gained)) s.res[k] += v;
  clampToCaps(s, d.cap);
  const next = nextClue(s, 2);
  if (next && rng() < 0.6 * d.clueMult) {
    s.clues.push(next.id);
    result.clue = next;
  }
  emit(s, { type: 'flight', kind: 'island', ...result });
  return result;
}

// ---------- raids ----------

export function raidPower(s) {
  // Threat grows with each raid the village wins, so a loss never snowballs.
  return 6 * Math.pow(1.18, s.raid.wins);
}

export function defense(s, d = derive(s)) {
  return d.guardPower + d.dragonPower + s.raid.rally * d.rallyPower;
}

export function rally(s) {
  if (!s.raid.warning || s.raid.rally >= 20) return false;
  s.raid.rally++;
  return true;
}

function resolveRaid(s, rng) {
  const r = s.raid;
  const d = derive(s);
  const power = raidPower(s);
  const def = defense(s, d);
  const result = { power, defense: def, won: def >= power, gained: {}, lost: {} };
  if (result.won) {
    result.gained.scrap = Math.round(3 + power / 3);
    result.gained.trust = 3;
    s.res.scrap += result.gained.scrap;
    s.res.trust += result.gained.trust;
    r.wins++;
  } else {
    const share = s.buildings.barracks ? 0.06 : 0.12;
    for (const k of ['wood', 'stone', 'food', 'ore', 'iron', 'hides']) {
      result.lost[k] = Math.floor(s.res[k] * share);
      s.res[k] -= result.lost[k];
    }
    if (s.dragon) s.dragon.affection = Math.max(0, s.dragon.affection - 20);
    r.losses++;
  }
  r.count++;
  r.next = 180 + rng() * 120;
  r.warning = false;
  r.rally = 0;
  emit(s, { type: 'raid', ...result });
}

// ---------- Bond skills ----------

export function findSkill(node) {
  for (const [branch, def] of Object.entries(SKILLS)) {
    if (def.nodes[node]) return { branch, def: def.nodes[node] };
  }
  return null;
}

export function skillCost(s, node) {
  const { def } = findSkill(node);
  return Math.ceil(def.base * Math.pow(SKILL_GROWTH, rank(s, node)));
}

export function skillUnlocked(s, node) {
  const { def } = findSkill(node);
  return !def.req || rank(s, def.req[0]) >= def.req[1];
}

export function canBuySkill(s, node) {
  const found = findSkill(node);
  if (!found || !s.dragon) return false;
  return skillUnlocked(s, node) && rank(s, node) < found.def.max && s.res.bond >= skillCost(s, node);
}

export function buySkill(s, node) {
  if (!canBuySkill(s, node)) return false;
  s.res.bond -= skillCost(s, node);
  s.skills[node] = rank(s, node) + 1;
  if (node === 'collarLore') {
    emit(s, {
      type: 'story',
      pages: [{
        title: 'The runes give way',
        body: `You hold the broken collar and your palm glows. The crawling runes slow, and for a moment you can read them: <i>bind, obey, forget</i>. With more strength you could undo them — on a collar still locked around a dragon’s neck.<br><br><b>The story continues in Act 3.</b>`,
      }],
    });
  }
  return true;
}

// ---------- offline ----------

export function applyOffline(s, seconds, rng = Math.random) {
  const d = derive(s);
  const total = Math.min(seconds, d.offlineCap);
  if (total < 10) return null;
  const before = { ...s.res, level: s.dragon?.level ?? 0, pop: s.pop };
  const steps = Math.min(2000, Math.ceil(total));
  const dt = total / steps;
  for (let i = 0; i < steps; i++) tick(s, dt, rng, true);
  const gained = {};
  for (const k of Object.keys(RESOURCES)) {
    const diff = s.res[k] - before[k];
    if (Math.abs(diff) >= 1) gained[k] = diff;
  }
  return {
    seconds: total,
    capped: seconds > d.offlineCap,
    gained,
    levels: (s.dragon?.level ?? 0) - before.level,
    survivors: s.pop - before.pop,
  };
}

// ---------- save / load ----------

export function serialize(s) {
  const { events, ...rest } = s;
  return JSON.stringify({ ...rest, savedAt: Date.now() });
}

export function deserialize(json) {
  const base = newState();
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return base;
  }
  if (!data || typeof data !== 'object') return base;
  const merged = mergeDeep(base, data);
  merged.events = [];
  return merged;
}

function mergeDeep(base, data) {
  if (Array.isArray(base) || base === null || typeof base !== 'object') return data ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = mergeDeep(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export { ELEMENTS };
