// HERO · Start-up. An evaporator coil in a dark studio: 84 aluminium fins (instanced) threaded by one
// serpentine copper circuit. On load the compressor kicks, a cold refrigerant front runs the
// hairpins, frost blooms outward from each tube, and the air streaming through the pack turns from
// amber to blue. The reel plays on the plenum wall behind the coil and lights it through a
// RectAreaLight sampled from the footage. Scroll dollies the camera through one fin gap (with a
// zoom-out on the way, a dolly-zoom) until the film fills the frame.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLStage, fitFov, loadTexture } from './stage';
import type { Stage } from '../core/scroll';
import { clamp, smoother, lerp } from '../core/math';
import { isNarrow } from '../core/env';
import { NOISE_GLSL } from './noise';

const PASSES_FRONT = [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75];
const PASSES_BACK = [0.6, 0.3, 0.0, -0.3, -0.6];
const ZF = 0.11, ZB = -0.11;

type Seg = { kind: 'line'; a: THREE.Vector3; b: THREE.Vector3; len: number } | { kind: 'arc'; c: THREE.Vector3; u: THREE.Vector3; x: number; r: number; len: number };

/** One continuous circuit: lead-in, eleven passes joined by U-bends, lead-out. Arc-length parameterised. */
class SerpentineCurve extends THREE.Curve<THREE.Vector3> {
  segs: Seg[] = [];
  total = 0;
  constructor(halfLen: number) {
    super();
    const pts = [...PASSES_FRONT.map((y) => new THREE.Vector2(y, ZF)), ...PASSES_BACK.map((y) => new THREE.Vector2(y, ZB))];
    const xe = halfLen + 0.04;
    const line = (a: THREE.Vector3, b: THREE.Vector3) => this.segs.push({ kind: 'line', a, b, len: a.distanceTo(b) });
    line(new THREE.Vector3(-xe - 0.7, pts[0].x, pts[0].y), new THREE.Vector3(-xe, pts[0].x, pts[0].y));
    for (let i = 0; i < pts.length; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const a = new THREE.Vector3(-xe * dir, pts[i].x, pts[i].y);
      const b = new THREE.Vector3(xe * dir, pts[i].x, pts[i].y);
      line(a, b);
      if (i < pts.length - 1) {
        const e = new THREE.Vector3(xe * dir, pts[i + 1].x, pts[i + 1].y);
        const c = b.clone().add(e).multiplyScalar(0.5);
        const u = e.clone().sub(b).normalize();
        const r = b.distanceTo(e) / 2;
        this.segs.push({ kind: 'arc', c, u, x: dir, r, len: Math.PI * r });
      }
    }
    const last = pts[pts.length - 1];
    line(new THREE.Vector3(xe, last.x, last.y), new THREE.Vector3(xe + 0.7, last.x, last.y));
    this.total = this.segs.reduce((s, g) => s + g.len, 0);
  }
  override getPoint(t: number, target = new THREE.Vector3()) {
    let d = clamp(t) * this.total;
    for (const s of this.segs) {
      if (d <= s.len || s === this.segs[this.segs.length - 1]) {
        const f = clamp(d / s.len);
        if (s.kind === 'line') return target.copy(s.a).lerp(s.b, f);
        const phi = f * Math.PI;
        return target.copy(s.c).addScaledVector(s.u, -s.r * Math.cos(phi)).add(new THREE.Vector3(s.x * s.r * Math.sin(phi), 0, 0));
      }
      d -= s.len;
    }
    return target;
  }
}

export class HeroGL extends GLStage {
  u = {
    uCharge: { value: 0 },
    uFrost: { value: 0 },
    uCool: { value: 0 },
    uTime: { value: 0 },
    uGain: { value: 0.12 },
  };
  /** 0–1 push through the coil, set by the section from scroll */
  push = 0;
  /** camera shake amplitude (compressor kick) */
  jolt = 0;
  /** true when the DOM takeover video fully covers the canvas */
  occluded = false;
  pointer = new THREE.Vector2();

