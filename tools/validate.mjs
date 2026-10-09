/**
 * Chart validation. Runs without a browser because the chart pipeline is pure.
 *
 *   node tools/validate.mjs
 *
 * Exits non-zero if any invariant is broken.
 */

import { SONGS } from "../src/game/songs.js";
import { buildChart, DIFFICULTIES, MISS_WINDOW } from "../src/game/chart.js";

let failures = 0;
let checks = 0;

function check(condition, message) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

const MIN_DURATION = 8;
const MAX_DURATION = 95;

console.log("validating songs and charts\n");

for (const song of SONGS) {
  check(typeof song.id === "string" && song.id.length > 0, `${song.title}: missing id`);
  check(Number.isFinite(song.bpm) && song.bpm > 20 && song.bpm < 260, `${song.title}: bad bpm`);
  check(song.tracks?.length > 0, `${song.title}: no tracks`);
  check(/^#[0-9a-f]{6}$/i.test(song.accent), `${song.title}: bad accent colour`);
  check(typeof song.composer === "string" && song.composer.length > 0, `${song.title}: no composer`);

  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const chart = buildChart(song, difficulty);
    const tag = `${song.title} [${difficulty}]`;

    check(chart.notes.length > 0, `${tag}: chart is empty`);
    check(
      chart.laneCount === DIFFICULTIES[difficulty].lanes,
      `${tag}: lane count ${chart.laneCount} != ${DIFFICULTIES[difficulty].lanes}`,
    );
    check(chart.palette.length === chart.laneCount, `${tag}: palette size mismatch`);
    check(
      chart.duration >= MIN_DURATION && chart.duration <= MAX_DURATION,
      `${tag}: duration ${chart.duration.toFixed(1)}s outside ${MIN_DURATION}-${MAX_DURATION}s`,
    );

    // Lane bounds and pitch sanity.
    for (const n of chart.notes) {
      if (!(n.lane >= 0 && n.lane < chart.laneCount)) {
        check(false, `${tag}: lane ${n.lane} out of range`);
        break;
      }
      if (!(n.midi >= 21 && n.midi <= 108)) {
        check(false, `${tag}: midi ${n.midi} out of range`);
        break;
      }
    }

    // Time order.
    let ordered = true;
    for (let i = 1; i < chart.notes.length; i++) {
      if (chart.notes[i].time < chart.notes[i - 1].time - 1e-9) ordered = false;
    }
    check(ordered, `${tag}: notes are not sorted by time`);

    // No two notes may share a lane at the same instant, or one of them is
    // unhittable.
    const seen = new Set();
    let collisions = 0;
    for (const n of chart.notes) {
      const key = `${n.lane}:${n.time.toFixed(4)}`;
      if (seen.has(key)) collisions++;
      seen.add(key);
    }
    check(collisions === 0, `${tag}: ${collisions} note(s) share a lane and time`);

    // Onsets must respect the difficulty's minimum gap.
    const eps = 1 / 240 + 1e-9;
    let minGap = Infinity;
    let prevOnset = -Infinity;
    let lastTime = null;
    for (const n of chart.notes) {
      if (lastTime === null || Math.abs(n.time - lastTime) > eps) {
        if (prevOnset !== -Infinity) minGap = Math.min(minGap, n.time - prevOnset);
        prevOnset = n.time;
        lastTime = n.time;
      }
    }
    check(
      minGap >= DIFFICULTIES[difficulty].minGap - eps,
      `${tag}: shortest onset gap ${minGap.toFixed(3)}s below minGap ${DIFFICULTIES[difficulty].minGap}`,
    );

    // Difficulty must actually get denser (or at least not invert).
    const densityRank = { easy: 0, normal: 1, hard: 2 };
    check(
      densityRank[difficulty] === 2 ||
        chart.stats.nps <= buildChart(song, "hard").stats.nps + 1e-6,
      `${tag}: denser than hard`,
    );

    // Lane usage should not be absurdly concentrated.
    const counts = new Array(chart.laneCount).fill(0);
    for (const n of chart.notes) counts[n.lane]++;
    const worst = Math.max(...counts) / chart.notes.length;
    check(worst <= 0.72, `${tag}: lane concentration ${(worst * 100).toFixed(0)}% is too high`);

    // Every chart must be reachable within the miss window.
    check(MISS_WINDOW > 0 && MISS_WINDOW < 0.4, `${tag}: implausible miss window`);
  }
}

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) {
  console.error(`\n❌ ${failures} failure(s)`);
  process.exit(1);
}
console.log("✅ all charts valid");
