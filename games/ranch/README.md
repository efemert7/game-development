# Meadowbrook Ranch (v1)

A small first-person farming game in plain HTML/CSS/JavaScript with Three.js r128 (loaded from cdnjs).
All models are built in code from boxes, cylinders, spheres and cones. No model or texture files.

## Run

```bash
cd games/ranch
python3 -m http.server 8000
# open http://localhost:8000 in Chrome, Edge or Firefox
```

(Any static server works, e.g. `npx serve .`. An internet connection is needed for the Three.js CDN.)

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click the game to capture the mouse) |
| Shift | Run (uses energy) |
| E / left click | Interact / use selected tool |
| 1–5, mouse wheel | Select tool: Shovel, Watering Can, Seeds, Bucket, Axe |
| R (or 3 again) | Change seed type (wheat / carrot / corn) |
| Esc | Pause menu (Resume, Save, Controls, New Game) |

## How to play

- **Crops:** dig a plot in the brown field with the shovel, plant seeds, and water the plot (once per growth stage).
  Crops grow through 3 visible stages. Harvest when ripe. Refill the watering can at the well.
- **Animals:** feed chickens/cows (Animal Feed or Wheat). Chickens lay an egg on the ground; cows can then be milked with the bucket.
  An orange marker means hungry, white means ready to milk.
- **Wood:** chop trees with the axe (3 hits). Stumps regrow after a few days.
- **Economy:** sell at the box with the blue sign; buy seeds, feed, animals and fence upgrades at the striped stall.
- **Energy:** working and running use energy. Use the farmhouse door to sleep until 6:00 the next day.
- Progress autosaves every 30 seconds and when you sleep (localStorage).

Debug helpers are available in the browser console as `RanchGame` (e.g. `RanchGame.state().coins = 999`).
