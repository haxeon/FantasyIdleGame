// Procedural SVG dragon. Grows and changes with each evolution stage and
// takes its element's colours from the Juvenile stage on.

const PALETTES = {
  none: { body: '#d9683a', belly: '#f7c47e', wing: '#9c3b24', horn: '#f3e2c0', eye: '#ffd34d' },
  fire: { body: '#d23f26', belly: '#ffb35c', wing: '#7e1a14', horn: '#ffe2a8', eye: '#ffe14d' },
  frost: { body: '#4aa7d1', belly: '#dff4ff', wing: '#215f8a', horn: '#ffffff', eye: '#b8f4ff' },
  storm: { body: '#7656d1', belly: '#ddd0ff', wing: '#3a2687', horn: '#f0eaff', eye: '#fff36b' },
};

const SCALE = [0.62, 0.74, 0.86, 0.97, 1.06];

export function dragonSVG(stage, element, content = 1, collar = true) {
  const p = PALETTES[element || 'none'];
  const sc = SCALE[stage] ?? 1;
  const wingSpan = [0.45, 0.75, 1, 1.25, 1.4][stage] ?? 1;
  const headR = [25, 23, 21, 20, 20][stage] ?? 20;
  const sad = content < 0.3;
  const sleepy = content < 0.15;

  const spikes = stage >= 1
    ? [-28, -14, 0, 14].map((x, i) => {
      const y = -26 + Math.abs(x) * 0.12;
      const h = 9 + stage * 2 - i;
      return `<path d="M${x - 6},${y + 2} L${x},${y - h} L${x + 6},${y + 2} Z" fill="${p.wing}"/>`;
    }).join('')
    : '';

  const horns = stage >= 2
    ? `<path d="M38,-62 q-4,-${12 + stage * 4} -16,-${16 + stage * 4} q8,10 6,20 Z" fill="${p.horn}"/>
       <path d="M52,-60 q2,-${12 + stage * 4} 12,-${18 + stage * 4} q-2,12 -4,20 Z" fill="${p.horn}"/>`
    : `<circle cx="34" cy="-64" r="4" fill="${p.horn}"/><circle cx="54" cy="-63" r="4" fill="${p.horn}"/>`;

  const eye = sleepy
    ? `<path d="M48,-50 q6,4 12,0" stroke="#2a1a14" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : `<circle cx="54" cy="-50" r="7" fill="#fff"/>
       <circle cx="55.5" cy="-50" r="4.4" fill="${p.eye}"/>
       <ellipse cx="56" cy="-50" rx="1.6" ry="3.6" fill="#1b0f0a"/>
       <circle cx="53" cy="-53" r="1.6" fill="#fff"/>
       ${sad ? `<path d="M46,-60 l14,4" stroke="#2a1a14" stroke-width="2.5" stroke-linecap="round"/>` : ''}`;

  const mouth = sad
    ? `<path d="M58,-34 q6,-4 12,0" stroke="#2a1a14" stroke-width="2" fill="none" stroke-linecap="round"/>`
    : `<path d="M58,-36 q6,5 12,0" stroke="#2a1a14" stroke-width="2" fill="none" stroke-linecap="round"/>`;

  const collarSvg = collar && stage <= 1
    ? `<g><path d="M18,-34 q16,10 34,2" stroke="#4a4038" stroke-width="7" fill="none" stroke-linecap="round"/>
        <path d="M24,-30 l2,-4 M32,-27 l1,-5 M40,-27 l2,-4" stroke="#8fe3ff" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/></g>`
    : '';

  const aura = stage >= 4
    ? `<circle cx="0" cy="-20" r="105" fill="url(#aura)" class="aura"/>`
    : '';

  const shell = stage === 0
    ? `<path d="M-48,30 l10,-12 l8,10 l9,-13 l9,12 l8,-10 l9,11 l8,-9 l10,12 q-30,22 -71,0 Z" fill="#efe6d4" stroke="#c9bba1" stroke-width="2"/>`
    : '';

  return `<svg viewBox="-110 -140 220 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Your dragon">
  <defs>
    <radialGradient id="aura"><stop offset="0" stop-color="${p.eye}" stop-opacity="0.35"/><stop offset="1" stop-color="${p.eye}" stop-opacity="0"/></radialGradient>
    <radialGradient id="ember"><stop offset="0" stop-color="#ff9a3c" stop-opacity="0.55"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="0" cy="48" rx="90" ry="14" fill="url(#ember)"/>
  ${aura}
  <g transform="scale(${sc})" class="dragon-body">
    <g class="wing wing-back" style="transform-origin:-6px -22px">
      <path d="M-6,-22 L${-40 * wingSpan},${-95 * wingSpan} L${-20 * wingSpan},${-70 * wingSpan} L${-60 * wingSpan},${-82 * wingSpan} L${-34 * wingSpan},${-48 * wingSpan} L${-70 * wingSpan},${-50 * wingSpan} L-26,-10 Z" fill="${p.wing}" opacity="0.75"/>
    </g>
    <path d="M-34,8 q-50,10 -62,-26 q-2,-6 4,-4 q16,22 52,4 Z" fill="${p.body}"/>
    <path d="M-96,-22 l-8,-10 l12,2 Z" fill="${p.wing}"/>
    ${spikes}
    <ellipse cx="-4" cy="0" rx="44" ry="32" fill="${p.body}"/>
    <ellipse cx="2" cy="10" rx="30" ry="20" fill="${p.belly}"/>
    <path d="M-2,8 h20 M-2,16 h22 M0,24 h18" stroke="${p.body}" stroke-width="1.5" opacity="0.4"/>
    <ellipse cx="-28" cy="28" rx="12" ry="9" fill="${p.body}"/>
    <ellipse cx="18" cy="30" rx="12" ry="9" fill="${p.body}"/>
    <path d="M10,37 l3,5 M16,38 l1,5 M22,38 l-1,5" stroke="${p.horn}" stroke-width="2" stroke-linecap="round"/>
    <path d="M18,-18 q10,-30 26,-34 l8,22 q-14,4 -18,24 Z" fill="${p.body}"/>
    ${collarSvg}
    <g class="head">
      ${horns}
      <circle cx="44" cy="-46" r="${headR}" fill="${p.body}"/>
      <ellipse cx="66" cy="-38" rx="14" ry="10" fill="${p.body}"/>
      <ellipse cx="70" cy="-34" rx="9" ry="5" fill="${p.belly}"/>
      <circle cx="74" cy="-42" r="1.6" fill="#2a1a14"/>
      ${eye}
      ${mouth}
      ${!sad && !sleepy ? `<ellipse cx="44" cy="-36" rx="5" ry="3" fill="#ff8a8a" opacity="0.5"/>` : ''}
    </g>
    <g class="wing wing-front" style="transform-origin:0px -20px">
      <path d="M0,-20 L${-24 * wingSpan},${-100 * wingSpan} L${-4 * wingSpan},${-74 * wingSpan} L${-36 * wingSpan},${-90 * wingSpan} L${-14 * wingSpan},${-52 * wingSpan} L${-46 * wingSpan},${-58 * wingSpan} L-16,-6 Z" fill="${p.wing}"/>
    </g>
  </g>
  ${shell}
</svg>`;
}
