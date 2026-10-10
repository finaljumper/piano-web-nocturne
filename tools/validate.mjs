/**
 * Chart validation. Runs without a browser because the chart pipeline is pure.
 *
 *   node tools/validate.mjs
 *
 * Exits non-zero if any invariant is broken.
 */

import { SONGS } from "../src/game/songs.js";
import { buildChart, DIFFICULTIES, MISS_WINDOW } from "../src/game/chart.js";
import { parseToken, parseNoteString } from "../src/game/notes.js";
import { Session } from "../src/game/session.js";
import { Game } from "../src/game/game.js";
import { readFileSync } from "node:fs";
import MidiPkg from "@tonejs/midi";
import { sustainedDuration } from "./midi-sustain.mjs";
import "./audit-transcriptions.mjs";

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
const MAX_DURATION = 420;

console.log("validating songs and charts\n");

/* --- score structure: these contracts come from the written notation ------ */
{
  const source = (id) => new MidiPkg.Midi(readFileSync(new URL(`./midi/${id}.mid`, import.meta.url)));
  const canon = source("canon-in-d");
  const parts = canon.tracks.filter((t) => t.notes.length);
  check(parts.length === 4, "Canon: the three canon voices and ground bass are required");
  check(JSON.stringify(parts.map((t) => t.notes[0].ticks / canon.header.ppq)) === "[8,16,24,0]",
    "Canon: voices must enter two bars apart over the opening bass");
  const bass = parts[3].notes;
  // The source's \relative c bass starts on D3, not D2.
  const ground = [50, 45, 47, 42, 43, 38, 43, 45];
  check(bass.length === 225 && bass.slice(0, 224).every((n, i) =>
    n.midi === ground[i % 8] && n.ticks === i * canon.header.ppq),
    "Canon: the 28 complete ground-bass repetitions are missing or altered");
  for (const [id, quarters] of [["minuet-in-g", 192], ["gymnopedie-1", 234], ["fur-elise", 187], ["rondo-alla-turca", 430.5]]) {
    const midi = source(id);
    const end = Math.max(...midi.tracks.flatMap((t) => t.notes).map((n) => n.ticks + n.durationTicks)) / midi.header.ppq;
    check(end === quarters, `${id}: written repeats/alternative endings are incomplete`);
  }
}

/* --- damper pedal changes audible holds, never written rhythm ------------- */
{
  const note = { time: 1, duration: 0.5 };
  const pedal = [{ time: 0.9, value: 1 }, { time: 2.5, value: 0 }];
  check(sustainedDuration(note, pedal) === 1.5, "pedal: key release cuts off a sustained harmony");
  check(sustainedDuration(note, [{ time: 1.5, value: 0 }]) === 0.5, "pedal: release at key-up adds sustain");
  check(sustainedDuration(note, [{ time: 1.6, value: 1 }, { time: 3, value: 0 }]) === 0.5, "pedal: late press revives a released note");
  check(sustainedDuration(note, [{ time: 0, value: 1 }, { time: 1.3, value: 0 }]) === 0.5, "pedal: early release shortens a held key");
  check(sustainedDuration(note, [{ time: 0, value: 1 }]) === 0.5, "pedal: missing release creates an indefinite hold");
  const chart = buildChart({ bpm: 60, tracks: [{ notes: [{ midi: 60, time: 0, dur: 0.2, sustain: 3 }] }] }, "easy");
  check(chart.performance[0].dur === 0.2 && chart.performance[0].sustain === 3 && chart.duration === 5.2,
    "pedal: audible sustain changes notated duration or gets cut off by results");
}

/* --- regression: rest durations (every rest used to parse as 1 beat) ----- */
for (const [token, beats] of [
  ["Rw", 4], ["Rh", 2], ["Rq", 1], ["Re", 0.5], ["Rs", 0.25],
  ["Rq.", 1.5], ["R:0.75", 0.75], ["E5h", 2], ["D#5e.", 0.75],
]) {
  let got;
  try {
    got = parseToken(token).dur;
  } catch (err) {
    got = `threw ${err.message}`;
  }
  check(got === beats, `token ${token}: duration ${got}, expected ${beats}`);
}

