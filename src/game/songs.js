/**
 * The repertoire.
 *
 * Every piece here is a public-domain composition. The note data is a compact
 * arrangement for the game rather than a scholarly urtext: the melodies,
 * harmonies and textures are preserved, inner voices are thinned where a
 * second simultaneous line would be unreadable on a lane highway.
 *
 * Authoring format
 *   tracks: [{ hand: 'L' | 'R', notes: <string | () => {midi,dur}[]> }]
 *   `hand` decides which half of the highway a note travels down, which is
 *   why left-hand bass reads as left lanes and melody as right lanes.
 */

import { parseNoteString } from "./notes.js";

const rep = (str, n) => Array.from({ length: n }, () => str).join(" ");

/* ------------------------------------------------------------------------ */
/*  Ludwig van Beethoven — Für Elise (WoO 59), A minor                      */
/* ------------------------------------------------------------------------ */

const FE_RH = [
  "E5e D#5e E5e D#5e E5e B4e",
  "D5e C5e A4q Rq",
  "C4e E4e A4e B4e Rq",
  "E4e G#4e B4e C5e Rq",
  "E4e E5e D#5e E5e D#5e E5e",
  "D5e C5e A4q Rq",
  "C4e E4e A4e B4e Rq",
  "E4e C5e B4q Rq",
].join(" ");

const FE_LH = [
  "A2q E3e A3e Rq",
  "A2q E3e A3e Rq",
  "A2q E3e A3e Rq",
  "E2q E3e G#3e Rq",
  "A2q E3e A3e Rq",
  "A2q E3e A3e Rq",
  "A2q E3e A3e Rq",
  "A2q E3e A3e Rq",
].join(" ");

/* ------------------------------------------------------------------------ */
/*  Ludwig van Beethoven — Ode to Joy (Symphony No. 9 theme), C major       */
/* ------------------------------------------------------------------------ */

const ODE_RH = [
  "E4q E4q F4q G4q",
  "G4q F4q E4q D4q",
  "C4q C4q D4q E4q",
  "E4q. D4e D4h",
  "E4q E4q F4q G4q",
  "G4q F4q E4q D4q",
  "C4q C4q D4q E4q",
  "D4q. C4e C4h",
].join(" ");

const ODE_LH = [
  "C3h G3h",
  "G2h D4q G3q",
  "C3h G3h",
  "G2h G3h",
  "C3h G3h",
  "G2h D4q G3q",
  "C3h E3q G3q",
  "C3h G2h",
].join(" ");

/* ------------------------------------------------------------------------ */
/*  Christian Petzold (attrib. Bach) — Minuet in G (BWV Anh. 114), G major  */
/* ------------------------------------------------------------------------ */

const MIN_RH = [
  "D5q G4e A4e B4e C5e",
  "D5q G4q G4q",
  "E5q C5e D5e E5e F#5e",
  "G5q G4q G4q",
  "C5q D5e C5e B4e A4e",
  "B4q C5e B4e A4e G4e",
  "F#4q G4e A4e B4e G4e",
  "A4h.",
  // second half
  "D5q G4e A4e B4e C5e",
  "D5q G4q G4q",
  "E5q C5e D5e E5e F#5e",
  "G5q G4q G4q",
  "C5q D5e C5e B4e A4e",
  "B4q C5e B4e A4e G4e",
  "A4q B4e A4e G4e F#4e",
  "G4h.",
].join(" ");

const MIN_LH = [
  "G2h D3q",
  "G2h B3q",
  "C3h E3q",
  "G2h D3q",
  "C3h E3q",
  "G2h D4q",
  "D3h F#3q",
  "G2h D3q",
  "G2h D3q",
  "G2h B3q",
  "C3h E3q",
  "G2h D3q",
  "C3h E3q",
  "G2h D4q",
  "D3h F#3q",
  "G2h D3q",
].join(" ");

/* ------------------------------------------------------------------------ */
/*  Johann Pachelbel — Canon in D, D major                                  */
/* ------------------------------------------------------------------------ */

