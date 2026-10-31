// Base class for every WebGL take: one renderer per canvas, rendered only while its section is in
// view, adaptive resolution, async shader compilation at boot, and full GPU disposal.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { LiteBloom } from './bloom';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { dprCap, isNarrow } from '../core/env';
import type { Stage } from '../core/scroll';
import { LensShader } from './lens';

export type GLOptions = {
  bloom?: { strength: number; radius: number; threshold: number };
  lens?: { vignette: number; flare: number; aberration: number };
  shadows?: boolean;
  alpha?: boolean;
  exposure?: number;
  /** full-screen shader takes have no scene graph worth post-processing */
  post?: boolean;
};

export abstract class GLStage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
  composer?: EffectComposer;
  bloom?: LiteBloom;
  lens?: ShaderPass;
  width = 1;
  height = 1;
  /** adaptive resolution scale (0.55–1) applied on top of the device pixel ratio cap */
  quality = 1;
  private frameTimes: number[] = [];
  private lastAdapt = 0;
  protected disposed = false;
  /** texture loads that must land before shaders compile (a late map would force a recompile) */
  protected pending: Promise<unknown>[] = [];
  forceRender = true;
  /** set once every program is compiled and every texture uploaded; until then the take shows its CSS ground */
  ready = false;

  constructor(public canvas: HTMLCanvasElement, public stage: Stage, protected opts: GLOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: opts.post === false,
      alpha: !!opts.alpha,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = opts.exposure ?? 1;
    if (opts.alpha) this.renderer.setClearColor(0x000000, 0);
    if (opts.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    }
  }

  /** build post after the subclass has its camera */
  protected setupPost() {
    if (this.opts.post === false) return;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: isNarrow() ? 0 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.opts.bloom) {
      const b = this.opts.bloom;
      this.bloom = new LiteBloom(b.strength, b.radius, b.threshold);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    const l = this.opts.lens ?? { vignette: 0.9, flare: 0.25, aberration: 0.0025 };
    this.lens = new ShaderPass(LensShader);
    this.lens.uniforms.uVignette.value = l.vignette;
    this.lens.uniforms.uFlare.value = l.flare;
    this.lens.uniforms.uAberration.value = l.aberration;
    this.composer.addPass(this.lens);
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.width = w;
    this.height = h;
    const dpr = dprCap() * this.quality;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(dpr);
    this.composer?.setSize(w, h);
    if (this.lens) this.lens.uniforms.uAspect.value = w / h;
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.onResize(w, h);
    this.forceRender = true;
  }

  protected onResize(_w: number, _h: number) {}

  /** compile every program and upload every texture now, so entering the take never stalls */
  async warm() {
    await Promise.all(this.pending);
    this.resize();
    await this.renderer.compileAsync(this.scene, this.camera);
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const mats = Array.isArray(m) ? m : m ? [m] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
          if (v instanceof THREE.Texture && !(v instanceof THREE.VideoTexture)) this.renderer.initTexture(v);
        }
        const u = (mat as THREE.ShaderMaterial).uniforms;
        if (u) for (const k in u) { const v = u[k].value; if (v instanceof THREE.Texture && !(v instanceof THREE.VideoTexture)) this.renderer.initTexture(v); }
      }
    });
    // one real frame through the composer allocates its targets
    this.render(0, 0);
    this.ready = true;
    this.canvas.classList.add("is-ready");
  }

  frame(dt: number, time: number) {
    if (this.disposed || !this.ready) return;
    if (!this.stage.inView && !this.forceRender) return;
    this.forceRender = false;
    this.update(dt, time);
    this.render(dt, time);
    this.adapt(dt, time);
  }

  protected render(_dt: number, time: number) {
    if (this.lens) this.lens.uniforms.uTime.value = time;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** drop resolution when frames run long, recover slowly when there is headroom */
  private adapt(dt: number, time: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 40) this.frameTimes.shift();
    if (time - this.lastAdapt < 1.2 || this.frameTimes.length < 40) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    let q = this.quality;
    // aim for 60: shed resolution below ~54 fps, win it back slowly once frames are on time
    if (avg > 1 / 54) q = Math.max(0.6, q - 0.1);
    else if (avg < 1 / 59 && q < 1) q = Math.min(1, q + 0.04);
    if (q !== this.quality) {
      this.quality = q;
      this.lastAdapt = time;
      this.resize();
      // resizing clears the drawing buffer: draw again now so a cleared canvas is never presented
      this.render(dt, time);
    }
  }

  abstract update(dt: number, time: number): void;

  dispose() {
    this.disposed = true;
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      const mats = Array.isArray(m) ? m : m ? [m] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) v.dispose();
        const u = (mat as THREE.ShaderMaterial).uniforms;
        if (u) for (const k in u) if (u[k].value instanceof THREE.Texture) u[k].value.dispose();
        mat.dispose();
      }
    });
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** Widen the vertical FOV on narrow/portrait screens so the subject keeps its horizontal coverage. */
export function fitFov(baseVFov: number, aspect: number, minHFov: number) {
  const hFov = 2 * Math.atan(Math.tan((baseVFov * Math.PI) / 360) * aspect) * (180 / Math.PI);
  if (hFov >= minHFov) return baseVFov;
  return (2 * Math.atan(Math.tan((minHFov * Math.PI) / 360) / aspect) * 180) / Math.PI;
}

export function loadTexture(url: string, srgb = true, repeat = false): Promise<THREE.Texture> {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(url, (t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      resolve(t);
    }, undefined, () => resolve(new THREE.Texture()));
  });
}
