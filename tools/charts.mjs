import { SONGS } from "../src/game/songs.js";
import { buildChart, DIFFICULTIES } from "../src/game/chart.js";

for (const song of SONGS) {
  console.log(`\n${song.title} — ${song.composer} (${song.bpm} bpm)`);
  for (const d of ["easy", "medium", "hard"]) {
    const c = buildChart(song, d);
    const lanes = new Array(c.laneCount).fill(0);
    for (const n of c.notes) lanes[n.lane]++;
    const dur = c.notes.length ? c.notes[c.notes.length - 1].time + 2.2 : 0;
    const span = c.notes.length ? c.notes[c.notes.length - 1].time - c.notes[0].time : 0;
    console.log(
      `  ${d.padEnd(6)} lanes=${c.laneCount} notes=${String(c.stats.count).padStart(3)} ` +
      `dur=${dur.toFixed(1)}s nps=${(c.stats.count / Math.max(1, span)).toFixed(2)} ` +
      `peak=${c.stats.peak.toFixed(1)} rating=${c.stats.rating}/10 lanes[${lanes.join(",")}]`
    );
  }
}
