// Static game data. All numbers are first-pass placeholders for tuning
// (see "Economy and scaling" in the design doc).

export const COST_GROWTH = 1.15; // cost_n = base * 1.15^n
export const FOOD_UPKEEP = 0.1; // food per villager per second
export const BASE_CAP = 250;
export const TENT_CAP = 1000;
export const HALL_CAP_MULT = 1.5;

export const RESOURCES = {
  wood: { name: 'Wood', icon: '🪵', capped: true },
  stone: { name: 'Stone', icon: '🪨', capped: true },
  ore: { name: 'Ore', icon: '⛏️', capped: true },
  food: { name: 'Food', icon: '🍖', capped: true },
  iron: { name: 'Iron bars', icon: '🔩', capped: true },
  hides: { name: 'Hides', icon: '🧥', capped: true },
  scrap: { name: 'Troll scrap', icon: '🗡️', capped: false },
  crystal: { name: 'Rare crystal', icon: '💎', capped: false },
  bond: { name: 'Bond', icon: '✨', capped: false },
  trust: { name: 'Trust', icon: '🤝', capped: false },
};

// Manual gathering. `chance` is the odds a tap yields anything.
export const GATHER = {
  chop: { name: 'Chop wood', verb: 'Chop', icon: '🪓', gives: { wood: 1 }, chance: 1 },
  rubble: { name: 'Clear rubble', verb: 'Clear', icon: '🧱', gives: { stone: 1 }, chance: 1 },
  mine: { name: 'Mine ore', verb: 'Mine', icon: '⛏️', gives: { ore: 1 }, chance: 0.35, note: 'Slow and rare' },
  forage: { name: 'Forage', verb: 'Forage', icon: '🍄', gives: { food: 1 }, chance: 1 },
  fish: { name: 'Fish the stream', verb: 'Fish', icon: '🎣', gives: { food: 2 }, chance: 0.5 },
  hunt: { name: 'Hunt', verb: 'Hunt', icon: '🏹', gives: { hides: 1, food: 2 }, chance: 0.3, needs: 'spear' },
  crystal: { name: 'Glimmer Caves', verb: 'Dig', icon: '💎', gives: { crystal: 1 }, chance: 0.06, needs: 'caves' },
};

// Main rebuild order for Act 1, then Act 2 buildings.
export const BUILDINGS = {
  farm: {
    name: 'Farm Plot', icon: '🌾', base: { wood: 30, stone: 10 }, repeat: true, step: 1,
    desc: '+0.5 food per second. Food brings survivors home.',
  },
  hut: {
    name: 'Rebuilt Hut', icon: '🛖', base: { wood: 40, stone: 20 }, repeat: true,
    desc: 'Room for 2 more villagers.',
  },
  blacksmith: {
    name: 'Blacksmith (repair)', icon: '⚒️', base: { wood: 100, stone: 80, ore: 40 }, step: 2,
    desc: 'Better tools, smelting 5 ore into 1 iron bar, and a spear for hunting hides.',
  },
  barracks: {
    name: 'Barracks (repair)', icon: '🛡️', base: { wood: 150, stone: 120, iron: 20 }, step: 3,
    desc: '3 guards and the Night Watch, which stops scavengers stealing from the stockpile.',
  },
  tent: {
    name: "Chief's Tent", icon: '⛺', base: { wood: 200, iron: 10, hides: 20 }, step: 4,
    desc: 'Village storage and the chief’s seat. Completes Act 1.',
  },
  dock: {
    name: 'Fishing Dock', icon: '🛶', base: { wood: 80, stone: 30 }, repeat: true, act: 2,
    desc: '+0.3 food per second and 3 fisher jobs. Fish keeps a dragon fed.',
  },
  den: {
    name: 'Dragon Den', icon: '🕳️', base: { wood: 120, stone: 80, iron: 5 }, repeat: true, act: 2,
    desc: 'A warmer, safer den. Each level slows need drain by 12%.',
  },
  hall: {
    name: "Chief's Hall", icon: '🏛️', base: { wood: 250, stone: 200, iron: 20, hides: 15 }, repeat: true, act: 2,
    desc: 'Storage x1.5, +1 hour of offline earnings, room for 3 villagers.',
  },
};

// Things crafted or trained at buildings.
export const UPGRADES = {
  spear: {
    name: 'Hunting Spear', icon: '🔱', base: { wood: 10, iron: 2 }, at: 'blacksmith',
    desc: 'Unlocks hunting by hand and the hunter job.',
  },
  tools: {
    name: 'Better Tools', icon: '🛠️', base: { wood: 30, iron: 3 }, repeat: true, at: 'blacksmith',
    desc: '+25% per tap and per worker. Guards fight harder too.',
  },
  training: {
    name: 'Guard Training', icon: '⚔️', base: { food: 60, iron: 6 }, repeat: true, at: 'barracks',
    desc: '+2 guard posts.',
  },
};

