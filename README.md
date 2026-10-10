# Nocturne

A piano rhythm game for classical and neo-classical music. Notes fall down a
highway in the spirit of *Guitar Hero*, but instead of five frets you play the
notes themselves — left hand on the left lanes, right hand on the right.

The music is **synthesised live in the browser**. There are no audio files, no
soundfonts and no network requests: each note is built additively from partials
with per-partial inharmonicity and pitch-dependent decay, fed through a
procedural convolution reverb.

Twelve catalog entries are generated from checked-in Mutopia sheet-music
notation, with all written repeats and simultaneous parts. The complete four-part
Canon replaces the former single melody. Orchestral/choral parts are rendered
on piano, so instrumentation differs from the original ensemble. Five existing
third-party MIDI transcriptions still need independent score verification.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build:

```bash
npm run build
npm run preview
```

Audio can only start from a user gesture, so the first click on **Play**
unlocks the AudioContext. The `AudioContext` clock then drives the whole game —
gem positions, judgement windows and note scheduling all read the same clock, so
what you see and what you hear cannot drift apart.

## Playing

| Left hand | Right hand |
| --------- | ---------- |
| `A` `S` `D` `F` | `J` `K` `L` `;` |

- Press the key for a lane as its gem crosses the hit line.
- `Esc` or `P` pauses. On touch devices, tap the pads along the bottom.
- Number keys `1`–`6` are accepted as alternates for the active lanes.

Timing grades: **Perfect** ±70 ms, **Great** ±130 ms, **Good** ±210 ms, beyond
that the note is missed and the combo resets. Score scales with the grade and a
combo multiplier (up to 4×). Every piece is rated `S`/`A`/`B`/`C`/`D` on accuracy
at the end.

### Difficulty

| | Lanes | Target spacing | Max targets per chord | Scroll |
| --- | --- | --- | --- | --- |
| Easy | 4 | ≥ 460 ms | 1 | slower |
| Medium | 6 | ≥ 290 ms | 2 | medium |
| Hard | 6 | ≥ 120 ms | 6 | fast |

**The complete song plays on every difficulty**, including notes without a
falling block. Playback preserves the source MIDI's simultaneous voices, note
lengths, velocities and tempo changes. Difficulty changes the targets to hit,
never the music or its tempo. Hits reward you with visual effects and scoring
without adding extra piano notes.

Easy selects fewer onsets and single-note targets; Medium adds more onsets and
two-note chords; Hard follows the score most closely, while still simplifying
very dense passages and combining voices that share a lane. Additional even
thinning keeps Easy and Medium lighter even in slow, sparse pieces.
Lane assignment ranks the
*distinct pitches* of each hand and spreads them across its half of the highway:
monotonic in pitch (a scale run reads as a lane run), but no lane swallows the
melody.

## Repertoire

Seventeen classical pieces and arrangements. Twelve have checked-in notation
sources and a reproducible score-to-MIDI pipeline in `tools/build-score-midi.mjs`.
`tools/import-midi.mjs` preserves the complete MIDI performance.

| Piece | Composer | Era |
| --- | --- | --- |
| Für Elise | Beethoven | Classical |
| Moonlight Sonata (I) | Beethoven | Classical |
| Ode to Joy (theme arrangement) | Beethoven | Classical |
| Pathétique: Adagio cantabile | Beethoven | Classical |
| Rondo alla Turca | Mozart | Classical |
| Lacrimosa (Requiem) | Mozart | Classical |
| Nocturne Op. 9 No. 2 | Chopin | Romantic |
| Prelude Op. 28 No. 4 | Chopin | Romantic |
| Fantaisie-Impromptu Op. 66 | Chopin | Romantic |
| Prelude Op. 3 No. 2 | Rachmaninoff | Romantic |
| Vocalise Op. 34 No. 14 | Rachmaninoff | Romantic |
| Swan Lake Theme | Tchaikovsky | Romantic |
| Dance of the Sugar Plum Fairy | Tchaikovsky | Romantic |
| Minuet in G | Petzold (attrib. Bach) | Baroque |
| Canon in D | Pachelbel | Baroque |
| Prelude in C | J.S. Bach | Baroque |
| Gymnopédie No. 1 | Satie | Neo-classical |

