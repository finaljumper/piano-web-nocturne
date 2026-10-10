/** Check the independently compared passages, without certifying unchecked parts.
 * node tools/audit-transcriptions.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import MidiPkg from "@tonejs/midi";

const load = (id) => new MidiPkg.Midi(readFileSync(new URL(`./midi/${id}.mid`, import.meta.url)));
const reference = (name) => JSON.parse(readFileSync(new URL(`./transcription-audit/${name}.json`, import.meta.url)));
let checks = 0;
const choir = reference("lacrimosa-choir");
const lacrimosa = load("lacrimosa");
for (const [name, notes] of Object.entries(choir.parts)) {
  const track = lacrimosa.tracks.find((t) => t.name.trim() === name);
  assert.ok(track, `Lacrimosa: missing ${name}`);
  assert.equal(track.notes.length, notes.length, `Lacrimosa: ${name} omitted/extra attacks`);
  notes.forEach(([quarter, pitch, duration], i) => {
    const note = track.notes[i];
    assert.equal(note.midi, pitch, `Lacrimosa ${name}: pitch at quarter ${quarter}`);
    assert.equal(note.ticks, quarter * lacrimosa.header.ppq, `Lacrimosa ${name}: onset at quarter ${quarter}`);
    assert.ok(Math.abs(note.durationTicks - duration * lacrimosa.header.ppq) <= choir.durationToleranceTicks,
      `Lacrimosa ${name}: tied duration at quarter ${quarter}`);
    checks++;
  });
  console.log(`· Lacrimosa ${name}: all ${notes.length} attacks, onsets and tied lengths checked (30 bars)`);
}
const opening = reference("ode-opening");
const ode = load("ode-to-joy");
for (const octave of [0, -12]) {
  const track = ode.tracks.find((t) => t.notes[0]?.midi === opening.notes[0][1] + octave
    && Math.abs(t.notes[0].ticks / ode.header.ppq - 4) < opening.quarterTolerance);
  assert.ok(track, `Ode to Joy: missing opening voice, octave ${octave}`);
  const notes = track.notes.filter((n) => n.ticks / ode.header.ppq < 35.9);
  assert.equal(notes.length, opening.notes.length, "Ode to Joy: omitted/extra opening attacks");
  opening.notes.forEach(([quarter, pitch], i) => {
    assert.equal(notes[i].midi, pitch + octave, `Ode to Joy: opening pitch at quarter ${quarter}`);
    assert.ok(Math.abs(notes[i].ticks / ode.header.ppq - quarter) <= opening.quarterTolerance,
      `Ode to Joy: opening entry at quarter ${quarter}`);
    checks++;
  });
}
console.log(`· Ode to Joy: first eight theme bars checked against Reinecke's published score (two octave voices)`);
console.log(`\n${checks} checked attacks passed. Scope: choir only for Lacrimosa; opening only for Ode to Joy.`);
console.log("Full-score verification is pending for all five legacy transcriptions; see tools/transcription-audit/README.md.");
