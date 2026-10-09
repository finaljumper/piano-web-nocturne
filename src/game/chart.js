/**
 * Turns a song's note data into a playable chart for a given difficulty.
 *
 * Pipeline: tracks -> absolute beats -> seconds -> difficulty filter ->
 * lane assignment -> notes sorted by time.
 */

import { parseNoteString } from "./notes.js";

/** Lane colours, chosen to read as a pitch spectrum from low to high. */
const PALETTES = {
  4: ["#4fb3d9", "#9ed36a", "#e9c46a", "#e97a9b"],
  6: ["#4fb3d9", "#5fd0b0", "#9ed36a", "#e9c46a", "#e97a9b", "#b07fe0"],
};

export const DIFFICULTIES = {
  // `minGap` is the shortest allowed gap between note onsets. Thinning the
  // texture evenly (rather than deleting one hand) keeps the tune intact at
  // every difficulty while giving a real density gradient. Easy also breathes:
  // 0.8x tempo and 4 lanes; Hard speeds up to 1.15x with the same 6 lanes as
  // Medium, but a tighter minGap lets more of the fast line through.
  easy: { id: "easy", label: "Easy", lanes: 4, minGap: 0.46, tempoScale: 0.8, approach: 2.6 },
  medium: { id: "medium", label: "Medium", lanes: 6, minGap: 0.29, tempoScale: 1, approach: 2.0 },
  hard: { id: "hard", label: "Hard", lanes: 6, minGap: 0.22, tempoScale: 1.15, approach: 1.7 },
};

/** Hit windows, in seconds either side of the note. */
export const WINDOWS = {
  perfect: 0.07,
  great: 0.13,
  good: 0.21,
};

export const MISS_WINDOW = WINDOWS.good;

/** Expand one author track into `{ midi, beat, durBeats, hand }`. */
function expandTrack(track) {
  const raw = typeof track.notes === "function" ? track.notes() : track.notes;
  const parsed = typeof raw === "string" ? parseNoteString(raw) : raw;

  const out = [];
  let beat = 0;
  for (const item of parsed) {
    const midi = item.midi ?? null;
    const dur = item.dur ?? 1;
    if (midi !== null) {
      out.push({ midi, beat, durBeats: dur, hand: track.hand ?? "R" });
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
  // Easy also breathes: a slightly slower tempo gives newer players room,
  // which thinning alone cannot.
  const spb = 60 / (song.bpm * (cfg.tempoScale ?? 1));

  // --- 1. expand all tracks -------------------------------------------------
  const all = [];
  for (const track of song.tracks) {
    for (const n of expandTrack(track)) {
      all.push({
        midi: n.midi,
        hand: n.hand,
        time: n.beat * spb,
        dur: Math.max(0.08, n.durBeats * spb),
      });
    }
  }
  all.sort((a, b) => a.time - b.time || a.midi - b.midi);

  // --- 2. difficulty filtering ---------------------------------------------
  const EPS = 1 / 240;

  // Group simultaneous notes into onsets so chords stay together.
  const onsets = [];
  for (const n of all) {
    const last = onsets.at(-1);
    if (last && Math.abs(n.time - last.time) < EPS) last.notes.push(n);
    else onsets.push({ time: n.time, notes: [n] });
  }

  // Drop onsets that crowd the previous kept onset. Even sub-sampling keeps the
  // rhythm legible instead of punching holes in the melody.
  const kept = [];
  let lastKept = -Infinity;
  for (const onset of onsets) {
    if (onset.time - lastKept < cfg.minGap - EPS) continue;
    lastKept = onset.time;
    kept.push(...onset.notes);
  }
  kept.sort((a, b) => a.time - b.time || a.midi - b.midi);

  // --- 3. lane assignment ---------------------------------------------------
  const laneCount = cfg.lanes;
  const hands = new Set(kept.map((n) => n.hand));
  const bothHands = hands.has("L") && hands.has("R");
  const split = bothHands ? Math.max(1, Math.floor(laneCount / 2)) : laneCount;

  // Spread the distinct pitches of each hand evenly across its lane block. This
  // is still monotonic in pitch, but it stops a pitch that repeats constantly
  // (the Moonlight's arpeggio tones) from swallowing one lane.
  const distinctByHand = {};
  for (const hand of hands) {
    distinctByHand[hand] = [
      ...new Set(kept.filter((n) => n.hand === hand).map((n) => n.midi)),
    ].sort((a, b) => a - b);
  }

  for (const n of kept) {
    const blockStart = bothHands && n.hand === "L" ? 0 : bothHands ? split : 0;
    const blockSize = bothHands ? split : laneCount;
    const pitches = distinctByHand[n.hand];
    const idx = pitches.indexOf(n.midi);
    const t = pitches.length <= 1 ? 0.5 : idx / (pitches.length - 1);
    n.lane = blockStart + clampInt(Math.round(t * (blockSize - 1)), 0, blockSize - 1);
  }

  // --- 4. finalise ----------------------------------------------------------
  kept.sort((a, b) => a.time - b.time || a.lane - b.lane);

  const endTime = kept.length ? kept[kept.length - 1].time + 2.2 : 5;

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
