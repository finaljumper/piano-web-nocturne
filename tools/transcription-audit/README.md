# Remaining MIDI transcription audit

Audit date: 2026-10-10. **None of these five performances has yet passed a
complete comparison with an authoritative score.** Playback/import checks are
separate from notation accuracy. The existing MIDI arrangements stay in place,
with only the two confirmed Lacrimosa alto corrections below.

| Piece | Comparison completed | Result / outstanding work |
| --- | --- | --- |
| Lacrimosa | All four choir parts, all 30 bars, pitches, entries and tied durations | Corrected bar 6 alto E4 (previously D4) and restored bar 9's final eighth-note A4. All 387 choir attacks now agree with the independent SATB notation, allowing the MIDI's one-tick note-off gap. The other 13 pitched tracks still need a full orchestral score comparison. |
| Ode to Joy | First eight instrumental-theme bars, cello and bass octave doubling, against Reinecke's published piano reduction | All 52 attacks match in pitch and entry, allowing 0.1 quarter for humanized timing. This verifies only the opening. The remaining arrangement, its selection of theme statements, articulation and transcription license are pending. It is not the complete Ninth Symphony finale. |
| Swan Lake | Opening melody compared with a third-party piano reduction | 32 of 34 attacks agree in pitch and entry. The reduction has F#4 where the MIDI has G4 at quarters 19 and 35. The reduction is not an authoritative edition, so this does not establish that the MIDI is wrong; no pitches were changed. The reference is only 32 bars, while the MIDI extends to about 281 quarters. Need the complete No. 10 Scene score and its transposing-part conventions. |
| Dance of the Sugar Plum Fairy | Form and register compared with a third-party piano reduction | Reference has 53 bars (106 quarters); MIDI ends at 104 quarters. Register, octave-shift notation and instrumentation also differ. These differences need the original celesta/orchestral notation to resolve; no speculative octave or bar edits were made. |
| Vocalise | MIDI structure and candidate sources inspected | No independent complete notation source obtained. The existing single piano track has 1,222 attacks and extensive sustain-pedal data. Found audio/visual projects and a project generating new melodies, which cannot certify the original voice-and-piano score or identify this arrangement. |

## Reproduce the checked passages

```sh
node tools/correct-transcriptions.mjs  # known-source, idempotent Lacrimosa patch + import
node tools/audit-transcriptions.mjs   # 439 independently compared attacks
npm run validate                     # also runs the passage audit and full MIDI/chart checks
```

The checked reference tuples are `[onset in quarters, MIDI pitch, tied length in
quarters]`. Lacrimosa's note-off tolerance is one MIDI tick, rather than a broad
rhythmic tolerance. Ode's articulation lengths are deliberately not certified:
the source MIDI uses humanized starts and detached note lengths. Its fixture
contains the manually read notation lengths for reference.

The correction script accepts the original Lacrimosa source SHA-256
`5c645cacf7e66070e0e38f926afb5b65a251ecc0bc4c5fcf03f05d46adc45991`, patches the
alto track's note-on and note-off, and inserts the missing eighth. It preserves
other notes, tempi, controllers, names and metadata. An unknown uncorrected
source is rejected. Restoring the original MIDI requires rerunning this patch.

## References and limits

- [Lacrimosa SATB notation](https://github.com/mitselek/Mozart-Requiem/blob/6023402038dc192b4a4b91ffd4250c0d248c7224/Mozart%20Requiem%20-%20SATB.mscz),
  revision `6023402038dc192b4a4b91ffd4250c0d248c7224`, repository license CC0.
  SHA-256 and extraction scope are retained in `lacrimosa-choir.json`.
  The same repository's SATB + piano file corroborates both alto differences.
  [Victor Noagbodji's Klindworth piano transcription](https://github.com/nvictor/sheets/blob/ff571289a1d8950fdd9fad1b678dc83031dc5f42/ly/lacrimosa.ly)
  also contains E4 in the disputed bar 6 harmony. These are comparison references,
  not a claim that the orchestral MIDI or its license is fully verified.
- [Beethoven/Reinecke, Breitkopf & Härtel V.A.1295, historical score scan](https://github.com/KeyboardPhilharmonic/beethoven_symphony-9_breitkopf-va1295/blob/b007aceb1d4782e511c7c6e88ef0c16037b63e1d/IMSLP51456-PMLP01607-Beethoven_9.Symphonie_Breitkopf_Reinecke.pdf),
  printed page 4, PDF page 5. Its repository's MusicXML file contains only a
  rest-filled timeline: it cannot be used to regenerate this performance.
- [Swan Lake piano reference](https://github.com/musetrainer/library/blob/9128876f6164d96997c877a2be843349a32bdabb/scores/Swan_Lake.mxl)
  and [Sugar Plum piano reference](https://github.com/musetrainer/library/blob/9128876f6164d96997c877a2be843349a32bdabb/scores/Dance_of_the_sugar_plum_fairy.mxl).
  No edition or individual transcription license could be established; these
  files were inspected but were not copied into the game or used as replacements.

The original five MIDI URLs remain listed in `../fetch-midi.mjs`. Their
transcription licenses remain unverified even where notes have been compared.

## Access needed to finish

The cloud proxy explicitly denied access to `imslp.org` (CONNECT 403). A narrow
environment network draft adding `imslp.org` and `*.imslp.org` has been saved for
review; it is not applied to the running environment. Obtain complete historical
scores before certifying the remaining parts. A download host outside that scope,
if required by the archive, must be added through environment settings as well.
Do not treat these partial checks, similar third-party MIDIs, an opening motif,
or an unproven public-domain label as a complete transcription verification.
