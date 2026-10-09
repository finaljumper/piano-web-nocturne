/**
 * Ad-hoc visual check: renders a chart with note letters on and dumps a
 * screenshot, so the note-atlas path can be verified without a display.
 *
 *   node tools/shot.mjs [outfile] [songId] [difficulty]
 */

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const out = process.argv[2] ?? "tools/shots/labels.png";
const songId = process.argv[3] ?? "fur-elise";
const difficulty = process.argv[4] ?? "normal";
const url = "http://localhost:4201/";
const root = new URL("..", import.meta.url).pathname;

const server = spawn("npx", ["vite", "preview", "--port", "4201", "--strictPort"], {
  cwd: root,
  stdio: "ignore",
});
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {
    /* retry */
  }
  await sleep(250);
}

const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio",
  ],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));
await page.addInitScript(() => {
  localStorage.setItem(
    "nocturne.settings.v1",
    JSON.stringify({ volume: 0, offset: 0, bloom: false, particles: true, noteLabels: true }),
  );
});

await page.goto(url, { waitUntil: "networkidle" });
await sleep(600);
await page.click("#btnPlay");
await sleep(300);
await page.click(`.pill[data-diff="${difficulty}"]`);
await sleep(200);
await page.click(`.song-card[data-song="${songId}"]`);
await sleep(6500);
await page.screenshot({ path: out });
console.log("wrote", out);
await browser.close();
server.kill();
process.exit(0);
