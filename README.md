# Dragon Chief

A mobile incremental idle game. A young chief rebuilds his raided village, finds out he alone can bond with dragons, and raises one dragon from hatchling to legend.

Built from the *Dragon Chief — Idle Game Design Doc* (Nov 15, 2026). This build covers **Act 1: The Ashes** and **Act 2: The Bond**, ending on the Act 3 seed (Rune magic and the troll collars).

## Play

It's a no-build web game (plain ES modules), installable as a PWA and playable offline.

```sh
npm start          # serves on http://localhost:8080
```

On a phone, open the URL and use **Add to Home Screen** to install it full-screen. Progress saves to the device every 10 seconds and when the app goes to the background.

## What's in it

**Act 1: The Ashes**
- Manual gathering: chop wood, clear rubble, mine ore (35% per tap), forage, fish, and later hunt.
- Rebuild order from the doc: Farm Plots → Blacksmith → Barracks → Chief's Tent, with the doc's starting costs and 15% cost growth.
- Each building brings back survivors with a line about what they saw. Survivors also trickle home while there's food and housing.
- Jobs: woodcutter, quarrier, miner, farmer, hunter, smith, guard (plus fisher and Dragon Keeper in Act 2). Each villager eats 0.1 food/s; running out halves output.
- Scavengers steal from the stockpile until the Barracks posts the Night Watch.
- Clues found while gathering fill the Lore journal.
- Finale: the baby dragon in the troll net (you name it).

**Act 2: The Bond**
- Dragon needs (Hunger, Warmth, Affection) drain over time and combine into **Contentment**, which multiplies dragon XP, Bond and a village-wide morale bonus. A neglected dragon never dies; it just stops growing and boosting.
- What you feed it before Juvenile decides its element: fish → Frost, roast → Fire, ore-salted → Storm.
- Evolution: Hatchling → Whelp → Juvenile → Drake → Elder, each with the doc's requirements and village effects (tap sparks, faster smelting, scouting flights, island rides and raid defense, an all-system aura).
- **Bond** skill tree with Hearth, Wing and Rune branches.
- **Trust** unlocks Dragon Keepers (automatic care), more housing and rider training.
- New buildings: Fishing Dock, Dragon Den (slower drain) and Chief's Hall (storage, offline time).
- Troll raids return with a 30-second warning (tap **Rally**). Wins drop troll scrap, which the dragon needs to evolve.
- Offline progress: the village keeps working and the dragon sleeps (slow drain, bonus growth). The offline cap grows with the Tent and Hall.

## Code layout

| File | What it does |
| --- | --- |
| `src/data.js` | All tunable numbers, buildings, jobs, stages, skills, clues and story text |
| `src/engine.js` | Game rules as pure functions over a plain state object (tick, build, gather, dragon, raids, offline, save) |
| `src/main.js` | Mobile UI, input, modals, save/load and the game loop |
| `src/dragonArt.js` | Procedural SVG dragon that changes with stage, element and mood |
| `sw.js`, `manifest.webmanifest` | Offline cache and install metadata |
| `test/engine.test.js` | Engine tests (`npm test`, Node 18+) |

All numbers are first-pass placeholders, as in the doc. Tune them in `src/data.js` and `derive()` in `src/engine.js`.

## Shipping to the app stores

The doc leaves the engine open. This build is a web game, so it can be wrapped with [Capacitor](https://capacitorjs.com/) for iOS and Android without changing the game code:

```sh
npm i -D @capacitor/cli @capacitor/core @capacitor/ios @capacitor/android
npx cap init "Dragon Chief" com.example.dragonchief --web-dir .
npx cap add ios && npx cap add android
npx cap open ios   # or android
```

(Pick a real bundle ID, and point `--web-dir` at a folder that holds only the game files if you add other tooling.)

## Open questions still open

Final title, multiple dragons, who leads the trolls, and monetization are left as the doc has them.
