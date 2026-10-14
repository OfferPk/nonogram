/* Game-specific achievements (cosmetic coin rewards). Shared ones live in achievements.js. */
window.ACH_DEFS = [
  { "id": "qp_first", "name": "First Picture", "desc": "Solve your first puzzle", "metric": "wins", "goal": 1, "reward": 15 },
  { "id": "qp_wins25", "name": "Sketchbook", "desc": "Solve 25 puzzles", "metric": "wins", "goal": 25, "reward": 80 },
  { "id": "qp_wins100", "name": "Gallery Wall", "desc": "Solve 100 puzzles", "metric": "wins", "goal": 100, "reward": 200 },
  { "id": "qp_flaw10", "name": "Clean Lines", "desc": "Solve 10 puzzles with no mistakes or hints", "metric": "clean_wins", "goal": 10, "reward": 70 },
  { "id": "qp_daily7", "name": "Daily Doodler", "desc": "Solve 7 Daily puzzles", "metric": "dailies", "goal": 7, "reward": 90 },
  { "id": "qp_big5", "name": "Big Canvas", "desc": "Solve 5 puzzles of 15×15 or larger", "metric": "big", "goal": 5, "reward": 100 },
  { "id": "qp_quick", "name": "Quick Quill", "desc": "Solve 10 puzzles in under 3 minutes", "metric": "quick", "goal": 10, "reward": 60 },
  { "id": "qp_all", "name": "Master Illustrator", "desc": "Solve every puzzle in every pack", "metric": "solved_total", "goal": 348, "reward": 250 }
];
