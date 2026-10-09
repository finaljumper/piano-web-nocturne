import "./styles.css";

import { AudioEngine, buildMasterBus } from "./audio/engine.js";
import { Piano } from "./audio/piano.js";
import { View } from "./render/scene.js";
import { Highway } from "./render/highway.js";
import { Effects } from "./render/effects.js";
import { Game } from "./game/game.js";
import { UI } from "./ui/ui.js";
import { SONG_BY_ID } from "./game/songs.js";
import { KEY_LAYOUTS } from "./game/input.js";

/* -------------------------------------------------------------------------- */

const canvas = document.getElementById("scene");
const isTouch = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
const isLowEnd = (navigator.hardwareConcurrency ?? 8) <= 4;

const audio = new AudioEngine();
const view = new View(canvas);
const highway = new Highway(view);
const effects = new Effects(view, highway);

view.setQuality(isLowEnd ? "medium" : "high");

/* -------------------------------------------------------------------------- */
/* UI wiring                                                                  */
/* -------------------------------------------------------------------------- */

const ui = new UI({
  onPlay: async () => {
    await audio.unlock();
    ui.setBase("songs");
  },
  onStartSong: async (id) => {
    audio.unlock();
    const song = SONG_BY_ID[id];
    if (!song) return;
    game.play(song, ui.difficulty);
  },
  onMenu: () => {
    game.stop();
    ui.setBase("menu");
  },
  onSongs: () => {
    game.stop();
    ui.setBase("songs");
  },
  onRestart: () => {
    ui.hideAllOverlays();
    if (game.state === "idle") {
      // Retry from the results screen after a stop.
      const chart = game.chart;
      if (chart) game.play(chart.song, chart.difficulty.id);
      return;
    }
    if (game.state === "paused") audio.resume();
    game.restart();
  },
  onPauseRequest: () => game.pause(),
  onResume: () => game.resume(),
  onQuit: () => {
    game.stop();
    ui.setBase("menu");
  },
  onSettings: (settings) => applySettings(settings),
});

/* -------------------------------------------------------------------------- */
/* Game                                                                       */
/* -------------------------------------------------------------------------- */

const game = new Game({
  audio,
  view,
  highway,
  effects,
  hooks: {
    onStart: (chart) => {
      ui.setBase("__playing__");
      ui.showHud(true);
      ui.showTouch(isTouch);
      ui.buildLaneLabels(chart.laneCount, chart.palette, KEY_LAYOUTS[chart.laneCount]);
      ui.startPerformance(chart);
    },
    onJudge: (detail) => ui.judge(detail),
    onProgress: (session, songTime, chart) => ui.updateHUD(session, songTime, chart),
    onCountdown: (value) => ui.countdown(value),
    onPause: () => ui.showOverlay("pause"),
    onResume: () => ui.hideOverlay("pause"),
    onStop: () => {
      ui.showHud(false);
      ui.showTouch(false);
      ui.countdown(null);
      ui.hideAllOverlays();
    },
    onPauseKey: () => game.togglePause(),
    onFinish: (summary, chart) => {
      ui.showHud(false);
      ui.showTouch(false);
      ui.countdown(null);
      ui.showResults(summary, chart);
    },
  },
});

game.input.mountTouch(document.getElementById("touchLanes"));
game.input.attach();

/* -------------------------------------------------------------------------- */
/* settings                                                                   */
/* -------------------------------------------------------------------------- */

function applySettings(s) {
  audio.setVolume(s.volume);
  game.offset = s.offset / 1000;
  view.setBloom(!!s.bloom && !isLowEnd);
  effects.setEnabled(!!s.particles);
  highway.setNoteLabels(!!s.noteLabels);
}

applySettings(ui.settings);

// Nudge users if bloom is off because the device asked for it.
if (isLowEnd && ui.settings.bloom) {
  setTimeout(() => ui.toast("Glow reduced for this device"), 900);
}

/* -------------------------------------------------------------------------- */
/* touch                                                                      */
/* -------------------------------------------------------------------------- */

const touchLanes = document.getElementById("touchLanes");

touchLanes.addEventListener("pointerdown", (e) => {
  const key = e.target.closest?.(".touch-key");
  if (!key) return;
  e.preventDefault();
  key.setPointerCapture?.(e.pointerId);
  game.input.pointerDown(e.pointerId, Number(key.dataset.lane));
});

const release = (e) => game.input.pointerUp(e.pointerId);
touchLanes.addEventListener("pointerup", release);
touchLanes.addEventListener("pointercancel", release);
touchLanes.addEventListener("lostpointercapture", release);

// Touching anywhere outside the pads should not scroll or select.
document.getElementById("app").addEventListener("touchstart", (e) => {
  if (e.target.closest?.(".touch-key")) return;
  if (e.target.closest?.("button, input, .panel, .song-grid")) return;
  e.preventDefault();
}, { passive: false });

/* -------------------------------------------------------------------------- */
/* layout                                                                     */
/* -------------------------------------------------------------------------- */

function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  view.setSize(w, h);
  view.frameHighway(highway.laneSpan || 10);
}

window.addEventListener("resize", layout);
window.addEventListener("orientationchange", () => setTimeout(layout, 120));
layout();

/* -------------------------------------------------------------------------- */
/* master loop                                                                */
/* -------------------------------------------------------------------------- */

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  game.update(dt);
  // Keep the highway frozen (not emptied) while paused.
  const live = game.state === "playing" || game.state === "paused";
  highway.update(live ? game.songTime : Number.NEGATIVE_INFINITY, dt);
  effects.update(dt);
  view.update(dt);
  view.render();
}

requestAnimationFrame(frame);

/* -------------------------------------------------------------------------- */
/* housekeeping                                                               */
/* -------------------------------------------------------------------------- */

document.addEventListener("visibilitychange", () => {
  if (document.hidden && game.state === "playing") game.pause();
});

ui.setBase("menu");
ui.showHud(false);
ui.showTouch(false);

// Handy for debugging and for automated checks.
window.__nocturne = { game, view, highway, effects, ui, audio, Piano, buildMasterBus };
