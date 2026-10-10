# Notation sources

The twelve song directories retain the original LilyPond notation and local
includes from the Mutopia Project. The pinned upstream links, editions,
typesetters and transcription licenses are in `../score-sources.json`.
Their original notices remain in the files. A public-domain composition does
not imply that every transcription uses the same license.

With LilyPond 2.24.x and `convert-ly` on PATH, rebuild all twelve performances:

```sh
node tools/build-score-midi.mjs
node tools/music-credits.mjs
npm run validate
```

Pass song IDs to rebuild a subset. `LILYPOND` and `CONVERT_LY` can select custom
binaries. This is an authoring operation; routine installation and app builds
use the already checked-in MIDI and generated JavaScript and need no LilyPond.

The script works on temporary copies, migrates older notation with `convert-ly`,
unfolds written repeats and alternative endings, then compiles MIDI. Two old
commands require explicit compatibility changes: `set-octavation` becomes
`\ottava`, and obsolete engraving-only beam helpers are removed. Original
notation remains untouched. No pitches or rhythms are authored by the importer.

The complete four-part Canon replaces the previous single-violin arrangement.
All four parts play through the piano synth. This is a keyboard rendering of
the original parts rather than a separately arranged two-hand reduction.

Score performance markings take precedence. Where no numeric tempo is given,
the existing quarter = 60 fallback is retained, except Alla Turca's Allegretto
uses quarter = 120. Moonlight enables its source's commented quarter = 54.
These choices are documented in the manifest; notation alone does not prescribe
a unique recording's tempo or rubato.

The five other catalog entries still use the pre-existing MIDI transcriptions.
Their complete pitched events are retained. The [remaining transcription audit](../transcription-audit/README.md)
checks all four Lacrimosa choir parts (including two alto corrections) and the
first eight Ode to Joy theme bars. Full-score fidelity and the original MIDI
transcription licenses remain unverified. Ode to Joy is a
theme arrangement, not Beethoven's complete Ninth Symphony finale. They need
authoritative notation before they can be described as verified score editions.

The MIDI/note-data adaptations retain each source's linked license. In
particular, the ShareAlike terms apply to the adaptations of Moonlight,
Nocturne Op. 9 No. 2 and Prelude Op. 3 No. 2. Shipped attributions are generated
in `public/music-credits.html` and linked from the game's settings.