/* --- hands should stay in lockstep -------------------------------------- */
// Hand-authored arrangements align exactly; pitch-split imports can end a
// hand a few beats early (a hand's last low note may precede the other's),
// but a large drift means authoring/import data is broken.
const beatsOf = (track) => {
  const raw = typeof track.notes === "function" ? track.notes() : track.notes;
  const items = typeof raw === "string" ? parseNoteString(raw) : raw;
  return items.reduce((sum, n) => sum + n.dur, 0);
};
for (const song of SONGS) {
  if (song.tracks.length < 2) continue;
  // Absolute MIDI tracks overlap and may finish at different times by design.
  if (song.tracks.some((t) => t.notes.some?.((n) => n.time !== undefined))) continue;
  const lengths = song.tracks.map(beatsOf);
  const spread = Math.max(...lengths) - Math.min(...lengths);
  check(
    spread <= 8,
    `${song.title}: hands drift apart (${lengths.map((l) => l.toFixed(2)).join(" vs ")} beats)`,
  );
}

/* --- regression: a late press must not steal the next note in the lane --- */
{
  const notes = [
    { time: 1, lane: 0, judged: null },
    { time: 1.24, lane: 0, judged: null },
  ];
  const s = new Session({ notes });
  s.press(0, 1.13);
  s.press(0, 1.32);
  for (let t = 0; t < 2; t += 1 / 60) s.update(t);
  check(
    notes[0].judged !== "miss" && notes[1].judged !== "miss",
    `same-lane steal: got ${notes.map((n) => n.judged).join(", ")}`,
  );
}

/* --- regression: the timing offset must also move the auto-miss clock ---- */
{
  const clock = { t: 0 };
  const stub = () => {};
  const game = new Game({
    audio: {
      now: () => clock.t,
      piano: { note: stub, accent: stub },
      panic: stub,
      suspend: stub,
      resume: stub,
    },
    view: {},
    highway: { build: stub, pressLane: stub, punchLane: stub },
    effects: { clear: stub, missFlash: stub, burst: stub },
  });
  const song = { bpm: 60, tracks: [{ hand: "R", notes: "Rw C5q Rw" }] };
  game.play(song, "hard");
  game.offset = 0.15; // player is consistently 150 ms late
  const note = game.chart.notes[0];
  const pressAt = game._audioStart + note.time + 0.15 + 0.1; // and 100 ms later still
  for (clock.t = 0; clock.t < pressAt; clock.t += 1 / 60) game.update(1 / 60);
  game._press(note.lane);
  check(
    note.judged === "great",
    `offset 150ms, press 250ms late: judged ${note.judged}, expected great`,
  );
}

