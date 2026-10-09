/**
 * Turn a screenshot into something a terminal (or a text-only reviewer) can
 * actually read: an ASCII luminance map plus colour/coverage statistics.
 *
 *   node tools/inspect-img.mjs tools/shots/05-highway.png [cols] [rows]
 */

import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

const file = process.argv[2];
const COLS = Number(process.argv[3] ?? 78);
const ROWS = Number(process.argv[4] ?? 30);

if (!file) {
  console.error("usage: node tools/inspect-img.mjs <png> [cols] [rows]");
  process.exit(1);
}

const png = PNG.sync.read(readFileSync(file));
const { width, height, data } = png;

const cellW = width / COLS;
const cellH = height / ROWS;

const ramp = " .:-=+*#%@";
const rows = [];
let brightPixels = 0;
let totalLuminance = 0;
let coloredPixels = 0;
const hueBuckets = new Array(12).fill(0);
let maxLum = 0;

for (let r = 0; r < ROWS; r++) {
  let line = "";
  for (let c = 0; c < COLS; c++) {
    let sum = 0;
    let n = 0;
    const x0 = Math.floor(c * cellW);
    const y0 = Math.floor(r * cellH);
    const x1 = Math.min(width, Math.floor((c + 1) * cellW));
    const y1 = Math.min(height, Math.floor((r + 1) * cellH));
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const i = (width * y + x) << 2;
        const R = data[i];
        const G = data[i + 1];
        const B = data[i + 2];
        const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        sum += lum;
        n++;
        totalLuminance += lum;
        maxLum = Math.max(maxLum, lum);
        if (lum > 40) brightPixels++;
        const mx = Math.max(R, G, B);
        const mn = Math.min(R, G, B);
        if (mx - mn > 26 && mx > 46) {
          coloredPixels++;
          hueBuckets[Math.floor((hue(R, G, B) / 360) * 12) % 12]++;
        }
      }
    }
    const avg = n ? sum / n : 0;
    const idx = Math.min(ramp.length - 1, Math.round((avg / 255) * (ramp.length - 1) * 2.2));
    line += ramp[idx];
  }
  rows.push(line);
}

function hue(R, G, B) {
  const r = R / 255;
  const g = G / 255;
  const b = B / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d === 0) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return (h + 360) % 360;
}

const pixels = width * height;

console.log(`\n${file}`);
console.log(`size ${width}×${height}   mean luminance ${(totalLuminance / (pixels / 4)).toFixed(1)}   peak ${maxLum.toFixed(0)}`);
console.log(`bright pixels (lum>40): ${((brightPixels / (pixels / 4)) * 100).toFixed(1)}%   saturated colour: ${((coloredPixels / (pixels / 4)) * 100).toFixed(1)}%`);

const hues = [
  "red",
  "orange",
  "yellow",
  "yellow-green",
  "green",
  "spring",
  "cyan",
  "azure",
  "blue",
  "violet",
  "magenta",
  "rose",
];
const top = hueBuckets
  .map((v, i) => [hues[i], v])
  .sort((a, b) => b[1] - a[1])
  .filter(([, v]) => v > 0)
  .slice(0, 4)
  .map(([n, v]) => `${n} ${((v / Math.max(1, coloredPixels)) * 100).toFixed(0)}%`);
console.log(`dominant hues: ${top.length ? top.join(", ") : "none"}`);

console.log("\n" + rows.join("\n") + "\n");
