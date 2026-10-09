#!/usr/bin/env node
/**
 * Fetch public-domain MIDI sources from the Mutopia Project (mutopiaproject.org)
 * into tools/midi/ so the import pipeline is reproducible.
 *
 * Usage: node tools/fetch-midi.mjs
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const BASE = "https://www.mutopiaproject.org/ftp";

// song-id -> { dir, file } under the Mutopia ftp tree, { url } for other
// public-domain hosts (BitMidi, Wikimedia Commons), or { zip, member }.
const FILES = {
  "fur-elise": { dir: "BeethovenLv/WoO59/fur_Elise_WoO59", file: "fur_Elise_WoO59.mid" },
  "canon-in-d": { dir: "PachelbelJ/CanonInD", file: "CanonInD.mid" },
  "gymnopedie-1": { dir: "SatieE/gymnopedie_1", file: "gymnopedie_1.mid" },
  "prelude-in-c": { dir: "BachJS/BWV846/wtk1-prelude1", file: "wtk1-prelude1.mid" },
  "minuet-in-g": { dir: "BachJS/BWVAnh114/anna-magdalena-04", file: "anna-magdalena-04.mid" },
  "rondo-alla-turca": { dir: "MozartWA/KV331/KV331_3_RondoAllaTurca", file: "KV331_3_RondoAllaTurca.mid" },
  "pathetique-2": { dir: "BeethovenLv/O13/pathetique-2", file: "pathetique-2.mid" },
  "nocturne-op9-no2": { dir: "ChopinFF/O9/chopin_nocturne_op9_n2", file: "chopin_nocturne_op9_n2.mid" },
  "prelude-op28-no4": { dir: "ChopinFF/O28/Chop-28-4", file: "Chop-28-4.mid" },
  "fantaisie-impromptu": { dir: "ChopinFF/O66/chopin_fantaisie-impromptu", file: "chopin_fantaisie-impromptu.mid" },
  "prelude-op3-no2": { dir: "RachmaninoffS/O3/rach-prelude-op3-no2", file: "rach-prelude-op3-no2.mid" },
  // Moonlight mvt I lives inside a zip of per-movement files.
  "moonlight": {
    zip: "BeethovenLv/O27/moonlight/moonlight-mids.zip",
    member: "moonlight1.mid",
  },
  // Lacrimosa: the full orchestral movement (the Liszt piano reduction on
  // Wikimedia is only a 13s fragment).
  "lacrimosa": { url: "https://bitmidi.com/uploads/30305.mid" },
  // Remaining transcriptions via BitMidi (user-hosted; public-domain works).
  "swan-lake": { url: "https://bitmidi.com/uploads/103013.mid" },
  "sugar-plum-fairy": { url: "https://bitmidi.com/uploads/35328.mid" },
  "vocalise": { url: "https://bitmidi.com/uploads/36198.mid" },
  "ode-to-joy": { url: "https://bitmidi.com/uploads/81798.mid" },
};

mkdirSync("tools/midi", { recursive: true });

let ok = 0;
let fail = 0;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
for (const [id, src] of Object.entries(FILES)) {
  const out = `tools/midi/${id}.mid`;
  if (existsSync(out)) {
    console.log(`· ${id}: already present`);
    ok++;
    continue;
  }
  if (src.zip) {
    process.stdout.write(`· ${id}: fetching zip ${src.zip} ... `);
    try {
      const res = await fetch(`${BASE}/${src.zip}`, { headers: { "user-agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // Unzip the single member we need without an external dependency.
      const memberStart = buf.indexOf(Buffer.from(src.member));
      if (memberStart < 0) throw new Error(`${src.member} not found in zip`);
      // Locate the local file header for this member, then data follows its
      // fixed 30-byte header + name + extra field.
      let off = 0;
      let data = null;
      while (off < buf.length) {
        const sig = buf.readUInt32LE(off);
        if (sig !== 0x04034b50) break;
        const nameLen = buf.readUInt16LE(off + 26);
        const extraLen = buf.readUInt16LE(off + 28);
        const size = buf.readUInt32LE(off + 18);
        const nameStart = off + 30;
        const name = buf.slice(nameStart, nameStart + nameLen).toString("latin1");
        const dataStart = nameStart + nameLen + extraLen;
        if (name === src.member) {
          data = buf.slice(dataStart, dataStart + size);
          break;
        }
        off = dataStart + size;
      }
      if (!data) throw new Error("member not found");
      writeFileSync(out, data);
      console.log(`${(data.length / 1024).toFixed(1)} KiB`);
      ok++;
    } catch (e) {
      console.log(`FAILED (${e.message})`);
      fail++;
    }
    continue;
  }
  const url = src.url ?? `${BASE}/${src.dir}/${encodeURIComponent(src.file)}`;
  process.stdout.write(`· ${id}: fetching ${url} ... `);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100 || buf.slice(0, 4).toString("ascii") !== "MThd") {
      throw new Error("not a MIDI file (no MThd header)");
    }
    writeFileSync(out, buf);
    console.log(`${(buf.length / 1024).toFixed(1)} KiB`);
    ok++;
  } catch (e) {
    console.log(`FAILED (${e.message})`);
    fail++;
  }
}
console.log(`\ndone: ${ok} ok, ${fail} failed`);
if (fail) process.exit(1);
