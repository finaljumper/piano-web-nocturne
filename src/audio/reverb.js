/**
 * Procedural impulse responses for convolution reverb.
 * Avoids shipping audio assets while still giving the piano a room.
 */

/**
 * @param {BaseAudioContext} ctx
 * @param {object} [opts]
 * @param {number} [opts.seconds=3.2]  tail length
 * @param {number} [opts.decay=2.6]    exponential decay exponent
 * @param {number} [opts.preDelay=0.012]
 * @param {number} [opts.damping=0.42] how fast highs die relative to lows
 * @param {boolean} [opts.reverse=false]
 * @returns {AudioBuffer}
 */
export function createImpulseResponse(ctx, opts = {}) {
  const {
    seconds = 3.2,
    decay = 2.6,
    preDelay = 0.012,
    damping = 0.42,
    reverse = false,
  } = opts;

  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const preDelaySamples = Math.floor(rate * preDelay);
  const buffer = ctx.createBuffer(2, length + preDelaySamples, rate);

  // One-pole low-pass state per channel so the tail darkens as it fades,
  // which is what makes a synthetic IR read as a real room rather than hiss.
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Early reflections get a small cluster of bumps.
      const early = i < rate * 0.09
        ? (Math.random() * 2 - 1) * (1 - i / (rate * 0.09)) * 0.5
        : 0;
      const noise = Math.random() * 2 - 1;
      // Progressive damping: coefficient shrinks as the tail decays.
      const coeff = 1 - damping * t;
      lp += (noise - lp) * Math.max(0.02, coeff * 0.55);
      const env = Math.pow(1 - t, decay);
      const idx = reverse ? length - 1 - i : i;
      data[idx + preDelaySamples] = (lp + early) * env * 0.6;
    }
    // Stereo decorrelation.
    if (ch === 1) {
      // small offset by regenerating with shifted phase is expensive; a light
      // comb difference is enough to widen the image.
      for (let i = 0; i < length; i += 1) {
        const j = i + 37;
        if (j < length) data[i] = data[i] * 0.94 + data[j] * 0.06;
      }
    }
  }

  return buffer;
}
