/**
 * Headless verification for Nocturne.
 *
 *   node tools/verify.mjs [--url http://localhost:4173] [--autoplay]
 *
 * Drives the real game in Chromium: loads each screen, starts a performance,
 * plays a chart with frame-accurate synthetic key presses, and reports console
 * errors, score, accuracy and captured screenshots.
 */

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const PAGE_URL = argOf("--url", "http://localhost:4173/");
const SHOTS = new URL("../tools/shots/", import.meta.url).pathname;
const WANT_AUTOPLAY = args.includes("--autoplay");

mkdirSync(SHOTS, { recursive: true });

/* -------------------------------------------------------------------------- */

let server = null;

async function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`server did not start: ${url}`);
}

async function ensureServer() {
  try {
    const res = await fetch(PAGE_URL);
    if (res.ok) {
      console.log(`· using existing server at ${PAGE_URL}`);
      return;
    }
  } catch {
    /* start one */
  }
  console.log("· starting vite preview…");
  server = spawn("npx", ["vite", "preview", "--port", "4173", "--strictPort"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: "ignore",
  });
  await waitForServer(PAGE_URL);
}

/* -------------------------------------------------------------------------- */

const problems = [];
const logs = [];

function record(msg, kind) {
  const text = `${kind}: ${msg}`;
  logs.push(text);
  if (kind === "error" || kind === "pageerror") problems.push(text);
}

const DISABLE_HEAVY = () => {
  // Software rendering in CI cannot afford bloom; keep the checks meaningful.
  localStorage.setItem(
    "nocturne.settings.v1",
    JSON.stringify({ volume: 0, offset: 0, bloom: false, particles: true, noteLabels: false }),
  );
};

const watchdog = setTimeout(() => {
  console.error("WATCHDOG: verification exceeded 180s");
  process.exit(2);
}, 180_000);
watchdog.unref?.();

