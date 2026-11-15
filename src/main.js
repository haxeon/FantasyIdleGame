import * as E from './engine.js';
import {
  RESOURCES, GATHER, BUILDINGS, UPGRADES, JOBS, DRAGON_STAGES, FEEDS, ELEMENTS, SKILLS,
  CLUES, STORY, TRUST_KEEPER, TRUST_RIDERS,
} from './data.js';
import { dragonSVG } from './dragonArt.js';

const SAVE_KEY = 'dragonchief.save.v1';
const TICK_MS = 100;

// ---------- formatting ----------

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
function fmt(n) {
  if (!isFinite(n)) return '∞';
  const neg = n < 0;
  n = Math.abs(n);
  let out;
  if (n < 1000) out = String(Math.floor(n));
  else {
    const i = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3));
    const v = n / Math.pow(1000, i);
    out = (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)) + SUFFIX[i];
  }
  return (neg ? '-' : '') + out;
}
function fmtRate(n) {
  if (Math.abs(n) < 0.005) return '';
  const a = Math.abs(n);
  const v = a < 10 ? a.toFixed(2).replace(/\.?0+$/, '') : fmt(a);
  return `${n < 0 ? '−' : '+'}${v}/s`;
}
function fmtAmt(n) {
  return n < 10 && n % 1 ? n.toFixed(1) : fmt(n);
}
function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function pct(x) {
  return `${Math.round(x * 100)}%`;
}
function esc(t) {
  return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------- state ----------

let s = load();
let tab = 'gather';

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return E.deserialize(raw);
  } catch { /* storage blocked */ }
  return E.newState();
}
function save() {
  try {
    localStorage.setItem(SAVE_KEY, E.serialize(s));
    s.savedAt = Date.now();
  } catch { /* storage blocked */ }
}

// ---------- tiny binding system ----------
// Regions render HTML once per "structure" change and then update text,
// widths, classes and enabled state in place every frame.

class Region {
  constructor(el) {
    this.el = el;
    this.fns = [];
    this.binds = [];
    this.key = null;
  }
  b(fn) { this.fns.push(fn); return `<span data-b="${this.fns.length - 1}"></span>`; }
  h(fn) { this.fns.push(fn); return `data-h="${this.fns.length - 1}"`; }
  w(fn) { this.fns.push(fn); return `data-w="${this.fns.length - 1}"`; }
  en(fn) { this.fns.push(fn); return `data-en="${this.fns.length - 1}"`; }
  cls(fn) { this.fns.push(fn); return `data-cls="${this.fns.length - 1}"`; }
  render(key, build) {
    if (key === this.key) return;
    this.key = key;
    this.fns = [];
    this.el.innerHTML = build(this);
    this.binds = [];
    for (const kind of ['b', 'h', 'w', 'en', 'cls']) {
      this.el.querySelectorAll(`[data-${kind}]`).forEach((el) => {
        this.binds.push({ el, kind, fn: this.fns[+el.dataset[kind]], last: undefined });
      });
    }
    this.update();
  }
  update() {
    for (const bd of this.binds) {
      const v = bd.fn();
      if (v === bd.last) continue;
      bd.last = v;
      if (bd.kind === 'b') bd.el.textContent = v;
      else if (bd.kind === 'h') bd.el.innerHTML = v;
      else if (bd.kind === 'w') bd.el.style.width = `${Math.max(0, Math.min(100, v * 100))}%`;
      else if (bd.kind === 'en') bd.el.disabled = !v;
      else if (bd.kind === 'cls') bd.el.className = v;
    }
  }
}

const hud = new Region(document.getElementById('hud'));
const banner = new Region(document.getElementById('banner'));
const main = new Region(document.getElementById('main'));
const nav = new Region(document.getElementById('nav'));

// ---------- shared bits ----------

function shown(k) {
  const b = s.buildings;
  switch (k) {
    case 'iron': return b.blacksmith > 0 || s.res.iron > 0;
    case 'hides': return s.upgrades.spear > 0 || s.res.hides > 0 || b.barracks > 0;
    case 'scrap': case 'bond': case 'trust': return s.act >= 2;
    case 'crystal': return s.act >= 2 && (s.areas.caves || s.res.crystal > 0 || (s.dragon?.stage ?? 0) >= 2);
    default: return true;
  }
}

function costHTML(r, cost) {
  return Object.entries(cost).map(([k, v]) =>
    `<span ${r.cls(() => (s.res[k] >= v ? 'cost' : 'cost short'))}>${RESOURCES[k].icon} ${fmt(v)}</span>`).join('');
}

