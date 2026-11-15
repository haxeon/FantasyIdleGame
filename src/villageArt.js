// Procedural SVG of the whole village. Every area is drawn from the game
// state: burned ruins at the start, rebuilt and then grown by upgrades, with
// villagers standing at their job sites. Colours warm from smoke to dawn as
// the village is restored.

import { dragonSVG } from './dragonArt.js';

const W = 400;
const H = 260;

// ---------- restoration score ----------

export function restoration(s) {
  const b = s.buildings;
  let score = 0;
  score += b.farm ? 10 : 0;
  score += b.blacksmith ? 14 : 0;
  score += b.barracks ? 14 : 0;
  score += b.tent ? 14 : 0;
  score += Math.min(b.hut, 6) * (10 / 6);
  score += Math.max(0, Math.min(b.farm, 7) - 1) * (6 / 6);
  score += Math.min(s.upgrades.tools, 4) * 1;
  score += Math.min(s.upgrades.training, 3) * 1;
  score += Math.min(b.dock, 3) * 2;
  score += Math.min(b.den, 3) * 2;
  score += Math.min(b.hall, 3) * 3;
  score += (s.areas.caves ? 1 : 0) + (s.areas.lake ? 1 : 0) + (s.areas.oldmine ? 1 : 0);
  return Math.min(1, score / 100);
}

