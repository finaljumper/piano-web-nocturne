# Plan: Full-length songs, expanded repertoire, 3 difficulties

## Context
Nocturne's songs are currently short compact arrangements (~8–16 bars). The user wants:
1. Existing songs extended to **full length**.
2. **More songs** from Mozart, Chopin, Beethoven, Rachmaninov, Tchaikovsky — full length.
3. **3 difficulties per song**: Easy (4 lanes, slower), Medium (6 lanes, normal), Hard (6 lanes, faster).

Decisions made with the user:
- **Full-length data via public-domain MIDI import** (not hand-authoring).
- **New song list approved** (~2 per composer, see below).
- **Hard = 1.15× tempo**, 6 lanes; existing best scores kept as-is (stale hard scores accepted).

## Current state (codebase findings)
- `src/game/songs.js` — hand-authored note strings/generators; `src/game/notes.js` defines the DSL and also accepts raw `{midi,dur}[]` arrays (expandTrack handles both), and generators may return `{name,dur}` too.
- `src/game/chart.js` — `DIFFICULTIES = { easy: 4 lanes / 0.8×, normal: 6 lanes / 1×, hard: 8 lanes / 1× }`, with `minGap` onset thinning, `approach` time, and hand-based lane splitting. tempoScale already exists per difficulty.
- `src/game/input.js` — `KEY_LAYOUTS` for 4/6/8; 6-key layout already present.
- `src/ui/ui.js` — difficulty pills rendered from `DIFFICULTIES`; best scores keyed `${song.id}:${difficulty}` (localStorage), no migration needed.
- `tools/validate.mjs` / `tools/verify.mjs` — assert lane counts, min gaps, and a hard-vs-easier density ordering (references `normal` and `hard`).
- Song audio is synthesized (`src/audio/`), so no audio assets to worry about — only note data.

## Approach

### A. MIDI import pipeline (new)
1. Add `@tonejs/midi` as a devDependency (pure JS MIDI parser).
2. New tool `tools/import-midi.mjs`:
   - Input: a MIDI file (downloaded once from Mutopia/IMSLP-adjacent public-domain sources, kept in `tools/midi/` or fetched; files committed for reproducibility).
   - Output: `src/game/data/<song-id>.json` — `{ tracks: [{ hand, notes: [{midi, dur}] }] , bpm, beatsPerBar }`.
   - Conversion rules:
     - Hand assignment: split by MIDI track when the source has clean LH/RH tracks; otherwise split at a pitch threshold (e.g. C4 / middle-line per piece).
     - Merge near-simultaneous duplicate pitches, clamp durations to `>0`.
     - Keep a raw conversion; the existing difficulty `minGap` thinning in `chart.js` handles readability per difficulty, so the import stays faithful.
   - CLI: `node tools/import-midi.mjs <in.mid> <song-id> [--split <midi-note>]`.
3. `src/game/songs.js` — each imported song's `tracks` becomes a lazy loader reading its JSON (`import()` or a bundled JSON import via Vite), so full-length data doesn't bloat initial parse. Existing hand-authored DSL stays for any piece without a good MIDI source.

### B. Repertoire (all full length)
- **Extend existing 7** via MIDI import where available (Für Elise, Moonlight Mvt I, Ode to Joy, Minuet in G, Canon in D, Prelude in C, Gymnopédie 1).
- **Add new (approved mix):**
  - Mozart: Turkish March (K.331/III — actually Beethoven's ruin... use *Rondo alla Turca* K.331), Lacrimosa (Requiem, piano reduction)
  - Chopin: Nocturne op.9 no.2, Prelude op.28 no.4 (e-minor), Fantaisie-Impromptu op.66
  - Beethoven: full Für Elise covers Beethoven; add Pathétique Mvt II (Adagio cantabile)
  - Rachmaninov: Prelude op.3 no.2 (c#-minor — public domain in most jurisdictions via IMSLP Russia rules; if sourcing is a problem, swap to a pre-1923-published piece), Vocalise (piano reduction)
  - Tchaikovsky: Swan Lake theme (piano transcription), Dance of the Sugar Plum Fairy (op.71a)
  - All are public-domain compositions; MIDI files sourced from public-domain repositories (e.g. Mutopia, where available).
- Each song keeps id/title/composer/era/year/accent/bpm/beatsPerBar/blurb metadata in `songs.js`.

### C. Difficulty rework (`src/game/chart.js`)
```js
easy:   { lanes: 4, tempoScale: 0.8,  minGap: 0.46, approach: 2.6 }   // unchanged
medium: { id:"medium", label:"Medium", lanes: 6, tempoScale: 1,   minGap: 0.29, approach: 2.0 }  // rename normal→medium
hard:   { lanes: 6, tempoScale: 1.15, minGap: 0.22, approach: 1.7 }  // 6 lanes, faster, allow denser than medium
```
- `minGap` for hard shrinks so the faster tempo actually shows more notes; validate density ordering still holds (easy ≤ medium ≤ hard nps) — adjust if verify fails.
- Keep the 8-lane `PALETTES[8]`/`KEY_LAYOUTS[8]` code paths (harmless) or prune; prefer pruning to keep `KEY_LAYOUTS` honest.
- Update `validate.mjs` density ranking `{easy:0, medium:1, hard:2}` and any `normal` references; update `verify.mjs` selector `.pill[data-diff="normal"]` → `medium`.
- Old localStorage bests: leave untouched (user approved); stale hard scores simply persist.

## Files to modify / create
- **New:** `tools/import-midi.mjs`, `src/game/data/*.json` (imported songs), `tools/midi/` (source MIDIs, committed)
- **Modify:** `package.json` (add `@tonejs/midi`, `import:midi` script), `src/game/songs.js` (lazy JSON loading + 7–9 new song entries), `src/game/chart.js` (difficulty rework), `src/game/input.js` (prune 8-lane layout), `src/ui/ui.js` (difficulty copy), `tools/validate.mjs`, `tools/verify.mjs`

## Reuse
- `parseNoteString` / `expandTrack` (`notes.js`, `chart.js`) — raw `{midi,dur}[]` arrays already supported, no format change needed.
- `minGap` onset-thinning in `chart.js` — the readability mechanism for dense MIDI imports; no new thinning code needed unless playtesting shows dense scores are unplayable (then add a max-notes-per-onset cap in `import-midi.mjs`).
- `KEY_LAYOUTS[6]`, `PALETTES[6]` — already exist.

## Steps
- [x] Add `@tonejs/midi`; write `tools/import-midi.mjs` (parse → track/pitch split → JSON)
- [x] Source + commit public-domain MIDI files; import the 7 existing pieces as full-length data; point their `songs.js` entries at the JSON
- [x] Rework `DIFFICULTIES` (easy 4/0.8×, medium 6/1×, hard 6/1.15×), prune 8-lane paths, update UI copy
- [x] Import + add the ~11 new songs with metadata
- [x] Update `validate.mjs` / `verify.mjs` for the new difficulty ids and density ordering
- [x] Run `npm run validate` and `npm run verify`; fix density/lanes assertion failures
- [x] Manual playtest: each new song × 3 difficulties (tempo feel, 4 vs 6 lanes, song runs to the true end, results + best-score flow)

## Verification
- `npm run validate` — chart invariants (lane counts, min gaps, density ordering) across all songs × 3 difficulties.
- `npm run verify` — headless browser end-to-end (menu → select → play → results), screenshots in `tools/shots/`.
- Manual spot-check that full-length durations are real (e.g. Für Elise ~2:30, Canon in D full ~4–5 min at game tempo).
