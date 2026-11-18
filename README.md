# SOLMAR HEAT — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/liaw0/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/liaw0/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game that runs in a desktop browser from static
files, built for the make.fun **gta6-01** bounty (["Make GTA 6"](https://make.fun/bounty/gta6-01)).

**The city.** Solmar City is a sun-soaked coastal grid city: nine avenues of
traffic, sidewalks full of pedestrians, a beach and sea to the south, a
downtown of towers, and landmarks — the Marlin Club, the docks, the marina,
Solmar General hospital, Solmar Bank and the chop shop.

**The story.** Rook Vega came home owing $50,000 to the Marlin Club. Fixer
Delia Vane has five jobs for him: pick up a package at the docks, steal a
Comet GT from the marina, make a drop while the cops are on him, intercept a
bank courier van, and bring the final payment home. Each job pays; the debt
is the thread through all five.

**The systems.**
- On foot and by car: third-person movement, mouse-look camera, cars to
  steal and drive (WASD, handbrake, speed-sensitive steering).
- Traffic AI driving the street grid and pedestrians who stroll — and flee
  from gunfire and speeding cars.
- Wanted level (0–5 stars): stealing, hitting pedestrians and shooting raise
  the heat; police cruisers chase, ram and try to bust you. Lose them and the
  stars fade.
- Combat: a pistol with hitscan shooting, tracers, reloads and real
  consequences.
- Missions with a waypoint beacon, minimap blips and a HUD objective;
  free roam after the story is done.
- HUD with health, money, wanted stars, speed, a live minimap and a message
  feed; start screen, pause, busted / wasted flows, and a localStorage save.
- All sound is synthesized with WebAudio (engine, sirens, gunshots, a bass
  groove) — no audio files, no network requests at all.

**Tech.** three.js (vendored as `game/vendor/three/three.module.min.js`), plain
ES modules, no build step. `node serve.ts` serves `game/` on
http://localhost:8080. Screenshots are real renders of the running game
(`?shot=start|drive|chase|mission`).

Everything in this game — the city, characters, vehicles, names, story, art,
sounds and music — is original. Nothing is taken from any commercial game.
