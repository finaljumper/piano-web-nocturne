/** Translate MIDI damper pedal (CC64) into the key's audible hold time. */
export function sustainedDuration(note, changes) {
  const keyUp = note.time + note.duration;
  let down = false;
  for (const change of changes) {
    if (change.time <= keyUp + 1e-9) down = change.value >= 0.5;
    else if (down && change.value < 0.5) return change.time - note.time;
    else if (!down) break;
  }
  // Without a closing pedal event, retain the notated key release rather
  // than invent an indefinite hold or extend the piece arbitrarily.
  return note.duration;
}
