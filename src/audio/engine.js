import { createImpulseResponse } from "./reverb.js";
import { Piano } from "./piano.js";

/**
 * The shipping master chain: bus -> master gain -> limiter -> soft clipper.
 *
 * The soft clipper is transparent below 0.75, so normal playing is untouched;
 * it exists only so a fortissimo cluster can never hard-clip the output.
 * Exported so the offline level measurement uses the exact same chain.
 *
 * @param {BaseAudioContext} ctx
 */
export function buildMasterBus(ctx) {
  const softClip = ctx.createWaveShaper();
  softClip.curve = softClipCurve();
  softClip.oversample = "2x";
  softClip.connect(ctx.destination);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 12;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.22;
  limiter.connect(softClip);

  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(limiter);

  return { input: master, master, limiter, softClip };
}

/** Identity below the threshold, asymptotic to 1.0 above it. */
function softClipCurve(samples = 2048, threshold = 0.75) {
  const curve = new Float32Array(samples);
  const span = 1 - threshold;
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] =
      a <= threshold
        ? x
        : Math.sign(x) * (threshold + span * Math.tanh((a - threshold) / span));
  }
  return curve;
}

/**
 * Owns the AudioContext, the master bus, the reverb send and the piano voice.
 * The AudioContext clock is the single source of truth for game time, which is
 * what keeps notes and falling gems locked together.
 */
export class AudioEngine {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: "interactive" });

    const bus = buildMasterBus(this.ctx);
    this.master = bus.master;
    this.limiter = bus.limiter;
    this.softClip = bus.softClip;

    // --- reverb ------------------------------------------------------------
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = createImpulseResponse(this.ctx, {
      seconds: 3.4,
      decay: 2.4,
      preDelay: 0.014,
      damping: 0.5,
    });

    this.reverbReturn = this.ctx.createGain();
    this.reverbReturn.gain.value = 0.5;

    // Tame the very top of the reverb tail.
    const revTone = this.ctx.createBiquadFilter();
    revTone.type = "lowpass";
    revTone.frequency.value = 5200;

    this.reverb.connect(revTone).connect(this.reverbReturn).connect(this.master);

    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(this.reverb);

    // Dry path.
    this.dry = this.ctx.createGain();
    this.dry.gain.value = 0.92;
    this.dry.connect(this.master);

    // Notes land on both buses.
    this.noteBus = this.ctx.createGain();
    this.noteBus.gain.value = 1;
    this.noteBus.connect(this.dry);
    this.noteBus.connect(this.reverbSend);

    // Slightly darker feed to the room so the tail sits behind the piano.
    this.piano = new Piano(this.ctx, this.noteBus);
  }

  /** Current AudioContext time, in seconds. */
  now() {
    return this.ctx.currentTime;
  }

  /** Must be called from a user gesture. */
  async unlock() {
    if (this.ctx.state !== "running") {
      await this.ctx.resume();
    }
  }

  get running() {
    return this.ctx.state === "running";
  }

  suspend() {
    if (this.ctx.state === "running") this.ctx.suspend();
  }

  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  /** Master volume, 0..1. */
  setVolume(v) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(clamp(v, 0, 1), t, 0.03);
  }

  /** Reverb amount, 0..1. */
  setReverb(v) {
    const t = this.ctx.currentTime;
    this.reverbReturn.gain.setTargetAtTime(clamp(v, 0, 1), t, 0.05);
  }

  panic() {
    this.piano.panic();
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