// Villager jobs. Rates are per worker per second.
export const JOBS = {
  woodcutter: { name: 'Woodcutter', icon: '🪓', makes: { wood: 0.5 } },
  quarrier: { name: 'Quarrier', icon: '🧱', makes: { stone: 0.4 } },
  miner: { name: 'Miner', icon: '⛏️', makes: { ore: 0.12 } },
  farmer: { name: 'Farmer', icon: '🌾', makes: { food: 0.6 }, capNote: '2 per farm plot' },
  hunter: { name: 'Hunter', icon: '🏹', makes: { hides: 0.06, food: 0.25 }, needs: 'spear' },
  smith: { name: 'Smith', icon: '🔥', makes: { iron: 0.1 }, eats: { ore: 0.5 }, needs: 'blacksmith', capNote: '2 at the forge' },
  guard: { name: 'Guard', icon: '🛡️', makes: {}, needs: 'barracks', capNote: 'Defends against raids' },
  fisher: { name: 'Fisher', icon: '🎣', makes: { food: 0.9 }, needs: 'dock', capNote: '3 per dock' },
  keeper: { name: 'Dragon Keeper', icon: '🧺', makes: {}, needs: 'keeper', capNote: 'Feeds and warms the dragon' },
};

export const DRAGON_STAGES = [
  { name: 'Hatchling', level: 1, cost: {}, gives: 'Sparks that boost the chief’s taps (+3% per level).' },
  { name: 'Whelp', level: 10, cost: { food: 300 }, gives: 'Fire breath: smelting x2, and it partly warms itself.' },
  { name: 'Juvenile', level: 25, cost: { scrap: 25 }, gives: 'Scouting flights reveal new areas and Clues. Its element is chosen.' },
  { name: 'Drake', level: 50, cost: { crystal: 5 }, gives: 'Ridable: fights raids and reaches new islands.' },
  { name: 'Elder', level: 100, cost: { bond: 500 }, gives: 'An aura that boosts every system by 50%.' },
];
// Food and wood the dragon needs per feeding grow with each form.
export const STAGE_APPETITE = [1, 2, 4, 7, 12];
export const STAGE_XP = [1, 1.5, 2.5, 4, 6];
export const LEVEL_CAP_ELDER = 200;

export const NEED_DRAIN = { hunger: 0.18, warmth: 0.15, affection: 0.22 };

export const FEEDS = {
  fish: { name: 'Fish', icon: '🐟', cost: { food: 10 }, hunger: 20, element: 'frost' },
  roast: { name: 'Roast meat', icon: '🍖', cost: { food: 8, wood: 5 }, hunger: 22, element: 'fire' },
  salted: { name: 'Ore-salted', icon: '🧂', cost: { food: 8, ore: 2 }, hunger: 22, element: 'storm' },
};
export const STOKE = { cost: { wood: 6 }, warmth: 25 };

export const ELEMENTS = {
  fire: { name: 'Fire', color: '#e2552e', desc: 'Smelting x1.5 and raid power x1.25.' },
  frost: { name: 'Frost', color: '#5fc2e8', desc: 'Needs drain 25% slower.' },
  storm: { name: 'Storm', color: '#9b7cf0', desc: 'Gathering x1.2 and faster scouting.' },
};

export const SKILLS = {
  hearth: {
    name: 'Hearth', icon: '🔥', desc: 'Boosts village production and job output.',
    nodes: {
      warmHands: { name: 'Warm Hands', base: 5, max: 10, desc: '+15% per tap' },
      steadyWork: { name: 'Steady Work', base: 8, max: 10, req: ['warmHands', 1], desc: '+10% job output' },
      harvestSong: { name: 'Harvest Song', base: 12, max: 10, req: ['steadyWork', 2], desc: '+15% food production' },
    },
  },
  wing: {
    name: 'Wing', icon: '🪽', desc: 'Speeds dragon growth and slows need drain.',
    nodes: {
      strongWings: { name: 'Strong Wings', base: 5, max: 10, desc: '+15% dragon XP' },
      patientBelly: { name: 'Patient Belly', base: 8, max: 10, req: ['strongWings', 1], desc: 'Needs drain 8% slower' },
      thickHide: { name: 'Thick Hide', base: 15, max: 10, req: ['patientBelly', 2], desc: '+20% dragon raid power' },
    },
  },
  rune: {
    name: 'Rune', icon: '🔮', desc: 'Grows the magic itself.',
    nodes: {
      runeSight: { name: 'Rune Sight', base: 6, max: 10, desc: '+20% Clue chance, +10% Bond' },
      glowingPalm: { name: 'Glowing Palm', base: 10, max: 10, req: ['runeSight', 1], desc: 'Petting gives +50% affection and Bond' },
      collarLore: { name: 'Collar Lore', base: 150, max: 1, req: ['glowingPalm', 3], desc: 'Read the runes on the broken collar' },
    },
  },
};
export const SKILL_GROWTH = 1.4;

