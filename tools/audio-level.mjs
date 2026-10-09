/**
 * Objective level check for the piano synth.
 *
 * Renders the voice graph through an OfflineAudioContext in the real browser
 * and reports peak / RMS / clipping for a few realistic textures, so the gain
 * staging can be tuned without ever hearing it.
 */

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const url = "http://localhost:4203/";
const root = new URL("..", import.meta.url).pathname;
const server = spawn("npx", ["vite", "preview", "--port", "4203", "--strictPort"], {
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
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));
await page.goto(url, { waitUntil: "networkidle" });
await sleep(600);

const result = await page.evaluate(async () => {
  const { Piano, buildMasterBus } = window.__nocturne;
  const RATE = 44100;
  const SECONDS = 6;

  async function render(build) {
    const ctx = new OfflineAudioContext(2, RATE * SECONDS, RATE);

    // The exact shipping master chain, shared with the engine.
    const bus = buildMasterBus(ctx);
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(bus.input);
    const piano = new Piano(ctx, out);
    build(piano);
    const buffer = await ctx.startRendering();

    let peak = 0;
    let sumSq = 0;
    let clipped = 0;
    let count = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const d = buffer.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        const v = d[i];
        const a = Math.abs(v);
        if (a > peak) peak = a;
        if (a >= 0.999) clipped++;
        sumSq += v * v;
        count++;
      }
    }
    return {
      peak: +peak.toFixed(4),
      rms: +Math.sqrt(sumSq / count).toFixed(4),
      clippedSamples: clipped,
    };
  }

  // 1. One melody note, as the game plays it (sustained performance layer).
  const single = await render((p) => {
    p.note(72, 0.1, 1.2, { velocity: 0.5, bright: 0.42 });
  });

  // 2. A hit: base note plus the bright accent reward layer.
  const hit = await render((p) => {
    p.note(72, 0.1, 1.2, { velocity: 0.5, bright: 0.42 });
    p.accent(72, 0.1);
  });

  // 3. A dense passage: bass + chord + melody, as in Für Elise's busiest bars.
  const dense = await render((p) => {
    const evs = [];
    for (let i = 0; i < 26; i++) {
      const t = 0.1 + i * 0.2;
      evs.push([48 + (i % 7), t]);
      evs.push([60 + (i % 5), t]);
      evs.push([64 + (i % 5), t]);
      evs.push([67 + (i % 5), t + 0.05]);
    }
    for (const [midi, t] of evs) p.note(midi, t, 0.5, { velocity: 0.5, bright: 0.42 });
    for (let i = 0; i < 8; i++) p.accent(60 + (i % 5) * 2, 0.1 + i * 0.6);
  });

  // 4. Worst case: a big cluster with accents on every note.
  const cluster = await render((p) => {
    const notes = [48, 52, 55, 60, 64, 67, 72, 76, 79];
    for (const midi of notes) {
      p.note(midi, 0.1, 2.0, { velocity: 0.9, bright: 0.8 });
      p.accent(midi, 0.1);
    }
  });

  return { single, hit, dense, cluster };
});

console.log(JSON.stringify(result, null, 2));
console.log(
  "\ntarget: single ~0.05-0.15, hit ~0.15-0.35, dense peak 0.4-0.8, cluster peak <= 1.0 with 0 clipped",
);

await browser.close();
server.kill();
process.exit(0);