async function main() {
  await ensureServer();

  const browser = await chromium.launch({
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
    ],
  });

  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  page.setDefaultTimeout(20_000);
  await page.addInitScript(DISABLE_HEAVY);
  page.on("console", (m) => {
    if (m.type() === "error") record(m.text(), "error");
    else if (m.type() === "warning") record(m.text(), "warn");
  });
  page.on("pageerror", (e) => record(e.message, "pageerror"));

  await page.goto(PAGE_URL, { waitUntil: "networkidle" });
  await sleep(900);

  await check(page, "01-menu", async () => {
    const visible = await page.isVisible("#screenMenu.is-active");
    if (!visible) throw new Error("menu screen not active");
  });

  // --- song select ---------------------------------------------------------
  await page.click("#btnPlay");
  await sleep(500);
  const cards = await page.locator(".song-card").count();
  console.log(`· song cards rendered: ${cards}`);
  if (cards < 4) problems.push(`only ${cards} song cards rendered`);

  await check(page, "02-song-select", async () => {});

  // --- difficulty switch ---------------------------------------------------
  await page.click('.pill[data-diff="hard"]');
  await sleep(250);
  await check(page, "03-song-select-hard", async () => {});
  await page.click('.pill[data-diff="medium"]');
  await sleep(200);

  // --- start a performance -------------------------------------------------
  await page.click('.song-card[data-song="fur-elise"]');
  await sleep(600);
  await check(page, "04-countdown", async () => {
    const state = await page.evaluate(() => window.__nocturne.game.state);
    if (state !== "playing") throw new Error(`state is ${state}, expected playing`);
    if (!(await page.isVisible("#screenCount.is-active"))) throw new Error("countdown overlay not visible");
    // Regression: the countdown overlay used to swallow clicks on the HUD.
    const reachable = await page.evaluate(() => {
      const btn = document.getElementById("btnPause");
      const r = btn.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === btn;
    });
    if (!reachable) throw new Error("pause button is covered by the countdown overlay");
  });

  // Let a few notes fall before capturing the highway.
  await sleep(5200);
  await check(page, "05-highway", async () => {
    // Regression: gems used to be colourless because palette strings were
    // bit-shifted as if they were numbers.
    const gems = await page.evaluate(() => {
      const g = window.__nocturne.highway.gems;
      const c = g.geometry.attributes.aColor.array;
      let lit = 0;
      for (let i = 0; i < g.count; i++) if (c[i * 3] + c[i * 3 + 1] + c[i * 3 + 2] > 0.3) lit++;
      return { visible: g.count, coloured: lit };
    });
    console.log(`\u00b7 gems on screen: ${gems.visible}, coloured: ${gems.coloured}`);
    if (gems.visible === 0) throw new Error("no gems on screen");
    if (gems.coloured !== gems.visible) throw new Error("some gems have no colour");
  });

  // Regression: each song start used to leak four GPU textures.
  {
    const textures = () =>
      page.evaluate(() => window.__nocturne.view.renderer.info.memory.textures);
    const before = await textures();
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.__nocturne.game.restart());
      await sleep(250);
    }
    const after = await textures();
    console.log(`\u00b7 GPU textures across 4 restarts: ${before} -> ${after}`);
    if (after > before + 1) problems.push(`texture leak: ${before} -> ${after} over 4 restarts`);
    await sleep(4200); // let the restarted chart get past its countdown
  }

  const lanes = await page.evaluate(() => window.__nocturne.game.chart.laneCount);
  console.log(`· lanes: ${lanes}`);

  // --- autoplay a chart ----------------------------------------------------
  const autoplay = WANT_AUTOPLAY || true;
  if (autoplay) {
    await page.evaluate(() => {
      const g = window.__nocturne.game;
      const pressed = new Set();
      window.__auto = true;
      const tick = () => {
        if (!window.__auto) return;
        if (g.state === "playing") {
          const t = g.songTime;
          for (const n of g.chart.notes) {
            if (pressed.has(n.index)) continue;
            if (n.time <= t && n.time > t - 0.25) {
              pressed.add(n.index);
              g.input.onPress(n.lane);
              setTimeout(() => g.input.onRelease(n.lane), 30);
            } else if (n.time <= t - 0.25) {
              pressed.add(n.index);
            }
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await sleep(4000);
    await check(page, "06-playing", async () => {});

    const stats = await page.evaluate(() => {
      const g = window.__nocturne.game;
      return {
        state: g.state,
        songTime: g.songTime,
        score: g.session.score,
        combo: g.session.combo,
        judged: g.session.judged,
        accuracy: g.session.accuracy,
        counts: g.session.counts,
        total: g.session.total,
        fps: window.__nocturne.view.renderer.info.render.frame,
      };
    });
    console.log("· performance stats:", JSON.stringify(stats, null, 2));

    if (stats.judged === 0) problems.push("autoplay judged no notes");
    if (stats.score <= 0) problems.push("autoplay produced no score");
    if (stats.counts.miss > stats.counts.perfect + stats.counts.great + stats.counts.good) {
      problems.push("more misses than hits during autoplay");
    }
  }

  // --- pause / resume ------------------------------------------------------
  await page.click("#btnPause");
  await sleep(400);
  await check(page, "07-paused", async () => {
    const s = await page.evaluate(() => window.__nocturne.game.state);
    if (s !== "paused") throw new Error(`state is ${s}, expected paused`);
    if (!(await page.isVisible("#screenPause.is-active"))) throw new Error("pause overlay not visible");
  });
  await page.click("#btnResume");
  await sleep(500);
  await check(page, "08-resumed", async () => {
    const s = await page.evaluate(() => window.__nocturne.game.state);
    if (s !== "playing") throw new Error(`state is ${s}, expected playing`);
  });

  // --- finish the song quickly by faking the clock --------------------------
  await page.evaluate(() => {
    window.__nocturne.game.songTime = 1e9;
  });
  // The update loop reads the real audio clock, so instead jump the cursor and
  // let the remaining notes resolve as misses.
  await page.evaluate(() => {
    const g = window.__nocturne.game;
    g.session.update(g.chart.duration + 1);
  });
  await sleep(300);

  // --- settings + results reachability -------------------------------------
  await page.evaluate(() => {
    const g = window.__nocturne.game;
    g._finish();
  });
  await sleep(700);
  await check(page, "09-results", async () => {
    const visible = await page.isVisible("#screenResults.is-active");
    if (!visible) throw new Error("results screen not shown");
  });

  const rank = await page.textContent("#resRank");
  const resScore = await page.textContent("#resScore");
  console.log(`· results: rank ${rank}, score ${resScore}`);

  await page.click("#btnResMenu");
  await sleep(400);
  await check(page, "10-back-to-menu", async () => {
    const visible = await page.isVisible("#screenMenu.is-active");
    if (!visible) throw new Error("menu not shown after quit");
  });

  // --- mobile viewport -----------------------------------------------------
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await mobile.addInitScript(DISABLE_HEAVY);
  mobile.on("pageerror", (e) => record(`[mobile] ${e.message}`, "pageerror"));
  await mobile.goto(PAGE_URL, { waitUntil: "networkidle" });
  await sleep(700);
  await mobile.click("#btnPlay");
  await sleep(400);
  await mobile.click('.song-card[data-song="ode-to-joy"]');
  await sleep(4200);
  await mobile.screenshot({ path: `${SHOTS}11-mobile.png` });
  const mobileState = await mobile.evaluate(() => window.__nocturne.game.state);
  console.log(`· mobile state: ${mobileState}`);
  await mobile.close();

  await browser.close();

  /* ---------------------------------------------------------------------- */
  console.log("\n──────── summary ────────");
  clearTimeout(watchdog);
  console.log(`screenshots: ${SHOTS}`);
  if (problems.length) {
    console.log(`\n❌ ${problems.length} problem(s):`);
    for (const p of problems) console.log("  - " + p);
    process.exitCode = 1;
  } else {
    console.log("✅ no console errors, all checks passed");
  }
  const warnings = logs.filter((l) => l.startsWith("warn"));
  if (warnings.length) {
    console.log(`\n(${warnings.length} console warnings)`);
    for (const w of warnings.slice(0, 6)) console.log("  " + w);
  }
}

async function check(page, name, fn) {
  try {
    await fn();
    await page.screenshot({ path: `${SHOTS}${name}.png` });
    console.log(`✓ ${name}`);
  } catch (err) {
    problems.push(`${name}: ${err.message}`);
    await page.screenshot({ path: `${SHOTS}${name}-FAILED.png` }).catch(() => {});
    console.log(`✗ ${name} — ${err.message}`);
  }
}

main()
  .catch((err) => {
    console.error("fatal:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    server?.kill();
  });
