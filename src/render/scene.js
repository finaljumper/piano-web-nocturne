import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/**
 * Owns the renderer, camera, scene background, ambient dust and the optional
 * bloom pass. Everything else in the render layer hangs off `view.scene`.
 */
export class View {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.setClearColor(0x05060b, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();
    this.scene.background = makeSkyTexture();
    this.scene.fog = new THREE.Fog(0x05060b, 34, 96);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 240);
    this.camera.position.set(0, 5, 9);
    this.camera.lookAt(0, 0.9, -6);

    this.dust = makeDust();
    this.scene.add(this.dust);

    this._buildComposer();

    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.quality = "high";
    this.bloomEnabled = true;
  }

  _buildComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.62, 0.62, 0.62);
    this.composer.addPass(this.bloom);
  }

  setBloom(on) {
    this.bloomEnabled = !!on;
  }

  setQuality(quality) {
    this.quality = quality;
    this.bloomEnabled = quality === "high";
    const ratio = quality === "high" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    // May be called before the first layout; sizing follows on resize.
    if (this.cssWidth) this.setSize(this.cssWidth, this.cssHeight, ratio);
  }

  /**
   * Position the camera so the whole highway fits, whatever the aspect ratio.
   * @param {number} laneSpan  total world width of the highway
   */
  frameHighway(laneSpan) {
    const aspect = this.width / this.height;
    const fovRad = (this.camera.fov * Math.PI) / 180;
    // Distance at which a plane through the hit line is wide enough, with margin.
    const need = laneSpan * 1.45;
    const dist = need / (2 * Math.tan(fovRad / 2) * aspect);
    const z = clamp(dist, 8.5, 26);
    this.camera.position.set(0, z * 0.52, z);
    this.camera.lookAt(0, 0.95, -6.5);
    this.camera.updateProjectionMatrix();
  }

  setSize(cssWidth, cssHeight, pixelRatio) {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.width = cssWidth;
    this.height = cssHeight;

    const dpr = pixelRatio ?? (this.quality === "high" ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    this.pixelRatio = dpr;

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssWidth, cssHeight, false);
    this.camera.aspect = cssWidth / cssHeight;
    this.camera.updateProjectionMatrix();

    this.composer.setPixelRatio(dpr);
    this.composer.setSize(cssWidth, cssHeight);
    this.bloom.setSize(cssWidth, cssHeight);
  }

  /** @param {number} dt seconds */
  update(dt) {
    // Slow ambient drift in the dust field.
    this.dust.rotation.y += dt * 0.008;
    this.dust.position.y = Math.sin(performance.now() * 0.00008) * 0.6;
  }

  render() {
    if (this.bloomEnabled && this.quality === "high") {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    this.renderer.dispose();
    this.composer?.dispose?.();
  }
}

/* ------------------------------------------------------------------------- */

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** A soft, wide sky/room gradient drawn as the scene background. */
function makeSkyTexture() {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");

  const base = ctx.createLinearGradient(0, 0, 0, size);
  base.addColorStop(0, "#04050a");
  base.addColorStop(0.45, "#080a13");
  base.addColorStop(0.8, "#0c0d18");
  base.addColorStop(1, "#05060b");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const glow = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x * size, y * size, 0, x * size, y * size, r * size);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  };

  glow(0.5, 1.08, 0.85, "rgba(233,196,106,0.20)");
  glow(0.12, -0.06, 0.6, "rgba(106,212,233,0.13)");
  glow(0.92, 0.04, 0.55, "rgba(157,140,233,0.13)");
  glow(0.5, 0.52, 0.75, "rgba(20,26,48,0.55)");

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** Floating motes that give the space depth without any cost. */
function makeDust() {
  const COUNT = 420;
  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  const size = new Float32Array(COUNT);

  const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3 + 0] = (Math.random() - 0.5) * 70;
    pos[i * 3 + 1] = Math.random() * 26 - 2;
    pos[i * 3 + 2] = -Math.random() * 90 + 8;

    const pick = Math.random();
    if (pick < 0.55) c.set("#e9c46a");
    else if (pick < 0.8) c.set("#6ad4e9");
    else c.set("#b07fe0");
    col[i * 3 + 0] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;

    size[i] = 0.6 + Math.random() * 1.8;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 0.5 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute vec3 aColor;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (140.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      uniform float uOpacity;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(d));
        gl_FragColor = vec4(vColor, a * a * uOpacity);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}
