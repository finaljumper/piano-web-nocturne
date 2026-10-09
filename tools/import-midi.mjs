#!/usr/bin/env node
/**
 * Convert a public-domain MIDI file into the game's song-data ES module.
 *
 * Usage:
 *   node tools/import-midi.mjs <in.mid> <song-id> [--split <midi-note>] [--track-hands]
 *
 * Output: src/game/data/<song-id>.js
 *   { tracks: [{ hand, notes: [{midi, dur}] }], bpm, beatsPerBar }
 *
 * Hand assignment:
 *   --track-hands  trust the source's track split (2 melodic tracks => L/R by
 *                  lowest average pitch).
 *   --split N      (default 60 = C4) split one merged track at pitch N.
 *
 * The conversion stays faithful to the source; the difficulty `minGap`
 * thinning in chart.js is what keeps it playable per difficulty.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import MidiPkg from "@tonejs/midi";
const { Midi } = MidiPkg;

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("usage: node tools/import-midi.mjs <in.mid> <song-id> [--split N] [--track-hands] [--bpm N]");
  process.exit(1);
}
const [inPath, songId] = args;
let split = 60;
let trackHands = false;
let bpmOverride = null;
for (let i = 2; i < args.length; i++) {
  if (args[i] === "--split") split = Number(args[++i]);
  else if (args[i] === "--track-hands") trackHands = true;
  else if (args[i] === "--bpm") bpmOverride = Number(args[++i]);
}

const midi = new Midi(readFileSync(resolve(inPath)));
const bpm = bpmOverride ?? Math.round(midi.header.tempos[0]?.bpm ?? 120);
const ts = midi.header.timeSignatures[0];
const beatsPerBar = ts ? ts.timeSignature[0] : 4;

/** Merge duplicate pitches at (nearly) the same beat, clamp durations. */
function collectTrack(track) {
  const notes = track.notes
    .map((n) => ({
      midi: n.midi,
      beat: n.ticks / midi.header.ppq,
      dur: Math.max(1 / 64, n.durationTicks / midi.header.ppq),
    }))
    .sort((a, b) => a.beat - b.beat || a.midi - b.midi);

  // Merge same-pitch notes that overlap (a re-strike within 1/16 counts as new).
  const EPS = 1 / 16;
  const byPitch = new Map();
  const out = [];
  for (const n of notes) {
    const key = n.midi;
    const prev = byPitch.get(key);
    if (prev && n.beat - (prev.beat + prev.dur) < EPS && n.beat - prev.beat < EPS) {
      // overlapping duplicate — extend, don't emit
      prev.dur = Math.max(prev.dur, n.beat + n.dur - prev.beat);
      continue;
    }
    const copy = { ...n };
    out.push(copy);
    byPitch.set(key, copy);
  }

  // Notes must be sequential in the game's expandTrack: insert rests by using
  // per-note start offsets is not supported, so we emit with gaps preserved
  // via explicit "beat" keys handled below.
  return out;
}

const melodic = midi.tracks.filter((t) => t.notes.length > 0);
let tracks;

if (trackHands && melodic.length >= 2) {
  // Use the source's own tracks; order by lowest average pitch.
  const sorted = [...melodic].sort(
    (a, b) =>
      a.notes.reduce((s, n) => s + n.midi, 0) / a.notes.length -
      b.notes.reduce((s, n) => s + n.midi, 0) / b.notes.length
  );
  const [lo, hi] = sorted;
  tracks = [
    { hand: "L", track: lo },
    { hand: "R", track: hi },
  ];
} else {
  // One merged pool, split at pitch threshold.
  const pool = melodic.flatMap((t) => collectTrack(t));
  const lo = pool.filter((n) => n.midi < split);
  const hi = pool.filter((n) => n.midi >= split);
  tracks = [
    { hand: "L", notes: lo },
    { hand: "R", notes: hi },
  ];
}

/**
 * Convert a list of {midi, beat, dur} into the sequential {midi, dur} format
 * the game consumes (expandTrack advances a cursor by each note's duration,
 * so events must not overlap in time). Each onset group is truncated to the
 * next onset so overlapping pedal-held notes don't double-count time; rests
 * fill real silence. Chord onsets within 1/64 beat emit together.
 */
function toSequential(notes, maxChord = 4) {
  const seq = [...notes].sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  const final = [];
  let cursor = 0;
  for (let i = 0; i < seq.length; ) {
    const beat = seq[i].beat;
    let j = i;
    while (j < seq.length && seq[j].beat - beat <= 1 / 64) j++;
    const group = seq.slice(i, j);
    i = j;
    // Rest for genuine silence before this onset.
    const rest = beat - cursor;
    if (rest > 1 / 64) final.push({ midi: null, dur: rest });
    const nextBeat = i < seq.length ? seq[i].beat : null;
    // Cap chords so lanes stay readable: keep the top voices.
    group.sort((a, b) => b.midi - a.midi);
    // The game's note format is strictly sequential — notes within one hand
    // cannot sound at the same instant — so a simultaneous chord becomes a
    // quick spread that fills the slot exactly: k voices, each lasting slot/k.
    const slot = nextBeat !== null
      ? nextBeat - beat
      : Math.min(...group.map((p) => p.dur));
    // Keep only as many voices as fit without going under the min duration.
    const minDur = 1 / 64;
    const keep = Math.max(1, Math.min(maxChord, Math.floor(slot / minDur)));
    const chord = group.slice(0, keep);
    const step = slot / chord.length;
    chord.forEach((p, idx) => {
      // Last voice absorbs rounding so the group sums to the slot exactly.
      const dur = idx === chord.length - 1 ? slot - step * idx : step;
      final.push({ midi: p.midi, dur: Math.max(minDur, dur) });
    });
    cursor = beat + slot;
  }
  return final;
}

const result = {
  id: songId,
  source: basename(inPath),
  bpm,
  beatsPerBar,
  tracks: [],
};

if (tracks[0].track) {
  for (const { hand, track } of tracks) {
    const notes = collectTrack(track);
    result.tracks.push({ hand, notes: toSequential(notes) });
  }
} else {
  for (const { hand, notes } of tracks) result.tracks.push({ hand, notes: toSequential(notes) });
}

mkdirSync("src/game/data", { recursive: true });
const outPath = resolve(`src/game/data/${songId}.js`);
writeFileSync(outPath, `export default ${JSON.stringify(result)};\n`);
const total = result.tracks.reduce((s, t) => s + t.notes.length, 0);
console.log(`wrote ${outPath}: ${total} note events, bpm ${bpm}, ${beatsPerBar}/4 meter`);