const CANON_A = [
  "F#5q E5q D5q C#5q",
  "B4q A4q B4q C#5q",
  "D5q C#5q B4q A4q",
  "G4q F#4q G4q E4q",
].join(" ");

const CANON_B = [
  "D5q E5q F#5q D5q",
  "A4q B4q C#5q A4q",
  "B4q C#5q D5q E5q",
  "F#5q D5q F#5q E5q",
].join(" ");

// The ground bass that the whole piece is built on.
const CANON_BASS = "D3w A2w B2w F#2w G2w D3w G2w A2w";

/* ------------------------------------------------------------------------ */
/*  Erik Satie — Gymnopédie No. 1, D major (modal)                          */
/* ------------------------------------------------------------------------ */

function gymnopedieLeftHand() {
  const bars = [
    "G2q D4e F#4e Rq",
    "D3q A3e F#4e Rq",
    "G2q D4e F#4e Rq",
    "D3q A3e F#4e Rq",
    "G2q D4e F#4e Rq",
    "D3q A3e F#4e Rq",
    "G2q D4e F#4e Rq",
    "D3q A3e F#4e Rq",
    "G2q D4e F#4e Rq",
    "D3q A3e F#4e Rq",
    "G2q D4e F#4e Rq",
    "D3q A3e F#4e Rq",
  ];
  return parseNoteString(bars.join(" "));
}

function gymnopedieMelody() {
  // Two silent bars, then a slow modal line floats over the waltz.
  const bars = [
    "Rh Rq",
    "Rh Rq",
    "Rq F#5h",
    "E5h D5q",
    "Rq B4h",
    "A4h B4q",
    "Rq D5h",
    "C#5h B4q",
    "A4h G4q",
    "F#4h E4q",
    "D4h E4q",
    "F#4h.",
  ];
  return parseNoteString(bars.join(" "));
}

/* ------------------------------------------------------------------------ */
/*  Beethoven — Moonlight Sonata, Mvt. I (opening), C# minor                */
/* ------------------------------------------------------------------------ */

function moonlight() {
  // The right hand is a continuous triplet arpeggio; the left hand holds a
  // slow bass. This is the texture that defines the movement.
  const chords = [
    ["G#3", "C#4", "E4"],
    ["G#3", "C#4", "E4"],
    ["A3", "C#4", "E4"],
    ["A3", "C#4", "E4"],
    ["G#3", "C#4", "E4"],
    ["G#3", "C#4", "E4"],
    ["F#3", "A3", "C#4"],
    ["G#3", "C4", "F#4"],
  ];
  const out = [];
  const third = 1 / 3;
  for (const chord of chords) {
    // Every beat repeats the same rising triplet (low, middle, high), exactly
    // as Beethoven writes it; rotating the order would lose the figure.
    for (let beat = 0; beat < 4; beat++) {
      for (const note of chord) out.push({ name: note, dur: third });
    }
  }
  return out.map(({ name, dur }) => {
    const [midi] = parseNoteString(`${name}q`);
    return { midi: midi.midi, dur };
  });
}

function moonlightBass() {
  const bass = ["C#2", "C#2", "A1", "A1", "C#2", "C#2", "F#2", "G#2"];
  return bass.map((name) => ({ midi: parseNoteString(`${name}q`)[0].midi, dur: 4 }));
}

/* ------------------------------------------------------------------------ */
/*  J.S. Bach — Prelude in C (BWV 846), an arrangement of the opening       */
/* ------------------------------------------------------------------------ */

function preludeInC() {
  // Each two-beat group is a broken chord. Chord tones are [bass, 3rd, 5th, 8ve].
  const chords = [
    ["C4", "E4", "G4", "C5"],
    ["C4", "D4", "F4", "A4"],
    ["B3", "D4", "F4", "G4"],
    ["C4", "E4", "G4", "C5"],
    ["A3", "C4", "E4", "G4"],
    ["D3", "F#3", "A3", "C4"],
    ["G3", "B3", "D4", "G4"],
    ["C4", "E4", "G4", "C5"],
    ["A3", "C4", "E4", "G4"],
    ["D3", "F#3", "A3", "C4"],
    ["G3", "B3", "D4", "F4"],
    ["C4", "E4", "G4", "C5"],
    ["F3", "A3", "C4", "F4"],
    ["G3", "C4", "E4", "G4"],
    ["D3", "F3", "A3", "C4"],
    ["G3", "B3", "D4", "F4"],
  ];
  const toMidi = (name) => parseNoteString(`${name}q`)[0].midi;
  const shape = [0, 1, 2, 3, 2, 1, 2, 3]; // rise and fall within the chord
  const out = [];
  for (const chord of chords) {
    // Eight sixteenths per group: two beats of broken chord.
    for (const idx of shape) out.push({ midi: toMidi(chord[idx]), dur: 0.25 });
  }
  return out;
}

