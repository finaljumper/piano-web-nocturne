/**
 * Note-name parsing and the compact authoring DSL used by the song data.
 *
 * Token grammar
 *   E5e        note E5, an eighth note
 *   D#5q.      D sharp 5, dotted quarter
 *   Bb4s       B flat 4, sixteenth
 *   Rq         quarter rest
 *   G#3:0.3333 explicit duration in beats (quarter = 1)
 *
 * Duration letters:  w=4  h=2  q=1  e=0.5  s=0.25  t=0.125  x=0.0625
 * A trailing "." or ".." dots the value (x1.5, x1.75).
 */

const LETTER_DUR = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25, t: 0.125, x: 0.0625 };

const SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

const TOKEN_RE =
  /^([A-Ga-g])([#b]?)(-?\d+)(?::([\d.]+)|([whqestx])(\.{0,2}))?$|^(?:R|r|rest)(?::([\d.]+)|([whqestx])(\.{0,2}))?$/;

/**
 * Parse a single token into `{ midi, dur }`, or `{ midi: null, dur }` for a rest.
 * @param {string} token
 */
export function parseToken(token) {
  const m = TOKEN_RE.exec(token);
  if (!m) throw new Error(`Bad note token: "${token}"`);

  // Rest branch
  if (m[0].toLowerCase().startsWith("r")) {
    const numeric = m[6];
    const letter = m[7];
    const dots = m[8] ?? "";
    return { midi: null, dur: duration(numeric, letter, dots, token) };
  }

  const letter = m[1].toLowerCase();
  const accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  const octave = Number.parseInt(m[3], 10);
  const midi = (octave + 1) * 12 + SEMITONE[letter] + accidental;

  const dur = duration(m[4], m[5], m[6] ?? "", token);
  return { midi, dur };
}

function duration(numeric, letter, dots, token) {
  let value;
  if (numeric) value = Number.parseFloat(numeric);
  else if (letter) value = LETTER_DUR[letter.toLowerCase()];
  else value = 1; // bare note defaults to a quarter
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Bad duration in "${token}"`);
  if (dots === ".") value *= 1.5;
  else if (dots === "..") value *= 1.75;
  return value;
}

/**
 * Parse a whitespace-separated note string into `{ midi, dur }[]`.
 * @param {string} str
 */
export function parseNoteString(str) {
  return str
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseToken);
}

export const midiToName = (midi) => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
};
