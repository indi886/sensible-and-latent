// 05 · DAMPER BANK. Recent work printed across the blades of an opposed-blade damper. Scroll drives
// the actuator; each blade follows the linkage through its own spring (underdamped, so it overshoots
// and settles), with the drive arriving a few milliseconds later at each blade down the bank. Alternate
// blades turn opposite ways, the classic fish-mouth of an opposed-blade damper. While the blades are
// open, air streams through the gaps from a lit plenum and the blades flutter in it.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { GLStage, fitFov, loadTexture } from './stage';
import type { Stage } from '../core/scroll';
import { clamp, lerp } from '../core/math';
import { reducedMotion, isNarrow } from '../core/env';

const W = 6, H = 4, N = 12, BH = H / N;

type Blade = { mesh: THREE.Mesh; crank: THREE.Object3D; front: { value: THREE.Texture }; back: { value: THREE.Texture }; fi: number; bi: number; theta: number; omega: number; target: number };

export class DamperGL extends GLStage {
  /** project position, 0…count-1 (fractional while flipping) */
  P = 0;
  pointer = new THREE.Vector2();
  tilt = 0;
  opening = 0;
  private blades: Blade[] = [];
  private tex: THREE.Texture[] = [];
  private uAir = { value: 0 };
  private uTime = { value: 0 };
  private bar!: THREE.Mesh;
  private plenum: THREE.RectAreaLight;

