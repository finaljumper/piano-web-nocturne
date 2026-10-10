/** Regenerate the shipped credits from the notation-source manifest. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { SONG_BY_ID } from "../src/game/songs.js";
const sources = JSON.parse(readFileSync(new URL("./score-sources.json", import.meta.url)));
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const licenses = {
  "Public Domain": "https://creativecommons.org/publicdomain/mark/1.0/",
  "Creative Commons Attribution 4.0": "https://creativecommons.org/licenses/by/4.0/",
  "Creative Commons Attribution-ShareAlike 2.5": "https://creativecommons.org/licenses/by-sa/2.5/",
  "Creative Commons Attribution-ShareAlike 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  "Creative Commons Attribution-ShareAlike 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
};
const rows = Object.entries(sources).map(([id, s]) => {
  if (!licenses[s.license]) throw new Error(`Unknown license: ${s.license}`);
  return `<li><h2>${escape(SONG_BY_ID[id].title)}</h2><p>Notation by ${escape(s.typesetter)} via <a href="${escape(s.source)}">Mutopia Project</a>. Edition: ${escape(s.edition)}.</p><p><a href="${licenses[s.license]}">${escape(s.license)}</a>.${s.tempoNote ? " " + escape(s.tempoNote) : ""}</p></li>`;
}).join("\n");
mkdirSync(new URL("../public", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/music-credits.html", import.meta.url), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Music credits — Nocturne</title>
<style>body{margin:0;background:#0d1120;color:#e8eaf3;font:16px/1.6 system-ui,sans-serif}main{max-width:52rem;margin:auto;padding:2rem 1.25rem}a{color:#a8cfff}h2{font-size:1.1rem}ul{padding:0;list-style:none}li{border-top:1px solid #343b50;padding:.75rem 0}p{margin:.4rem 0}</style></head>
<body><main><a href="./">Return to Nocturne</a><h1>Music credits</h1>
<p>These public-domain compositions play through Nocturne’s piano synthesizer. The notation and its typesetters have their own credits and licenses.</p>
<p>The MIDI and note-data adaptations unfold written repeats, preserve simultaneous parts and use the source’s performance markings. The original notation is retained with its notices. Adaptations of the Creative Commons sources retain the licenses linked below; gameplay simplification changes only the targets.</p>
<ul>${rows}</ul>
<h2>Other MIDI transcriptions</h2><p>Lacrimosa, Swan Lake Theme, Dance of the Sugar Plum Fairy, Vocalise and Ode to Joy use the existing third-party transcriptions listed in <code>tools/fetch-midi.mjs</code>. Lacrimosa’s four choir parts have been compared with <a href="https://github.com/mitselek/Mozart-Requiem/blob/6023402038dc192b4a4b91ffd4250c0d248c7224/Mozart%20Requiem%20-%20SATB.mscz">independent SATB notation</a> (repository CC0), correcting one alto pitch and restoring one missing alto note. Ode to Joy’s first eight theme bars have been compared with <a href="https://github.com/KeyboardPhilharmonic/beethoven_symphony-9_breitkopf-va1295/blob/b007aceb1d4782e511c7c6e88ef0c16037b63e1d/IMSLP51456-PMLP01607-Beethoven_9.Symphonie_Breitkopf_Reinecke.pdf">Beethoven/Reinecke’s historical piano score</a>. Complete score fidelity and the original MIDI transcription licenses remain unverified for these five performances. These are piano renderings; Ode to Joy is a theme arrangement.</p>
</main></body></html>\n`);
console.log("· music credits regenerated");