  private video: HTMLVideoElement;
  private videoTex: THREE.VideoTexture;
  private filmLight: THREE.RectAreaLight;
  private film!: THREE.Mesh;
  private sampler = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  private sampleTick = 0;
  private path: THREE.CatmullRomCurve3;
  private look: THREE.CatmullRomCurve3;
  private gapX: number;
  private baseFov = 30;
  private portraitPos = new THREE.Vector3(1.5, -0.4, 5.4);
  private portraitLook = new THREE.Vector3(0.15, 0.62, -2.2);
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, stage: Stage, videoUrl: string, private galvUrl: string, private copperUrl: string) {
    super(canvas, stage, { shadows: true, bloom: { strength: 0.8, radius: 0.5, threshold: 0.86 }, lens: { vignette: 0.55, flare: 0.3, aberration: 0.0025 }, exposure: 0.82 });
    RectAreaLightUniformsLib.init();
    this.scene.background = new THREE.Color(0x07080a);
    const cam = this.camera as THREE.PerspectiveCamera;
    cam.near = 0.01;
    cam.far = 60;

    this.video = Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true, preload: 'auto' });
    if (videoUrl) this.video.src = videoUrl;
    this.video.setAttribute('playsinline', '');
    this.videoTex = new THREE.VideoTexture(this.video);
    this.videoTex.colorSpace = THREE.SRGBColorSpace;
    this.sampler.canvas.width = 16;
    this.sampler.canvas.height = 9;

    const narrow = isNarrow();
    const N = narrow ? 62 : 84;
    const pitch = 4.62 / N;
    const L = N * pitch;
    this.gapX = -L / 2 + Math.round((L / 2 + 0.33) / pitch) * pitch;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.1;
    pmrem.dispose();

    this.buildCoil(N, pitch, L);
    this.buildRoom();
    this.filmLight = this.buildFilm();
    this.buildLights();
    this.buildAir(narrow ? 1500 : 2800);
    this.buildMist(narrow ? 140 : 260);

    // camera choreography: hero set-up → approach → aligned on a fin gap → through → at the film
    const g = this.gapX, yc = -0.075;
    this.path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(4.6, 0.95, 5.5),
      new THREE.Vector3(2.3, 0.36, 2.9),
      new THREE.Vector3(g + 0.06, yc, 1.15),
      new THREE.Vector3(g, yc, 0.35),
      new THREE.Vector3(g, yc, -0.3),
      new THREE.Vector3(g * 0.25, 0.08, -0.62),
    ], false, 'centripetal');
    this.look = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.05, -0.2, -0.2),
      new THREE.Vector3(g, -0.08, -0.6),
      new THREE.Vector3(g, yc, -2.0),
      new THREE.Vector3(g, yc, -3.0),
      new THREE.Vector3(g * 0.5, 0.05, -3.4),
      new THREE.Vector3(0, 0.12, -3.4),
    ], false, 'centripetal');
    this.setupPost();
  }

  private buildCoil(N: number, pitch: number, L: number) {
    const galv = loadTexture(this.galvUrl, true, true);
    const copper = loadTexture(this.copperUrl, true, true);
    this.pending.push(galv, copper);
    // fins
    const finGeo = new THREE.BoxGeometry(0.0045, 1.8, 0.5);
    const finMat = new THREE.MeshStandardMaterial({ color: 0x77828a, metalness: 0.95, roughness: 0.28, envMapIntensity: 0.55 });
    const tubes = [...PASSES_FRONT.map((y) => new THREE.Vector2(y, ZF)), ...PASSES_BACK.map((y) => new THREE.Vector2(y, ZB))];
    finMat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { uFrost: this.u.uFrost, uTime: this.u.uTime, uTubes: { value: tubes } });
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFin;\nvarying vec3 vLocal;\nvarying float vFin;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position; vFin = aFin;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uFrost; uniform float uTime; uniform vec2 uTubes[11];
          varying vec3 vLocal; varying float vFin;
          ${NOISE_GLSL}
          float gFrost = 0.0;`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          {
            float dmin = 10.0;
            for (int i = 0; i < 11; i++) dmin = min(dmin, distance(vLocal.yz, uTubes[i]));
            float n = vnoise(vLocal.yz * 22.0 + vFin * 91.0) * 0.7 + vnoise(vLocal.yz * 90.0 + vFin * 13.0) * 0.3;
            // frost hugs the tubes first: bands along each pass, dark aluminium between them
            float reach = uFrost * 0.125;
            float f = smoothstep(reach + 0.035, reach - 0.06, dmin + (n - 0.5) * 0.06);
            // hoar-frost fibres: fine needles standing off the fin, brighter at their tips
            float fib = vnoise(vLocal.yz * vec2(260.0, 55.0) + vFin * 17.0);
            f *= 0.75 + 0.35 * fib;
            f *= smoothstep(vFin - 0.3, vFin + 0.02, uFrost * 1.3);
            gFrost = f;
            diffuseColor.rgb *= 0.92 + 0.08 * fract(vFin * 37.0);
            // wavy-fin corrugation: alternating sheen across the depth of each fin
            float wave = sin(vLocal.z * 120.0 + vLocal.y * 6.0);
            roughnessFactor *= 0.7 + 0.6 * wave * wave;
            diffuseColor.rgb *= 0.85 + 0.15 * wave;
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.55, 0.66, 0.78), vec3(0.86, 0.93, 1.0), fib), f);
            roughnessFactor = mix(roughnessFactor, 0.62, f);
            metalnessFactor = mix(metalnessFactor, 0.05, f);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float sp = step(0.982, hash12(floor(vLocal.yz * 520.0) + vFin * 7.0)) * gFrost;
            totalEmissiveRadiance += vec3(0.6, 0.86, 1.0) * sp * (0.5 + 0.5 * sin(uTime * 5.0 + vFin * 60.0)) * 2.2;
          }`);
    };
    const fins = new THREE.InstancedMesh(finGeo, finMat, N);
    const aFin = new Float32Array(N);
    const m = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      m.makeTranslation(-L / 2 + (i + 0.5) * pitch, 0, 0);
      fins.setMatrixAt(i, m);
      aFin[i] = i / (N - 1);
    }
    finGeo.setAttribute('aFin', new THREE.InstancedBufferAttribute(aFin, 1));
    fins.castShadow = true;
    fins.receiveShadow = true;
    this.scene.add(fins);

    // the copper circuit
    const curve = new SerpentineCurve(L / 2);
    const tubeGeo = new THREE.TubeGeometry(curve, 1200, 0.028, 10, false);
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xc8784a, metalness: 1, roughness: 0.24 });
    copper.then((t) => { t.repeat.set(90, 1); tubeMat.map = t; tubeMat.needsUpdate = true; });
    tubeMat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { uCharge: this.u.uCharge, uFrost: this.u.uFrost, uTime: this.u.uTime });
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vPath;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPath = uv.x;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uCharge; uniform float uFrost; uniform float uTime;\nvarying float vPath;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float behind = smoothstep(uCharge + 0.0008, uCharge - 0.003, vPath);
            float live = step(0.0005, uCharge) * (1.0 - step(0.9995, uCharge));
            float band = exp(-pow((vPath - uCharge) / 0.0055, 2.0)) * live;
            float pulse = 0.55 + 0.45 * sin(vPath * 1400.0 - uTime * 9.0);
            totalEmissiveRadiance += vec3(0.28, 0.78, 1.0) * (band * 11.0 + behind * 0.16 * pulse);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.9, 0.97), behind * uFrost * 0.42);
          }`);
    };
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tube.castShadow = true;
    this.scene.add(tube);

    // galvanised tube sheets and drain pan
    const sheetMat = new THREE.MeshStandardMaterial({ color: 0xaab3b8, metalness: 0.85, roughness: 0.42 });
    galv.then((t) => { t.repeat.set(1, 2); sheetMat.map = t; sheetMat.needsUpdate = true; });
    for (const s of [-1, 1]) {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.9, 0.58), sheetMat);
      sheet.position.set(s * (L / 2 + 0.012), 0, 0);
      sheet.castShadow = sheet.receiveShadow = true;
      this.scene.add(sheet);
    }
    const pan = new THREE.Mesh(new THREE.BoxGeometry(L + 0.5, 0.07, 0.78), sheetMat);
    pan.position.set(0, -0.98, 0);
    pan.receiveShadow = pan.castShadow = true;
    this.scene.add(pan);
    // suction header at the outlet: a vertical copper riser
    const header = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.1, 20), tubeMat);
    header.position.set(L / 2 + 0.78, 0.25, ZB);
    header.castShadow = true;
    this.scene.add(header);
  }

  private buildRoom() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.2, metalness: 0.2, envMapIntensity: 0.4 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.02;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  private buildFilm() {
    const W = 5.6, H = 3.15;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.videoTex }, uGain: this.u.uGain },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D uMap; uniform float uGain; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(uMap, vUv).rgb;
          float e = smoothstep(0.0, 0.012, vUv.x) * smoothstep(1.0, 0.988, vUv.x) * smoothstep(0.0, 0.02, vUv.y) * smoothstep(1.0, 0.98, vUv.y);
          gl_FragColor = vec4(c * uGain * e, 1.0);
          #include <colorspace_fragment>
        }`,
      toneMapped: false,
    });
    const film = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    film.position.set(0, 0.12, -3.4);
    this.film = film;
    this.scene.add(film);
    // the film lights the coil from behind
    const light = new THREE.RectAreaLight(0xffffff, 0, W, H);
    light.position.copy(film.position);
    light.lookAt(0, 0, 0);
    this.scene.add(light);
    return light;
  }

  private buildLights() {
    const key = new THREE.SpotLight(0xffd2a0, 70, 0, 0.4, 0.85, 2);
    // raking: from high on the left, so every fin edge catches a line of light and the faces fall away
    key.position.set(-3.2, 4.4, 1.6);
    key.target.position.set(0, -0.3, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.015;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 12;
    this.scene.add(key, key.target);

    // one strip light (a long specular line down every fin edge); the other rims are cheap point
    // sources so the program stays light enough to compile fast on ANGLE/D3D11
    const rimL = new THREE.RectAreaLight(0x8fd3ff, 7, 0.12, 3.4);
    rimL.position.set(-3.5, 0.3, 0.9);
    rimL.lookAt(0, 0, 0);
    const rimR = new THREE.SpotLight(0xffd9b8, 26, 0, 0.6, 0.9, 2);
    rimR.position.set(3.9, 0.4, -1.2);
    rimR.target.position.set(0, 0, 0);
    const top = new THREE.DirectionalLight(0xcfe6ff, 0.35);
    top.position.set(0, 4, 1);
    this.scene.add(rimL, rimR, rimR.target, top, new THREE.HemisphereLight(0x9fb8c8, 0x060606, 0.08));
  }

  private buildAir(count: number) {
    const geo = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.u.uTime, uCool: this.u.uCool, uPixel: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `attribute vec4 aSeed; uniform float uTime, uCool, uPixel; varying vec3 vCol; varying float vA;
        void main(){
          float speed = mix(0.32, 0.8, aSeed.w);
          float z = mod(aSeed.z * 5.2 + uTime * speed, 5.2) - 3.3;
          float x = (aSeed.x - 0.5) * 5.4;
          float y = (aSeed.y - 0.5) * 2.1 + sin(uTime * 0.6 + aSeed.x * 23.0) * 0.04;
          float through = smoothstep(-0.25, 0.4, z);
          float cool = through * uCool;
          vCol = mix(vec3(1.0, 0.52, 0.22), vec3(0.42, 0.8, 1.0), cool);
          vA = smoothstep(-3.3, -2.5, z) * (1.0 - smoothstep(1.2, 1.9, z)) * mix(0.3, 0.6, cool) * (1.0 - step(-0.26, z) * step(z, 0.26));
          vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
          gl_PointSize = uPixel * mix(1.3, 3.0, aSeed.w) * (3.2 / max(0.2, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying vec3 vCol; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vCol * a * 1.8, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  /** cold mist spilling off the bottom of the coil once it is running, pooling on the floor */
  private buildMist(count: number) {
    const geo = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.u.uTime, uCool: this.u.uCool, uPixel: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `attribute vec4 aSeed; uniform float uTime, uCool, uPixel; varying float vA;
        void main(){
          float t = fract(aSeed.x + uTime * mix(0.05, 0.09, aSeed.y));
          float x = (aSeed.z - 0.5) * 4.8 + sin(uTime * 0.3 + aSeed.w * 9.0) * 0.15;
          // falls off the drain pan, then rolls forward along the floor
          float fall = smoothstep(0.0, 0.35, t);
          vec3 p = vec3(x + (aSeed.w - 0.5) * t * 0.8, mix(-0.92, -0.97, fall), mix(0.32, 0.45, fall) + max(0.0, t - 0.25) * 2.2);
          vA = uCool * smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.55, 1.0, t)) * 0.11;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uPixel * mix(50.0, 120.0, aSeed.y) * (2.4 / max(0.4, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d) * vA; gl_FragColor = vec4(vec3(0.62, 0.84, 1.0) * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  protected override onResize(w: number, h: number) {
    const cam = this.camera as THREE.PerspectiveCamera;
    // portrait: a longer lens from low and close (coil cropped at the sides, film filling the sky)
    this.baseFov = w < h ? 52 : fitFov(30, w / h, 40);
    // portrait: the film wall grows up from its bottom edge so it fills the frame above the coil
    const k = w < h ? 1.8 : 1;
    this.film.scale.setScalar(k);
    this.film.position.y = 0.12 - 3.15 / 2 + (3.15 * k) / 2;
    cam.fov = this.baseFov;
    // portrait phones: lift the coil into the upper half, the type owns the lower half
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }

  /** the reel arrives after the shaders have started compiling */
  setVideo(url: string) { if (!this.video.src) this.video.src = url; }

  playVideo() { if (this.video.paused) this.video.play().catch(() => {}); }
  pauseVideo() { this.video.pause(); }
  get videoTime() { return this.video.currentTime; }

  update(dt: number, time: number) {
    this.u.uTime.value = time;
    const cam = this.camera as THREE.PerspectiveCamera;
    const s = smoother(clamp(this.push));
    this.path.getPoint(s, this.tmpA);
    this.look.getPoint(Math.min(1, s + 0.02), this.tmpB);
    // portrait phones: a lower, more frontal set-up so the film fills the frame above the coil and
    // the coil sits just above the type; it hands over to the shared path as the dolly commits
    if (this.height > this.width && s < 0.42) {
      const k = 1 - smoother(s / 0.42);
      this.tmpA.lerp(this.portraitPos, k);
      this.tmpB.lerp(this.portraitLook, k);
    }
    // idle drift and pointer parallax fade out as the camera commits to the gap
    const free = 1 - clamp(s / 0.3);
    this.tmpA.x += (Math.sin(time * 0.21) * 0.08 + this.pointer.x * 0.25) * free;
    this.tmpA.y += (Math.sin(time * 0.17) * 0.04 + this.pointer.y * 0.12) * free;
    if (this.jolt > 0.001) {
      this.tmpA.x += (Math.random() - 0.5) * 0.03 * this.jolt;
      this.tmpA.y += (Math.random() - 0.5) * 0.03 * this.jolt;
      this.jolt *= Math.exp(-dt * 7);
    }
    cam.position.copy(this.tmpA);
    cam.lookAt(this.tmpB);
    // dolly-zoom: widen the lens as we pass through the pack, so the film fills the frame
    // end on the lens that fits the film exactly (wider on desktop, narrower on portrait phones)
    cam.fov = lerp(this.baseFov, 58, smoother(clamp((s - 0.45) / 0.55)));
    cam.updateProjectionMatrix();

    // sample the footage's average colour for the film's light, a few times a second
    if (++this.sampleTick % 12 === 0 && this.video.readyState >= 2) {
      this.sampler.drawImage(this.video, 0, 0, 16, 9);
      const d = this.sampler.getImageData(0, 0, 16, 9).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4 * 255;
      this.filmLight.color.setRGB(r / n, g / n, b / n, THREE.SRGBColorSpace);
    }
    this.filmLight.intensity = this.u.uGain.value * 3.4;
  }

  override frame(dt: number, time: number) {
    if (this.occluded) return;
    super.frame(dt, time);
  }

  override dispose() {
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.videoTex.dispose();
    super.dispose();
  }
}
