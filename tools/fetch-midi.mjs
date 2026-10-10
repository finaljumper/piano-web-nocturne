#!/usr/bin/env node
/**
 * Restore cached MIDI sources. The twelve notation-backed performances must
 * be built with tools/build-score-midi.mjs; downloading their older Mutopia
 * MIDI exports would lose the written repeats again.
 *
 * The remaining five URLs identify the existing third-party transcriptions;
 * their score accuracy and transcription licenses are not independently verified.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const scores = JSON.parse(readFileSync(new URL("./score-sources.json", import.meta.url)));
const transcriptions = {
  "lacrimosa": "https://bitmidi.com/uploads/30305.mid",
  "swan-lake": "https://bitmidi.com/uploads/103013.mid",
  "sugar-plum-fairy": "https://bitmidi.com/uploads/35328.mid",
  "vocalise": "https://bitmidi.com/uploads/36198.mid",
  "ode-to-joy": "https://bitmidi.com/uploads/81798.mid",
};
mkdirSync("tools/midi", { recursive: true });
let failures = 0;
for (const id of Object.keys(scores)) {
  if (existsSync(`tools/midi/${id}.mid`)) console.log(`· ${id}: already present`);
  else {
    console.error(`· ${id}: rebuild from notation: node tools/build-score-midi.mjs ${id}`);
    failures++;
  }
}
for (const [id, url] of Object.entries(transcriptions)) {
  const out = `tools/midi/${id}.mid`;
  if (existsSync(out)) {
    console.log(`· ${id}: already present`);
    continue;
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length < 100 || data.subarray(0, 4).toString("ascii") !== "MThd") {
      throw new Error("not a MIDI file (no MThd header)");
    }
    writeFileSync(out, data);
    if (id === "lacrimosa") {
      const result = spawnSync(process.execPath, ["tools/correct-transcriptions.mjs"], { stdio: "inherit" });
      if (result.error || result.status !== 0) throw result.error ?? new Error("Lacrimosa corrections failed");
    }
    console.log(`· ${id}: fetched ${(data.length / 1024).toFixed(1)} KiB`);
  } catch (error) {
    console.error(`· ${id}: ${error.message}`);
    failures++;
  }
}
if (failures) process.exitCode = 1;
