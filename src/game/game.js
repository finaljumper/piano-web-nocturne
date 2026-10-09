import { buildChart } from "./chart.js";
import { Session, GRADE_LABEL } from "./session.js";
import { Input } from "./input.js";

const LEAD_IN = 3.2; // seconds of countdown before the first beat
const LOOKAHEAD = 1.5; // seconds of audio scheduled ahead of the clock

/**
 * One performance. Owns the clock, the session, audio scheduling and the
 * bridge between input and the visual layer.
 */
export class Game {
  /**
   * @param {object} o
   * @param {import('../audio/engine.js').AudioEngine} o.audio
   * @param {import('../render/scene.js').View} o.view
   * @param {import('../render/highway.js').Highway} o.highway
   * @param {import('../render/effects.js').Effects} o.effects
   * @param {object} o.hooks  UI callbacks
   */
  constructor({ audio, view, highway, effects, hooks = {} }) {
    this.audio = audio;
    this.view = view;
    this.highway = highway;
    this.effects = effects;
    this.hooks = hooks;

    this.state = "idle"; // idle | playing | paused | finished
    this.songTime = 0;
    this.chart = null;
    this.session = null;
    this.offset = 0; // seconds, from settings
    this._schedIndex = 0;
    this._audioStart = 0;
    this._countShown = null;

    this.input = new Input({
      onPress: (lane) => this._press(lane),
      onRelease: (lane) => this.highway.pressLane(lane, false),
      onPause: () => this.hooks.onPauseKey?.(),
    });
  }

  /* ---------------------------------------------------------------------- */

  /** @param {object} song @param {'easy'|'medium'|'hard'} difficulty */
  play(song, difficulty) {
    this.stop(true);

    this.chart = buildChart(song, difficulty);
    this.session = new Session(this.chart);
    this.highway.build(this.chart);
    this.effects.clear();

    this.input.setLanes(this.chart.laneCount);
    this.input.setEnabled(true);

    this._schedIndex = 0;
    this._countShown = null;
    this._audioStart = this.audio.now() + LEAD_IN;
    this.songTime = -LEAD_IN;
    this.state = "playing";

    this.hooks.onStart?.(this.chart);
  }

  /** Reset the same chart from the top. */
  restart() {
    if (!this.chart) return;
    const { song, difficulty } = this.chart;
    this.play(song, difficulty.id);
  }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.audio.suspend();
    this.hooks.onPause?.();
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.audio.resume();
    // The countdown overlay is hidden while paused; force it to re-emit.
    this._countShown = undefined;
    this.hooks.onResume?.();
  }

  togglePause() {
    if (this.state === "playing") this.pause();
    else if (this.state === "paused") this.resume();
  }

  /**
   * @param {boolean} silent skip the finish hooks (used when restarting)
   */
  stop(silent = false) {
    if (this.state === "idle") return;
    this.state = "idle";
    this.audio.panic();
    this.input.setEnabled(false);
    if (!silent) this.hooks.onStop?.();
  }

  /* ---------------------------------------------------------------------- */

  /** @param {number} _dt seconds */
  update(_dt) {
    if (this.state !== "playing") return;

    const songTime = this.audio.now() - this._audioStart;
    this.songTime = songTime;

    this._updateCountdown(songTime);
    this._scheduleAudio(songTime);

    // Notes whose window has closed are misses. Judge on the same
    // offset-adjusted clock as key presses, or a positive offset lets the
    // auto-miss fire before a late-but-valid press can claim the note.
    const missed = this.session.update(songTime - this.offset);
    for (const note of missed) {
      this.effects.missFlash(note.lane);
      this.hooks.onJudge?.({ grade: "miss", note, lane: note.lane, label: GRADE_LABEL.miss });
    }

    this.hooks.onProgress?.(this.session, songTime, this.chart);

    if (songTime > this.chart.duration) this._finish();
  }

  _updateCountdown(songTime) {
    const remaining = -songTime;
    let value = null;
    if (remaining > 0) value = Math.min(3, Math.ceil(remaining));
    if (value !== this._countShown) {
      this._countShown = value;
      this.hooks.onCountdown?.(value);
    }
  }

  _scheduleAudio(songTime) {
    const notes = this.chart.notes;
    const horizon = songTime + LOOKAHEAD;
    while (this._schedIndex < notes.length && notes[this._schedIndex].time <= horizon) {
      const note = notes[this._schedIndex];
      const when = this._audioStart + note.time;
      if (when > this.audio.now()) {
        // The sustained "performance" layer: the piece always sounds, so the
        // player is practising against a real pianist rather than silence.
        this.audio.piano.note(note.midi, when, note.dur + 0.35, {
          velocity: 0.5,
          bright: 0.42,
        });
      }
      this._schedIndex++;
    }
  }

  _press(lane) {
    if (this.state !== "playing") return;

    this.highway.pressLane(lane, true);

    // A positive offset makes the judgement more forgiving for late hits.
    const judgeTime = this.songTime - this.offset;
    const detail = this.session.press(lane, judgeTime);
    if (!detail || detail.grade === "miss") return;

    const color = this.chart.palette[lane];
    this.effects.burst(lane, detail.grade, color);
    this.highway.punchLane(lane, detail.grade === "perfect" ? 1 : 0.6);

    // Reward layer: a bright restrike of the note the player just earned.
    this.audio.piano.accent(detail.note.midi, this.audio.now() + 0.004);

    this.hooks.onJudge?.({
      grade: detail.grade,
      note: detail.note,
      lane,
      delta: detail.delta,
      label: GRADE_LABEL[detail.grade],
      combo: this.session.combo,
      multiplier: this.session.multiplier,
    });
  }

  _finish() {
    this.state = "finished";
    this.audio.panic();
    this.input.setEnabled(false);
    this.hooks.onFinish?.(this.session.summary, this.chart);
  }
}

export { LEAD_IN };
