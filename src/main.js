import * as E from './engine.js';
import {
  RESOURCES, GATHER, BUILDINGS, UPGRADES, JOBS, DRAGON_STAGES, FEEDS, ELEMENTS, SKILLS,
  CLUES, STORY, TRUST_KEEPER, TRUST_RIDERS,
} from './data.js';
import { dragonSVG } from './dragonArt.js';
import { villageSVG, restoration, AREA_INFO } from './villageArt.js';

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
let tab = 'chief';

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

// The chronicle: a short running log of what happened, shown under the
// village. Kept in memory only.
const chronicle = [];
let chronicleVersion = 0;
function log(icon, text) {
  chronicle.unshift({ icon, text, at: s.time });
  if (chronicle.length > 30) chronicle.pop();
  chronicleVersion++;
}

// ---------- tiny binding system ----------
// Regions render HTML once per "structure" change and then update text,
// widths, CSS values, classes and enabled state in place every frame.

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
  v(fn) { this.fns.push(fn); return `data-v="${this.fns.length - 1}"`; }
  en(fn) { this.fns.push(fn); return `data-en="${this.fns.length - 1}"`; }
  cls(fn) { this.fns.push(fn); return `data-cls="${this.fns.length - 1}"`; }
  render(key, build) {
    if (key === this.key) return;
    this.key = key;
    this.fns = [];
    this.el.innerHTML = build(this);
    this.binds = [];
    for (const kind of ['b', 'h', 'w', 'v', 'en', 'cls']) {
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
      else if (bd.kind === 'v') bd.el.style.setProperty('--v', Math.max(0, Math.min(1, v)).toFixed(3));
      else if (bd.kind === 'en') bd.el.disabled = !v;
      else if (bd.kind === 'cls') bd.el.className = v;
    }
  }
}

const hud = new Region(document.getElementById('hud'));
const nav = new Region(document.getElementById('nav'));
const stage = new Region(document.getElementById('stage'));
const desk = new Region(document.getElementById('desk'));
const panel = new Region(document.getElementById('panel'));

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
  return `<div class="costs">${Object.entries(cost).map(([k, v]) =>
    `<span ${r.cls(() => (s.res[k] >= v ? 'cost' : 'cost short'))}><i>${RESOURCES[k].icon}</i>${fmt(v)}</span>`).join('')}</div>`;
}

function costProgress(cost) {
  const parts = Object.entries(cost).map(([k, v]) => Math.min(1, s.res[k] / v));
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 1;
}

function nextStep() {
  return ['farm', 'blacksmith', 'barracks', 'tent'].find((k) => !s.buildings[k]);
}

const cap = () => E.derive(s).cap;

// ---------- top bar ----------

function renderHud() {
  const keys = Object.keys(RESOURCES).filter(shown);
  const key = JSON.stringify([keys, s.act, !!s.dragon, s.raid.warning]);
  hud.render(key, (r) => {
    const pills = keys.map((k) => {
      const def = RESOURCES[k];
      return `<div class="res" title="${def.name}">
        <span class="res-ic" ${def.capped ? r.v(() => s.res[k] / cap()) : ''}><i>${def.icon}</i></span>
        <span class="res-txt"><b>${r.b(() => fmt(s.res[k]))}</b>
        <small ${r.cls(() => (E.rates(s).net[k] < -0.004 ? 'neg' : ''))}>${r.b(() => fmtRate(E.rates(s).net[k]))}</small></span>
      </div>`;
    }).join('');
    const raid = s.dragon
      ? (s.raid.warning
        ? `<button class="raid-chip alarm" data-act="rally" ${r.en(() => s.raid.rally < 20)}>
            <span>⚔️ Raid in <b>${r.b(() => fmtTime(s.raid.next))}</b></span>
            <small>${r.b(() => `${fmt(E.defense(s))} vs ${fmt(E.raidPower(s))}`)} · Rally ${r.b(() => s.raid.rally)}/20</small></button>`
        : `<div class="raid-chip"><span>🛡️ Raid in <b>${r.b(() => fmtTime(s.raid.next))}</b></span>
            <small>${r.b(() => `defense ${fmt(E.defense(s))} vs ${fmt(E.raidPower(s))}`)}</small></div>`)
      : '';
    return `<div class="brand"><span class="brand-name">Dragon Chief</span>
        <span class="brand-act">${s.act === 1 ? 'Act I · The Ashes' : 'Act II · The Bond'}</span></div>
      <div class="res-row">${pills}</div>
      <div class="hud-right">
        <div class="pop-chip">👥 <b>${r.b(() => s.pop)}</b><small ${r.cls(() => (E.idle(s) > 0 ? 'idle' : 'idle hide'))}>${r.b(() => `${E.idle(s)} idle`)}</small></div>
        ${raid}
      </div>
      <div ${r.cls(() => (s.starving ? 'starve' : 'starve hide'))}>⚠ The stores are empty. Villagers work at half pace.</div>`;
  });
  hud.update();
}

// ---------- navigation ----------