The conversions keep every pitched MIDI note at its original time; percussion
tracks are excluded from this piano arrangement. Per-difficulty onset thinning
in `chart.js` affects only the lane highway, while its separate `performance`
score supplies full audio playback. MIDI damper-pedal events extend audible
holds without changing the written rhythm or target timing. Song length includes
the final held note. No extra piano notes are added when hitting a target.

To regenerate note data from its checked-in MIDI:

```bash
node tools/import-midi.mjs tools/midi/fur-elise.mid fur-elise
```

To rebuild MIDI from the actual notation (LilyPond 2.24.x and `convert-ly` required):

```bash
node tools/build-score-midi.mjs
node tools/music-credits.mjs
```

See [notation sources](tools/scores/README.md) for editions, repeat handling and
tempo choices. The [remaining transcription audit](tools/transcription-audit/README.md)
documents two corrected Lacrimosa alto notes, its complete choir comparison,
Ode to Joy's checked opening, and the full-score comparisons still pending.
Ordinary app builds use the checked-in data and need no notation compiler or music download.

## Architecture

```text
src/
  audio/
    piano.js      additive piano voice: partials, inharmonicity, hammer noise
    reverb.js     procedural impulse responses
    engine.js     AudioContext, master bus, limiter, soft clipper, reverb send
  game/
    notes.js      note-name parsing and the compact authoring DSL
    songs.js      the repertoire as note data
    chart.js      song -> playable chart: timing, difficulty filter, lanes
    session.js    judgement, scoring, combos, accuracy, rank
    input.js      keyboard + touch mapped onto N lanes
    game.js       clock, audio scheduling, input/visual/audio wiring
  render/
    scene.js      renderer, camera, sky, dust, bloom
    highway.js    road, lanes, hit line, key pads, instanced gems
    effects.js    pooled hit particles, rings, miss flashes
  ui/
    ui.js         screens, song select, HUD, settings, results
  main.js         bootstrap and the single master loop
```

Notable implementation details:

- **Gems** are one `InstancedMesh` with a rounded-rect SDF shader, per-instance
  colour and alpha, and a shared 16×8 texture atlas of every MIDI note name for
  the optional "show note letters" learning aid.
- **Audio is scheduled on a lookahead** (~1.5 s) against `AudioContext.currentTime`
  so timing never depends on frame rate.
- **Pause** suspends the AudioContext, which freezes the clock, the music and the
  falling notes together.
- Hit sparkles, rings and miss flashes are fully pooled — no allocation during
  play.
- A soft clipper after the limiter is transparent below 0.75 and asymptotic to
  1.0, so a dense fortissimo can never hard-clip the output.

## Development tools

The project ships its own verification harness. It drives the real game in
headless Chromium, plays charts with frame-accurate synthetic key presses, and
fails on any console error.

```bash
npm run validate     # chart invariants, MIDI fidelity and audio scheduling
npm run verify       # build, then drive the game end to end in Chromium
npm run audio:level  # offline render of the synth: peak / RMS / clipping
```

`npm run verify` writes screenshots to `tools/shots/`. Because the checks are
meant to be meaningful in CI — where there is no GPU — bloom is disabled for the
run via a pre-seeded settings value.

Two helpers inspect a screenshot without a display:

```bash
node tools/inspect-img.mjs tools/shots/05-highway.png   # ASCII map + colour stats
node tools/shot.mjs tools/shots/labels.png fur-elise hard
```

## Accessibility

- `prefers-reduced-motion` collapses UI animation.
- Volume, timing offset, bloom and spark effects are all configurable and
  persisted to `localStorage`.
- Difficulty is selectable per session; `Easy` reduces lane count, density and
  tempo together.

## Licence

Game code is provided as-is. Composition rights, MIDI transcription rights and
recording rights must be considered separately.

Notation credits and individual transcription licenses are in
[Music credits](public/music-credits.html), also accessible from Settings.
Adapted MIDI and note data retain the respective source licenses.
