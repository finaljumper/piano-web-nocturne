/**
 * Judgement and scoring for one performance.
 *
 * The chart holds every note; the session decides when a note was struck,
 * how well, and keeps the running tally. It never touches audio or rendering.
 */

import { WINDOWS, MISS_WINDOW } from "./chart.js";

const BASE = { perfect: 300, great: 200, good: 100, miss: 0 };

export class Session {
  /** @param {ReturnType<import('./chart.js').buildChart>} chart */
  constructor(chart) {
    this.chart = chart;
    this.notes = chart.notes;

    /** Index of the earliest note not yet judged (notes are time-sorted). */
    this._cursor = 0;

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.judged = 0;
    this.hits = 0;
    this.accuracySum = 0; // weighted, over all judged notes
    this.lastGrade = null;
    /** @type {Array<{note:object, grade:string, delta:number}>} */
    this.recent = [];
  }

  get total() {
    return this.notes.length;
  }

  get progress() {
    return this.total ? this.judged / this.total : 0;
  }

  get accuracy() {
    if (!this.judged) return 1;
    return this.accuracySum / (this.judged * BASE.perfect);
  }

  get multiplier() {
    return Math.min(4, 1 + this.combo * 0.02);
  }

  /**
   * Advance the clock. Notes whose window has fully elapsed become misses.
   * @param {number} songTime seconds since the song started
   * @returns {object[]} the notes that were missed this frame
   */
  update(songTime) {
    const missed = [];
    const deadline = songTime - MISS_WINDOW;
    while (this._cursor < this.notes.length && this.notes[this._cursor].time < deadline) {
      const note = this.notes[this._cursor];
      this._cursor++;
      if (note.judged) continue;
      note.judged = "miss";
      this._register("miss", 0);
      missed.push(note);
    }
    return missed;
  }

  /**
   * Register a key press on a lane.
   * @param {number} lane
   * @param {number} songTime
   * @returns {{note:object, grade:string, delta:number}|null} the judged note
   */
  press(lane, songTime) {
    let best = null;
    let bestDelta = Infinity;

    for (const note of this.notes) {
      if (note.lane !== lane || note.judged) continue;
      const delta = songTime - note.time;
      if (delta < -MISS_WINDOW) break; // too far in the future, and sorted
      const abs = Math.abs(delta);
      if (abs <= MISS_WINDOW && abs < bestDelta) {
        bestDelta = abs;
        best = note;
      }
    }

    if (!best) return null;

    const grade = gradeFor(bestDelta);
    best.judged = grade;
    best.delta = songTime - best.time;
    const detail = { note: best, grade, delta: best.delta };
    this._register(grade, bestDelta);
    this.recent.push(detail);
    if (this.recent.length > 24) this.recent.shift();
    return detail;
  }

  _register(grade, absDelta) {
    this.judged++;
    this.counts[grade] = (this.counts[grade] ?? 0) + 1;
    this.lastGrade = grade;

    if (grade === "miss") {
      this.combo = 0;
      this.accuracySum += 0;
      return;
    }

    this.hits++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);

    // Near-perfect timing counts a touch more than a scrape.
    const tightness = 1 - Math.min(1, absDelta / MISS_WINDOW) * 0.25;
    this.accuracySum += BASE[grade] * tightness;

    this.score += Math.round(BASE[grade] * this.multiplier * tightness);
  }

  get rank() {
    const acc = this.accuracy;
    if (acc >= 0.98) return "SS";
    if (acc >= 0.94) return "S";
    if (acc >= 0.88) return "A";
    if (acc >= 0.8) return "B";
    if (acc >= 0.68) return "C";
    return "D";
  }

  get summary() {
    return {
      score: this.score,
      accuracy: this.accuracy,
      maxCombo: this.maxCombo,
      counts: { ...this.counts },
      total: this.total,
      rank: this.rank,
    };
  }
}

function gradeFor(absDelta) {
  if (absDelta <= WINDOWS.perfect) return "perfect";
  if (absDelta <= WINDOWS.great) return "great";
  if (absDelta <= WINDOWS.good) return "good";
  return "miss";
}

export const GRADE_LABEL = {
  perfect: "Perfect",
  great: "Great",
  good: "Good",
  miss: "Miss",
};