const TABS = [
  { id: 'chief', icon: '🪓', name: 'Chief' },
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
      ${t.id === 'build' ? `<i ${r.cls(() => (['farm', 'blacksmith', 'barracks', 'tent', 'hut', 'dock', 'den', 'hall'].some((k) => BUILDINGS[k] && E.canBuild(s, k)) ? 'dot' : 'dot hide'))}></i>` : ''}
      ${t.id === 'dragon' ? `<i ${r.cls(() => (s.dragon && (E.canEvolve(s) || E.contentment(s.dragon) < 0.4) ? 'dot' : 'dot hide'))}></i>` : ''}
      ${t.id === 'bond' ? `<i ${r.cls(() => (Object.values(SKILLS).some((br) => Object.keys(br.nodes).some((n) => E.canBuySkill(s, n))) ? 'dot' : 'dot hide'))}></i>` : ''}
    </button>`).join(''));
  nav.update();
}

// ---------- the stage: village or dragon den ----------

const SPOTS = {
  chop: [74, 160, 'Chop'], hunt: [20, 188, 'Hunt'], rubble: [362, 86, 'Clear'], mine: [108, 100, 'Mine'],
  forage: [172, 204, 'Forage'], fish: [376, 162, 'Fish'], crystal: [26, 62, 'Dig'],
};

function renderStage() {
  const den = tab === 'dragon' && s.dragon;
  const avail = Object.keys(GATHER).filter((k) => E.gatherAvailable(s, k));
  const key = JSON.stringify(den ? ['den', s.dragon.stage, s.dragon.element, s.dragon.name] : ['village', avail, s.buildings.blacksmith]);
  stage.render(key, (r) => (den ? denStage(r) : villageStage(r, avail)));
  stage.update();
}

function villageStage(r, avail) {
  const spots = avail.map((k) => {
    const [x, y, verb] = SPOTS[k];
    const g = GATHER[k];
    let chance = g.chance;
    if (k === 'mine' && s.areas.oldmine) chance = Math.min(1, chance * 2);
    return `<button class="spot" style="left:${(x / 400) * 100}%;top:${(y / 260) * 100}%" data-act="gather" data-arg="${k}" aria-label="${g.name}">
      <span class="spot-ic">${g.icon}</span><span class="spot-label">${verb}${chance < 1 ? ` <small>${Math.round(chance * 100)}%</small>` : ''}</span></button>`;
  }).join('');
  const forge = s.buildings.blacksmith
    ? `<button class="spot forge" style="left:${(146 / 400) * 100}%;top:${(170 / 260) * 100}%" data-act="smelt" ${r.en(() => s.res.ore >= E.SMELT.ore)} aria-label="Smelt ore">
        <span class="spot-ic">🔥</span><span class="spot-label">Smelt</span></button>`
    : '';
  return `<div class="scene">
      <div class="scene-art" ${r.h(() => villageSVG(s, cap()))}></div>
      <div class="spots">${spots}${forge}</div>
      <div class="scene-badge">
        <span>Village restored</span><b>${r.b(() => pct(restoration(s)))}</b>
        <div class="meter"><i ${r.w(() => restoration(s))}></i></div>
      </div>
    </div>`;
}

function denStage(r) {
  const dr = s.dragon;
  const st = DRAGON_STAGES[dr.stage];
  const el = dr.element ? ELEMENTS[dr.element] : null;
  return `<div class="scene den" style="--el:${el ? el.color : '#ff8a3d'}">
      <div class="den-glow"></div>
      <div class="den-dragon" data-act="pet" ${r.h(() => {
        const c = E.contentment(s.dragon);
        const mood = c < 0.15 ? 0.1 : c < 0.3 ? 0.2 : 1;
        return dragonSVG(s.dragon.stage, s.dragon.element, mood);
      })}></div>
      <div class="den-plate">
        <button class="den-name" data-act="rename" title="Rename">${esc(dr.name)}</button>
        <div class="den-sub">${st.name}${el ? ` · <span style="color:${el.color}">${el.name}</span>` : ''} · Level ${r.b(() => s.dragon.level)}</div>
        <div class="meter xp"><i ${r.w(() => s.dragon.xp / E.xpFor(s.dragon.level))}></i></div>
        <div class="den-hint">${r.b(() => (s.dragon.level >= E.levelCap(s.dragon) && dr.stage < 4 ? 'Ready to evolve' : 'Tap to pet'))}</div>
      </div>
    </div>`;
}

// ---------- the desk: under the stage ----------

function renderDesk() {
  const den = tab === 'dragon' && s.dragon;
  const key = JSON.stringify(den ? ['care', s.dragon.stage] : ['log', chronicleVersion, nextStep(), s.dragon?.stage]);
  desk.render(key, (r) => (den ? careDesk(r) : chronicleDesk(r)));
  desk.update();
}

function gauge(r, label, icon, fn, cls = '') {
  return `<div class="gauge ${cls}" ${r.v(fn)}><div class="ring"><span>${icon}</span></div>
    <b>${r.b(() => pct(fn()))}</b><small>${label}</small></div>`;
}

function careDesk(r) {
  const dr = () => s.dragon;
  const feeds = Object.entries(FEEDS).map(([k, f]) => `<button class="care" data-act="feed" data-arg="${k}" ${r.en(() => dr().hunger < 98 && E.canAfford(s, E.feedCost(s, k)))}>
      <span class="care-ic">${f.icon}</span><span class="care-name">${f.name}</span>${costHTML(r, E.feedCost(s, k))}</button>`).join('');
  return `<div class="gauges">
      ${gauge(r, 'Contentment', '💛', () => E.contentment(dr()), 'big')}
      ${gauge(r, 'Hunger', '🍖', () => dr().hunger / 100, 'hunger')}
      ${gauge(r, 'Warmth', '🔥', () => dr().warmth / 100, 'warmth')}
      ${gauge(r, 'Affection', '💗', () => dr().affection / 100, 'affection')}
    </div>
    <div class="care-row">
      <button class="care pet" data-act="pet"><span class="care-ic">💗</span><span class="care-name">Pet</span><div class="costs"><span class="cost">free</span></div></button>
      ${feeds}
      <button class="care" data-act="stoke" ${r.en(() => dr().warmth < 98 && E.canAfford(s, E.stokeCost(s)))}>
        <span class="care-ic">🪵</span><span class="care-name">Stoke</span>${costHTML(r, E.stokeCost(s))}</button>
    </div>`;
}

function chronicleDesk(r) {
  const entries = chronicle.slice(0, 6).map((c) => `<li><span>${c.icon}</span><p>${c.text}</p></li>`).join('');
  return `<div class="desk-grid">
      ${objectiveCard(r)}
      <section class="chronicle">
        <h3>Chronicle</h3>
        ${entries ? `<ul>${entries}</ul>` : '<p class="muted">The village is quiet. Tap the forest, the rubble and the fields to start gathering.</p>'}
      </section>
    </div>`;
}

function objectiveCard(r) {
  const step = nextStep();
  if (step) {
    const def = BUILDINGS[step];
    const cost = E.buildingCost(s, step);
    return `<section class="objective">
      <div class="obj-art">${villageSVG(s, cap(), null, step)}</div>
      <div class="obj-body">
        <div class="eyebrow">Rebuild · step ${def.step} of 4</div>
        <h3>${def.name}</h3>
        ${costHTML(r, cost)}
        <div class="meter"><i ${r.w(() => costProgress(cost))}></i></div>
        <button class="btn primary" data-act="build" data-arg="${step}" ${r.en(() => E.canBuild(s, step))}>Build</button>
      </div>
    </section>`;
  }
  const dr = s.dragon;
  if (dr && dr.stage < DRAGON_STAGES.length - 1) {
    const next = DRAGON_STAGES[dr.stage + 1];
    return `<section class="objective">
      <div class="obj-art dragon-mini">${dragonSVG(dr.stage, dr.element)}</div>
      <div class="obj-body">
        <div class="eyebrow">Raise ${esc(dr.name)}</div>
        <h3>Evolve into a ${next.name}</h3>
        <p class="muted">Level ${next.level}${Object.entries(next.cost).map(([k, v]) => ` · ${fmt(v)} ${RESOURCES[k].icon}`).join('')}</p>
        <div class="meter"><i ${r.w(() => Math.min(1, s.dragon.level / next.level))}></i></div>
        <button class="btn" data-act="tab" data-arg="dragon">Visit the den</button>
      </div>
    </section>`;
  }
  return '';
}

// ---------- the panel ----------

function structureKey() {
  const dr = s.dragon;
  return JSON.stringify([
    tab, s.act, s.buildings, s.upgrades, s.areas, s.skills,
    Object.keys(JOBS).filter((j) => E.jobUnlocked(s, j)),
    dr && [dr.stage, dr.element, dr.name, dr.level >= E.levelCap(dr)],
    s.clues.length, s.testimonies.length, s.scouts > 0, s.res.trust >= TRUST_KEEPER, s.res.trust >= TRUST_RIDERS,
  ]);
}

function renderPanel() {
  panel.render(structureKey(), (r) => {
    switch (tab) {
      case 'chief': return chiefPanel(r);
      case 'build': return buildPanel(r);
      case 'jobs': return jobsPanel(r);
      case 'dragon': return s.dragon ? dragonPanel(r) : '';
      case 'bond': return s.dragon ? bondPanel(r) : '';
      case 'lore': return lorePanel(r);
      default: return '';
    }
  });
  panel.update();
}

function head(title, sub) {
  return `<header class="panel-head"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</header>`;
}

// Chief: gathering by hand

function chiefPanel(r) {
  const tiles = Object.entries(GATHER).filter(([k]) => E.gatherAvailable(s, k)).map(([k, g]) => {
    const yields = Object.entries(g.gives).map(([res, v]) => `${RESOURCES[res].icon} ${r.b(() => {
      const d = E.derive(s);
      let amt = res === 'crystal' ? v : v * d.tapMult * (res === 'food' ? d.foodMult : 1);
      if (k === 'fish' && s.areas.lake) amt *= 3;
      return '+' + fmtAmt(amt);
    })}`).join(' ');
    let chance = g.chance;
    if (k === 'mine' && s.areas.oldmine) chance = Math.min(1, chance * 2);
    return `<button class="gather" data-act="gather" data-arg="${k}">
      <span class="gather-ic">${g.icon}</span>
      <span class="gather-txt"><b>${g.name}</b><small>${yields}${chance < 1 ? ` · ${Math.round(chance * 100)}%` : ''}</small></span>
    </button>`;
  }).join('');
  const smeltTile = s.buildings.blacksmith
    ? `<button class="gather" data-act="smelt" ${r.en(() => s.res.ore >= E.SMELT.ore)}>
        <span class="gather-ic">🔥</span><span class="gather-txt"><b>Smelt ore</b><small>⛏️ 5 → 🔩 ${r.b(() => (E.derive(s).smeltMult > 1 ? 2 : 1))}</small></span></button>`
    : '';
  const scav = s.buildings.farm && !s.buildings.barracks
    ? `<div class="notice">🦝 Scavengers raid the stockpile in <b>${r.b(() => fmtTime(s.scavengerTimer))}</b>. The Barracks will stop them.</div>`
    : '';
  const d = E.derive(s);
  return `${head('By your hand', 'Tap the village or these buttons. Your hands sometimes turn up Clues.')}
    <div class="gather-grid">${tiles}${smeltTile}</div>
    ${scav}
    <div class="stat-strip">
      <div><b>${r.b(() => `×${E.derive(s).tapMult.toFixed(2)}`)}</b><small>tap power</small></div>
      <div><b>${s.clues.length}/${CLUES.length}</b><small>clues</small></div>
      <div><b>${r.b(() => fmt(s.stats.taps))}</b><small>taps</small></div>
    </div>
    ${d.sparks > 1 ? `<p class="muted small">${esc(s.dragon.name)}’s sparks add ${pct(d.sparks - 1)} to every tap.</p>` : ''}`;
}

// Village: buildings with a view of each one

function buildCard(r, k) {
  const def = BUILDINGS[k];
  const n = s.buildings[k];
  const done = !def.repeat && n > 0;
  const ups = Object.keys(UPGRADES).filter((u) => UPGRADES[u].at === k && E.upgradeUnlocked(s, u));
  const upRows = ups.map((u) => {
    const ud = UPGRADES[u];
    const lvl = s.upgrades[u];
    if (!ud.repeat && lvl) return `<div class="sub done"><span>${ud.icon} ${ud.name}</span><span class="tag ok">Made</span></div>`;
    return `<div class="sub"><span class="sub-name">${ud.icon} ${ud.name}${ud.repeat && lvl ? ` <span class="tag">Lv ${lvl}</span>` : ''}<small>${ud.desc}</small></span>
      ${costHTML(r, E.upgradeCost(s, u))}
      <button class="btn small" data-act="upgrade" data-arg="${u}" ${r.en(() => E.canUpgrade(s, u))}>${ud.repeat ? 'Upgrade' : 'Craft'}</button></div>`;
  }).join('');
  const crop = k === 'tent' && s.buildings.hall ? 'hall' : k;
  const action = done
    ? '<span class="tag ok">Rebuilt</span>'
    : `${costHTML(r, E.buildingCost(s, k))}
       <button class="btn primary" data-act="build" data-arg="${k}" ${r.en(() => E.canBuild(s, k))}>${def.repeat && n ? 'Build another' : def.step ? 'Rebuild' : 'Build'}</button>`;
  return `<article class="bcard ${done ? 'is-done' : ''}" id="card-${k}">
      <div class="bcard-art" data-act="focus" data-arg="${k}">${villageSVG(s, cap(), null, crop)}
        ${def.repeat && n ? `<span class="count">×${n}</span>` : ''}${!n ? '<span class="ruin-tag">In ruins</span>' : ''}</div>
      <div class="bcard-body">
        <h3>${def.icon} ${def.name}</h3>
        <p>${def.desc}</p>
        <div class="bcard-act">${action}</div>
        ${upRows ? `<div class="subs">${upRows}</div>` : ''}
      </div>
    </article>`;
}

function buildPanel(r) {
  const step = nextStep();
  const order = s.act === 1
    ? ['farm', 'blacksmith', 'barracks', 'tent', 'hut']
    : ['hall', 'den', 'dock', 'farm', 'hut', 'blacksmith', 'barracks'];
  const list = order.filter((k) => {
    const def = BUILDINGS[k];
    if (def.act && s.act < def.act) return false;
    if (def.step && !s.buildings[k] && k !== step) return false; // only the next rebuild step
    if (k === 'hut') return s.buildings.farm > 0;
    return true;
  });
  const d = E.derive(s);
  return `${head('The village', `Housing ${s.pop}/${d.housing} · storage ${fmt(d.cap)} · away up to ${fmtTime(d.offlineCap)}`)}
    <div class="bgrid">${list.map((k) => buildCard(r, k)).join('')}</div>`;
}

// Jobs

function jobsPanel(r) {
  const jobs = Object.keys(JOBS).filter((j) => E.jobUnlocked(s, j));
  const tiles = jobs.map((j) => {
    const def = JOBS[j];
    const jcap = E.jobCap(s, j);
    const makes = Object.entries(def.makes).map(([res, v]) => `${RESOURCES[res].icon}${r.b(() => {
      const d = E.derive(s);
      return `+${(v * d.jobMult * (res === 'food' ? d.foodMult : 1) * (j === 'smith' ? d.smeltMult : 1)).toFixed(2)}`;
    })}`).join(' ');
    return `<div class="job">
      <div class="job-top"><span class="job-ic">${def.icon}</span><span class="job-name">${def.name}<small>${makes || def.capNote || ''}</small></span></div>
      <div class="job-ctl">
        <button class="round" data-act="job" data-arg="${j}" data-d="-1" ${r.en(() => s.jobs[j] > 0)} aria-label="Fewer">−</button>
        <span class="job-n">${r.b(() => s.jobs[j])}${jcap !== Infinity ? `<small>/${jcap}</small>` : ''}</span>
        <button class="round" data-act="job" data-arg="${j}" data-d="1" ${r.en(() => E.idle(s) > 0 && s.jobs[j] < jcap)} aria-label="More">+</button>
      </div>
    </div>`;
  }).join('');
  const keeperHint = s.dragon && !E.jobUnlocked(s, 'keeper')
    ? `<div class="notice">🧺 Dragon Keepers unlock at ${TRUST_KEEPER} Trust. You have ${r.b(() => fmt(s.res.trust))}.</div>` : '';
  return `${head('Jobs', 'Each villager eats 0.1 food a second. Starving villagers work at half pace.')}
    <div class="stat-strip">
      <div><b>${r.b(() => s.pop)}</b><small>villagers</small></div>
      <div><b ${r.cls(() => (E.idle(s) > 0 ? 'warn' : ''))}>${r.b(() => E.idle(s))}</b><small>idle</small></div>
      <div><b>${r.b(() => E.derive(s).housing)}</b><small>housing</small></div>
      <div><b ${r.cls(() => (E.rates(s).net.food < 0 ? 'bad' : 'good'))}>${r.b(() => fmtRate(E.rates(s).net.food) || '0/s')}</b><small>food</small></div>
    </div>
    <p class="muted small">${r.b(() => survivorHint())}</p>
    <div class="job-grid">${tiles}</div>
    ${keeperHint}`;
}

function survivorHint() {
  const d = E.derive(s);
  if (s.pop >= d.housing) return 'No room for more survivors. Build huts.';
  if (s.starving) return 'Survivors won’t return to a starving village.';
  return `Next survivor returns in ${fmtTime(E.SURVIVOR_INTERVAL - s.survivorTimer)}.`;
}

// Dragon

function dragonPanel(r) {
  const dr = s.dragon;
  const next = DRAGON_STAGES[dr.stage + 1];
  const path = DRAGON_STAGES.map((st, i) => `<li class="${i < dr.stage ? 'past' : i === dr.stage ? 'now' : ''}">
      <span class="pip"></span><b>${st.name}</b><small>${i === 0 ? 'Start' : `Lv ${st.level}`}</small></li>`).join('');
  const evolve = next
    ? `<section class="card evolve">
        <div class="eyebrow">Next form</div><h3>${next.name}</h3><p>${next.gives}</p>
        <div class="costs"><span ${r.cls(() => (s.dragon.level >= next.level ? 'cost' : 'cost short'))}>Lv ${next.level}</span>${Object.entries(next.cost).map(([k, v]) =>
          `<span ${r.cls(() => (s.res[k] >= v ? 'cost' : 'cost short'))}><i>${RESOURCES[k].icon}</i>${fmt(v)}</span>`).join('')}</div>
        <button class="btn primary wide" data-act="evolve" ${r.en(() => E.canEvolve(s))}>Evolve</button>
      </section>`
    : '<section class="card"><h3>An Elder dragon</h3><p>Its aura lifts every part of the village.</p></section>';
  const diet = dr.stage < 2
    ? `<section class="card"><div class="eyebrow">Element</div>
        <p>What ${esc(dr.name)} eats before it becomes a Juvenile decides its element.</p>
        <div class="diet">${Object.entries(FEEDS).map(([k, f]) => `<div class="diet-row" style="--c:${ELEMENTS[f.element].color}">
          <span>${f.icon} ${ELEMENTS[f.element].name}</span><div class="meter"><i ${r.w(() => {
            const t = Object.values(s.dragon.diet).reduce((a, b) => a + b, 0);
            return t ? s.dragon.diet[f.element] / t : 0;
          })}></i></div></div>`).join('')}</div></section>`
    : `<section class="card"><div class="eyebrow">Element</div><h3 style="color:${ELEMENTS[dr.element].color}">${ELEMENTS[dr.element].name}</h3><p>${ELEMENTS[dr.element].desc}</p></section>`;
  const flights = dr.stage >= 2
    ? `<section class="card"><div class="eyebrow">Flights</div>
        <div class="flight"><span>🧭 <b>Scout</b><small>New areas, Clues, supplies</small></span>
          <button class="btn" data-act="scout" ${r.en(() => E.canScout(s))}>${r.b(() => (s.cooldowns.scout > 0 ? fmtTime(s.cooldowns.scout) : 'Fly'))}</button></div>
        ${dr.stage >= 3 ? `<div class="flight"><span>🏝️ <b>Ride to the islands</b><small>Crystal, scrap and hides</small></span>
          <button class="btn" data-act="island" ${r.en(() => E.canIsland(s))}>${r.b(() => (s.cooldowns.island > 0 ? fmtTime(s.cooldowns.island) : 'Ride'))}</button></div>` : ''}
        <p class="muted small">${r.b(() => (E.contentment(s.dragon) < 0.25 ? `${s.dragon.name} is too unhappy to fly.` : ''))}</p></section>`
    : '';
  return `${head(esc(dr.name), 'Contentment multiplies its growth, your Bond and village morale.')}
    <ol class="path">${path}</ol>
    <div class="stat-strip">
      <div><b>${r.b(() => `+${pct(E.derive(s).morale - 1)}`)}</b><small>morale</small></div>
      <div><b>${r.b(() => `+${pct(E.derive(s).sparks - 1)}`)}</b><small>tap sparks</small></div>
      <div><b>${r.b(() => fmtAmt(E.derive(s).xpRate))}</b><small>XP/s</small></div>
    </div>
    ${evolve}${diet}${flights}`;
}

// Bond

function bondPanel(r) {
  const branches = Object.entries(SKILLS).map(([, br]) => {
    const nodes = Object.entries(br.nodes).map(([k, n]) => {
      const rk = E.rank(s, k);
      const unlocked = E.skillUnlocked(s, k);
      const maxed = rk >= n.max;
      return `<li class="node ${unlocked ? '' : 'locked'} ${maxed ? 'maxed' : ''}" style="--v:${rk / n.max}">
        <div class="node-ring"><span>${rk}</span></div>
        <div class="node-body"><b>${n.name}</b><small>${unlocked ? n.desc : `Needs ${E.findSkill(n.req[0]).def.name} ${n.req[1]}`}</small></div>
        ${maxed ? '<span class="tag ok">Max</span>'
          : `<button class="btn small rune" data-act="skill" data-arg="${k}" ${r.en(() => E.canBuySkill(s, k))}>✨ ${fmt(E.skillCost(s, k))}</button>`}
      </li>`;
    }).join('');
    return `<section class="branch"><h3>${br.icon} ${br.name}</h3><p>${br.desc}</p><ol>${nodes}</ol></section>`;
  }).join('');
  return `${head('Bond', 'The chief’s own magic, drawn from a contented dragon and your touch.')}
    <div class="stat-strip">
      <div><b class="rune-txt">${r.b(() => fmt(s.res.bond))}</b><small>Bond</small></div>
      <div><b>${r.b(() => E.derive(s).bondRate.toFixed(3))}</b><small>per second</small></div>
      <div><b>${r.b(() => fmt(s.res.trust))}</b><small>Trust</small></div>
    </div>
    <div class="branches">${branches}</div>`;
}

// Lore

function lorePanel(r) {
  const clues = CLUES.map((c) => (s.clues.includes(c.id)
    ? `<article class="clue"><span class="clue-ic">🔎</span><div><b>${c.name}</b><p>${c.text}</p></div></article>`
    : `<article class="clue unknown"><span class="clue-ic">?</span><div><b>Undiscovered</b><p>${c.act === 2 ? 'Seen from the air, beyond the valley.' : 'Buried in the ashes.'}</p></div></article>`)).join('');
  const testimonies = s.testimonies.map((t) => `<blockquote><p>“${esc(t.line)}”</p><cite>${esc(t.who)}</cite></blockquote>`).join('');
  return `${head('Lore journal', `Who are the troll riders, and how do they control dragons? ${s.clues.length} of ${CLUES.length} clues found.`)}
    <div class="clues">${clues}</div>
    ${testimonies ? `<h3 class="sub-head">What the survivors saw</h3>${testimonies}` : ''}
    ${s.act >= 2 ? `<div class="stat-strip">
      <div><b>${r.b(() => s.raid.wins)}</b><small>raids repelled</small></div>
      <div><b>${r.b(() => s.raid.losses)}</b><small>raids lost</small></div>
      <div><b>${r.b(() => fmt(E.raidPower(s)))}</b><small>next raid</small></div></div>` : ''}
    <h3 class="sub-head">Settings</h3>
    <div class="settings">
      <button class="btn" data-act="save">Save now</button>
      <button class="btn" data-act="replay">Replay intro</button>
      <button class="btn danger" data-act="reset">Reset game</button>
    </div>
    <p class="muted small">Progress saves on this device. The village keeps working while you are away.</p>`;
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
  modalEl.innerHTML = `<div class="sheet ${m.art ? 'has-art' : ''}">
    ${m.art ? `<div class="modal-art${m.wide ? ' wide' : ''}">${m.art}</div>` : ''}
    <div class="sheet-body">
      ${m.eyebrow ? `<div class="eyebrow">${m.eyebrow}</div>` : ''}
      <h2>${m.title}</h2>
      <div class="modal-body">${m.body}</div>
      ${m.input != null ? `<label class="field">Name your dragon<input id="m-input" maxlength="16" value="${esc(m.input)}"></label>` : ''}
      <div class="sheet-actions">
        ${m.cancel ? '<button class="btn" id="m-cancel">Cancel</button>' : ''}
        <button class="btn ${m.danger ? 'danger' : 'primary'}" id="m-ok">${m.button || 'Continue'}</button>
      </div>
    </div>
  </div>`;
  const cancel = document.getElementById('m-cancel');
  if (cancel) cancel.onclick = () => nextModal();
  document.getElementById('m-ok').onclick = () => {
    const input = document.getElementById('m-input');
    if (m.onClose) m.onClose(input ? input.value.trim() : undefined);
    nextModal();
  };
}

const STORY_ART = {
  'The morning after': () => villageSVG(s, cap()),
  'The pyre': () => villageSVG(s, cap(), 'tent'),
};

function queueStory(pages, onDone) {
  pages.forEach((p, i) => queueModal({
    eyebrow: 'Story',
    title: p.title,
    body: `<p>${p.body}</p>`,
    art: p.nameInput && s.dragon ? dragonSVG(0, null) : STORY_ART[p.title] ? STORY_ART[p.title]() : null,
    wide: !!STORY_ART[p.title],
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
  return `<div class="costs">${Object.entries(g).filter(([, v]) => v).map(([k, v]) => `<span class="cost"><i>${RESOURCES[k].icon}</i>${v > 0 ? '+' : ''}${fmt(v)}</span>`).join('')}</div>`;
}

function drainEvents() {
  while (s.events.length) {
    const ev = s.events.shift();
    switch (ev.type) {
      case 'toast': toast(ev.text); log('•', esc(ev.text)); break;
      case 'clue':
        log('🔎', `Found a clue: <b>${ev.clue.name}</b>`);
        queueModal({
          eyebrow: 'Clue found', title: ev.clue.name,
          body: `<p>${ev.clue.text}</p><p class="muted small">Added to your Lore journal.</p>`,
        });
        break;
      case 'survivors':
        log('🏠', `${BUILDINGS[ev.building].name} rebuilt. ${ev.count} survivors came home.`);
        queueModal({
          eyebrow: `${BUILDINGS[ev.building].name} rebuilt`,
          title: `${ev.count} survivors return`,
          art: villageSVG(s, cap(), ev.building),
          wide: true,
          body: ev.lines.map(([who, line]) => `<blockquote><p>“${line}”</p><cite>${who}</cite></blockquote>`).join('') +
            `<p class="muted small">${ev.building === 'barracks' ? 'Three of them take up the guard posts. The Night Watch is posted; scavengers will stay away.' : 'Give them jobs on the Jobs tab.'}</p>`,
        });
        break;
      case 'story': queueStory(ev.pages, () => { tab = 'dragon'; }); break;
      case 'evolve': {
        const st = DRAGON_STAGES[ev.stage];
        log('🐉', `${esc(s.dragon.name)} became a <b>${st.name}</b>.`);
        queueModal({
          eyebrow: 'Evolution', title: `${esc(s.dragon.name)} is now a ${st.name}!`,
          art: dragonSVG(ev.stage, ev.element),
          body: `<p>${st.gives}</p>${ev.stage === 2 ? `<p>Its element is <b style="color:${ELEMENTS[ev.element].color}">${ELEMENTS[ev.element].name}</b>: ${ELEMENTS[ev.element].desc}</p>` : ''}`,
        });
        break;
      }
      case 'flight':
        log(ev.kind === 'scout' ? '🧭' : '🏝️', ev.area ? `Found <b>${ev.area.name}</b>.` : (ev.kind === 'scout' ? 'Back from a scouting flight.' : 'Back from the islands.'));
        queueModal({
          eyebrow: ev.kind === 'scout' ? 'Scouting flight' : 'Island ride',
          title: ev.area ? `Found: ${ev.area.name}` : (ev.kind === 'scout' ? 'Back from the skies' : 'Back from the islands'),
          art: ev.area ? villageSVG(s, cap()) : null,
          wide: true,
          body: `${ev.area ? `<p>${ev.area.text}</p>` : ''}${gainsList(ev.gained)}${ev.clue ? `<p><b>🔎 ${ev.clue.name}:</b> ${ev.clue.text}</p>` : ''}`,
        });
        break;
      case 'raid':
        log(ev.won ? '🛡️' : '🔥', ev.won ? `Raid driven off. Troll scrap +${ev.gained.scrap}.` : 'The trolls broke through and looted the stockpile.');
        queueModal({
          eyebrow: 'Troll raid',
          title: ev.won ? 'The raid is driven off!' : 'The trolls broke through',
          body: `<p>Troll power ${fmt(ev.power)} against your defense ${fmt(ev.defense)}.</p>
            ${ev.won ? `<p>They left behind troll scrap. ${s.dragon.stage < 2 ? `${esc(s.dragon.name)} will need it to grow.` : ''}</p>${gainsList(ev.gained)}`
              : `<p>They grabbed what they could and fled. ${esc(s.dragon.name)} is shaken. More guards, better tools or a grown dragon will hold next time.</p>${gainsList(Object.fromEntries(Object.entries(ev.lost).map(([k, v]) => [k, -v])))}`}`,
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
  setTimeout(() => el.remove(), 1000);
}

function pointOf(e, el) {
  if (e.clientX || e.clientY) return [e.clientX, e.clientY];
  const rect = el.getBoundingClientRect();
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

function bump(el) {
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const { act, arg } = el.dataset;
  const [x, y] = pointOf(e, el);
  let changed = true;
  switch (act) {
    case 'tab':
      tab = arg;
      document.getElementById('panel').scrollTop = 0;
      if (window.innerWidth < 1024) window.scrollTo({ top: 0 });
      break;
    case 'gather': {
      const res = E.gather(s, arg);
      if (!res) break;
      if (res.hit) floatText(x, y, Object.entries(res.gained).map(([k, v]) => `+${fmtAmt(v)}${RESOURCES[k].icon}`).join(' '));
      else floatText(x, y, 'nothing…', 'miss');
      bump(el);
      changed = false;
      break;
    }
    case 'smelt': if (E.smelt(s)) floatText(x, y, '+🔩'); bump(el); changed = false; break;
    case 'build': E.build(s, arg); break;
    case 'upgrade': E.buyUpgrade(s, arg); break;
    case 'job': E.assign(s, arg, +el.dataset.d); changed = false; break;
    case 'feed': if (E.feed(s, arg)) floatText(x, y, `+${FEEDS[arg].hunger}🍖`); bump(el); changed = false; break;
    case 'stoke': if (E.stoke(s)) floatText(x, y, '+25🔥'); bump(el); changed = false; break;
    case 'pet': {
      const p = E.pet(s);
      if (p) floatText(x, y, `💗 +${fmtAmt(p.bond)}✨`, 'love');
      const art = document.querySelector('.den-dragon');
      if (art) bump(art);
      changed = false;
      break;
    }
    case 'focus': {
      changed = false;
      const card = document.getElementById(`card-${arg === 'hall' ? 'hall' : arg}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.remove('flash');
        void card.offsetWidth;
        card.classList.add('flash');
      } else if (BUILDINGS[arg]) {
        tab = 'build';
        changed = true;
        setTimeout(() => document.getElementById(`card-${arg}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      } else if (AREA_INFO[arg]) {
        toast(AREA_INFO[arg]);
      }
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
        onClose: (n) => { if (n) { s.dragon.name = n.slice(0, 16); stage.key = null; panel.key = null; } },
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
          tab = 'chief';
          chronicle.length = 0;
          chronicleVersion++;
          for (const reg of [hud, nav, stage, desk, panel]) reg.key = null;
          startIntro();
        },
      });
      changed = false;
      break;
    default: changed = false;
  }
  drainEvents();
  if (changed) { panel.key = null; desk.key = null; }
  frame();
});

// ---------- loop ----------

let last = performance.now();
function frame() {
  document.body.dataset.tab = tab;
  renderHud();
  renderNav();
  renderStage();
  renderDesk();
  renderPanel();
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
  log('🌙', `${fmtTime(report.seconds)} passed while you were away.`);
  queueModal({
    eyebrow: 'While you were away',
    title: `${fmtTime(report.seconds)} passed`,
    art: villageSVG(s, cap()),
    wide: true,
    body: `<p>${s.pop ? 'The villagers kept working.' : 'The ashes waited for you.'}${s.dragon ? ` ${esc(s.dragon.name)} slept by the hearth and woke a little bigger.` : ''}</p>
      ${gainsList(report.gained)}
      ${report.levels > 0 ? `<p>${esc(s.dragon.name)} gained ${report.levels} level${report.levels > 1 ? 's' : ''}.</p>` : ''}
      ${report.survivors > 0 ? `<p>${report.survivors} survivor${report.survivors > 1 ? 's' : ''} came home.</p>` : ''}
      ${report.capped ? '<p class="muted small">Offline earnings were capped. Build the Chief’s Tent and Hall to stay away longer.</p>' : ''}`,
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
