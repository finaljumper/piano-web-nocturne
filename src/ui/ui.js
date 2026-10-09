import { SONGS } from "../game/songs.js";
import { buildChart, DIFFICULTIES } from "../game/chart.js";

const SETTINGS_KEY = "nocturne.settings.v1";
const BEST_KEY = "nocturne.best.v1";

const DEFAULT_SETTINGS = {
  volume: 0.85,
  offset: 0,
  bloom: true,
  particles: true,
  noteLabels: false,
};

/** Screen + HUD management. Knows nothing about audio or 3D. */
export class UI {
  /**
   * @param {object} hooks callbacks into the app
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.settings = loadJSON(SETTINGS_KEY, { ...DEFAULT_SETTINGS });
    this.best = loadJSON(BEST_KEY, {});
    this.difficulty = "normal";

    this._displayScore = 0;
    this._comboVisible = false;
    this._countValue = null;

    this._cacheDom();
    this._bind();
    this.applySettingsToForm();
    this.renderSongGrid();
    this.renderMenuStats();
  }

  _cacheDom() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $("hud"),
      hudTitle: $("hudTitle"),
      hudComposer: $("hudComposer"),
      hudScore: $("hudScore"),
      hudAccuracy: $("hudAccuracy"),
      progressFill: $("progressFill"),
      comboWrap: $("comboWrap"),
      comboNum: $("comboNum"),
      judgement: $("judgement"),
      laneLabels: $("laneLabels"),
      touch: $("touch"),
      touchLanes: $("touchLanes"),
      songGrid: $("songGrid"),
      menuStats: $("menuStats"),
      toast: $("toast"),
      screens: {
        menu: $("screenMenu"),
        songs: $("screenSongs"),
        how: $("screenHow"),
        settings: $("screenSettings"),
        count: $("screenCount"),
        pause: $("screenPause"),
        results: $("screenResults"),
      },
      countdown: $("countdown"),
      // results
      resRank: $("resRank"),
      resSong: $("resSong"),
      resComposer: $("resComposer"),
      resScore: $("resScore"),
      resAccuracy: $("resAccuracy"),
      resCombo: $("resCombo"),
      resPerfect: $("resPerfect"),
      resGood: $("resGood"),
      resMiss: $("resMiss"),
      resNotes: $("resNotes"),
      // settings inputs
      setVolume: $("setVolume"),
      setVolumeVal: $("setVolumeVal"),
      setOffset: $("setOffset"),
      setOffsetVal: $("setOffsetVal"),
      setBloom: $("setBloom"),
      setParticles: $("setParticles"),
      setNoteLabels: $("setNoteLabels"),
      songsHint: $("songsHint"),
    };
  }

  _bind() {
    const $ = (id) => document.getElementById(id);

    $("btnPlay").addEventListener("click", () => this.hooks.onPlay?.());
    $("btnHowTo").addEventListener("click", () => this.showOverlay("how"));
    $("btnHowClose").addEventListener("click", () => this.hideOverlay("how"));
    $("btnSettings").addEventListener("click", () => this.showOverlay("settings"));
    $("btnSettingsClose").addEventListener("click", () => this.hideOverlay("settings"));
    $("btnSongsBack").addEventListener("click", () => this.hooks.onMenu?.());

    $("btnPause").addEventListener("click", () => this.hooks.onPauseRequest?.());
    $("btnResume").addEventListener("click", () => this.hooks.onResume?.());
    $("btnRestart").addEventListener("click", () => this.hooks.onRestart?.());
    $("btnQuit").addEventListener("click", () => this.hooks.onQuit?.());

    $("btnResRetry").addEventListener("click", () => this.hooks.onRestart?.());
    $("btnResSongs").addEventListener("click", () => this.hooks.onSongs?.());
    $("btnResMenu").addEventListener("click", () => this.hooks.onMenu?.());

    document.querySelectorAll(".pill[data-diff]").forEach((pill) => {
      pill.addEventListener("click", () => {
        this.setDifficulty(pill.dataset.diff);
      });
    });

    this.el.songGrid.addEventListener("click", (e) => {
      const card = e.target.closest(".song-card");
      if (!card) return;
      this.hooks.onStartSong?.(card.dataset.song);
    });

    // Settings
    this.el.setVolume.addEventListener("input", () => {
      this.settings.volume = Number(this.el.setVolume.value) / 100;
      this.el.setVolumeVal.textContent = this.el.setVolume.value;
      this._saveSettings();
    });
    this.el.setOffset.addEventListener("input", () => {
      this.settings.offset = Number(this.el.setOffset.value);
      this.el.setOffsetVal.textContent = `${this.settings.offset > 0 ? "+" : ""}${this.settings.offset} ms`;
      this._saveSettings();
    });
    this.el.setBloom.addEventListener("change", () => {
      this.settings.bloom = this.el.setBloom.checked;
      this._saveSettings();
    });
    this.el.setParticles.addEventListener("change", () => {
      this.settings.particles = this.el.setParticles.checked;
      this._saveSettings();
    });
    this.el.setNoteLabels.addEventListener("change", () => {
      this.settings.noteLabels = this.el.setNoteLabels.checked;
      this._saveSettings();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const open = ["how", "settings"].find((n) => this.el.screens[n].classList.contains("is-active"));
      if (open) this.hideOverlay(open);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* screens                                                                */
  /* ---------------------------------------------------------------------- */

