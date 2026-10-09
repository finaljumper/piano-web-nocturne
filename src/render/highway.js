import * as THREE from "three";

import { midiToName } from "../game/notes.js";

/**
 * The note highway: a receding road of coloured lanes, a hit line, key pads and
 * the falling gems themselves.
 *
 * Gems are one InstancedMesh. Their vertical position is derived from how much
 * time is left before the note is due, so the highway always scrolls at the
 * speed implied by the current approach time.
 */

const LANE_WIDTH = 1.25;
const ROAD_NEAR = 7;
const ROAD_FAR = -74;
const ROAD_LENGTH = ROAD_NEAR - ROAD_FAR;
const ROAD_CENTER = (ROAD_NEAR + ROAD_FAR) / 2;
const TRAVEL = 44; // world units a gem covers over one approach window
const GEM_Y = 0.52;
const MAX_GEMS = 192;
// Resting opacities; update() adds press/pulse feedback on top of these.
const LANE_TINT_BASE = 0.42;
const HIT_GLOW_BASE = 0.34;

export class Highway {
  /** @param {import('./scene.js').View} view */
  constructor(view) {
    this.view = view;
    this.group = new THREE.Group();
    view.scene.add(this.group);

    this.laneCount = 0;
    this.palette = [];
    this.laneSpan = 0;
    this.approach = 2;
    this.notes = [];
    this._lo = 0;
    this._hi = 0;

    this._pressed = [];
    this._pulse = [];
    this._buildGemPool();
    this._buildEffects();
  }

  /* ---------------------------------------------------------------------- */
  /* construction                                                           */
  /* ---------------------------------------------------------------------- */

