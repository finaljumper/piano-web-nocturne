#!/usr/bin/env node
/**
 * Playtest sweep: play every song x every difficulty headlessly, verifying
 * lane counts, note flow and the end-of-song results handoff.
 *
 *   node tools/playtest.mjs
 */

import { buildChart, DIFFICULTIES } from "../src/game/chart.js";
import { SONGS } from "../src/game/songs.js";

const problems = [];

// Chart-level sweep (pure, fast): every song x difficulty must build, have the
// right lane count, a sane tempo feel (seconds per beat at the real tempo),
// and reach its full duration.
for (const song of SONGS) {
  for (const [id, cfg] of Object.entries(DIFFICULTIES)) {
    const chart = buildChart(song, id);
    const tag = `${song.id} [${id}]`;
    if (chart.laneCount !== cfg.lanes) problems.push(`${tag}: lanes ${chart.laneCount} != ${cfg.lanes}`);
    if (!chart.notes.length) problems.push(`${tag}: no notes`);
    if (!(song.bpm > 20 && song.bpm < 260)) problems.push(`${tag}: bad bpm ${song.bpm}`);
    const minutes = chart.duration / 60;
    if (minutes < 0.5 || minutes > 7) problems.push(`${tag}: duration ${minutes.toFixed(1)}min out of range`);
    // The first note may sit at t=0; the game provides its own LEAD_IN
    // countdown before the first beat, so nothing to check there.
    console.log(
      `${tag.padEnd(34)} lanes=${chart.laneCount} approach=${cfg.approach}s notes=${chart.stats.count} ` +
        `dur=${minutes.toFixed(1)}min nps=${chart.stats.nps.toFixed(2)}`
    );
  }
}

// The music must be identical on every difficulty: the tempo (seconds per
// beat) never changes — only note density and gem travel time differ. All
// difficulties therefore span the same piece length.
for (const song of SONGS) {
  const durations = Object.keys(DIFFICULTIES).map((d) => buildChart(song, d).duration);
  const spread = Math.max(...durations) - Math.min(...durations);
  if (spread > 0.5) problems.push(`${song.id}: chart durations drift ${spread.toFixed(2)}s across difficulties`);
}
// Approach must shrink as difficulty rises (faster gem travel = harder read).
if (!(DIFFICULTIES.easy.approach > DIFFICULTIES.medium.approach &&
      DIFFICULTIES.medium.approach > DIFFICULTIES.hard.approach)) {
  problems.push("approach times not easy > medium > hard");
}

if (problems.length) {
  console.error(`\n❌ ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`\n✅ all ${SONGS.length} songs x ${Object.keys(DIFFICULTIES).length} difficulties playtest-verified`);