function costProgress(cost) {
  const parts = Object.entries(cost).map(([k, v]) => Math.min(1, s.res[k] / v));
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function nextStep() {
  return ['farm', 'blacksmith', 'barracks', 'tent'].find((k) => !s.buildings[k]);
}

// ---------- HUD ----------

function renderHud() {
  const keys = Object.keys(RESOURCES).filter(shown);
  const key = JSON.stringify([keys, s.act, !!s.buildings.tent, s.buildings.hall]);
  hud.render(key, (r) => {
    const d = () => E.derive(s);
    const chips = keys.map((k) => {
      const def = RESOURCES[k];
      return `<div class="chip" title="${def.name}">
        <span class="ic">${def.icon}</span>
        <span class="amt">${r.b(() => fmt(s.res[k]))}</span>
        <span ${r.cls(() => {
          const v = E.rates(s).net[k];
          return v < -0.004 ? 'rate neg' : 'rate';
        })}>${r.b(() => fmtRate(E.rates(s).net[k]))}</span>
        ${def.capped ? `<span class="cap"><i ${r.w(() => s.res[k] / d().cap)}></i></span>` : ''}
      </div>`;
    }).join('');
    return `<div class="hud-top">
        <div class="title"><span class="act">${s.act === 1 ? 'Act 1 · The Ashes' : 'Act 2 · The Bond'}</span></div>
        <div class="pop" title="Villagers">👥 ${r.b(() => `${s.pop}`)} <small>${r.b(() => (E.idle(s) > 0 ? `${E.idle(s)} idle` : ''))}</small></div>
      </div>
      <div class="chips">${chips}</div>
      <div class="capline">${r.b(() => `Storage ${fmt(d().cap)}`)}${r.b(() => (s.starving ? ' · ⚠ Starving: workers at half pace' : ''))}</div>`;
  });
  hud.update();
}

// ---------- raid banner ----------

function renderBanner() {
  const active = s.act >= 2 && !!s.dragon;
  const key = JSON.stringify([active, s.raid.warning]);
  banner.render(key, (r) => {
    if (!active) return '';
    if (!s.raid.warning) {
      return `<div class="raid calm"><span>🛡️ Next troll raid in <b>${r.b(() => fmtTime(s.raid.next))}</b></span>
        <small>${r.b(() => `defense ${fmt(E.defense(s))} vs ~${fmt(E.raidPower(s))}`)}</small></div>`;
    }
    return `<div class="raid alarm">
      <div><b>⚠ Troll riders arrive in ${r.b(() => fmtTime(s.raid.next))}</b><br>
      <small>Their power ${r.b(() => fmt(E.raidPower(s)))} · your defense <span ${r.cls(() => (E.defense(s) >= E.raidPower(s) ? 'good' : 'bad'))}>${r.b(() => fmt(E.defense(s)))}</span></small></div>
      <button class="btn danger" data-act="rally" ${r.en(() => s.raid.rally < 20)}>Rally! ${r.b(() => `${s.raid.rally}/20`)}</button>
    </div>`;
  });
  banner.update();
}

// ---------- tabs ----------

const TABS = [
  { id: 'gather', icon: '🪓', name: 'Gather' },
  { id: 'build', icon: '🏚️', name: 'Village' },
  { id: 'jobs', icon: '👥', name: 'Jobs', needs: () => s.buildings.farm > 0 },
  { id: 'dragon', icon: '🐉', name: 'Dragon', needs: () => !!s.dragon },
  { id: 'bond', icon: '✨', name: 'Bond', needs: () => !!s.dragon },
  { id: 'lore', icon: '📜', name: 'Lore' },
];

function renderNav() {
  const open = TABS.filter((t) => !t.needs || t.needs());
  const key = JSON.stringify([tab, open.map((t) => t.id)]);
  nav.render(key, (r) => open.map((t) => `<button class="tab ${t.id === tab ? 'on' : ''}" data-act="tab" data-arg="${t.id}">
      <span class="ti">${t.icon}</span><span class="tn">${t.name}</span>
      ${t.id === 'jobs' ? `<i ${r.cls(() => (E.idle(s) > 0 ? 'dot' : 'dot hide'))}></i>` : ''}
      ${t.id === 'dragon' ? `<i ${r.cls(() => (s.dragon && (E.canEvolve(s) || E.contentment(s.dragon) < 0.4) ? 'dot' : 'dot hide'))}></i>` : ''}
    </button>`).join(''));
  nav.update();
}

function structureKey() {
  const dr = s.dragon;
  return JSON.stringify([
    tab, s.act, s.buildings, s.upgrades, s.areas, s.skills,
    Object.keys(JOBS).filter((j) => E.jobUnlocked(s, j)),
    dr && [dr.stage, dr.element, dr.name, dr.level >= E.levelCap(dr)],
    s.clues.length, s.testimonies.length, s.scouts > 0, s.res.trust >= TRUST_KEEPER, s.res.trust >= TRUST_RIDERS,
  ]);
}

function renderMain() {
  main.render(structureKey(), (r) => {
    switch (tab) {
      case 'gather': return gatherTab(r);
      case 'build': return buildTab(r);
      case 'jobs': return jobsTab(r);
      case 'dragon': return s.dragon ? dragonTab(r) : '';
      case 'bond': return s.dragon ? bondTab(r) : '';
      case 'lore': return loreTab(r);
      default: return '';
    }
  });
  main.update();
}

// ---------- Gather ----------

function objectiveCard(r) {
  const step = nextStep();
  if (step) {
    const def = BUILDINGS[step];
    const cost = E.buildingCost(s, step);
    return `<div class="card objective">
      <div class="eyebrow">Rebuild · step ${def.step} of 4</div>
      <div class="row"><div class="big-ic">${def.icon}</div><div class="grow">
        <h3>${def.name}</h3><p>${def.desc}</p>
        <div class="costs">${costHTML(r, cost)}</div>
        <div class="bar"><i ${r.w(() => costProgress(cost))}></i></div>
      </div></div>
      <button class="btn primary wide" data-act="build" data-arg="${step}" ${r.en(() => E.canBuild(s, step))}>Build</button>
    </div>`;
  }
  const dr = s.dragon;
  if (dr && dr.stage < DRAGON_STAGES.length - 1) {
    const next = DRAGON_STAGES[dr.stage + 1];
    return `<div class="card objective">
      <div class="eyebrow">Raise ${esc(dr.name)}</div>
      <h3>Evolve into a ${next.name}</h3>
      <p>Reach level ${next.level}${Object.keys(next.cost).length ? ' and gather ' : ''}${Object.entries(next.cost).map(([k, v]) => `${fmt(v)} ${RESOURCES[k].name.toLowerCase()}`).join(', ')}. ${next.gives}</p>
      <div class="bar"><i ${r.w(() => Math.min(1, dr.level / next.level))}></i></div>
      <button class="btn wide" data-act="tab" data-arg="dragon">Go to the dragon</button>
    </div>`;
  }
  return '';
}

function gatherTab(r) {
  const tiles = Object.entries(GATHER).filter(([k]) => E.gatherAvailable(s, k)).map(([k, g]) => {
    const yields = Object.entries(g.gives).map(([res, v]) => `${RESOURCES[res].icon}${r.b(() => {
      const d = E.derive(s);
      let amt = res === 'crystal' ? v : v * d.tapMult * (res === 'food' ? d.foodMult : 1);
      if (k === 'fish' && s.areas.lake) amt *= 3;
      return '+' + fmtAmt(amt);
    })}`).join(' ');
    let chance = g.chance;
    if (k === 'mine' && s.areas.oldmine) chance *= 2;
    return `<button class="tile" data-act="gather" data-arg="${k}">
      <span class="tile-ic">${g.icon}</span>
      <span class="tile-name">${g.name}</span>
      <span class="tile-yield">${yields}</span>
      ${chance < 1 ? `<span class="tile-note">${Math.round(chance * 100)}% per tap</span>` : ''}
    </button>`;
  }).join('');
  const smeltTile = s.buildings.blacksmith
    ? `<button class="tile forge" data-act="smelt" ${r.en(() => s.res.ore >= E.SMELT.ore)}>
        <span class="tile-ic">🔥</span><span class="tile-name">Smelt</span>
        <span class="tile-yield">⛏️5 → 🔩${r.b(() => (E.derive(s).smeltMult > 1 ? 2 : 1))}</span>
      </button>`
    : '';
  const status = s.buildings.farm && !s.buildings.barracks
    ? `<p class="hint">🦝 Scavengers creep into the stockpile at night. Next visit in about <b>${r.b(() => fmtTime(s.scavengerTimer))}</b>.</p>`
    : '';
  const intro = s.stats.taps < 5 && s.act === 1
    ? '<p class="hint">Tap to gather by hand. Every task starts with you; survivors will take over as the village recovers. Sometimes your hands find <b>Clues</b>.</p>'
    : '';
  return `${objectiveCard(r)}${intro}<div class="tiles">${tiles}${smeltTile}</div>${status}
    <p class="hint small">🔎 Clues found: ${s.clues.length} / ${CLUES.length}</p>`;
}

// ---------- Village ----------

function buildCard(r, k) {
  const def = BUILDINGS[k];
  const n = s.buildings[k];
  const done = !def.repeat && n > 0;
  const unlocked = E.buildingUnlocked(s, k);
  if (done) {
    return `<div class="card built"><div class="row"><div class="big-ic">${def.icon}</div><div class="grow">
      <h3>${def.name} <span class="tag ok">Built</span></h3><p>${def.desc}</p></div></div></div>`;
  }
  if (!unlocked) {
    return `<div class="card locked"><div class="row"><div class="big-ic">🔒</div><div class="grow">
      <h3>${def.name}</h3><p>Rebuild the earlier step first.</p></div></div></div>`;
  }
  const cost = E.buildingCost(s, k);
  return `<div class="card"><div class="row"><div class="big-ic">${def.icon}</div><div class="grow">
      <h3>${def.name}${def.repeat && n ? ` <span class="tag">x${n}</span>` : ''}</h3><p>${def.desc}</p>
      <div class="costs">${costHTML(r, cost)}</div></div>
      <button class="btn primary" data-act="build" data-arg="${k}" ${r.en(() => E.canBuild(s, k))}>Build</button>
    </div></div>`;
}

function upgradeCard(r, k) {
  const def = UPGRADES[k];
  const n = s.upgrades[k];
  if (!def.repeat && n) {
    return `<div class="card built"><div class="row"><div class="big-ic">${def.icon}</div><div class="grow">
      <h3>${def.name} <span class="tag ok">Made</span></h3><p>${def.desc}</p></div></div></div>`;
  }
  const cost = E.upgradeCost(s, k);
  return `<div class="card"><div class="row"><div class="big-ic">${def.icon}</div><div class="grow">
      <h3>${def.name}${def.repeat && n ? ` <span class="tag">Lv ${n}</span>` : ''}</h3><p>${def.desc}</p>
      <div class="costs">${costHTML(r, cost)}</div></div>
      <button class="btn" data-act="upgrade" data-arg="${k}" ${r.en(() => E.canUpgrade(s, k))}>${def.repeat ? 'Upgrade' : 'Craft'}</button>
    </div></div>`;
}

function buildTab(r) {
  const order = s.act === 1
    ? ['farm', 'blacksmith', 'barracks', 'tent', 'hut']
    : ['dock', 'den', 'hall', 'farm', 'hut', 'blacksmith', 'barracks', 'tent'];
  const shownB = order.filter((k) => {
    const def = BUILDINGS[k];
    if (def.act && s.act < def.act) return false;
    if (k === 'hut') return s.buildings.farm > 0;
    return true;
  });
  const ups = Object.keys(UPGRADES).filter((k) => E.upgradeUnlocked(s, k));
  const d = E.derive(s);
  return `<h2>Village</h2>
    <p class="hint small">Housing ${s.pop} / ${d.housing} · Storage ${fmt(d.cap)} each · Offline earnings up to ${fmtTime(d.offlineCap)}</p>
    ${shownB.map((k) => buildCard(r, k)).join('')}
    ${ups.length ? `<h2>Forge &amp; Barracks</h2>${ups.map((k) => upgradeCard(r, k)).join('')}` : ''}`;
}

// ---------- Jobs ----------

function jobsTab(r) {
  const jobs = Object.keys(JOBS).filter((j) => E.jobUnlocked(s, j));
  const rows = jobs.map((j) => {
    const def = JOBS[j];
    const cap = E.jobCap(s, j);
    const makes = Object.entries(def.makes).map(([res, v]) => `${RESOURCES[res].icon}${r.b(() => {
      const d = E.derive(s);
      let amt = v * d.jobMult * (res === 'food' ? d.foodMult : 1) * (j === 'smith' ? d.smeltMult : 1);
      return `+${amt.toFixed(2)}`;
    })}`).join(' ');
    const eats = def.eats ? Object.entries(def.eats).map(([res, v]) => ` ${RESOURCES[res].icon}−${r.b(() => (v * E.derive(s).jobMult * E.derive(s).smeltMult).toFixed(2))}`).join('') : '';
    return `<div class="job">
      <div class="job-ic">${def.icon}</div>
      <div class="grow"><b>${def.name}</b><small>${makes}${eats}${makes || eats ? ' each/s' : ''}${def.capNote ? ` · ${def.capNote}` : ''}</small></div>
      <button class="btn round" data-act="job" data-arg="${j}" data-d="-1" ${r.en(() => s.jobs[j] > 0)}>−</button>
      <span class="job-n">${r.b(() => `${s.jobs[j]}${cap !== Infinity ? `/${cap}` : ''}`)}</span>
      <button class="btn round" data-act="job" data-arg="${j}" data-d="1" ${r.en(() => E.idle(s) > 0 && s.jobs[j] < cap)}>+</button>
    </div>`;
  }).join('');
  const lockedKeeper = s.dragon && !E.jobUnlocked(s, 'keeper')
    ? `<p class="hint small">🧺 Dragon Keepers unlock at ${TRUST_KEEPER} Trust (${r.b(() => fmt(s.res.trust))} now). Trust grows when the village sees the dragon helping.</p>`
    : '';
  return `<h2>Jobs</h2>
    <div class="card"><div class="stats">
      <div><b>${r.b(() => s.pop)}</b><small>villagers</small></div>
      <div><b>${r.b(() => E.idle(s))}</b><small>idle</small></div>
      <div><b>${r.b(() => E.derive(s).housing)}</b><small>housing</small></div>
      <div><b ${r.cls(() => (E.rates(s).net.food < 0 ? 'bad' : 'good'))}>${r.b(() => fmtRate(E.rates(s).net.food) || '0/s')}</b><small>food</small></div>
    </div>
    <p class="hint small">${r.b(() => survivorHint())}</p></div>
    ${rows}
    ${lockedKeeper}
    <p class="hint small">Each villager eats 0.1 food per second. If food runs out, everyone works at half pace and no one new comes home.</p>`;
}

function survivorHint() {
  const d = E.derive(s);
  if (s.pop >= d.housing) return 'No room for more survivors. Build huts.';
  if (s.starving) return 'Survivors won’t return to a starving village.';
  return `Next survivor returns in ${fmtTime(E.SURVIVOR_INTERVAL - s.survivorTimer)}.`;
}

// ---------- Dragon ----------

function needBar(r, key, label, icon) {
  return `<div class="need"><span>${icon} ${label}</span>
    <div class="bar ${key}"><i ${r.w(() => s.dragon[key] / 100)}></i></div>
    <span class="nv">${r.b(() => Math.round(s.dragon[key]))}</span></div>`;
}

function dragonTab(r) {
  const dr = s.dragon;
  const stage = DRAGON_STAGES[dr.stage];
  const next = DRAGON_STAGES[dr.stage + 1];
  const elementTag = dr.element ? `<span class="tag" style="background:${ELEMENTS[dr.element].color}">${ELEMENTS[dr.element].name}</span>` : '';
  const feeds = Object.entries(FEEDS).map(([k, f]) => `<button class="btn action" data-act="feed" data-arg="${k}" ${r.en(() => s.dragon.hunger < 98 && E.canAfford(s, E.feedCost(s, k)))}>
      <span>${f.icon} ${f.name}</span><span class="costs">${costHTML(r, E.feedCost(s, k))}</span></button>`).join('');
  const evolveCard = next
    ? `<div class="card"><div class="eyebrow">Next form</div><h3>${next.name}</h3><p>${next.gives}</p>
        <div class="costs"><span ${r.cls(() => (dr.level >= next.level ? 'cost' : 'cost short'))}>Lv ${next.level}</span>${costHTML(r, next.cost)}</div>
        <button class="btn primary wide" data-act="evolve" ${r.en(() => E.canEvolve(s))}>Evolve</button></div>`
    : '';
  const lean = dr.stage < 2
    ? `<p class="hint small">What ${esc(dr.name)} eats before the Juvenile stage decides its element: 🐟 fish → Frost, 🍖 roast → Fire, 🧂 ore-salted → Storm. ${r.b(() => {
      const l = E.leaning(s.dragon);
      return l ? `Leaning: ${ELEMENTS[l].name}.` : 'No leaning yet.';
    })}</p>`
    : '';
  const flights = dr.stage >= 2
    ? `<h2>Flights</h2>
      <div class="card"><div class="row"><div class="big-ic">🧭</div><div class="grow"><h3>Scouting flight</h3>
        <p>Reveals new gathering areas, Clues and supplies.</p></div>
        <button class="btn" data-act="scout" ${r.en(() => E.canScout(s))}>${r.b(() => (s.cooldowns.scout > 0 ? fmtTime(s.cooldowns.scout) : 'Fly'))}</button></div></div>
      ${dr.stage >= 3 ? `<div class="card"><div class="row"><div class="big-ic">🏝️</div><div class="grow"><h3>Ride to the islands</h3>
        <p>Raid troll camps for crystal, scrap and hides.</p></div>
        <button class="btn" data-act="island" ${r.en(() => E.canIsland(s))}>${r.b(() => (s.cooldowns.island > 0 ? fmtTime(s.cooldowns.island) : 'Ride'))}</button></div></div>` : ''}
      <p class="hint small">${r.b(() => (E.contentment(s.dragon) < 0.25 ? `${s.dragon.name} is too unhappy to fly.` : ''))}</p>`
    : '';
  return `<div class="dragon-stage">
      <div class="dragon-art" data-act="pet" ${r.h(() => {
        const c = E.contentment(s.dragon);
        const mood = c < 0.15 ? 0 : c < 0.3 ? 1 : 2;
        return dragonSVG(s.dragon.stage, s.dragon.element, [0.1, 0.2, 1][mood]);
      })}></div>
      <div class="dragon-name"><button class="link" data-act="rename">${esc(dr.name)} ✎</button> <span class="tag">${stage.name}</span> ${elementTag}</div>
      <div class="lvl">Level ${r.b(() => s.dragon.level)}<span class="muted">${r.b(() => (s.dragon.level >= E.levelCap(s.dragon) && next ? ' · ready to evolve' : ''))}</span></div>
      <div class="bar xp"><i ${r.w(() => s.dragon.xp / E.xpFor(s.dragon.level))}></i></div>
      <p class="hint small center">Tap ${esc(dr.name)} to pet. Only you can.</p>
    </div>
    <div class="card">
      ${needBar(r, 'hunger', 'Hunger', '🍖')}
      ${needBar(r, 'warmth', 'Warmth', '🔥')}
      ${needBar(r, 'affection', 'Affection', '💗')}
      <div class="content-row"><span>Contentment</span><b ${r.cls(() => (E.contentment(s.dragon) >= 0.5 ? 'good' : 'bad'))}>${r.b(() => pct(E.contentment(s.dragon)))}</b></div>
      <p class="hint small">${r.b(() => {
        const d = E.derive(s);
        return `Village morale +${pct(d.morale - 1)} · sparks +${pct(d.sparks - 1)} taps · ${fmtAmt(d.xpRate)} XP/s · ${d.bondRate.toFixed(3)} Bond/s`;
      })}</p>
    </div>
    <div class="actions">
      <button class="btn action pet" data-act="pet"><span>💗 Pet</span><span class="costs">free</span></button>
      ${feeds}
      <button class="btn action" data-act="stoke" ${r.en(() => s.dragon.warmth < 98 && E.canAfford(s, E.stokeCost(s)))}>
        <span>🔥 Stoke embers</span><span class="costs">${costHTML(r, E.stokeCost(s))}</span></button>
    </div>
    ${lean}
    ${evolveCard}
    ${flights}`;
}

// ---------- Bond ----------

function bondTab(r) {
  const branches = Object.entries(SKILLS).map(([, br]) => {
    const nodes = Object.entries(br.nodes).map(([k, n]) => {
      const rk = E.rank(s, k);
      const unlocked = E.skillUnlocked(s, k);
      const maxed = rk >= n.max;
      const reqName = n.req ? E.findSkill(n.req[0]).def.name : '';
      return `<div class="skill ${unlocked ? '' : 'locked'}">
        <div class="grow"><b>${n.name}</b> <span class="tag">${rk}/${n.max}</span><small>${n.desc}${!unlocked ? ` · needs ${reqName} ${n.req[1]}` : ''}</small></div>
        ${maxed ? '<span class="tag ok">Max</span>'
          : `<button class="btn" data-act="skill" data-arg="${k}" ${r.en(() => E.canBuySkill(s, k))}>✨ ${fmt(E.skillCost(s, k))}</button>`}
      </div>`;
    }).join('');
    return `<div class="card branch"><h3>${br.icon} ${br.name}</h3><p>${br.desc}</p>${nodes}</div>`;
  }).join('');
  return `<h2>Bond</h2>
    <div class="card"><div class="stats">
      <div><b>${r.b(() => fmt(s.res.bond))}</b><small>Bond</small></div>
      <div><b>${r.b(() => E.derive(s).bondRate.toFixed(3))}</b><small>per second</small></div>
      <div><b>${r.b(() => fmt(s.res.trust))}</b><small>Trust</small></div>
    </div>
    <p class="hint small">Bond is the chief’s own magic. It grows from ${esc(s.dragon.name)}’s Contentment and from petting.</p></div>
    ${branches}`;
}

// ---------- Lore ----------

function loreTab(r) {
  const clues = CLUES.map((c) => (s.clues.includes(c.id)
    ? `<div class="clue"><b>🔎 ${c.name}</b><p>${c.text}</p></div>`
    : `<div class="clue unknown"><b>??? </b><p>${c.act === 2 ? 'Found from the air, beyond the valley.' : 'Found by hand, in the ashes.'}</p></div>`)).join('');
  const testimonies = s.testimonies.map((t) => `<div class="clue"><b>${esc(t.who)}</b><p>“${esc(t.line)}”</p></div>`).join('');
  return `<h2>Lore journal</h2>
    <p class="hint small">Who are the troll riders, and how do they control dragons? ${s.clues.length} of ${CLUES.length} clues found.</p>
    <div class="card">${clues}</div>
    ${testimonies ? `<h2>What the survivors saw</h2><div class="card">${testimonies}</div>` : ''}
    ${s.act >= 2 ? `<h2>Raids</h2><div class="card"><div class="stats">
      <div><b>${r.b(() => s.raid.wins)}</b><small>repelled</small></div>
      <div><b>${r.b(() => s.raid.losses)}</b><small>lost</small></div>
      <div><b>${r.b(() => fmt(E.raidPower(s)))}</b><small>next power</small></div></div></div>` : ''}
    <h2>Settings</h2>
    <div class="card settings">
      <button class="btn" data-act="save">Save now</button>
      <button class="btn" data-act="replay">Replay intro</button>
      <button class="btn danger" data-act="reset">Reset game</button>
      <p class="hint small">Progress saves on this device every few seconds. The village keeps working while you are away (up to the offline limit on the Village tab).</p>
    </div>`;
}

// ---------- modals & toasts ----------

const modalQueue = [];
let modalOpen = false;
const modalEl = document.getElementById('modal');

function queueModal(m) {
  modalQueue.push(m);
  if (!modalOpen) nextModal();
}

function nextModal() {
  const m = modalQueue.shift();
  if (!m) {
    modalOpen = false;
    modalEl.hidden = true;
    return;
  }
  modalOpen = true;
  modalEl.hidden = false;
  modalEl.innerHTML = `<div class="sheet">
    ${m.art ? `<div class="modal-art">${m.art}</div>` : ''}
    ${m.eyebrow ? `<div class="eyebrow">${m.eyebrow}</div>` : ''}
    <h2>${m.title}</h2>
    <div class="modal-body">${m.body}</div>
    ${m.input != null ? `<label class="field">Name your dragon<input id="m-input" maxlength="16" value="${esc(m.input)}"></label>` : ''}
    <button class="btn ${m.danger ? 'danger' : 'primary'} wide" id="m-ok">${m.button || 'Continue'}</button>
    ${m.cancel ? '<button class="btn wide" id="m-cancel">Cancel</button>' : ''}
  </div>`;
  const cancel = document.getElementById('m-cancel');
  if (cancel) cancel.onclick = () => nextModal();
  document.getElementById('m-ok').onclick = () => {
    const input = document.getElementById('m-input');
    if (m.onClose) m.onClose(input ? input.value.trim() : undefined);
    nextModal();
  };
}

function queueStory(pages, onDone) {
  pages.forEach((p, i) => queueModal({
    eyebrow: 'Story',
    title: p.title,
    body: `<p>${p.body}</p>`,
    art: p.nameInput && s.dragon ? dragonSVG(0, null) : null,
    input: p.nameInput && s.dragon ? s.dragon.name : null,
    button: i === pages.length - 1 ? 'Begin' : 'Continue',
    onClose: (val) => {
      if (p.nameInput && s.dragon && val) s.dragon.name = val;
      if (i === pages.length - 1 && onDone) onDone();
    },
  }));
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  const box = document.getElementById('toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4300);
}

function gainsList(g) {
  return Object.entries(g).filter(([, v]) => v).map(([k, v]) => `<span class="cost">${RESOURCES[k].icon} ${v > 0 ? '+' : ''}${fmt(v)}</span>`).join('');
}

function drainEvents() {
  while (s.events.length) {
    const ev = s.events.shift();
    switch (ev.type) {
      case 'toast': toast(ev.text); break;
      case 'clue':
        queueModal({
          eyebrow: 'Clue found', title: `🔎 ${ev.clue.name}`,
          body: `<p>${ev.clue.text}</p><p class="hint small">Added to your Lore journal.</p>`,
        });
        break;
      case 'survivors':
        queueModal({
          eyebrow: `${BUILDINGS[ev.building].name} rebuilt`,
          title: `${ev.count} survivors return`,
          body: ev.lines.map(([who, line]) => `<p><b>${who}:</b> “${line}”</p>`).join('') +
            `<p class="hint small">${ev.building === 'barracks' ? 'Three of them take up the guard posts. The Night Watch is posted; scavengers will stay away.' : 'Give them jobs on the Jobs tab.'}</p>`,
        });
        break;
      case 'story': queueStory(ev.pages, () => { tab = 'dragon'; }); break;
      case 'evolve': {
        const st = DRAGON_STAGES[ev.stage];
        queueModal({
          eyebrow: 'Evolution', title: `${s.dragon.name} is now a ${st.name}!`,
          art: dragonSVG(ev.stage, ev.element),
          body: `<p>${st.gives}</p>${ev.stage === 2 ? `<p>Its element is <b style="color:${ELEMENTS[ev.element].color}">${ELEMENTS[ev.element].name}</b>: ${ELEMENTS[ev.element].desc}</p>` : ''}`,
        });
        break;
      }
      case 'flight':
        queueModal({
          eyebrow: ev.kind === 'scout' ? 'Scouting flight' : 'Island ride',
          title: ev.area ? `Found: ${ev.area.name}` : (ev.kind === 'scout' ? 'Back from the skies' : 'Back from the islands'),
          body: `${ev.area ? `<p>${ev.area.text}</p>` : ''}<div class="costs">${gainsList(ev.gained)}</div>${ev.clue ? `<p><b>🔎 ${ev.clue.name}:</b> ${ev.clue.text}</p>` : ''}`,
        });
        break;
      case 'raid':
        queueModal({
          eyebrow: 'Troll raid',
          title: ev.won ? 'The raid is driven off!' : 'The trolls broke through',
          body: `<p>Troll power ${fmt(ev.power)} against your defense ${fmt(ev.defense)}.</p>
            ${ev.won ? `<p>They left behind troll scrap. ${s.dragon.stage < 2 ? `${esc(s.dragon.name)} will need it to grow.` : ''}</p><div class="costs">${gainsList(ev.gained)}</div>`
              : `<p>They grabbed what they could and fled. ${esc(s.dragon.name)} is shaken. More guards, better tools or a grown dragon will hold next time.</p><div class="costs">${gainsList(Object.fromEntries(Object.entries(ev.lost).map(([k, v]) => [k, -v])))}</div>`}`,
        });
        break;
      default: break;
    }
  }
}

// ---------- input ----------

function floatText(x, y, text, cls = '') {
  const el = document.createElement('div');
  el.className = `float ${cls}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function pointOf(e, el) {
  if (e.clientX || e.clientY) return [e.clientX, e.clientY];
  const rect = el.getBoundingClientRect();
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const { act, arg } = el.dataset;
  const [x, y] = pointOf(e, el);
  let changed = true;
  switch (act) {
    case 'tab': tab = arg; window.scrollTo({ top: 0 }); break;
    case 'gather': {
      const res = E.gather(s, arg);
      if (!res) break;
      if (res.hit) floatText(x, y, Object.entries(res.gained).map(([k, v]) => `+${fmtAmt(v)}${RESOURCES[k].icon}`).join(' '));
      else floatText(x, y, 'nothing…', 'miss');
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
      changed = false;
      break;
    }
    case 'smelt': if (E.smelt(s)) floatText(x, y, '+🔩'); changed = false; break;
    case 'build': E.build(s, arg); break;
    case 'upgrade': E.buyUpgrade(s, arg); break;
    case 'job': E.assign(s, arg, +el.dataset.d); changed = false; break;
    case 'feed': if (E.feed(s, arg)) floatText(x, y, `+${FEEDS[arg].hunger}🍖`); changed = false; break;
    case 'stoke': if (E.stoke(s)) floatText(x, y, '+25🔥'); changed = false; break;
    case 'pet': {
      const p = E.pet(s);
      if (p) floatText(x, y, `💗 +${fmtAmt(p.bond)}✨`, 'love');
      const art = document.querySelector('.dragon-art');
      if (art) { art.classList.remove('nuzzle'); void art.offsetWidth; art.classList.add('nuzzle'); }
      changed = false;
      break;
    }
    case 'evolve': E.evolve(s); break;
    case 'scout': E.scout(s); break;
    case 'island': E.islandFlight(s); break;
    case 'rally': if (E.rally(s)) floatText(x, y, '+⚔️'); changed = false; break;
    case 'skill': E.buySkill(s, arg); break;
    case 'rename':
      queueModal({
        title: 'Rename your dragon', body: '', input: s.dragon.name, button: 'Save name', cancel: true,
        onClose: (n) => { if (n) { s.dragon.name = n.slice(0, 16); main.key = null; } },
      });
      changed = false;
      break;
    case 'save': save(); toast('Saved.'); changed = false; break;
    case 'replay': queueStory(STORY.intro); changed = false; break;
    case 'reset':
      queueModal({
        title: 'Start over from the ashes?',
        body: '<p>This erases your village, your dragon and every clue. It cannot be undone.</p>',
        button: 'Erase and restart', danger: true, cancel: true,
        onClose: () => {
          s = E.newState();
          save();
          tab = 'gather';
          main.key = null;
          startIntro();
        },
      });
      changed = false;
      break;
    default: changed = false;
  }
  drainEvents();
  if (changed) main.key = null;
  frame();
});

// ---------- loop ----------

let last = performance.now();
function frame() {
  renderHud();
  renderBanner();
  renderNav();
  renderMain();
}

function loop() {
  const now = performance.now();
  const dt = Math.min(1, (now - last) / 1000);
  last = now;
  E.tick(s, dt);
  drainEvents();
  frame();
}

function catchUp(seconds) {
  const report = E.applyOffline(s, seconds);
  if (!report) return;
  const g = gainsList(report.gained);
  queueModal({
    eyebrow: 'While you were away',
    title: `${fmtTime(report.seconds)} passed`,
    body: `<p>${s.pop ? 'The villagers kept working.' : 'The ashes waited for you.'}${s.dragon ? ` ${esc(s.dragon.name)} slept by the hearth and woke a little bigger.` : ''}</p>
      ${g ? `<div class="costs">${g}</div>` : ''}
      ${report.levels > 0 ? `<p>${esc(s.dragon.name)} gained ${report.levels} level${report.levels > 1 ? 's' : ''}.</p>` : ''}
      ${report.survivors > 0 ? `<p>${report.survivors} survivor${report.survivors > 1 ? 's' : ''} came home.</p>` : ''}
      ${report.capped ? '<p class="hint small">Offline earnings were capped. Build the Chief’s Tent and Hall to stay away longer.</p>' : ''}`,
  });
}

function startIntro() {
  queueStory(STORY.intro, () => { s.introSeen = true; save(); });
}

let hiddenAt = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    save();
  } else if (hiddenAt) {
    catchUp((Date.now() - hiddenAt) / 1000);
    hiddenAt = null;
    last = performance.now();
  }
});
window.addEventListener('pagehide', save);

if (!s.introSeen) startIntro();
else if (s.savedAt) catchUp((Date.now() - s.savedAt) / 1000);
drainEvents();
frame();
setInterval(loop, TICK_MS);
setInterval(save, 10000);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