// ---------- helpers ----------

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = hex(a);
  const B = hex(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function rnd(seed) {
  // small deterministic noise so ruins look the same every frame
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function smoke(x, y, scale = 1, delay = 0) {
  return `<g class="v-smoke" transform="translate(${x},${y}) scale(${scale})">
    ${[0, 1, 2].map((i) => `<circle r="${4 + i * 1.5}" fill="#8d8079" style="animation-delay:${delay + i * 1.1}s"/>`).join('')}
  </g>`;
}

const JOB_COLOR = {
  woodcutter: '#9a6332', quarrier: '#9b958c', miner: '#5d5550', farmer: '#d1a92e', hunter: '#567d3d',
  smith: '#b8402c', guard: '#7f93b8', fisher: '#3f93bd', keeper: '#b665a6', idle: '#e2d6c6',
};

function person(x, y, job) {
  const c = JOB_COLOR[job];
  const tool = job === 'guard'
    ? `<line x1="3" y1="-13" x2="3" y2="0" stroke="#d9d2c4" stroke-width="0.8"/>`
    : job === 'woodcutter' || job === 'miner' || job === 'quarrier'
      ? `<line x1="2" y1="-6" x2="5" y2="-10" stroke="#3a2a20" stroke-width="1"/>`
      : '';
  return `<g class="v-person" transform="translate(${x},${y})">
    <ellipse cx="0" cy="0.5" rx="2.6" ry="0.9" fill="#000" opacity="0.25"/>
    <path d="M-2.2,0 L-1.6,-6.5 Q0,-8 1.6,-6.5 L2.2,0 Z" fill="${c}"/>
    <circle cy="-8.6" r="1.9" fill="#f0c8a0"/>
    ${tool}
  </g>`;
}

function crowd(job, n, spots, cap = 4) {
  const out = [];
  for (let i = 0; i < Math.min(n, cap, spots.length); i++) out.push({ y: spots[i][1], svg: person(spots[i][0], spots[i][1], job) });
  return out;
}

function tap(key, inner, label) {
  // A larger invisible target so small ruins are easy to hit with a finger.
  const r = HIT[key];
  const hit = r ? `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" fill="transparent"/>` : '';
  return `<g class="v-tap" data-act="focus" data-arg="${key}"><title>${label}</title>${hit}${inner}</g>`;
}

// ---------- areas ----------

function sky(s, p) {
  const top = mix('#1d1316', '#56809f', p);
  const bottom = mix('#7d3a1c', '#f3b77a', p);
  const sun = mix('#ff6a2a', '#ffe7a6', p);
  const raid = s.raid?.warning;
  const riders = raid
    ? [[70, 30, 1], [130, 46, 0.8], [196, 24, 0.9]].map(([x, y, k]) => `<g class="v-rider" transform="translate(${x},${y}) scale(${k})">
        <path d="M0,0 q-10,-10 -22,-4 q10,0 14,6 q-14,2 -20,10 q12,-4 22,-4 l8,2 l10,-2 l-4,-4 Z" fill="#1a0d0b"/>
        <circle cx="2" cy="-4" r="2.2" fill="#1a0d0b"/></g>`).join('')
    : '';
  return `<defs>
      <linearGradient id="v-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
      <linearGradient id="v-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix('#4b3a2e', '#6e7a3e', p)}"/><stop offset="1" stop-color="${mix('#33261e', '#4e5a2c', p)}"/></linearGradient>
      <radialGradient id="v-glow"><stop offset="0" stop-color="#ffb35a" stop-opacity="0.9"/><stop offset="1" stop-color="#ff7a2a" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${W}" height="140" fill="url(#v-sky)"/>
    <circle cx="300" cy="104" r="34" fill="${sun}" opacity="${0.35 + 0.35 * p}"/>
    ${raid ? `<g opacity="0.3"><rect width="${W}" height="140" fill="#9a1410" class="v-alarm"/></g>` : ''}
    ${riders}
    <path d="M0,112 L38,66 L78,92 L128,44 L186,98 L238,58 L296,102 L346,66 L400,98 L400,140 L0,140 Z" fill="${mix('#2a1c1d', '#5d6c82', p)}"/>
    <path d="M0,124 Q60,96 120,114 T240,110 T400,114 L400,150 L0,150 Z" fill="${mix('#3a2a22', '#56703f', p)}"/>`;
}

function ground(p) {
  return `<rect y="126" width="${W}" height="${H - 126}" fill="url(#v-ground)"/>
    <path d="M190,124 Q182,170 196,205 Q206,232 194,${H} L214,${H} Q224,232 214,205 Q202,170 210,124 Z" fill="${mix('#6a5442', '#c2a477', p)}" opacity="0.8"/>`;
}

function cliff(s, p) {
  const items = [];
  const rock = mix('#3d2e28', '#6f655b', p);
  items.push({
    y: 120,
    svg: `<path d="M0,140 L0,52 Q22,40 46,54 L72,68 Q88,96 94,140 Z" fill="${rock}"/>
      <path d="M8,64 l10,6 M30,58 l6,10 M60,80 l8,4" stroke="#00000033" stroke-width="2"/>`,
  });

  // Glimmer Caves, revealed by scouting
  if (s.areas.caves) {
    items.push({
      y: 121,
      svg: tap('caves', `<ellipse cx="22" cy="74" rx="8" ry="6" fill="#140c0c"/>
        ${[[16, 72], [24, 70], [28, 76], [19, 77]].map(([x, y], i) => `<path class="v-twinkle" style="animation-delay:${i * 0.5}s" d="M${x},${y - 3} l2,3 l-2,3 l-2,-3 Z" fill="#8fe8ff"/>`).join('')}`, 'Glimmer Caves'),
    });
  }

  // Dragon Den, Act 2
  if (s.dragon) {
    const lvl = s.buildings.den;
    const dr = s.dragon;
    const sizes = [26, 30, 34, 38, 42];
    const dw = sizes[dr.stage] ?? 30;
    const den = `<ellipse cx="48" cy="110" rx="${15 + Math.min(lvl, 3) * 2}" ry="${12 + Math.min(lvl, 3)}" fill="#120a09"/>
      ${lvl >= 1 ? `<path d="M${30 - lvl},118 Q48,${88 - lvl * 2} ${66 + lvl},118" stroke="#9c8f80" stroke-width="${3 + lvl}" fill="none"/>` : ''}
      <path d="M36,120 q12,-4 24,0" stroke="#d6b45a" stroke-width="3" fill="none"/>
      <svg x="${48 - dw / 2}" y="${118 - dw * 0.9}" width="${dw}" height="${dw * 0.91}" viewBox="-110 -140 220 200">${dragonInner(dr)}</svg>
      ${lvl >= 2 ? `<g><rect x="24" y="112" width="3" height="8" fill="#5b4a3c"/><circle class="v-flame" cx="25.5" cy="110" r="3" fill="#ff9a3c"/>
        <rect x="69" y="112" width="3" height="8" fill="#5b4a3c"/><circle class="v-flame" cx="70.5" cy="110" r="3" fill="#ff9a3c"/></g>` : ''}
      ${lvl >= 3 ? `<path d="M48,84 l0,-14 l12,4 l-12,4" fill="${dr.element ? { fire: '#d23f26', frost: '#4aa7d1', storm: '#7656d1' }[dr.element] : '#c9572e'}" stroke="#3a2a20" stroke-width="0.8"/>` : ''}`;
    items.push({ y: 122, svg: tap('den', den, `Dragon Den${lvl ? ` (level ${lvl})` : ''}`) });
  }
  return items;
}

let dragonCache = { key: '', svg: '' };
function dragonInner(dr) {
  const key = `${dr.stage}|${dr.element}`;
  if (dragonCache.key !== key) {
    const full = dragonSVG(dr.stage, dr.element, 0.1, dr.stage <= 1);
    // drop the outer <svg> and the gradient ids (they would clash with the Dragon tab)
    dragonCache = {
      key,
      svg: full.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<defs>[\s\S]*?<\/defs>/, '')
        .replace(/<ellipse cx="0" cy="48"[^>]*\/>/, '').replace(/<circle cx="0" cy="-20" r="105"[^>]*\/>/, ''),
    };
  }
  return dragonCache.svg;
}

function forest(s, p) {
  const trees = [[6, 150], [20, 142], [34, 154], [50, 146], [64, 156], [12, 164], [44, 166], [78, 150], [28, 172]];
  const green = Math.round(p * trees.length);
  const svg = trees.map(([x, y], i) => {
    if (i < green) {
      const g = ['#3f6b35', '#4f7d3a', '#36602f'][i % 3];
      return `<g><rect x="${x - 1.2}" y="${y - 10}" width="2.4" height="10" fill="#5a3c26"/>
        <path d="M${x},${y - 30} L${x + 9},${y - 8} L${x - 9},${y - 8} Z" fill="${g}"/>
        <path d="M${x},${y - 36} L${x + 6},${y - 20} L${x - 6},${y - 20} Z" fill="${g}"/></g>`;
    }
    const h = 18 + rnd(i) * 10;
    return `<g stroke="#1e1512" stroke-width="2" stroke-linecap="round" fill="none">
      <path d="M${x},${y} L${x},${y - h}"/>
      <path d="M${x},${y - h * 0.6} l-5,-6 M${x},${y - h * 0.75} l5,-5" stroke-width="1.3"/></g>`;
  }).join('');
  return [{ y: 160, svg: tap('forest', svg, green < trees.length / 2 ? 'The burned forest' : 'The forest is growing back') }];
}

function mine(s) {
  const open = s.areas.oldmine;
  const svg = open
    ? `<path d="M110,128 L110,112 Q122,100 134,112 L134,128 Z" fill="#140c0a"/>
       <path d="M108,128 L108,110 L136,110 L136,128" stroke="#7a5534" stroke-width="3" fill="none"/>
       <circle class="v-flame" cx="139" cy="108" r="2.2" fill="#ffd36a"/>
       <path d="M112,128 L150,134" stroke="#5a4636" stroke-width="1.2"/>
       <rect x="138" y="124" width="10" height="6" rx="1" fill="#6b5442"/><circle cx="141" cy="131" r="1.5" fill="#2b211b"/><circle cx="146" cy="131" r="1.5" fill="#2b211b"/>`
    : `<ellipse cx="122" cy="126" rx="11" ry="5" fill="#1e1512"/>
       <path d="M112,124 l20,-4 M114,120 l18,6" stroke="#6b5442" stroke-width="2"/>
       <circle cx="135" cy="128" r="3" fill="#6a6058"/><circle cx="139" cy="127" r="2" fill="#7c7268"/>`;
  return [{ y: 128, svg: tap('mine', svg, open ? 'The Old Mine (reopened)' : 'The ore pit') }];
}

function quarry(s) {
  return [{
    y: 126,
    svg: tap('quarry', `<path d="M340,126 L348,108 L362,104 L376,112 L384,126 Z" fill="#7d7268"/>
      <path d="M350,112 l6,10 M366,108 l-4,12" stroke="#5d544c" stroke-width="1.5"/>
      <rect x="342" y="122" width="6" height="4" fill="#9a9086"/><rect x="376" y="121" width="5" height="5" fill="#8b8178"/>`, 'Rubble quarry'),
  }];
}

function lake(s, p) {
  const water = mix('#2a3440', '#3f8cb8', p);
  const fish = s.areas.lake
    ? `<path class="v-fish" d="M362,150 q4,-6 8,0 q-4,3 -8,0 Z" fill="#cfe9f5"/>
       <path d="M390,142 l0,-8 M394,143 l1,-9 M386,144 l-1,-7" stroke="#6f8f4a" stroke-width="1.2"/>`
    : '';
  const items = [{
    y: 132,
    svg: tap('lake', `<path d="M286,136 Q330,124 400,128 L400,178 Q352,174 322,164 Q294,154 286,136 Z" fill="${water}"/>
      <path class="v-shimmer" d="M310,146 h14 M340,156 h18 M366,140 h12 M330,138 h10" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1"/>
      ${fish}`, s.areas.lake ? 'Deep Lake' : 'The stream and lake'),
  }];
  const docks = s.buildings.dock;
  if (docks > 0) {
    const len = 26 + Math.min(docks, 4) * 10;
    const boats = Array.from({ length: Math.min(docks, 3) }, (_, i) => `<g transform="translate(${336 + i * 18},${138 + (i % 2) * 6})">
        <path d="M-7,0 Q0,5 7,0 Z" fill="#7a5534"/><line x1="0" y1="0" x2="0" y2="-7" stroke="#3a2a20" stroke-width="0.8"/>
        <path d="M0,-7 L5,-2 L0,-2 Z" fill="#e8dcc4"/></g>`).join('');
    items.push({
      y: 152,
      svg: tap('dock', `<rect x="296" y="148" width="${len}" height="4" fill="#8a6440"/>
        ${Array.from({ length: Math.ceil(len / 10) }, (_, i) => `<rect x="${298 + i * 10}" y="152" width="1.6" height="6" fill="#5a3f28"/>`).join('')}
        ${boats}`, `Fishing Dock x${docks}`),
    });
  }
  return items;
}

const HUT_SLOTS = [[150, 132], [254, 132], [126, 146], [280, 146], [164, 156], [238, 158]];

function huts(s) {
  const n = s.buildings.hut;
  const items = HUT_SLOTS.map(([x, y], i) => {
    if (i < n) {
      return {
        y,
        svg: tap('hut', `<rect x="${x - 9}" y="${y - 10}" width="18" height="10" fill="#9a7650"/>
          <path d="M${x - 12},${y - 9} L${x},${y - 22} L${x + 12},${y - 9} Z" fill="#c9a250"/>
          <path d="M${x - 8},${y - 13} L${x + 8},${y - 13}" stroke="#a88638" stroke-width="1"/>
          <rect x="${x - 2.5}" y="${y - 6}" width="5" height="6" fill="#4a3324"/>`, 'Rebuilt hut'),
      };
    }
    if (i < 4) {
      return {
        y,
        svg: tap('hut', `<path d="M${x - 9},${y} L${x - 9},${y - 6} L${x - 4},${y - 4} L${x},${y - 8} L${x + 5},${y - 3} L${x + 9},${y - 5} L${x + 9},${y} Z" fill="#3a2a22"/>
          <path d="M${x - 10},${y - 2} L${x + 6},${y - 12}" stroke="#1c120e" stroke-width="2"/>
          ${s.act === 1 ? smoke(x + 2, y - 10, 0.6, i * 0.7) : ''}`, 'Burned hut'),
      };
    }
    return null;
  }).filter(Boolean);
  if (n > HUT_SLOTS.length) {
    items.push({ y: 160, svg: `<text x="200" y="166" class="v-label" text-anchor="middle">+${n - HUT_SLOTS.length} huts</text>` });
  }
  return items;
}

function blacksmith(s) {
  const x = 96;
  const y = 186;
  if (!s.buildings.blacksmith) {
    return [{
      y,
      svg: tap('blacksmith', `<path d="M${x - 22},${y} L${x - 22},${y - 14} L${x - 12},${y - 10} L${x - 4},${y - 18} L${x + 6},${y - 9} L${x + 14},${y - 13} L${x + 22},${y - 6} L${x + 22},${y} Z" fill="#41312a"/>
        <path d="M${x - 24},${y - 4} L${x + 10},${y - 22}" stroke="#1c120e" stroke-width="3"/>
        <rect x="${x + 8}" y="${y - 28}" width="7" height="20" fill="#3a2e2a"/>
        ${smoke(x + 11, y - 30, 1, 0.3)}`, 'Ruined blacksmith'),
    }];
  }
  const tools = s.upgrades.tools;
  const fire = s.dragon && s.dragon.stage >= 1;
  const glowR = 10 + Math.min(tools, 5) * 2 + (fire ? 4 : 0);
  return [{
    y,
    svg: tap('blacksmith', `<circle cx="${x - 8}" cy="${y - 6}" r="${glowR}" fill="url(#v-glow)" class="v-flicker"/>
      <rect x="${x - 22}" y="${y - 18}" width="44" height="18" fill="#7d6a58"/>
      <path d="M${x - 22},${y - 18} h44" stroke="#5d4c3e" stroke-width="1"/>
      <path d="M${x - 26},${y - 17} L${x - 6},${y - 32} L${x + 26},${y - 17} Z" fill="#6b3d26"/>
      <rect x="${x + 10}" y="${y - 38}" width="7" height="16" fill="#5d5048"/>
      ${smoke(x + 13.5, y - 40, 0.8, 0)}
      <rect x="${x - 14}" y="${y - 11}" width="10" height="11" fill="#2a1a12"/>
      <rect x="${x - 13}" y="${y - 6}" width="8" height="5" fill="${fire ? '#ffb02e' : '#ff7a2a'}" class="v-flicker"/>
      <path d="M${x + 26},${y - 2} h8 l-2,-4 h-6 Z" fill="#4a4a50"/>
      ${s.upgrades.spear ? `<path d="M${x + 4},${y} L${x + 4},${y - 14} M${x + 8},${y} L${x + 8},${y - 14}" stroke="#8a6a44" stroke-width="1"/>
        <path d="M${x + 2.5},${y - 14} l1.5,-3 l1.5,3 Z M${x + 6.5},${y - 14} l1.5,-3 l1.5,3 Z" fill="#c8c8cc"/>` : ''}
      ${tools ? `<text x="${x}" y="${y + 9}" class="v-label" text-anchor="middle">Tools ${tools}</text>` : ''}`, `Blacksmith${tools ? `, tools level ${tools}` : ''}`),
  }];
}

function barracks(s) {
  const x0 = 262;
  const x1 = 352;
  const y = 196;
  const built = s.buildings.barracks;
  const stakes = [];
  for (let x = x0, i = 0; x <= x1; x += 6, i++) {
    if (built && x > 298 && x < 316) continue; // the gate
    const h = built ? 20 + (i % 2) * 2 : 4 + rnd(i + 3) * 14;
    const lean = built ? 0 : (rnd(i) - 0.5) * 8;
    stakes.push(`<path d="M${x - 2},${y} L${x - 2 + lean},${y - h} L${x + lean},${y - h - 3} L${x + 2 + lean},${y - h} L${x + 2},${y} Z" fill="${built ? '#8a6440' : '#33241c'}"/>`);
  }
  let svg = stakes.join('');
  if (built) {
    const tall = s.upgrades.training >= 2 ? 10 : 0;
    const flags = Math.min(s.upgrades.training, 4);
    svg += `<rect x="298" y="${y - 22}" width="18" height="4" fill="#6b4a2e"/>
      <rect x="${x1 + 2}" y="${y - 48 - tall}" width="4" height="${48 + tall}" fill="#6b4a2e"/>
      <rect x="${x1 + 12}" y="${y - 48 - tall}" width="4" height="${48 + tall}" fill="#6b4a2e"/>
      <rect x="${x1}" y="${y - 52 - tall}" width="18" height="6" fill="#8a6440"/>
      <path d="M${x1 - 1},${y - 52 - tall} L${x1 + 9},${y - 62 - tall} L${x1 + 19},${y - 52 - tall} Z" fill="#6b3d26"/>
      <circle cx="${x1 + 9}" cy="${y - 64 - tall}" r="6" fill="url(#v-glow)" class="v-flicker"/>
      <circle cx="${x1 + 9}" cy="${y - 64 - tall}" r="2" fill="#ffd36a" class="v-flame"/>
      ${Array.from({ length: flags }, (_, i) => `<g transform="translate(${x0 + 6 + i * 12},${y - 24})"><line y2="-10" stroke="#3a2a20"/><path d="M0,-10 l7,2 l-7,3 Z" fill="#b8402c"/></g>`).join('')}`;
  } else {
    svg += `<path d="M${x1 + 4},${y} L${x1 + 22},${y - 10}" stroke="#2a1d16" stroke-width="4"/>
      ${smoke(x1 - 10, y - 18, 0.8, 1.4)}`;
  }
  return [{ y, svg: tap('barracks', svg, built ? 'Barracks and Night Watch' : 'Ruined barracks') }];
}

function chiefsSeat(s) {
  const x = 200;
  const y = 128;
  const b = s.buildings;
  if (b.hall > 0) {
    const lvl = Math.min(b.hall, 4);
    const w = 52 + lvl * 8;
    const shields = Math.min(lvl * 2, 6);
    const svg = `<rect x="${x - w / 2}" y="${y - 16}" width="${w}" height="16" fill="#7a5a3c"/>
      <path d="M${x - w / 2 - 6},${y - 15} L${x - w / 2 + 6},${y - 34} L${x + w / 2 - 6},${y - 34} L${x + w / 2 + 6},${y - 15} Z" fill="#5a3a26"/>
      <path d="M${x - w / 2 + 6},${y - 34} h${w - 12}" stroke="#c9a250" stroke-width="1.5"/>
      ${lvl >= 2 ? `<path d="M${x - w / 2 + 6},${y - 34} q-6,-6 -2,-10 q2,4 6,4 Z M${x + w / 2 - 6},${y - 34} q6,-6 2,-10 q-2,4 -6,4 Z" fill="#c9a250"/>` : ''}
      <rect x="${x - 5}" y="${y - 11}" width="10" height="11" fill="#2a1a12"/>
      ${Array.from({ length: shields }, (_, i) => {
        const sx = x - w / 2 + 8 + i * ((w - 16) / Math.max(1, shields - 1));
        if (Math.abs(sx - x) < 8) return '';
        return `<circle cx="${sx}" cy="${y - 8}" r="2.6" fill="${['#b8402c', '#3f6fa0', '#c9a250'][i % 3]}" stroke="#3a2a20" stroke-width="0.6"/>`;
      }).join('')}
      ${lvl >= 3 ? `<g transform="translate(${x - w / 2 - 4},${y})"><line y2="-30" stroke="#3a2a20"/><path d="M0,-30 h8 v10 l-4,-3 l-4,3 Z" fill="#b8402c"/></g>
        <g transform="translate(${x + w / 2 + 4},${y})"><line y2="-30" stroke="#3a2a20"/><path d="M0,-30 h-8 v10 l4,-3 l4,3 Z" fill="#b8402c"/></g>` : ''}
      ${smoke(x, y - 36, 0.7, 0.5)}`;
    return [{ y, svg: tap('hall', svg, `Chief’s Hall, level ${b.hall}`) }];
  }
  if (b.tent) {
    return [{
      y,
      svg: tap('tent', `<path d="M${x - 26},${y} L${x},${y - 38} L${x + 26},${y} Z" fill="#cfa86a"/>
        <path d="M${x - 13},${y} L${x},${y - 38} L${x + 4},${y}" fill="#b58c52"/>
        <path d="M${x - 4},${y} L${x},${y - 14} L${x + 4},${y} Z" fill="#3a2418"/>
        <line x1="${x}" y1="${y - 38}" x2="${x}" y2="${y - 50}" stroke="#3a2a20" stroke-width="1"/>
        <path d="M${x},${y - 50} l10,3 l-10,3 Z" fill="#b8402c"/>`, 'Chief’s Tent'),
    }];
  }
  // The father's pyre: ashes and embers where the chief's seat will stand
  const frame = b.barracks
    ? `<path d="M${x - 22},${y} L${x},${y - 32} L${x + 22},${y} M${x},${y - 32} L${x},${y}" stroke="#8a6440" stroke-width="2" fill="none"/>`
    : '';
  return [{
    y,
    svg: tap('tent', `<ellipse cx="${x}" cy="${y - 2}" rx="18" ry="5" fill="#2a1d18"/>
      ${[-14, -8, 0, 8, 14].map((dx, i) => `<circle cx="${x + dx}" cy="${y - 2 + (i % 2)}" r="2.6" fill="#6a6058"/>`).join('')}
      <path d="M${x - 9},${y - 3} L${x + 9},${y - 7} M${x - 7},${y - 7} L${x + 8},${y - 2}" stroke="#1a100c" stroke-width="3"/>
      <circle cx="${x}" cy="${y - 4}" r="9" fill="url(#v-glow)" class="v-flicker" opacity="0.7"/>
      ${frame}
      ${smoke(x, y - 10, 1.1, 0.2)}`, b.barracks ? 'Raising the Chief’s Tent' : 'Your father’s pyre'),
  }];
}

function farm(s) {
  const n = s.buildings.farm;
  const cols = 4;
  const items = [];
  const golden = (s.skills?.harvestSong || 0) > 0;
  for (let i = 0; i < 8; i++) {
    const cx = 18 + (i % cols) * 40;
    const cy = 212 + Math.floor(i / cols) * 24;
    let svg;
    if (i < n) {
      const crop = golden ? '#d9b443' : '#6f9a3c';
      svg = `<rect x="${cx}" y="${cy}" width="34" height="18" rx="2" fill="#6a4a2e"/>
        ${[3, 8, 13].map((dy) => `<path d="M${cx + 3},${cy + dy} h28" stroke="${crop}" stroke-width="3" stroke-dasharray="3 2" stroke-linecap="round"/>`).join('')}`;
    } else if (i === 0 || i < n + 2) {
      svg = `<rect x="${cx}" y="${cy}" width="34" height="18" rx="2" fill="#2f241e"/>
        <path d="M${cx + 4},${cy + 5} l6,2 M${cx + 18},${cy + 11} l8,-3 M${cx + 10},${cy + 14} l5,1" stroke="#17100c" stroke-width="2"/>`;
    } else continue;
    items.push({ y: cy + 18, svg: tap('farm', svg, n ? `Farm plots x${n}` : 'Scorched fields') });
  }
  if (n > 8) items.push({ y: 260, svg: `<text x="88" y="257" class="v-label" text-anchor="middle">+${n - 8} more plots</text>` });
  return items;
}

function stockpile(s, cap) {
  const lvl = (k) => Math.min(4, Math.ceil((s.res[k] / cap) * 4));
  const wood = lvl('wood');
  const stone = lvl('stone');
  const iron = lvl('iron');
  const food = lvl('food');
  let svg = '';
  // woodpile
  for (let r = 0; r < wood; r++) {
    for (let c = 0; c < 4 - r * 0.5; c++) {
      svg += `<circle cx="${236 + c * 5 + r * 2.5}" cy="${238 - r * 4.4}" r="2.4" fill="#9a6a3c" stroke="#5a3c22" stroke-width="0.6"/>`;
    }
  }
  // stone pile
  for (let i = 0; i < stone * 3; i++) {
    svg += `<circle cx="${262 + (i % 4) * 4 + Math.floor(i / 4) * 2}" cy="${239 - Math.floor(i / 4) * 3.5}" r="2.6" fill="${['#8b8178', '#a29890', '#776d65'][i % 3]}"/>`;
  }
  // iron bars
  for (let i = 0; i < iron * 2; i++) {
    svg += `<rect x="${284 + (i % 3) * 4}" y="${238 - Math.floor(i / 3) * 2.5}" width="3.6" height="2" fill="#9aa0a8" stroke="#5a5e66" stroke-width="0.4"/>`;
  }
  // food baskets
  for (let i = 0; i < food; i++) {
    svg += `<g transform="translate(${226 - i * 7},${240})"><path d="M-3,0 h6 l-1,-4 h-4 Z" fill="#a87a3c"/><circle cx="-1" cy="-5" r="1.6" fill="#c8402c"/><circle cx="1.4" cy="-5" r="1.6" fill="#e8b84c"/></g>`;
  }
  if (s.res.hides >= 1) {
    svg += `<path d="M298,240 L298,226 M312,240 L312,226 M297,227 h16" stroke="#5a3c22" stroke-width="1.4"/>
      <path d="M300,228 h4 l1,8 h-6 Z M306,228 h5 l0,7 h-5 Z" fill="#9a6a44"/>`;
  }
  if (s.starving) svg += `<text x="262" y="252" class="v-label warn" text-anchor="middle">Stores empty</text>`;
  return [{ y: 242, svg: tap('stockpile', svg || `<text x="262" y="240" class="v-label" text-anchor="middle">Empty stockpile</text>`, 'The stockpile') }];
}

function villagers(s) {
  const j = s.jobs;
  const idle = Math.max(0, s.pop - Object.values(j).reduce((a, b) => a + b, 0));
  return [
    ...crowd('woodcutter', j.woodcutter, [[84, 166], [72, 172], [90, 158], [60, 178]]),
    ...crowd('quarrier', j.quarrier, [[352, 128], [370, 129], [361, 131], [344, 129]]),
    ...crowd('miner', j.miner, [[118, 132], [128, 134], [146, 136], [108, 134]]),
    ...crowd('farmer', j.farmer, [[50, 230], [92, 232], [130, 228], [168, 236]]),
    ...crowd('hunter', j.hunter, [[16, 182], [30, 186], [8, 190], [40, 190]]),
    ...crowd('smith', j.smith, [[126, 190], [132, 194]]),
    ...crowd('guard', j.guard, [[276, 206], [288, 208], [300, 206], [318, 208], [330, 206], [342, 208]], 6),
    ...crowd('fisher', j.fisher, [[304, 148], [314, 148], [324, 148], [334, 148]]),
    ...crowd('keeper', j.keeper, [[74, 126], [24, 126], [80, 130]]),
    ...crowd('idle', idle, [[184, 142], [218, 142], [176, 150], [226, 150], [192, 156], [210, 156]], 6),
  ];
}

// ---------- the whole scene ----------

let cache = { key: '', svg: '' };

export function villageKey(s, cap) {
  const lvl = (k) => Math.min(4, Math.ceil((s.res[k] / cap) * 4));
  return JSON.stringify([
    s.act, s.buildings, s.upgrades, s.areas, s.jobs, s.pop, s.starving, !!s.raid?.warning,
    s.dragon && [s.dragon.stage, s.dragon.element], s.skills?.harvestSong || 0,
    ['wood', 'stone', 'iron', 'food'].map(lvl), s.res.hides >= 1,
  ]);
}

export function villageSVG(s, cap, highlight = null) {
  const key = villageKey(s, cap);
  if (!highlight && cache.key === key) return cache.svg;
  const p = restoration(s);
  const items = [
    ...cliff(s, p), ...forest(s, p), ...mine(s), ...quarry(s), ...lake(s, p), ...huts(s),
    ...blacksmith(s), ...barracks(s), ...chiefsSeat(s), ...farm(s), ...stockpile(s, cap), ...villagers(s),
  ].sort((a, b) => a.y - b.y);
  const ring = highlight && RING[highlight]
    ? `<ellipse class="v-ring" cx="${RING[highlight][0]}" cy="${RING[highlight][1]}" rx="${RING[highlight][2]}" ry="${RING[highlight][2] * 0.45}" fill="none" stroke="#ffd36a" stroke-width="2" stroke-dasharray="5 4"/>`
    : '';
  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Your village, ${Math.round(p * 100)}% restored">
    ${sky(s, p)}${ground(p)}${ring}${items.map((i) => i.svg).join('')}
  </svg>`;
  if (!highlight) cache = { key, svg };
  return svg;
}

// Tap areas [x, y, width, height], fitted so neighbours don't overlap.
const HIT = {
  farm: [14, 208, 164, 48], blacksmith: [70, 150, 62, 44], barracks: [258, 128, 116, 76],
  tent: [172, 82, 56, 50], hall: [154, 82, 92, 50], dock: [294, 132, 72, 26], den: [26, 84, 46, 40],
};

const RING = {
  farm: [88, 226, 70], blacksmith: [96, 184, 34], barracks: [310, 194, 54], tent: [200, 128, 32],
  hall: [200, 128, 44], hut: [150, 132, 16], dock: [330, 150, 34], den: [48, 118, 26],
};

export const AREA_INFO = {
  forest: 'The burned forest. It grows back as the village recovers. Woodcutters and hunters work its edge.',
  mine: 'The ore pit. Miners dig here. A scouting flight can find the Old Mine sealed beneath it.',
  quarry: 'Rubble from the raid. Quarriers cut usable stone from it.',
  lake: 'The stream and lake. Fishing by hand happens here, and the Fishing Dock goes on its shore.',
  caves: 'The Glimmer Caves, found by your dragon. Dig here by hand for rare crystal.',
  stockpile: 'The stockpile. The piles grow with what you have stored.',
};
