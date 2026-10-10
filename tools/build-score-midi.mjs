#!/usr/bin/env node
/** Compile checked-in notation, including written repeats, into full MIDI.
 * Requires LilyPond 2.24.x and convert-ly; normal app builds need neither.
 * LILYPOND and CONVERT_LY may select binaries outside PATH.
 * Usage: node tools/build-score-midi.mjs [song-id ...]
 */
import { readFileSync, writeFileSync, mkdtempSync, cpSync, readdirSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const sources = JSON.parse(readFileSync(new URL("./score-sources.json", import.meta.url)));
const ids = process.argv.slice(2);
const work = mkdtempSync(join(tmpdir(), "nocturne-scores-"));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message ?? result.stderr}`);
  }
}
try {
  for (const id of ids.length ? ids : Object.keys(sources)) {
    const source = sources[id];
    if (!source) throw new Error(`No checked-in notation for ${id}`);
    const dir = join(work, id);
    cpSync(join(root, "tools/scores", id), dir, { recursive: true });
    for (const name of readdirSync(dir)) {
      if (!/\.(ly|ily)$/.test(name)) continue;
      const file = join(dir, name);
      run(process.env.CONVERT_LY ?? "convert-ly", ["-e", file], dir);
      let text = readFileSync(file, "utf8");
      // This legacy command in the Chopin nocturne predates convert-ly's
      // supported ottava migration. Preserve its octave-marking semantics.
      text = text.replace(/#\s*\(set-octavation\s+(-?\d+)\)/g, "\\ottava #$1");
      // Removed engraving-only beam helpers in the 2007 Moonlight source.
      // They do not change pitches, rhythms, ties or performance dynamics.
      text = text.replace(/#\s*\(override-auto-beam-setting[^\n]*\)/g, "");
      // LilyPond's default MIDI export plays volta sections only once.
      // Unfold the score's own repeats and alternatives before performance.
      text = text.replace(/\\score\s*\{/g, "$&\n  \\unfoldRepeats\n");
      text = text.replace(/\\midi\s*\{\s*\}/g, `\\midi { \\tempo 4 = ${source.fallbackBpm} }`);
      if (id === "moonlight") text = text.replace(/%\\tempo 4 = 54/g, "\\tempo 4 = 54");
      writeFileSync(file, text);
    }
    const output = join(dir, id);
    run(process.env.LILYPOND ?? "lilypond", ["-dno-print-pages", "-o", output, join(dir, source.entry)], dir);
    const midi = join(root, "tools/midi", `${id}.mid`);
    copyFileSync(`${output}.midi`, midi);
    run(process.execPath, [join(root, "tools/import-midi.mjs"), midi, id], root);
    console.log(`· ${id}: rebuilt from ${source.entry} with repeats`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
