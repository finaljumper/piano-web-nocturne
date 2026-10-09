/**
 * The repertoire.
 *
 * Every piece here is a public-domain composition. Full-length note data
 * comes from MIDI conversions stored in ./data/*.json, produced with
 * tools/import-midi.mjs from sources in tools/midi/ (see tools/fetch-midi.mjs).
 * The difficulty layer in chart.js thins the texture per difficulty so the
 * tune stays intact at every lane count.
 *
 * Authoring format
 *   tracks: [{ hand: 'L' | 'R', notes: <string | () => {midi,dur}[]> }]
 *   `hand` decides which half of the highway a note travels down, which is
 *   why left-hand bass reads as left lanes and melody as right lanes.
 */

import furElise from "./data/fur-elise.js";
import moonlight from "./data/moonlight.js";
import odeToJoy from "./data/ode-to-joy.js";
import minuetInG from "./data/minuet-in-g.js";
import canonInD from "./data/canon-in-d.js";
import preludeInC from "./data/prelude-in-c.js";
import gymnopedie1 from "./data/gymnopedie-1.js";
import rondoAllaTurca from "./data/rondo-alla-turca.js";
import nocturneOp9No2 from "./data/nocturne-op9-no2.js";
import preludeOp28No4 from "./data/prelude-op28-no4.js";
import fantaisieImpromptu from "./data/fantaisie-impromptu.js";
import preludeOp3No2 from "./data/prelude-op3-no2.js";
import lacrimosa from "./data/lacrimosa.js";
import vocalise from "./data/vocalise.js";
import swanLake from "./data/swan-lake.js";
import sugarPlumFairy from "./data/sugar-plum-fairy.js";
import pathetique2 from "./data/pathetique-2.js";

