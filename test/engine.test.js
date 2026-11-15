import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';

const always = () => 0; // rng that always hits and always finds clues
const never = () => 0.999;

function give(s, res) {
  for (const [k, v] of Object.entries(res)) s.res[k] = v;
}

test('costs grow 15% per purchase', () => {
  assert.deepEqual(E.costOf({ wood: 100 }, 0), { wood: 100 });
  assert.deepEqual(E.costOf({ wood: 100 }, 1), { wood: 115 });
  assert.deepEqual(E.costOf({ wood: 100 }, 2), { wood: 133 });
});

test('Act 1 rebuild order is enforced and brings survivors', () => {
  const s = E.newState();
  give(s, { wood: 250, stone: 250, ore: 250, iron: 250, hides: 250 });
  assert.equal(E.build(s, 'blacksmith'), false, 'blacksmith needs a farm first');
  assert.equal(E.build(s, 'farm'), true);
  assert.equal(s.pop, 3);
  assert.equal(E.build(s, 'tent'), false);
  assert.equal(E.build(s, 'blacksmith'), true);
  give(s, { wood: 250, stone: 250, ore: 250, iron: 250, hides: 250 });
  assert.equal(E.build(s, 'barracks'), true);
  give(s, { wood: 250, stone: 250, ore: 250, iron: 250, hides: 250 });
  assert.equal(s.jobs.guard, 3, 'returning guards take their posts');
  assert.equal(E.build(s, 'tent'), true);
  assert.equal(s.act, 2);
  assert.ok(s.dragon);
  assert.ok(s.events.some((e) => e.type === 'story'));
});

test('gathering is manual, ore is rare, clues turn up', () => {
  const s = E.newState();
  const r = E.gather(s, 'chop', always);
  assert.equal(r.hit, true);
  assert.equal(s.res.wood, 1);
  assert.ok(r.clue, 'rng 0 finds a clue');
  assert.equal(s.clues.length, 1);
  const miss = E.gather(s, 'mine', never);
  assert.equal(miss.hit, false);
  assert.equal(s.res.ore, 0);
  assert.equal(E.gather(s, 'hunt', always), null, 'hunting needs a spear');
});

test('workers produce and villagers eat', () => {
  const s = E.newState();
  give(s, { wood: 30, stone: 10, food: 100 });
  E.build(s, 'farm');
  assert.ok(E.assign(s, 'woodcutter', 1));
  E.tick(s, 10, never);
  assert.ok(Math.abs(s.res.wood - 5) < 1e-6);
  // 3 villagers eat 0.3/s, one farm makes 0.5/s
  assert.ok(Math.abs(s.res.food - 102) < 1e-6);
});

test('food running out slows workers', () => {
  const s = E.newState();
  give(s, { wood: 30, stone: 10, food: 0 });
  E.build(s, 'farm');
  s.pop = 10;
  E.tick(s, 1, never);
  assert.equal(s.starving, true);
  assert.equal(E.derive(s).jobMult, 0.5);
});

test('smiths turn 5 ore into 1 iron, limited by ore on hand', () => {
  const s = E.newState();
  give(s, { wood: 250, stone: 250, ore: 40, food: 200 });
  E.build(s, 'farm');
  E.build(s, 'blacksmith');
  give(s, { ore: 1 });
  E.assign(s, 'smith', 1);
  E.tick(s, 10, never); // wants 5 ore, has 1
  assert.ok(s.res.ore < 1e-9);
  assert.ok(Math.abs(s.res.iron - 0.2) < 1e-9);
});

function act2() {
  const s = E.newState();
  give(s, { wood: 250, stone: 250, ore: 250, iron: 250, hides: 250, food: 250 });
  for (const b of ['farm', 'blacksmith', 'barracks', 'tent']) {
    give(s, { wood: 250, stone: 250, ore: 250, iron: 250, hides: 250, food: 250 });
    assert.ok(E.build(s, b), b);
  }
  s.events = [];
  return s;
}

test('dragon needs drain, contentment drives growth and bond', () => {
  const s = act2();
  const dr = s.dragon;
  dr.hunger = dr.warmth = dr.affection = 100;
  assert.equal(E.contentment(dr), 1);
  E.tick(s, 10, never);
  assert.ok(dr.hunger < 100 && dr.warmth < 100 && dr.affection < 100);
  assert.ok(dr.xp > 0 || dr.level > 1);
  assert.ok(s.res.bond > 0);

  dr.hunger = dr.warmth = dr.affection = 0;
  const xp = dr.xp;
  const bond = s.res.bond;
  E.tick(s, 10, never);
  assert.equal(dr.xp, xp, 'a neglected dragon stops growing');
  assert.equal(s.res.bond, bond);
});

test('feeding sets the element at Juvenile', () => {
  const s = act2();
  const dr = s.dragon;
  give(s, { food: 1000, ore: 1000 });
  dr.hunger = 0;
  assert.ok(E.feed(s, 'salted'));
  dr.level = 10;
  assert.ok(E.evolve(s));
  assert.equal(dr.stage, 1);
  dr.level = 25;
  s.res.scrap = 25;
  assert.ok(E.evolve(s));
  assert.equal(dr.element, 'storm');
});

test('level is capped until the dragon evolves', () => {
  const s = act2();
  E.addXp(s, 1e6);
  assert.equal(s.dragon.level, 10);
});

test('raids: guards win scrap', () => {
  const s = act2();
  s.raid.next = 0.5;
  E.tick(s, 1, never);
  const ev = s.events.find((e) => e.type === 'raid');
  assert.ok(ev.won, '3 guards beat the first raid');
  assert.ok(s.res.scrap > 0);
});

test('keepers feed the dragon', () => {
  const s = act2();
  s.res.trust = 20;
  s.pop += 2;
  assert.ok(E.assign(s, 'keeper', 1));
  s.dragon.hunger = 10;
  E.tick(s, 9, never);
  assert.ok(s.dragon.hunger > 10);
});

test('offline progress is capped and the dragon sleeps', () => {
  const s = act2();
  s.dragon.hunger = s.dragon.warmth = s.dragon.affection = 100;
  E.assign(s, 'farmer', 0);
  const report = E.applyOffline(s, 100000, never);
  assert.equal(report.seconds, E.derive(s).offlineCap);
  assert.ok(s.dragon.level > 1);
});

test('save round-trips', () => {
  const s = act2();
  const t = E.deserialize(E.serialize(s));
  assert.equal(t.act, 2);
  assert.equal(t.dragon.name, s.dragon.name);
  assert.deepEqual(t.events, []);
  assert.equal(E.deserialize('garbage').act, 1);
});

test('skills need their prerequisite', () => {
  const s = act2();
  s.res.bond = 100;
  assert.equal(E.buySkill(s, 'steadyWork'), false);
  assert.ok(E.buySkill(s, 'warmHands'));
  assert.ok(E.buySkill(s, 'steadyWork'));
});