export const TRUST_KEEPER = 10;
export const TRUST_RIDERS = 60;

// Clues are found in order. Act 1 clues come from gathering by hand,
// Act 2 clues from scouting and island flights.
export const CLUES = [
  { id: 'scale', name: 'Scorched scale', text: 'A scale the size of your palm, still warm at the edges. No lizard grows this big.' },
  { id: 'charm', name: 'Bone charm', text: 'Carved troll-bone on a leather thong. The runes on it seem to crawl when you look away.' },
  { id: 'rein', name: 'Bitten rein', text: 'A thick hide strap, chewed through. Something fought hard against being ridden.' },
  { id: 'footprint', name: 'Three-toed print', text: 'Pressed deep into the ash. Whatever made it walked away carrying something heavy.' },
  { id: 'glass', name: 'Tear of glass', text: 'Where something wept onto hot ash, the ash turned to glass. Dragons cry?' },
  { id: 'collar', name: 'Broken rune collar', text: 'Iron, carved with the same crawling runes as the charm. The inside is scratched raw. They do not ride dragons. They chain them.' },
  // Act 2
  { id: 'camp', name: 'Abandoned troll camp', text: 'Stakes in a ring, and chains thick as your arm. The ground inside is scorched in claw marks.', act: 2 },
  { id: 'stone', name: 'Rune stone', text: 'A standing stone carved with the collar runes. Your palm tingles when you touch it, and the carving dims.', act: 2 },
  { id: 'shells', name: 'Empty eggshells', text: 'Dozens of them, in a nest that was never a nest. A pen. They are breeding them.', act: 2 },
  { id: 'banner', name: 'Crowned skull banner', text: 'Every raider band flies it. Someone leads the trolls, and they answer to a crown.', act: 2 },
  { id: 'cages', name: 'Island cages', text: 'From the air you count the cages on the far islands. Some are empty. Some are not.', act: 2 },
  { id: 'lullaby', name: 'The old lullaby', text: 'An elder hums a song about the "dragon-hand" chiefs of long ago. Your father knew it. He never sang it to you.', act: 2 },
];
export const ACT1_CLUES = CLUES.filter((c) => !c.act).length;

// Survivors return with a line about what they saw.
export const SURVIVOR_LINES = {
  farm: {
    count: 3,
    lines: [
      ['Mara, the miller’s widow', 'They came down out of the clouds, chief. Riders on their backs… shaped like men, but not.'],
      ['Old Tobin', 'I saw one lash its beast with a chain. The dragon screamed like it hated every wingbeat.'],
    ],
  },
  blacksmith: {
    count: 2,
    lines: [['Bram, the smith’s apprentice', 'Their blades were black iron. I’ve never seen ore like it. Not from these hills.']],
  },
  barracks: {
    count: 3,
    lines: [['Captain Hild', 'Your father held the gate alone so we could run. He’d want you keeping watch now.']],
  },
  tent: {
    count: 3,
    lines: [['Wren, the shepherd girl', 'One of the dragons looked right at me. It didn’t want to burn anything. I could tell.']],
  },
};

export const SCOUT_AREAS = [
  { id: 'caves', name: 'Glimmer Caves', text: 'Your dragon circles a cliff and dives into a cave mouth. Crystals glitter in the dark. (New gathering spot)' },
  { id: 'lake', name: 'Deep Lake', text: 'A lake the raiders never found, thick with fish. Fishing by hand now catches three times as much.' },
  { id: 'oldmine', name: 'The Old Mine', text: 'A collapsed mine your grandfather sealed. Mining by hand now finds ore twice as often.' },
];

export const STORY = {
  intro: [
    {
      title: 'The morning after',
      body: 'Smoke still hangs over the valley. Last night, creatures like trolls came out of the clouds riding <b>dragons</b> — beasts from your grandmother’s stories. They burned the village in a single night.',
    },
    {
      title: 'The pyre',
      body: 'Your father, the chief, fell holding the gate. At dawn, a handful of survivors light his funeral pyre and turn to you. <i>“The chief’s son is chief now.”</i><br><br>There is no one to give orders to. You pick up an axe.',
    },
  ],
  finale: [
    {
      title: 'A cry in the burned forest',
      body: 'The night the tent goes up, a thin, desperate cry comes from the burned forest. You take a torch and follow it.',
    },
    {
      title: 'The baby dragon',
      body: 'Tangled in a troll net lies a dragon no bigger than a dog, wearing a broken rune collar. It snaps and hisses as you cut the net. When you reach for it, <b>your hand begins to glow</b> — and the dragon goes still, then presses its head into your palm.',
    },
    {
      title: 'Act 2: The Bond',
      body: 'Nobody in the village has seen this power before. The dragon follows you home. It will need food, warmth and affection — and if the village cares for it, it will grow, and the village with it.<br><br>And somewhere beyond the clouds, the trolls will want it back.',
      nameInput: true,
    },
  ],
};
