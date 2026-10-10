/**
 * Turns a song's note data into a playable chart for a given difficulty.
 *
 * The full performance is independent of the difficulty's playable targets.
 * Imported tracks use absolute seconds; the sequential authoring DSL remains
 * supported for hand-authored songs.
 */

import { parseNoteString } from "./notes.js";

/** Lane colours, chosen to read as a pitch spectrum from low to high. */
const PALETTES = {
  4: ["#4fb3d9", "#9ed36a", "#e9c46a", "#e97a9b"],
  6: ["#4fb3d9", "#5fd0b0", "#9ed36a", "#e9c46a", "#e97a9b", "#b07fe0"],
};

export const DIFFICULTIES = {
  // Only hit-target density, chord size, lanes and approach speed change.
  // The complete music plays at its source tempo on every difficulty.
  // `approach` is gem travel time; shorter times make the highway scroll faster.
  easy: { id: "easy", label: "Easy", lanes: 4, minGap: 0.46, targetFraction: 0.7, maxChord: 1, approach: 3.2 },
  medium: { id: "medium", label: "Medium", lanes: 6, minGap: 0.29, targetFraction: 0.85, maxChord: 2, approach: 2.2 },
  hard: { id: "hard", label: "Hard", lanes: 6, minGap: 0.12, targetFraction: 1, maxChord: 6, approach: 1.6 },
};

/** Hit windows, in seconds either side of the note. */
export const WINDOWS = {
  perfect: 0.07,
  great: 0.13,
  good: 0.21,
};

export const MISS_WINDOW = WINDOWS.good;

/** Read absolute MIDI events or expand sequential notes at the song's tempo. */
function expandTrack(track, spb) {
  const raw = typeof track.notes === "function" ? track.notes() : track.notes;
  const parsed = typeof raw === "string" ? parseNoteString(raw) : raw;

  const out = [];
  let beat = 0;
  for (const item of parsed) {
    const midi = item.midi ?? null;
    const dur = item.dur ?? 1;
    if (midi !== null) {
      out.push({
        midi,
        time: item.time ?? beat * spb,
        dur: item.time === undefined ? Math.max(0.08, dur * spb) : dur,
        velocity: item.velocity ?? 0.5,
        sustain: item.sustain ?? (item.time === undefined ? Math.max(0.08, dur * spb) : dur),
        hand: track.hand ?? "R",
      });
    }
    beat += dur;
  }
  return out;
}

/**
 * @param {object} song  entry from SONGS
 * @param {'easy'|'medium'|'hard'} difficulty
 */
