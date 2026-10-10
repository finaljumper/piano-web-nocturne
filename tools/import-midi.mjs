#!/usr/bin/env node
/**
 * Import the complete pitched MIDI performance: simultaneous voices, note
 * lengths, velocity and tempo changes. Only chart.js filters hit targets.
 *
 * node tools/import-midi.mjs <in.mid> <song-id> [--split N] [--track-hands] [--bpm N]
 * --bpm explicitly replaces the source tempo map with a constant tempo.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import MidiPkg from "@tonejs/midi";
import { sustainedDuration } from "./midi-sustain.mjs";
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
  else throw new Error(`Unknown option: ${args[i]}`);
}
if (!Number.isFinite(split) || (bpmOverride !== null && !(Number.isFinite(bpmOverride) && bpmOverride > 0))) {
  throw new Error("Split and tempo must be valid numbers");
}
const midi = new Midi(readFileSync(resolve(inPath)));
const melodic = midi.tracks.filter((t) => t.notes.length && !t.instrument.percussion);
const sorted = [...melodic].sort((a, b) =>
  a.notes.reduce((s, n) => s + n.midi, 0) / a.notes.length -
  b.notes.reduce((s, n) => s + n.midi, 0) / b.notes.length
);
const hands = { L: [], R: [] };
for (const track of melodic) {
  const timeAt = (event) => bpmOverride === null ? event.time : event.ticks / midi.header.ppq * 60 / bpmOverride;
  const pedal = (track.controlChanges[64] ?? []).map((event) => ({ ...event, time: timeAt(event) }));
  for (const note of track.notes) {
    const time = timeAt(note);
    const dur = bpmOverride === null ? note.duration : note.durationTicks / midi.header.ppq * 60 / bpmOverride;
    const held = sustainedDuration({ time, duration: dur }, pedal);
    const hand = trackHands && sorted.length >= 2
      ? (sorted.indexOf(track) < sorted.length / 2 ? "L" : "R")
      : (note.midi < split ? "L" : "R");
    hands[hand].push({
      midi: note.midi,
      time,
      dur,
      velocity: note.velocity,
      ...(held > dur + 1e-9 ? { sustain: held } : {}),
    });
  }
}
const result = {
  id: songId,
  source: basename(inPath),
  bpm: bpmOverride ?? Math.round(midi.header.tempos[0]?.bpm ?? 120),
  beatsPerBar: midi.header.timeSignatures[0]?.timeSignature[0] ?? 4,
  tracks: Object.entries(hands).map(([hand, notes]) => ({
    hand,
    notes: notes.sort((a, b) => a.time - b.time || a.midi - b.midi),
  })),
};
mkdirSync("src/game/data", { recursive: true });
const outPath = resolve(`src/game/data/${songId}.js`);
writeFileSync(outPath, `export default ${JSON.stringify(result)};\n`);
console.log(`wrote ${outPath}: ${result.tracks.reduce((s, t) => s + t.notes.length, 0)} notes`);
