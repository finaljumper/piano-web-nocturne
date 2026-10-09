import * as THREE from "three";

/**
 * Hit sparkles, expanding rings and miss flashes.
 *
 * Everything is pooled: no allocation happens while the song is running.
 */

const MAX_PARTICLES = 700;
const MAX_RINGS = 14;

export class Effects {
  /**
   * @param {import('./scene.js').View} view
   * @param {import('./highway.js').Highway} highway
   */
  constructor(view, highway) {
    this.view = view;
    this.highway = highway;
    this.group = new THREE.Group();
    view.scene.add(this.group);
    this.enabled = true;

    this._buildParticles();
    this._buildRings();
    this._buildFlashes();

    this._v = new THREE.Vector3();
  }

  _buildParticles() {
    const pos = new Float32Array(MAX_PARTICLES * 3);
    const col = new Float32Array(MAX_PARTICLES * 3);
    const alpha = new Float32Array(MAX_PARTICLES);
    const size = new Float32Array(MAX_PARTICLES);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    // Park everything far away until it is used.
    for (let i = 0; i < MAX_PARTICLES; i++) pos[i * 3 + 1] = -999;

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (150.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          float a = smoothstep(0.5, 0.02, r);
          float core = smoothstep(0.22, 0.0, r);
          gl_FragColor = vec4(vColor + vec3(core) * 0.8, a * a * vAlpha);
        }
      `,
    });

    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.particles.renderOrder = 8;
    this.group.add(this.particles);

    this._pPos = pos;
    this._pCol = col;
    this._pAlpha = alpha;
    this._pSize = size;
    this._pGeo = geo;
    this._pVel = new Float32Array(MAX_PARTICLES * 3);
    this._pLife = new Float32Array(MAX_PARTICLES);
    this._pMax = new Float32Array(MAX_PARTICLES);
    this._pHead = 0;
  }

  _buildRings() {
    this.rings = [];
    const geo = new THREE.RingGeometry(0.34, 0.5, 48);
    for (let i = 0; i < MAX_RINGS; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      mesh.visible = false;
      mesh.renderOrder = 7;
      this.group.add(mesh);
      this.rings.push({ mesh, life: 0, max: 0.5 });
    }
  }

  _buildFlashes() {
    this.flashes = [];
    const tex = radialTexture("rgba(255,120,150,0.85)", "rgba(255,60,110,0)");
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.group.add(mesh);
      this.flashes.push({ mesh, life: 0, max: 0.4 });
    }
    this._flashHead = 0;
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled) this.clear();
    this.group.visible = this.enabled;
  }

  /** Sparkle burst at a lane's hit point. */
  burst(lane, grade, color) {
    if (!this.enabled) return;
    const base = this.highway.hitPosition(lane, this._v).clone();

    const counts = { perfect: 26, great: 18, good: 11 };
    const n = counts[grade] ?? 12;
    const speed = grade === "perfect" ? 5.2 : grade === "great" ? 4.0 : 2.8;

    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const idx = this._pHead;
      this._pHead = (this._pHead + 1) % MAX_PARTICLES;

      const angle = Math.random() * Math.PI * 2;
      const spread = Math.random() * 0.9;
      const up = 1.4 + Math.random() * speed;

      this._pPos[idx * 3 + 0] = base.x + Math.cos(angle) * 0.18;
      this._pPos[idx * 3 + 1] = base.y + 0.05;
      this._pPos[idx * 3 + 2] = base.z + Math.sin(angle) * 0.1;

      this._pVel[idx * 3 + 0] = Math.cos(angle) * spread * speed;
      this._pVel[idx * 3 + 1] = up;
      this._pVel[idx * 3 + 2] = Math.sin(angle) * spread * speed * 0.6 + 1.2;

      const jitter = 0.75 + Math.random() * 0.5;
      this._pCol[idx * 3 + 0] = Math.min(1, c.r * jitter + 0.25);
      this._pCol[idx * 3 + 1] = Math.min(1, c.g * jitter + 0.2);
      this._pCol[idx * 3 + 2] = Math.min(1, c.b * jitter + 0.15);

      this._pSize[idx] = 1.6 + Math.random() * 3.4;
      this._pMax[idx] = 0.45 + Math.random() * 0.5;
      this._pLife[idx] = this._pMax[idx];
      this._pAlpha[idx] = 1;
    }

    this._spawnRing(base, color, grade);
  }

  _spawnRing(base, color, grade) {
    const slot = this.rings.find((r) => r.life <= 0) ?? this.rings[0];
    slot.mesh.position.copy(base).setY(base.y + 0.02);
    slot.mesh.rotation.x = -Math.PI / 2;
    slot.mesh.material.color.set(color);
    slot.mesh.visible = true;
    slot.max = grade === "perfect" ? 0.55 : 0.42;
    slot.life = slot.max;
    slot.scaleTo = grade === "perfect" ? 4.2 : 3.2;
  }

  /** Red bloom under a lane when a note is missed. */
  missFlash(lane) {
    if (!this.enabled) return;
    const slot = this.flashes[this._flashHead];
    this._flashHead = (this._flashHead + 1) % this.flashes.length;
    const p = this.highway.hitPosition(lane, this._v);
    slot.mesh.position.set(p.x, 0.045, 0);
    slot.mesh.visible = true;
    slot.max = 0.42;
    slot.life = slot.max;
  }

  update(dt) {
    if (!this.enabled) return;

    // --- particles --------------------------------------------------------
    let anyParticle = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this._pLife[i] <= 0) continue;
      anyParticle = true;
      this._pLife[i] -= dt;
      if (this._pLife[i] <= 0) {
        this._pAlpha[i] = 0;
        this._pPos[i * 3 + 1] = -999;
        continue;
      }
      const t = this._pLife[i] / this._pMax[i];
      this._pVel[i * 3 + 1] -= 9.5 * dt;
      this._pPos[i * 3 + 0] += this._pVel[i * 3 + 0] * dt;
      this._pPos[i * 3 + 1] += this._pVel[i * 3 + 1] * dt;
      this._pPos[i * 3 + 2] += this._pVel[i * 3 + 2] * dt;
      this._pAlpha[i] = t * t;
    }
    if (anyParticle) {
      this._pGeo.attributes.position.needsUpdate = true;
      this._pGeo.attributes.aColor.needsUpdate = true;
      this._pGeo.attributes.aAlpha.needsUpdate = true;
      this._pGeo.attributes.aSize.needsUpdate = true;
    }

    // --- rings ------------------------------------------------------------
    for (const ring of this.rings) {
      if (ring.life <= 0) {
        if (ring.mesh.visible) ring.mesh.visible = false;
        continue;
      }
      ring.life -= dt;
      const t = Math.max(0, ring.life / ring.max);
      const grow = 1 + (1 - t) * (ring.scaleTo ?? 3);
      ring.mesh.scale.setScalar(grow);
      ring.mesh.material.opacity = t * t * 0.9;
      if (ring.life <= 0) ring.mesh.visible = false;
    }

    // --- miss flashes -----------------------------------------------------
    for (const f of this.flashes) {
      if (f.life <= 0) {
        if (f.mesh.visible) f.mesh.visible = false;
        continue;
      }
      f.life -= dt;
      const t = Math.max(0, f.life / f.max);
      f.mesh.material.opacity = t * 0.55;
      f.mesh.scale.setScalar(0.7 + (1 - t) * 0.5);
      if (f.life <= 0) f.mesh.visible = false;
    }
  }

  clear() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this._pLife[i] = 0;
      this._pAlpha[i] = 0;
      this._pPos[i * 3 + 1] = -999;
    }
    this._pGeo.attributes.position.needsUpdate = true;
    this._pGeo.attributes.aAlpha.needsUpdate = true;
    for (const r of this.rings) {
      r.life = 0;
      r.mesh.visible = false;
    }
    for (const f of this.flashes) {
      f.life = 0;
      f.mesh.visible = false;
    }
  }

  dispose() {
    this.clear();
    this.view.scene.remove(this.group);
  }
}

function radialTexture(inner, outer) {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.5, inner.replace(/[\d.]+\)$/, "0.25)"));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}