/* --- full audio scheduling must survive chart filtering and hits ---------- */
for (const difficulty of Object.keys(DIFFICULTIES)) {
  const calls = [];
  const clock = { t: 0 };
  const stub = () => {};
  const game = new Game({
    audio: {
      now: () => clock.t,
      piano: {
        note: (midi, when, dur, options) => calls.push({ midi, when, dur, velocity: options.velocity }),
        accent: () => calls.push("extra hit note"),
      },
      panic: stub, suspend: stub, resume: stub,
    },
    view: {},
    highway: { build: stub, pressLane: stub, punchLane: stub },
    effects: { clear: stub, missFlash: stub, burst: stub },
  });
  // Fast notes, an overlapping chord and a held final note. Easier charts
  // intentionally omit some of these events; every one must still sound.
  const song = { bpm: 120, tracks: [{ hand: "R", notes: [
    { midi: 60, time: 0, dur: 0.1, velocity: 0.6 },
    { midi: 64, time: 0, dur: 1.5, velocity: 0.4 },
    { midi: 62, time: 0.1, dur: 0.1, velocity: 0.5 },
    { midi: 65, time: 0.3, dur: 0.1, velocity: 0.7 },
    { midi: 67, time: 0.5, dur: 3, sustain: 4, velocity: 0.3 },
  ] }] };
  game.play(song, difficulty);
  const start = game._audioStart;
  const target = game.chart.notes[0];
  game.songTime = target.time;
  game._press(target.lane);
  check(game.session.hits === 1 && calls.length === 0, `${difficulty}: hit alters the original audio score`);
  check(game.chart.performance.every((n) => n.judged === undefined), `${difficulty}: judging mutates audio notes`);
  for (let frame = 0; frame <= 60; frame++) {
    clock.t = frame / 10;
    game.update(0.1);
  }
  const expected = game.chart.performance.map((n) => ({ midi: n.midi, when: start + n.time, dur: n.sustain, velocity: n.velocity }));
  check(JSON.stringify(calls) === JSON.stringify(expected), `${difficulty}: full score was not scheduled exactly once`);
  clock.t = start + 3;
  game.update(0.1);
  check(game.state === "playing", `${difficulty}: results interrupt the final sustained note`);
  game.pause();
  const scheduled = calls.length;
  game.update(0.1);
  check(game.state === "paused" && calls.length === scheduled, `${difficulty}: pause schedules additional notes`);
  game.resume();
  clock.t = start + game.chart.duration + 0.1;
  game.update(0.1);
  check(game.state === "finished", `${difficulty}: performance never finishes`);
  calls.length = 0;
  game.restart();
  for (let frame = 0; frame <= 80; frame++) {
    clock.t += 0.1;
    game.update(0.1);
  }
  check(calls.length === game.chart.performance.length, `${difficulty}: restart skips or duplicates audio events`);
}

for (const song of SONGS) {
  const source = new MidiPkg.Midi(readFileSync(new URL(`./midi/${song.id}.mid`, import.meta.url)));
  const sourceNotes = source.tracks.filter((t) => !t.instrument.percussion).flatMap((t) => t.notes);
  const signature = (n) => JSON.stringify([n.midi, n.time, n.dur ?? n.duration, n.velocity]);
  const expected = sourceNotes.map(signature).sort();
  const charts = Object.keys(DIFFICULTIES).map((d) => buildChart(song, d));
  for (const chart of charts) {
    check(
      JSON.stringify(chart.performance.map(signature).sort()) === JSON.stringify(expected),
      `${song.id} [${chart.difficulty.id}]: audio differs from source MIDI`,
    );
    check(
      chart.duration >= Math.max(...sourceNotes.map((n) => n.time + n.duration)) + 2.2 - 1e-9,
      `${song.id}: duration cuts off the full performance`,
    );
    check(chart.performance.every((n) => n.judged === undefined && n.lane === undefined),
      `${song.id}: audio notes share mutable judgement/render state`);
  }
  check(charts.every((c) => c.duration === charts[0].duration), `${song.id}: difficulty changes song length`);
  check(charts[0].notes.length < charts[1].notes.length && charts[1].notes.length < charts[2].notes.length,
    `${song.id}: target counts do not increase with difficulty`);

  check(typeof song.id === "string" && song.id.length > 0, `${song.title}: missing id`);
  check(Number.isFinite(song.bpm) && song.bpm > 20 && song.bpm < 260, `${song.title}: bad bpm`);
  check(song.tracks?.length > 0, `${song.title}: no tracks`);
  check(/^#[0-9a-f]{6}$/i.test(song.accent), `${song.title}: bad accent colour`);
  check(typeof song.composer === "string" && song.composer.length > 0, `${song.title}: no composer`);

  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const chart = buildChart(song, difficulty);
    const tag = `${song.title} [${difficulty}]`;

    check(chart.notes.length > 0, `${tag}: chart is empty`);
    const chordCounts = new Map();
    for (const n of chart.notes) {
      const key = n.time.toFixed(2);
      chordCounts.set(key, (chordCounts.get(key) ?? 0) + 1);
    }
    check(Math.max(...chordCounts.values()) <= chart.difficulty.maxChord,
      `${tag}: too many simultaneous targets`);
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
    const densityRank = { easy: 0, medium: 1, hard: 2 };
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
