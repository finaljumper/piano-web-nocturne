/** Apply the independently checked Lacrimosa alto corrections to legacy MIDI.
 * Keeps all other MIDI events, metadata, tempi and articulation intact.
 * Safe to repeat; unknown source bytes are rejected before any writes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import MidiFile from "midi-file";

const path = new URL("./midi/lacrimosa.mid", import.meta.url);
const bytes = readFileSync(path);
const hash = createHash("sha256").update(bytes).digest("hex");
const originalHash = "5c645cacf7e66070e0e38f926afb5b65a251ecc0bc4c5fcf03f05d46adc45991";
const midi = MidiFile.parseMidi(bytes);
const trackIndex = midi.tracks.findIndex((t) => t.some((e) => e.type === "trackName" && e.text.trim() === "Alto"));
if (trackIndex < 0 || midi.header.ticksPerBeat !== 240) throw new Error("Unexpected Lacrimosa source");
let tick = 0;
const events = midi.tracks[trackIndex].map((event) => ({ ...event, tick: tick += event.deltaTime }));
// In bar 6, third dotted-quarter beat: E4, rather than D4.
const on = events.find((e) => e.tick === 7920 && e.type === "noteOn");
const off = events.find((e) => e.tick === 8039 && e.type === "noteOff");
const restored = events.find((e) => e.tick === 12840 && e.type === "noteOn" && e.noteNumber === 69);
if (on?.noteNumber === 64 && off?.noteNumber === 64 && restored) {
  console.log("· Lacrimosa alto corrections already present");
} else {
  if (hash !== originalHash || on?.noteNumber !== 62 || off?.noteNumber !== 62 || restored) {
    throw new Error("Unrecognized Lacrimosa MIDI; refusing to patch");
  }
  on.noteNumber = off.noteNumber = 64;
  // Bar 9, final eighth: missing A4; same one-tick articulation gap as its neighbors.
  events.push({ tick: 12840, deltaTime: 0, type: "noteOn", channel: on.channel, noteNumber: 69, velocity: on.velocity });
  events.push({ tick: 12959, deltaTime: 0, type: "noteOff", channel: on.channel, noteNumber: 69, velocity: 0, byte9: true });
  events.sort((a, b) => a.tick - b.tick);
  tick = 0;
  midi.tracks[trackIndex] = events.map(({ tick: absolute, ...event }) => {
    event.deltaTime = absolute - tick;
    tick = absolute;
    return event;
  });
  writeFileSync(path, Buffer.from(MidiFile.writeMidi(midi)));
  console.log("· corrected Lacrimosa: bar 6 E4; restored bar 9 A4");
}
const result = spawnSync(process.execPath, ["tools/import-midi.mjs", "tools/midi/lacrimosa.mid", "lacrimosa"], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