  setBase(name) {
    for (const [key, el] of Object.entries(this.el.screens)) {
      if (["how", "settings", "count", "pause", "results"].includes(key)) continue;
      el.classList.toggle("is-active", key === name);
    }
    this.hideAllOverlays();
  }

  showOverlay(name) {
    this.el.screens[name]?.classList.add("is-active");
  }

  hideOverlay(name) {
    this.el.screens[name]?.classList.remove("is-active");
  }

  hideAllOverlays() {
    for (const key of ["how", "settings", "count", "pause", "results"]) {
      this.el.screens[key]?.classList.remove("is-active");
    }
  }

  showHud(on) {
    this.el.hud.classList.toggle("is-hidden", !on);
  }

  showTouch(on) {
    this.el.touch.classList.toggle("is-hidden", !on);
  }

  toast(message, ms = 1800) {
    this.el.toast.textContent = message;
    this.el.toast.classList.remove("is-hidden");
    requestAnimationFrame(() => this.el.toast.classList.add("is-show"));
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.el.toast.classList.remove("is-show");
      setTimeout(() => this.el.toast.classList.add("is-hidden"), 260);
    }, ms);
  }

  /* ---------------------------------------------------------------------- */
  /* song select                                                            */
  /* ---------------------------------------------------------------------- */

  setDifficulty(diff) {
    this.difficulty = diff;
    document.querySelectorAll(".pill[data-diff]").forEach((p) => {
      p.classList.toggle("is-active", p.dataset.diff === diff);
    });
    this.renderSongGrid();
  }

  renderSongGrid() {
    const grid = this.el.songGrid;
    grid.innerHTML = "";

    for (const song of SONGS) {
      const chart = buildChart(song, this.difficulty);
      const card = document.createElement("button");
      card.className = "song-card";
      card.dataset.song = song.id;
      card.style.setProperty("--accent", song.accent);
      card.style.setProperty("--accent-soft", hexToRgba(song.accent, 0.14));

      const best = this.best[`${song.id}:${this.difficulty}`];
      const rating = ratingLabel(chart.stats.rating);
      const seconds = Math.round(chart.stats.count / Math.max(0.1, chart.stats.nps));

      const title = document.createElement("h3");
      title.className = "sc-title";
      title.textContent = song.title;
      card.appendChild(title);

      const composer = document.createElement("div");
      composer.className = "sc-composer";
      composer.textContent = `${song.composer} · ${song.year}`;
      card.appendChild(composer);

      const meta = document.createElement("div");
      meta.className = "sc-meta";
      for (const text of [
        song.era,
        `${chart.stats.rating}/10 ${rating}`,
        `${chart.stats.count} notes`,
        formatTime(seconds),
      ]) {
        const tag = document.createElement("span");
        tag.className = "sc-tag";
        tag.textContent = text;
        meta.appendChild(tag);
      }
      card.appendChild(meta);

      if (best) {
        const bestEl = document.createElement("div");
        bestEl.className = "sc-best";
        bestEl.textContent = `Best ${best.score.toLocaleString()} · ${Math.round(best.accuracy * 100)}% · ${best.rank}`;
        card.appendChild(bestEl);
      }

      grid.appendChild(card);
    }

    this.el.songsHint.textContent = `${DIFFICULTIES[this.difficulty].lanes} lanes · ${DIFFICULTIES[this.difficulty].label}`;
  }

  renderMenuStats() {
    const songs = SONGS.length;
    const played = Object.keys(this.best).length;
    this.el.menuStats.textContent = `${songs} pieces · ${played} score${played === 1 ? "" : "s"} recorded`;
  }

  /* ---------------------------------------------------------------------- */
  /* HUD                                                                    */
  /* ---------------------------------------------------------------------- */

  buildLaneLabels(laneCount, palette, labels) {
    const wrap = this.el.laneLabels;
    wrap.innerHTML = "";
    for (let i = 0; i < laneCount; i++) {
      const el = document.createElement("div");
      el.className = "lane-label";
      el.textContent = labels[i] ?? "";
      el.style.setProperty("--accent", palette[i]);
      wrap.appendChild(el);
    }

    // Colour the touch pads to match.
    const keys = this.el.touchLanes.children;
    for (let i = 0; i < keys.length; i++) {
      keys[i].style.setProperty("--accent", palette[i] ?? "#ffffff");
    }
  }

  startPerformance(chart) {
    this._displayScore = 0;
    this._comboVisible = false;
    this.el.hudTitle.textContent = chart.song.title;
    this.el.hudComposer.textContent = `${chart.song.composer} · ${chart.difficulty.label}`;
    this.el.hudScore.textContent = "0";
    this.el.hudAccuracy.textContent = "100%";
    this.el.progressFill.style.width = "0%";
    this.el.comboNum.textContent = "0";
    this.el.comboWrap.classList.remove("is-on");
    this.el.judgement.className = "judgement";
    this._lastJudge = 0;
  }

  updateHUD(session, songTime, chart) {
    // Ease the score so it ticks rather than jumps.
    this._displayScore += (session.score - this._displayScore) * 0.22;
    if (Math.abs(session.score - this._displayScore) < 0.6) this._displayScore = session.score;
    this.el.hudScore.textContent = Math.round(this._displayScore).toLocaleString();
    this.el.hudAccuracy.textContent = `${(session.accuracy * 100).toFixed(1)}%`;

    const pct = Math.max(0, Math.min(1, songTime / chart.duration));
    this.el.progressFill.style.width = `${(pct * 100).toFixed(1)}%`;
  }

  judge(detail) {
    const el = this.el.judgement;
    el.textContent = detail.grade === "miss" ? "Miss" : detail.label;
    el.className = `judgement ${detail.grade}`;
    // Restart the CSS animation.
    void el.offsetWidth;
    el.classList.add("show");

    if (detail.combo !== undefined) {
      this.el.comboNum.textContent = String(detail.combo);
      this.el.comboWrap.classList.toggle("is-on", detail.combo >= 2);
      if (detail.combo >= 2) {
        this.el.comboWrap.style.transform = "";
        this.el.comboWrap.animate(
          [
            { transform: "scale(1.14)" },
            { transform: "scale(1)" },
          ],
          { duration: 200, easing: "cubic-bezier(0.22,1,0.36,1)" },
        );
      }
    } else if (detail.grade === "miss") {
      this.el.comboWrap.classList.remove("is-on");
    }
  }

  countdown(value) {
    if (value === null) {
      this.hideOverlay("count");
      return;
    }
    this.showOverlay("count");
    const el = this.el.countdown;
    el.textContent = String(value);
    void el.offsetWidth;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  }

  /* ---------------------------------------------------------------------- */
  /* results                                                                */
  /* ---------------------------------------------------------------------- */

  showResults(summary, chart) {
    const key = `${chart.song.id}:${chart.difficulty.id}`;
    const prev = this.best[key];
    const isBest = !prev || summary.score > prev.score;
    if (isBest) {
      this.best[key] = {
        score: summary.score,
        accuracy: summary.accuracy,
        rank: summary.rank,
        combo: summary.maxCombo,
      };
      saveJSON(BEST_KEY, this.best);
    }

    this.el.resRank.textContent = summary.rank;
    this.el.resSong.textContent = chart.song.title;
    this.el.resComposer.textContent = `${chart.song.composer} · ${chart.difficulty.label}`;
    this.el.resAccuracy.textContent = `${(summary.accuracy * 100).toFixed(1)}%`;
    this.el.resCombo.textContent = String(summary.maxCombo);
    this.el.resPerfect.textContent = String(summary.counts.perfect ?? 0);
    this.el.resGood.textContent = String((summary.counts.great ?? 0) + (summary.counts.good ?? 0));
    this.el.resMiss.textContent = String(summary.counts.miss ?? 0);
    this.el.resNotes.textContent = String(summary.total);

    // Count the score up.
    const target = summary.score;
    const el = this.el.resScore;
    const start = performance.now();
    const dur = 700;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased).toLocaleString();
      if (t < 1) requestAnimationFrame(step);
    };
    step();

    this.showOverlay("results");
    this.renderSongGrid();
    this.renderMenuStats();

    if (isBest) this.toast("New personal best");
  }

  /* ---------------------------------------------------------------------- */
  /* settings                                                               */
  /* ---------------------------------------------------------------------- */

  applySettingsToForm() {
    const s = this.settings;
    this.el.setVolume.value = String(Math.round(s.volume * 100));
    this.el.setVolumeVal.textContent = String(Math.round(s.volume * 100));
    this.el.setOffset.value = String(s.offset);
    this.el.setOffsetVal.textContent = `${s.offset > 0 ? "+" : ""}${s.offset} ms`;
    this.el.setBloom.checked = !!s.bloom;
    this.el.setParticles.checked = !!s.particles;
    this.el.setNoteLabels.checked = !!s.noteLabels;
  }

  _saveSettings() {
    saveJSON(SETTINGS_KEY, this.settings);
    this.hooks.onSettings?.(this.settings);
  }
}

/* ------------------------------------------------------------------------- */

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage disabled */
  }
}

function ratingLabel(r) {
  if (r <= 2) return "Gentle";
  if (r <= 4) return "Easy";
  if (r <= 6) return "Moderate";
  if (r <= 8) return "Hard";
  return "Virtuoso";
}

function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function hexToRgba(hex, alpha) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