export function buildChart(song, difficulty = "medium") {
  const cfg = DIFFICULTIES[difficulty] ?? DIFFICULTIES.medium;
  // The music runs at the song's own tempo on every difficulty; only the gem
  // travel time (`approach`) changes how fast the highway scrolls.
  const spb = 60 / song.bpm;

  // --- 1. expand all tracks -------------------------------------------------
  const performance = [];
  for (const track of song.tracks) {
    performance.push(...expandTrack(track, spb));
  }
  performance.sort((a, b) => a.time - b.time || a.midi - b.midi);
  const all = performance;

  // --- 2. difficulty filtering ---------------------------------------------
  const EPS = 1 / 240;

  // Group simultaneous notes into onsets so chords stay together.
  const onsets = [];
  for (const n of all) {
    const last = onsets.at(-1);
    if (last && Math.abs(n.time - last.time) < EPS) last.notes.push(n);
    else onsets.push({ time: n.time, notes: [n], index: onsets.length });
  }

  // Nest the onset sets so an easier chart never asks for more notes. Dense
  // passages can still be simplified on Hard without changing their audio.
  let playableOnsets = onsets;
  for (const level of [DIFFICULTIES.hard, DIFFICULTIES.medium, DIFFICULTIES.easy]) {
    let lastKept = -Infinity;
    playableOnsets = playableOnsets.filter((onset) => {
      if (onset.time - lastKept < level.minGap - EPS) return false;
      lastKept = onset.notes.at(-1).time;
      return true;
    });
    // Leave some notes as accompaniment even when a slow piece already fits
    // the gap limit. This keeps Easy and Medium lighter for sparse songs too.
    playableOnsets = playableOnsets.filter((_, i) =>
      Math.floor(i * level.targetFraction) !== Math.floor((i - 1) * level.targetFraction)
    );
    if (level === cfg) break;
  }

  // --- 3. lane assignment ---------------------------------------------------
  const laneCount = cfg.lanes;
  const hands = new Set(all.map((n) => n.hand));
  const bothHands = hands.has("L") && hands.has("R");
  const split = bothHands ? Math.max(1, Math.floor(laneCount / 2)) : laneCount;

  // Spread the distinct pitches of each hand evenly across its lane block. This
  // is still monotonic in pitch, but it stops a pitch that repeats constantly
  // (the Moonlight's arpeggio tones) from swallowing one lane.
  const distinctByHand = {};
  for (const hand of hands) {
    distinctByHand[hand] = [
      ...new Set(all.filter((n) => n.hand === hand).map((n) => n.midi)),
    ].sort((a, b) => a - b);
  }

  const laneFor = (n) => {
    const blockStart = bothHands && n.hand === "L" ? 0 : bothHands ? split : 0;
    const blockSize = bothHands ? split : laneCount;
    const pitches = distinctByHand[n.hand];
    const idx = pitches.indexOf(n.midi);
    const t = pitches.length <= 1 ? 0.5 : idx / (pitches.length - 1);
    return blockStart + clampInt(Math.round(t * (blockSize - 1)), 0, blockSize - 1);
  };

  const kept = [];
  for (const onset of playableOnsets) {
    // Alternate bass/melody priority and fill outward-in: easier chords are
    // subsets of harder chords. Multiple voices sharing a lane are one target.
    const used = new Set();
    let lo = 0;
    let hi = onset.notes.length - 1;
    let pick = onset.index;
    while (lo <= hi && used.size < cfg.maxChord) {
      const note = onset.notes[pick++ % 2 ? lo++ : hi--];
      const lane = laneFor(note);
      if (used.has(lane)) continue;
      used.add(lane);
      kept.push({ ...note, lane });
    }
  }

  // --- 4. finalise ----------------------------------------------------------
  kept.sort((a, b) => a.time - b.time || a.lane - b.lane);

  // Filtered final targets must not end the piece or cut off sustained notes.
  const scoreEnd = all.length ? Math.max(...all.map((n) => n.time + n.sustain)) : 2.8;
  const endTime = scoreEnd + 2.2;

  for (let i = 0; i < kept.length; i++) {
    kept[i].index = i;
    kept[i].judged = null;
  }

  return {
    song,
    difficulty: cfg,
    laneCount,
    palette: PALETTES[laneCount] ?? PALETTES[6],
    notes: kept,
    performance,
    duration: endTime,
    stats: chartStats(kept),
  };
}

function chartStats(notes) {
  if (!notes.length) return { count: 0, nps: 0, peak: 0, rating: 1 };
  const start = notes[0].time;
  const end = notes[notes.length - 1].time;
  const span = Math.max(1, end - start);
  const nps = notes.length / span;

  // Peak notes-per-second over a 2s sliding window.
  let peak = 0;
  let lo = 0;
  for (let hi = 0; hi < notes.length; hi++) {
    while (notes[hi].time - notes[lo].time > 2) lo++;
    peak = Math.max(peak, (hi - lo + 1) / 2);
  }

  const rating = Math.round(clamp(1 + nps * 1.6 + peak * 0.5, 1, 10));
  return { count: notes.length, nps, peak, rating };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function clampInt(v, lo, hi) {
  return Math.round(clamp(v, lo, hi));
}