/* ------------------------------------------------------------------------ */

export const SONGS = [
  {
    id: "fur-elise",
    title: "Für Elise",
    composer: "Ludwig van Beethoven",
    era: "Classical",
    year: 1810,
    accent: "#e9c46a",
    bpm: 76,
    beatsPerBar: 3,
    tracks: [
      { hand: "L", notes: rep(FE_LH, 2) },
      { hand: "R", notes: rep(FE_RH, 2) },
    ],
    blurb: "The bagatelle everyone learns first — and never plays quite like this.",
  },
  {
    id: "moonlight",
    title: "Moonlight Sonata",
    composer: "Ludwig van Beethoven",
    era: "Classical",
    year: 1801,
    accent: "#7f8ce0",
    bpm: 54,
    beatsPerBar: 4,
    blurb: "The opening Adagio: a single unbroken triplet arpeggio under a held bass.",
    tracks: [
      { hand: "L", notes: moonlightBass },
      { hand: "R", notes: moonlight },
    ],
  },
  {
    id: "ode-to-joy",
    title: "Ode to Joy",
    composer: "Ludwig van Beethoven",
    era: "Classical",
    year: 1824,
    accent: "#e97a9b",
    bpm: 112,
    beatsPerBar: 4,
    blurb: "The Ninth's hymn, reduced to its plain and perfect tune.",
    tracks: [
      { hand: "L", notes: ODE_LH },
      { hand: "R", notes: ODE_RH },
    ],
  },
  {
    id: "minuet-in-g",
    title: "Minuet in G",
    composer: "Christian Petzold",
    era: "Baroque",
    year: 1725,
    accent: "#9ed36a",
    bpm: 120,
    beatsPerBar: 3,
    blurb: "From the Notebook for Anna Magdalena Bach — a dance that never ages.",
    tracks: [
      { hand: "L", notes: MIN_LH },
      { hand: "R", notes: MIN_RH },
    ],
  },
  {
    id: "canon-in-d",
    title: "Canon in D",
    composer: "Johann Pachelbel",
    era: "Baroque",
    year: 1680,
    accent: "#5fd0b0",
    bpm: 100,
    beatsPerBar: 4,
    blurb: "Eight bars of ground bass, and a melody that keeps climbing over it.",
    tracks: [
      { hand: "L", notes: rep(CANON_BASS, 2) },
      { hand: "R", notes: `${CANON_A} ${CANON_B} ${CANON_A} ${CANON_B}` },
    ],
  },
  {
    id: "prelude-in-c",
    title: "Prelude in C",
    composer: "Johann Sebastian Bach",
    era: "Baroque",
    year: 1722,
    accent: "#4fb3d9",
    bpm: 62,
    beatsPerBar: 4,
    blurb: "The first prelude of The Well-Tempered Clavier — harmony as clockwork.",
    tracks: [{ hand: "R", notes: preludeInC }],
  },
  {
    id: "gymnopedie-1",
    title: "Gymnopédie No. 1",
    composer: "Erik Satie",
    era: "Neo-classical",
    year: 1888,
    accent: "#b07fe0",
    bpm: 66,
    beatsPerBar: 3,
    blurb: "Three beats that hardly move, and a melody that floats above them.",
    tracks: [
      { hand: "L", notes: gymnopedieLeftHand },
      { hand: "R", notes: gymnopedieMelody },
    ],
  },
];

export const SONG_BY_ID = Object.fromEntries(SONGS.map((s) => [s.id, s]));