export const SONGS = [
  {
    id: "fur-elise",
    title: "Für Elise",
    composer: "Ludwig van Beethoven",
    era: "Classical",
    year: 1810,
    accent: "#e9c46a",
    bpm: 72,
    beatsPerBar: 3,
    tracks: furElise.tracks,
    blurb: "The bagatelle everyone learns first — and never plays quite like this.",
  },
  {
    id: "moonlight",
    title: "Moonlight Sonata",
    composer: "Ludwig van Beethoven",
    era: "Classical",
    year: 1801,
    accent: "#7f8ce0",
    bpm: 60,
    beatsPerBar: 2,
    blurb: "The Adagio: a single unbroken triplet arpeggio under a held bass.",
    tracks: moonlight.tracks,
  },
  {
    id: "ode-to-joy",
    title: "Ode to Joy",
    composer: "Ludwig van Beethoven",
    era: "Classical",
    year: 1824,
    accent: "#e97a9b",
    bpm: 160,
    beatsPerBar: 4,
    blurb: "The Ninth's hymn, from its first plain statement to the full finale.",
    tracks: odeToJoy.tracks,
  },
  {
    id: "minuet-in-g",
    title: "Minuet in G",
    composer: "Christian Petzold",
    era: "Baroque",
    year: 1725,
    accent: "#9ed36a",
    bpm: 140,
    beatsPerBar: 3,
    blurb: "From the Notebook for Anna Magdalena Bach — a dance that never ages.",
    tracks: minuetInG.tracks,
  },
  {
    id: "canon-in-d",
    title: "Canon in D",
    composer: "Johann Pachelbel",
    era: "Baroque",
    year: 1680,
    accent: "#5fd0b0",
    bpm: 60,
    beatsPerBar: 4,
    blurb: "Eight bars of ground bass, and a melody that keeps climbing over it.",
    tracks: canonInD.tracks,
  },
  {
    id: "prelude-in-c",
    title: "Prelude in C",
    composer: "Johann Sebastian Bach",
    era: "Baroque",
    year: 1722,
    accent: "#4fb3d9",
    bpm: 60,
    beatsPerBar: 4,
    blurb: "The first prelude of The Well-Tempered Clavier — harmony as clockwork.",
    tracks: preludeInC.tracks,
  },
  {
    id: "gymnopedie-1",
    title: "Gymnopédie No. 1",
    composer: "Erik Satie",
    era: "Neo-classical",
    year: 1888,
    accent: "#b07fe0",
    bpm: 60,
    beatsPerBar: 3,
    blurb: "Three beats that hardly move, and a melody that floats above them.",
    tracks: gymnopedie1.tracks,
  },
  {
    id: "pathetique-2",
    title: "Pathétique: Adagio cantabile",
    composer: "Ludwig van Beethoven",
    era: "Classical",
    year: 1798,
    accent: "#5f8fd0",
    bpm: 36,
    beatsPerBar: 2,
    blurb: "The sonata's second movement — the melody every heart hums.",
    tracks: pathetique2.tracks,
  },
  {
    id: "rondo-alla-turca",
    title: "Rondo alla Turca",
    composer: "Wolfgang Amadeus Mozart",
    era: "Classical",
    year: 1783,
    accent: "#e0a94f",
    bpm: 60,
    beatsPerBar: 2,
    blurb: "The Turkish March from the A major sonata — Mozart at his most gleeful.",
    tracks: rondoAllaTurca.tracks,
  },
  {
    id: "lacrimosa",
    title: "Lacrimosa",
    composer: "Wolfgang Amadeus Mozart",
    era: "Classical",
    year: 1791,
    accent: "#8a8fd0",
    bpm: 65,
    beatsPerBar: 12,
    blurb: "The Requiem's tearful 12/8 — left unfinished at Mozart's death.",
    tracks: lacrimosa.tracks,
  },
  {
    id: "nocturne-op9-no2",
    title: "Nocturne in E♭, Op. 9 No. 2",
    composer: "Frédéric Chopin",
    era: "Romantic",
    year: 1832,
    accent: "#d07fb0",
    bpm: 66,
    beatsPerBar: 12,
    blurb: "Chopin's best-loved nocturne: a singing line over rocking eighths.",
    tracks: nocturneOp9No2.tracks,
  },
  {
    id: "prelude-op28-no4",
    title: "Prelude in E minor, Op. 28 No. 4",
    composer: "Frédéric Chopin",
    era: "Romantic",
    year: 1838,
    accent: "#7ba3d9",
    bpm: 56,
    beatsPerBar: 2,
    blurb: "Two pages of sighing — the suffocation prelude Chopin asked at his funeral.",
    tracks: preludeOp28No4.tracks,
  },
  {
    id: "fantaisie-impromptu",
    title: "Fantaisie-Impromptu, Op. 66",
    composer: "Frédéric Chopin",
    era: "Romantic",
    year: 1834,
    accent: "#d98f5f",
    bpm: 168,
    beatsPerBar: 4,
    blurb: "Torrents of sixteenths against a trio of triplets — published posthumously.",
    tracks: fantaisieImpromptu.tracks,
  },
  {
    id: "prelude-op3-no2",
    title: "Prelude in C♯ minor, Op. 3 No. 2",
    composer: "Sergei Rachmaninoff",
    era: "Romantic",
    year: 1892,
    accent: "#9b6fd9",
    bpm: 60,
    beatsPerBar: 4,
    blurb: "The Moscow prelude — funeral bells, and a climax that fills the hall.",
    tracks: preludeOp3No2.tracks,
  },
  {
    id: "vocalise",
    title: "Vocalise, Op. 34 No. 14",
    composer: "Sergei Rachmaninoff",
    era: "Romantic",
    year:  1915,
    accent: "#c98ab8",
    bpm: 92,
    beatsPerBar: 4,
    blurb: "A song without words — Rachmaninoff's most tender melody, sung by the keys.",
    tracks: vocalise.tracks,
  },
  {
    id: "swan-lake",
    title: "Swan Lake Theme",
    composer: "Pyotr Ilyich Tchaikovsky",
    era: "Romantic",
    year: 1876,
    accent: "#6fb8d9",
    bpm: 80,
    beatsPerBar: 4,
    blurb: "The lake at midnight — the most famous swan song ever written for a ballet.",
    tracks: swanLake.tracks,
  },
  {
    id: "sugar-plum-fairy",
    title: "Dance of the Sugar Plum Fairy",
    composer: "Pyotr Ilyich Tchaikovsky",
    era: "Romantic",
    year: 1892,
    accent: "#e0b0d0",
    bpm: 62,
    beatsPerBar: 2,
    blurb: "Celesta sparkle from the Nutcracker — a dance of tiny, chiming steps.",
    tracks: sugarPlumFairy.tracks,
  },
];

export const SONG_BY_ID = Object.fromEntries(SONGS.map((s) => [s.id, s]));