  constructor(canvas: HTMLCanvasElement, stage: Stage, private urls: string[], galvUrl: string) {
    super(canvas, stage, { shadows: true, bloom: { strength: 0.6, radius: 0.55, threshold: 0.9 }, lens: { vignette: 0.6, flare: 0.22, aberration: 0.0025 }, exposure: 1.0 });
    RectAreaLightUniformsLib.init();
    this.scene.background = new THREE.Color(0x05080e);
    this.scene.fog = new THREE.Fog(0x05080e, 14, 30);
    const cam = this.camera as THREE.PerspectiveCamera;
    cam.near = 0.1;
    cam.far = 80;

    const galv = loadTexture(galvUrl, true, true);
    const imgs = urls.map((u) => loadTexture(u));
    this.pending.push(galv, ...imgs.map((p, i) => p.then((t) => { this.tex[i] = t; })));

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xa9b2b7, metalness: 0.85, roughness: 0.4 });
    galv.then((t) => { t.repeat.set(2, 2); frameMat.map = t; frameMat.needsUpdate = true; });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x9aa3a8, metalness: 0.9, roughness: 0.35 });

    // galvanised channel frame
    const T = 0.16, D = 0.34;
    const frame = (x: number, y: number, w: number, h: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, D), frameMat);
      m.position.set(x, y, 0);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    };
    frame(0, H / 2 + T / 2, W + 2 * T, T); frame(0, -H / 2 - T / 2, W + 2 * T, T);
    frame(-W / 2 - T / 2, 0, T, H); frame(W / 2 + T / 2, 0, T, H);

    // blades
    const geo = new THREE.BoxGeometry(W - 0.02, BH * 1.004, 0.035);
    const blank = new THREE.Texture();
    for (let i = 0; i < N; i++) {
      const front = { value: blank as THREE.Texture }, back = { value: blank as THREE.Texture };
      const rect = new THREE.Vector4(0, 1 - (i + 1) / N, 1, 1 / N);
      const face = (u: { value: THREE.Texture }, flip: number) => {
        const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.15, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.15, map: blank });
        m.customProgramCacheKey = () => 'damper-face';
        m.onBeforeCompile = (s) => {
          Object.assign(s.uniforms, { uImg: u, uRect: { value: rect }, uFlip: { value: flip }, uSelf: { value: 0.42 } });
          s.fragmentShader = s.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform sampler2D uImg; uniform vec4 uRect; uniform float uFlip; uniform float uSelf; vec3 gTex;')
            .replace('#include <map_fragment>', `
              vec2 fuv = mix(vMapUv, 1.0 - vMapUv, uFlip);
              vec4 texel = texture2D(uImg, uRect.xy + fuv * uRect.zw);
              gTex = texel.rgb;
              diffuseColor *= texel;`)
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gTex * uSelf;');
        };
        return m;
      };
      const mats = [edgeMat, edgeMat, edgeMat, edgeMat, face(front, 0), face(back, 1)];
      const mesh = new THREE.Mesh(geo, mats);
      mesh.position.set(0, H / 2 - (i + 0.5) * BH, 0);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      // axle pin and crank arm outside the frame, on the linkage side
      const crank = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.03), edgeMat);
      arm.position.y = -0.08;
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 10), edgeMat);
      pin.rotation.z = Math.PI / 2;
      crank.add(arm, pin);
      crank.position.set(W / 2 + T + 0.07, mesh.position.y, 0.08);
      this.scene.add(crank);
      this.blades.push({ mesh, crank, front, back, fi: -1, bi: -1, theta: 0, omega: 0, target: 0 });
    }
    // linkage bar and actuator
    this.bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, H - 0.2, 0.03), edgeMat);
    this.bar.position.set(W / 2 + T + 0.07, 0, 0.14);
    this.bar.castShadow = true;
    const act = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.16), new THREE.MeshStandardMaterial({ color: 0x1b1e21, roughness: 0.6 }));
    act.position.set(W / 2 + T + 0.12, -H / 2 - 0.42, 0.12);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 0.6), toneMapped: false }));
    led.position.set(W / 2 + T + 0.2, -H / 2 - 0.36, 0.205);
    this.scene.add(this.bar, act, led);

    // plenum behind the bank: lit, and visible as bright slits when the blades open
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.3, H + 0.3), new THREE.ShaderMaterial({
      uniforms: { uAir: this.uAir },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uAir; varying vec2 vUv;
        void main(){ float r = length((vUv - 0.5) * vec2(1.6, 1.0)); vec3 c = mix(vec3(0.42, 0.7, 1.05), vec3(0.03, 0.06, 0.12), smoothstep(0.0, 0.62, r)); gl_FragColor = vec4(c * (0.12 + 0.62 * uAir), 1.0); }`,
      toneMapped: false,
    }));
    glow.position.z = -1.6;
    this.scene.add(glow);
    this.plenum = new THREE.RectAreaLight(0x9fdcff, 1.5, W, H);
    this.plenum.position.set(0, 0, -1.0);
    this.plenum.lookAt(0, 0, 1);
    this.scene.add(this.plenum);


    // key, rim, fill
    const key = new THREE.SpotLight(0xffd9b0, 140, 0, 0.5, 0.7, 2);
    key.position.set(-3.5, 5.5, 6.5);
    key.target.position.set(0.4, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const rim = new THREE.SpotLight(0x6fb8ff, 40, 0, 0.55, 0.9, 2);
    rim.position.set(5.2, 1.2, 2.2);
    rim.target.position.set(0, 0, 0);
    this.scene.add(key, key.target, rim, rim.target, new THREE.HemisphereLight(0x5b7fb2, 0x080808, 0.3));

    this.buildAir();
    this.setupPost();
  }

  private buildAir() {
    const n = isNarrow() ? 900 : 1800;
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.uTime, uAir: this.uAir, uPixel: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `attribute vec4 aSeed; uniform float uTime, uAir, uPixel; varying float vA;
        void main(){
          float t = fract(aSeed.z + uTime * mix(0.25, 0.55, aSeed.w));
          vec3 p = vec3((aSeed.x - 0.5) * ${W.toFixed(1)}, (aSeed.y - 0.5) * ${H.toFixed(1)}, mix(-2.6, 5.5, t));
          p.xy += vec2(sin(uTime + aSeed.x * 30.0), cos(uTime * 0.8 + aSeed.y * 20.0)) * 0.05 * t;
          vA = uAir * smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.6, 1.0, t)) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uPixel * mix(1.2, 2.8, aSeed.w) * (6.0 / max(0.5, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(0.5, 0.85, 1.0) * a * 1.8, a); }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  protected override onResize(w: number, h: number) {
    const cam = this.camera as THREE.PerspectiveCamera;
    const aspect = w / h;
    cam.fov = fitFov(32, aspect, 40);
    cam.updateProjectionMatrix();
    // the bank sits right of centre on wide screens (copy on the left), centred and high on tall ones
    if (aspect > 1.1) cam.setViewOffset(w, h, -w * 0.13, 0, w, h);
    else cam.setViewOffset(w, h, 0, h * 0.16, w, h);
  }

  private faceIndex(n: number) {
    const max = this.tex.length - 1;
    const even = Math.min(max, Math.max(0, 2 * Math.round(n / 2)));
    const odd = Math.min(max, Math.max(0, n < even ? even - 1 : even + 1));
    return [even, odd];
  }

  update(dt: number, time: number) {
    this.uTime.value = time;
    const T = this.P * Math.PI;
    // linkage cascade + spring-damper per blade (sub-stepped so a dropped frame can't explode it)
    const K = 170, C = 2 * 0.32 * Math.sqrt(K);
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    let open = 0;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < N; i++) {
        const b = this.blades[i];
        const drive = i === 0 ? T : this.blades[i - 1].target;
        b.target += (drive - b.target) * (1 - Math.exp(-h * 26));
        if (reducedMotion) { b.theta = T; b.omega = 0; continue; }
        const acc = K * (b.target - b.theta) - C * b.omega;
        b.omega += acc * h;
        b.theta += b.omega * h;
      }
    }
    for (let i = 0; i < N; i++) {
      const b = this.blades[i];
      const sign = i % 2 === 0 ? 1 : -1;
      const openness = Math.abs(Math.sin(b.theta));
      open += openness;
      const flutter = reducedMotion ? 0 : openness * 0.035 * Math.sin(time * 21 + i * 1.7) * this.uAir.value;
      b.mesh.rotation.x = sign * (b.theta + flutter);
      b.crank.rotation.x = b.mesh.rotation.x;
      const [fi, bi] = this.faceIndex(b.theta / Math.PI);
      if (fi !== b.fi && this.tex[fi]) { b.front.value = this.tex[fi]; b.fi = fi; }
      if (bi !== b.bi && this.tex[bi]) { b.back.value = this.tex[bi]; b.bi = bi; }
    }
    this.opening = open / N;
    this.uAir.value = this.opening;
    this.plenum.intensity = 0.8 + this.opening * 3.2;
    this.bar.position.y = Math.sin(this.blades[0].theta) * 0.06;

    // tilt-up: a low camera that tilts up across the bank as the work goes by
    const cam = this.camera as THREE.PerspectiveCamera;
    const aspect = this.width / this.height;
    const hf = 2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * aspect);
    const share = aspect > 1.1 ? 0.5 : 0.88;
    const dist = Math.max(W / (share * 2 * Math.tan(hf / 2)), (H + 1.2) / (2 * Math.tan((cam.fov * Math.PI) / 360)) * (aspect > 1.1 ? 1.05 : 1.8));
    const tilt = this.tilt;
    cam.position.set(lerp(-0.6, 0.6, tilt) + this.pointer.x * 0.35, -1.7 + this.pointer.y * 0.2, dist);
    cam.lookAt(lerp(-0.2, 0.25, tilt), lerp(-0.9, 0.55, tilt), 0);
  }

  get count() { return this.urls.length; }
  static clampP(p: number, n: number) { return clamp(p, 0, n - 1); }
}
