/**
 * A procedural piano synthesizer built on the Web Audio API.
 *
 * Design notes:
 *  - No samples are shipped; each note is additive across a small set of
 *    partials with per-partial inharmonicity and decay, which is what makes a
 *    plucked/struck string read as a piano rather than an organ.
 *  - Low notes ring far longer than high notes, so the decay time constant is
 *    derived from pitch.
 *  - A short filtered noise burst stands in for the hammer strike.
 */

const A4 = 440;
const A4_MIDI = 69;

export const midiToFreq = (midi) => A4 * Math.pow(2, (midi - A4_MIDI) / 12);

/** Partial amplitude shape (mellow by default). */
const PARTIAL_AMP = [1, 0.5, 0.3, 0.18, 0.11, 0.07, 0.045, 0.03];

export class Piano {
  /**
   * @param {BaseAudioContext} ctx
   * @param {AudioNode} destination
   * @param {object} [opts]
   */
  constructor(ctx, destination, opts = {}) {
    this.ctx = ctx;
    this.out = destination;
    this.volume = opts.volume ?? 0.8;

    // Body: gentle low shelf lift + soft top roll-off keeps it warm.
    this.body = ctx.createBiquadFilter();
    this.body.type = "lowshelf";
    this.body.frequency.value = 240;
    this.body.gain.value = 2.2;

    this.tone = ctx.createBiquadFilter();
    this.tone.type = "highshelf";
    this.tone.frequency.value = 5200;
    this.tone.gain.value = -3.5;

    this.body.connect(this.tone);
    this.tone.connect(this.out);

    // Reusable noise buffer for hammer transients.
    this._noise = this._makeNoise(0.25);

    /** @type {Set<AudioScheduledSourceNode>} */
    this._live = new Set();
  }

  _makeNoise(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /**
   * Schedule one note.
   * @param {number} midi
   * @param {number} when        absolute AudioContext time (seconds)
   * @param {number} duration    seconds the key is held
   * @param {object} [o]
   * @param {number} [o.velocity=0.62]  0..1
   * @param {number} [o.bright=0.55]    0..1 tilt toward upper partials
   */
  note(midi, when, duration, o = {}) {
    const ctx = this.ctx;
    const velocity = clamp(o.velocity ?? 0.62, 0.02, 1.4);
    const bright = clamp(o.bright ?? 0.55, 0, 1.2);

    const f0 = midiToFreq(midi);
    const nyquist = ctx.sampleRate * 0.5;

    // Partial count falls with pitch: high strings have fewer audible partials.
    let partials = PARTIAL_AMP.length;
    if (midi > 88) partials = 3;
    else if (midi > 78) partials = 4;
    else if (midi > 66) partials = 5;
    else if (midi > 55) partials = 6;

    // Inharmonicity: real strings go progressively sharper up the series.
    const B = 0.00018 + Math.max(0, (60 - midi)) * 0.000006;

    // Piano decays: bass strings ring for seconds, treble dies quickly.
    const tau0 = 5.4 * Math.exp(-(midi - 21) / 33) + 0.55;
    const attack = 0.0025 + 0.006 * Math.exp(-(midi - 36) / 22);
    const release = Math.max(duration, 0.05);
    const dampStart = when + release + 0.02;
    const endTime = dampStart + 0.5;

    // Per-note mix bus with keyboard-position stereo placement.
    const noteGain = ctx.createGain();
    noteGain.gain.value = 1;

    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp((midi - 60) / 48, -0.6, 0.6);

    // Reduce level as more partials stack so density doesn't blow up.
    // Calibrated with tools/audio-level.mjs so a dense passage peaks near 0.6
    // while the master limiter still has headroom for fortissimo clusters.
    const voiceGain = (0.32 * velocity) / Math.sqrt(partials);

    const oscs = [];

    for (let n = 1; n <= partials; n++) {
      const freq = f0 * n * Math.sqrt(1 + B * n * n);
      if (freq >= nyquist) break;

      // Velocity opens up the upper partials (harder strike = brighter).
      const tilt = Math.pow(0.42 + bright * 0.95, n - 1);
      const amp = PARTIAL_AMP[n - 1] * tilt * voiceGain;
      if (amp < 0.0004) continue;

      const osc = ctx.createOscillator();
      osc.type = n === 1 ? "triangle" : "sine";
      // A hair of detune gives the shimmer of a tri-chord unison.
      osc.frequency.value = freq;
      osc.detune.value = n === 1 ? 0 : (Math.random() * 2 - 1) * 4;

      const g = ctx.createGain();
      const tau = tau0 / (1 + 0.5 * (n - 1));
      const a = attack * (n === 1 ? 1 : 1.35);

      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(Math.min(amp, 0.9), when + a);
      g.gain.setTargetAtTime(0, when + a, tau);
      g.gain.setTargetAtTime(0, dampStart, 0.07);

      osc.connect(g).connect(noteGain);
      osc.start(when);
      osc.stop(endTime);
      this._track(osc);
      oscs.push(osc);
    }

    // Hammer transient.
    if (midi < 92) {
      const src = ctx.createBufferSource();
      src.buffer = this._noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = clamp(f0 * 4.2, 300, 7000);
      bp.Q.value = 0.9;
      const ng = ctx.createGain();
      const amt = 0.035 * velocity * (0.4 + bright);
      ng.gain.setValueAtTime(0, when);
      ng.gain.linearRampToValueAtTime(amt, when + 0.002);
      ng.gain.setTargetAtTime(0, when + 0.002, 0.016);
      src.connect(bp).connect(ng).connect(noteGain);
      src.start(when);
      src.stop(when + 0.08);
      this._track(src);
    }

    noteGain.connect(panner).connect(this.body);

    // Free the graph once the note is silent.
    const last = oscs[oscs.length - 1];
    if (last) {
      last.onended = () => {
        this._untrack(last);
        try {
          panner.disconnect();
          noteGain.disconnect();
        } catch {
          /* already gone */
        }
      };
    }
  }

  /**
   * A bright accent layer used when the player nails a note: same pitch, more
   * velocity and sparkle, so a hit is audible as emphasis without disturbing
   * the underlying performance.
   */
  accent(midi, when) {
    this.note(midi, when, 0.5, { velocity: 1.0, bright: 0.85 });
    // A quiet octave above adds a "ping" that reads as reward.
    this.note(midi + 12, when, 0.28, { velocity: 0.22, bright: 1.0 });
  }

  _track(src) {
    this._live.add(src);
    const drop = () => this._live.delete(src);
    src.addEventListener?.("ended", drop, { once: true });
  }

  _untrack(src) {
    this._live.delete(src);
  }

  /** Immediately silence everything that is scheduled or ringing. */
  panic() {
    for (const src of this._live) {
      try {
        src.stop();
      } catch {
        /* not started yet / already stopped */
      }
    }
    this._live.clear();
  }

  setVolume(v) {
    this.volume = v;
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