  _buildGemPool() {
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.setAttribute("position", plane.attributes.position);
    geo.setAttribute("uv", plane.attributes.uv);

    const colors = new Float32Array(MAX_GEMS * 3);
    const alphas = new Float32Array(MAX_GEMS);
    const atlas = new Float32Array(MAX_GEMS);
    geo.setAttribute("aColor", new THREE.InstancedBufferAttribute(colors, 3));
    geo.setAttribute("aAlpha", new THREE.InstancedBufferAttribute(alphas, 1));
    geo.setAttribute("aAtlas", new THREE.InstancedBufferAttribute(atlas, 1));

    this._gemColors = colors;
    this._gemAlphas = alphas;
    this._gemAtlas = atlas;
    this.noteAtlas = makeNoteAtlas();

    this.gemMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: 0.5 },
        uAtlas: { value: this.noteAtlas },
        uLabels: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aAlpha;
        attribute float aAtlas;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vAtlas;
        void main() {
          vUv = uv;
          vColor = aColor;
          vAlpha = aAlpha;
          vAtlas = aAtlas;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vAtlas;
        uniform float uAspect;
        uniform float uTime;
        uniform sampler2D uAtlas;
        uniform float uLabels;

        // Signed distance to a rounded rectangle in normalised uv space.
        float roundRect(vec2 p, vec2 halfSize, float radius) {
          vec2 q = abs(p) - halfSize + radius;
          return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
        }

        void main() {
          vec2 p = vUv - 0.5;
          vec2 hs = vec2(0.5, 0.5);
          float r = 0.26;
          float d = roundRect(p, hs, r);

          float fill = smoothstep(0.012, -0.012, d);
          float halo = smoothstep(0.17, 0.0, d) * 0.32;
          if (fill <= 0.001 && halo <= 0.001) discard;

          // Bright rim, slightly hotter at the leading (top) edge.
          float rim = smoothstep(0.09, 0.0, abs(d + 0.045)) * 0.9;
          float lead = smoothstep(0.5, 0.05, vUv.y) * 0.35;

          // A soft vertical sheen through the middle of the gem.
          float sheen = smoothstep(0.42, 0.5, vUv.y) * smoothstep(0.58, 0.5, vUv.y);

          vec3 col = vColor * (1.05 + lead + sheen * 0.6) + vec3(rim) * 0.85;

          // Optional note letters, sampled from a 16x8 atlas of every MIDI name.
          if (uLabels > 0.5) {
            float cell = vAtlas;
            float cx = mod(cell, 16.0);
            float cy = floor(cell / 16.0);
            vec2 auv = vec2((cx + vUv.x) / 16.0, 1.0 - (cy + 1.0 - vUv.y) / 8.0);
            float inLetter = step(0.1, vUv.x) * step(vUv.x, 0.9) * step(0.16, vUv.y) * step(vUv.y, 0.86);
            float glyph = texture2D(uAtlas, auv).a * inLetter;
            col *= 1.0 - glyph * 0.4;
            col += vec3(1.0) * glyph * 0.85;
          }

          float alpha = (fill * (0.92 + rim * 0.4) + halo) * vAlpha;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    this.gems = new THREE.InstancedMesh(geo, this.gemMaterial, MAX_GEMS);
    this.gems.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gems.count = 0;
    this.gems.frustumCulled = false;
    this.gems.renderOrder = 5;
    this.group.add(this.gems);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  _buildEffects() {
    // Hit rings and lane pads are built per-chart; these are the shared probes.
    this._probes = new THREE.Group();
    this.group.add(this._probes);
  }

  /**
   * (Re)build the highway for a chart.
   * @param {ReturnType<import('../game/chart.js').buildChart>} chart
   */
  build(chart) {
    this.disposeChildren();

    this.laneCount = chart.laneCount;
    this.palette = chart.palette;
    // Palette entries are "#rrggbb" strings; the gem shader needs channels.
    this._paletteRGB = chart.palette.map((hex) => {
      const n = Number.parseInt(hex.slice(1), 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    });
    this.laneSpan = chart.laneCount * LANE_WIDTH;
    this.notes = chart.notes;
    this.approach = chart.difficulty.approach;
    this._lo = 0;
    this._hi = 0;
    this._pressed = new Array(this.laneCount).fill(0);
    this._pulse = new Array(this.laneCount).fill(0);
    this.gems.count = 0;

    const half = this.laneSpan / 2;

    // --- road -------------------------------------------------------------
    const roadMat = new THREE.MeshBasicMaterial({
      color: 0x0e1220,
      map: rampTexture([
        [0.0, "rgba(255,255,255,0.85)"],
        [0.06, "rgba(255,255,255,1)"],
        [0.45, "rgba(255,255,255,0.5)"],
        [1.0, "rgba(255,255,255,0.12)"],
      ]),
      transparent: true,
      depthWrite: true,
    });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(this.laneSpan + 1.6, ROAD_LENGTH), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, ROAD_CENTER);
    road.renderOrder = 0;
    this.group.add(road);

    // --- lane tints -------------------------------------------------------
    this.laneStrips = [];
    const tintMap = rampTexture([
      [0.0, "rgba(255,255,255,0.34)"],
      [0.055, "rgba(255,255,255,1)"],
      [0.45, "rgba(255,255,255,0.56)"],
      [1.0, "rgba(255,255,255,0.12)"],
    ]);
    for (let i = 0; i < this.laneCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(this.palette[i]),
        map: tintMap,
        transparent: true,
        opacity: LANE_TINT_BASE,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(LANE_WIDTH * 0.88, ROAD_LENGTH), mat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(this.laneX(i), 0.02, ROAD_CENTER);
      strip.renderOrder = 1;
      this.group.add(strip);
      this.laneStrips.push(strip);
    }

    // --- dividers ---------------------------------------------------------
    const divMap = rampTexture([
      [0.0, "rgba(255,255,255,0.1)"],
      [0.07, "rgba(255,255,255,0.85)"],
      [0.5, "rgba(255,255,255,0.3)"],
      [1.0, "rgba(255,255,255,0.04)"],
    ]);
    for (let i = 0; i <= this.laneCount; i++) {
      const x = -half + i * LANE_WIDTH;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xdfe8ff,
        map: divMap,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.035, ROAD_LENGTH), mat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.03, ROAD_CENTER);
      line.renderOrder = 2;
      this.group.add(line);
    }

    // --- hit line ---------------------------------------------------------
    const hitMat = new THREE.MeshBasicMaterial({
      color: 0xfff3d6,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const hitLine = new THREE.Mesh(new THREE.PlaneGeometry(this.laneSpan + 0.8, 0.075), hitMat);
    hitLine.rotation.x = -Math.PI / 2;
    hitLine.position.set(0, 0.05, 0);
    hitLine.renderOrder = 3;
    this.group.add(hitLine);
    this.hitLine = hitLine;

    const glowMat = new THREE.MeshBasicMaterial({
      map: radialTexture("rgba(233,196,106,0.55)", "rgba(233,196,106,0)"),
      transparent: true,
      opacity: HIT_GLOW_BASE,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const hitGlow = new THREE.Mesh(new THREE.PlaneGeometry(this.laneSpan + 2.2, 1.8), glowMat);
    hitGlow.rotation.x = -Math.PI / 2;
    hitGlow.position.set(0, 0.035, 0.1);
    hitGlow.renderOrder = 2;
    this.group.add(hitGlow);
    this.hitGlow = hitGlow;

    // --- lane targets + key pads -----------------------------------------
    this.rings = [];
    this.pads = [];
    for (let i = 0; i < this.laneCount; i++) {
      const color = new THREE.Color(this.palette[i]);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(LANE_WIDTH * 0.3, LANE_WIDTH * 0.4, 40),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(this.laneX(i), 0.06, 0);
      ring.renderOrder = 4;
      this.group.add(ring);
      this.rings.push(ring);

      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(LANE_WIDTH * 0.8, 1.0),
        padMaterial(color),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(this.laneX(i), 0.07, 2.4);
      pad.renderOrder = 4;
      this.group.add(pad);
      this.pads.push(pad);
    }

    this.view.frameHighway(this.laneSpan);
  }

  /* ---------------------------------------------------------------------- */
  /* runtime                                                                */
  /* ---------------------------------------------------------------------- */

  laneX(i) {
    return (i - (this.laneCount - 1) / 2) * LANE_WIDTH;
  }

  /** World position of the hit point for a lane. */
  hitPosition(lane, out = new THREE.Vector3()) {
    return out.set(this.laneX(lane), GEM_Y, 0);
  }

  /** Time the gem takes to travel from spawn to the hit line. */
  setApproach(seconds) {
    this.approach = seconds;
  }

  /** Show the note name inside each gem (a learning aid). */
  setNoteLabels(on) {
    this.gemMaterial.uniforms.uLabels.value = on ? 1 : 0;
  }

  pressLane(lane, down) {
    if (lane < 0 || lane >= this.laneCount) return;
    this._pressed[lane] = down ? 1 : Math.max(0, this._pressed[lane] * 0.4);
  }

  /** Visual reaction when a note is judged on this lane. */
  punchLane(lane, strength = 1) {
    if (lane < 0 || lane >= this.laneCount) return;
    this._pulse[lane] = Math.min(1.4, this._pulse[lane] + strength);
  }

  /**
   * @param {number} songTime
   * @param {number} dt
   */
  update(songTime, dt) {
    const notes = this.notes;
    const approach = this.approach;
    const gemW = LANE_WIDTH * 0.76;
    const gemH = gemW * 0.46;

    // Widen the visible window, then advance the low pointer past dead notes.
    while (this._lo < notes.length && notes[this._lo].time < songTime - 0.6) this._lo++;
    let hi = Math.max(this._hi, this._lo);
    while (hi < notes.length && notes[hi].time < songTime + approach * 1.02) hi++;
    this._hi = hi;

    let count = 0;
    const m = this._m;
    const q = this._q;
    const s = this._s;
    const p = this._p;
    for (let i = this._lo; i < hi && count < MAX_GEMS; i++) {
      const note = notes[i];
      const lead = note.time - songTime;
      if (lead > approach || lead < -0.32) continue;

      const z = -(TRAVEL * lead) / approach;
      p.set(this.laneX(note.lane), GEM_Y, z);
      s.set(gemW, gemH, 1);
      m.compose(p, q, s);
      this.gems.setMatrixAt(count, m);

      const rgb = this._paletteRGB[note.lane];
      this._gemColors[count * 3 + 0] = rgb[0];
      this._gemColors[count * 3 + 1] = rgb[1];
      this._gemColors[count * 3 + 2] = rgb[2];

      // Fade in at the horizon so gems don't pop into existence.
      const fadeIn = Math.min(1, (approach - lead) / 0.35);
      const pass = lead < 0 ? Math.max(0, 1 + lead / 0.32) : 1;
      this._gemAlphas[count] = Math.max(0, fadeIn * pass);
      this._gemAtlas[count] = note.midi;
      count++;
    }

    this.gems.count = count;
    this.gems.instanceMatrix.needsUpdate = true;
    this.gems.geometry.attributes.aColor.needsUpdate = true;
    this.gems.geometry.attributes.aAlpha.needsUpdate = true;
    this.gems.geometry.attributes.aAtlas.needsUpdate = true;
    this.gemMaterial.uniforms.uTime.value += dt;

    // Lane feedback.
    for (let i = 0; i < this.laneCount; i++) {
      const press = this._pressed[i];
      this._pressed[i] = Math.max(0, press - dt * 6);

      const pulse = this._pulse[i];
      if (pulse > 0) this._pulse[i] = Math.max(0, pulse - dt * 3.4);

      const strip = this.laneStrips[i];
      if (strip) strip.material.opacity = LANE_TINT_BASE + press * 0.4 + pulse * 0.45;

      const ring = this.rings[i];
      if (ring) {
        const k = 1 + pulse * 0.5 + press * 0.18;
        ring.scale.setScalar(k);
        ring.material.opacity = 0.4 + press * 0.5 + pulse * 0.55;
      }

      const pad = this.pads[i];
      if (pad) {
        pad.material.uniforms.uPress.value = press;
        pad.material.uniforms.uPulse.value = pulse;
      }
    }

    if (this.hitGlow) {
      this.hitGlow.material.opacity =
        HIT_GLOW_BASE + Math.sin(performance.now() * 0.0016) * 0.05;
    }
  }

  /* ---------------------------------------------------------------------- */

  disposeChildren() {
    const keep = new Set([this.gems, this._probes]);
    for (const child of [...this.group.children]) {
      if (keep.has(child) || child === this.gems) continue;
      this.group.remove(child);
      disposeTree(child);
    }
    this.laneStrips = [];
    this.rings = [];
    this.pads = [];
  }

  dispose() {
    this.disposeChildren();
    this.gems.geometry.dispose();
    this.gemMaterial.dispose();
    this.noteAtlas?.dispose?.();
    this.view.scene.remove(this.group);
  }
}

/* ------------------------------------------------------------------------- */
/* helpers                                                                    */
/* ------------------------------------------------------------------------- */

/** Flat, additive key pad that reacts to presses and hits. */
function padMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: color.clone() },
      uPress: { value: 0 },
      uPulse: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uPress;
      uniform float uPulse;
      void main() {
        vec2 p = abs(vUv - 0.5) * 2.0;
        float inside = 1.0 - smoothstep(0.86, 1.0, max(p.x, p.y));
        float edge = smoothstep(0.72, 1.0, max(p.x, p.y)) * inside;
        float body = inside * (0.16 + uPress * 0.55 + uPulse * 0.5);
        vec3 col = uColor * (0.9 + uPress * 0.7 + uPulse);
        col += vec3(1.0) * edge * (0.25 + uPress * 0.6 + uPulse * 0.7);
        gl_FragColor = vec4(col, body + edge * 0.7);
      }
    `,
  });
}

/**
 * A 16x8 atlas holding every MIDI note name, drawn once so gems can show the
 * letter of the note they represent without any per-note texture work.
 */
function makeNoteAtlas() {
  const CELL_W = 64;
  const CELL_H = 40;
  const cols = 16;
  const rows = 8;
  const c = document.createElement("canvas");
  c.width = cols * CELL_W;
  c.height = rows * CELL_H;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 24px ui-monospace, Menlo, monospace";

  for (let midi = 0; midi < cols * rows; midi++) {
    const col = midi % cols;
    const row = Math.floor(midi / cols);
    ctx.fillText(
      midiToName(midi),
      col * CELL_W + CELL_W / 2,
      row * CELL_H + CELL_H / 2,
    );
  }

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  return tex;
}

/** A 1px-wide vertical alpha ramp. */
function rampTexture(stops) {
  const h = 256;
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = h;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [pos, color] of stops) g.addColorStop(pos, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, h);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** A radial glow sprite. */
function radialTexture(inner, outer) {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function disposeTree(obj) {
  // material.dispose() does not free its textures, so release maps explicitly;
  // otherwise every song start leaks the ramp and glow textures on the GPU.
  const disposeMaterial = (m) => {
    m?.map?.dispose?.();
    m?.dispose?.();
  };
  obj.traverse?.((node) => {
    node.geometry?.dispose?.();
    const mat = node.material;
    if (Array.isArray(mat)) mat.forEach(disposeMaterial);
    else disposeMaterial(mat);
  });
}
