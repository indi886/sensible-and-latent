// 02 · TWO KINDS OF HEAT. A window pane, cold side in, sweating condensation, with a 112 °F Tucson
// afternoon behind it. Rack focus is one uniform: near (the droplets sharp, the desert a blur of
// light) ↔ far (the desert sharp, the droplets dissolved into soft lenses). Each droplet refracts
// a small, flipped, sharper image of the scene. The pointer wipes the fog; it re-forms because the
// glass is below the dew point.
import * as THREE from 'three';
import { ScreenGL } from './screen';
import { loadTexture } from './stage';
import { NOISE_GLSL } from './noise';
import type { Stage } from '../core/scroll';

const FRAG = /* glsl */ `
  uniform sampler2D uImg; uniform sampler2D uWipe;
  uniform vec2 uRes; uniform float uTime; uniform float uFocus; uniform vec2 uImgSize; uniform float uDrift;
  varying vec2 vUv;
  ${NOISE_GLSL}

  vec2 coverUv(vec2 uv) {
    float ra = uRes.x / uRes.y, ia = uImgSize.x / uImgSize.y;
    vec2 s = ra > ia ? vec2(1.0, ia / ra) : vec2(ra / ia, 1.0);
    return (uv - 0.5) * s + 0.5;
  }
  vec3 blurSample(vec2 uv, float lod) {
    vec3 acc = vec3(0.0);
    float r = exp2(lod) / uRes.y * 1.4;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 2.39996 + 0.5;
      vec2 o = vec2(cos(a), sin(a)) * r * sqrt(float(i) + 0.5) * 0.45;
      acc += textureLod(uImg, uv + o, lod).rgb;
    }
    return acc / 8.0;
  }
  // one layer of droplets on a jittered grid; returns (normal.xy, mask, size)
  vec4 drops(vec2 uv, float scale, float seed, float density) {
    vec2 p = uv * scale;
    vec2 id = floor(p);
    vec4 best = vec4(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 cid = id + vec2(x, y);
      vec2 h = hash22(cid + seed);
      if (h.x > density) continue;
      vec2 c = cid + 0.5 + (h - 0.5) * 0.8;
      float r = mix(0.12, 0.42, hash12(cid + seed * 3.1));
      vec2 d = (p - c) / vec2(r, r * 1.08);
      float l = length(d);
      if (l < 1.0) {
        float m = 1.0 - l;
        if (m > best.z) best = vec4(d * sqrt(1.0 - l * l) * -1.0, m, r);
      }
    }
    return best;
  }
  void main() {
    vec2 uv = vUv;
    vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
    vec2 iuv = coverUv(uv);
    iuv.x += uDrift * 0.02;
    float wipe = texture2D(uWipe, uv).r;

    // droplets: three sizes; their edges soften as focus racks away
    vec2 guv = uv * aspect;
    vec4 d1 = drops(guv + vec2(0.0, uTime * 0.0015), 26.0, 1.7, 0.75);
    vec4 d2 = drops(guv, 58.0, 9.2, 0.82);
    vec4 d3 = drops(guv * 1.0 + vec2(0.0, -uTime * 0.004), 11.0, 4.4, 0.32);
    float fogField = fbm(guv * 3.0 + 2.0) * 0.5 + 0.5;
    float fog = clamp(0.55 + 0.45 * fogField, 0.0, 1.0) * (1.0 - wipe);
    float soft = mix(0.04, 0.55, uFocus);
    float m1 = smoothstep(0.0, soft, d1.z), m2 = smoothstep(0.0, soft, d2.z), m3 = smoothstep(0.0, soft, d3.z);
    vec2 n = d1.xy * m1 + d2.xy * m2 * 0.8 + d3.xy * m3 * 1.2;
    float dm = clamp(max(max(m1, m2), m3), 0.0, 1.0) * (1.0 - wipe * 0.85);

    // background: blurred when focus is near, sharp when far
    float bgLod = mix(5.2, 0.4, uFocus);
    vec3 bg = blurSample(iuv, bgLod);
    // micro-fog: lifts and greys the scene between drops
    vec3 fogged = mix(bg, vec3(dot(bg, vec3(0.33))) * 0.9 + 0.12, 0.35 * fog * (1.0 - uFocus * 0.5));
    // inside a drop: a refracted, inverted, sharper image (each drop is a lens)
    vec2 ruv = iuv + n * 0.06 - (uv - 0.5) * 0.02;
    float dropLod = mix(1.2, 3.8, uFocus);
    vec3 inDrop = blurSample(ruv, dropLod) * 1.08;
    float rim = smoothstep(0.08, 0.0, abs(d1.z - 0.18)) * m1 + smoothstep(0.06, 0.0, abs(d3.z - 0.15)) * m3;
    vec3 col = mix(fogged, inDrop, dm);
    // specular highlight on each drop from the window's light
    float spec = pow(max(dot(normalize(vec3(n, 1.0)), normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 18.0) * dm;
    col += spec * 0.55 * (1.0 - uFocus * 0.6);
    col -= rim * 0.08 * (1.0 - uFocus);
    // grade: warm heat, deep shadows, vignette
    col = pow(col, vec3(1.08));
    col *= mix(vec3(1.0), vec3(1.05, 0.96, 0.86), 0.6);
    float v = smoothstep(1.2, 0.25, length((uv - 0.5) * vec2(1.25, 1.0)));
    col *= mix(0.45, 1.0, v);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class GlassGL extends ScreenGL {
  focus = 1;
  drift = 0;
  private wipeCtx: CanvasRenderingContext2D;
  private wipeTex: THREE.CanvasTexture;
  private lastWipe = { x: -1, y: -1 };

  constructor(canvas: HTMLCanvasElement, stage: Stage, url: string) {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 90;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 160, 90);
    const wipeTex = new THREE.CanvasTexture(c);
    super(canvas, stage, FRAG, {
      uImg: { value: null },
      uWipe: { value: wipeTex },
      uFocus: { value: 1 },
      uDrift: { value: 0 },
      uImgSize: { value: new THREE.Vector2(1920, 1072) },
    });
    this.wipeCtx = ctx;
    this.wipeTex = wipeTex;
    this.pending.push(loadTexture(url).then((t) => {
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      this.material.uniforms.uImg.value = t;
    }));
    this.host = canvas.closest<HTMLElement>('.stage')!;
    this.host.addEventListener('pointermove', this.onMove);
  }

  private host: HTMLElement;
  private onMove = (e: PointerEvent) => this.wipe(e);

  override dispose() {
    this.host.removeEventListener('pointermove', this.onMove);
    super.dispose();
  }

  private wipe(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 160, y = (1 - (e.clientY - r.top) / r.height) * 90;
    const ctx = this.wipeCtx;
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(this.lastWipe.x < 0 ? x : this.lastWipe.x, this.lastWipe.y < 0 ? y : this.lastWipe.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    this.lastWipe = { x, y };
    setTimeout(() => { this.lastWipe = { x: -1, y: -1 }; }, 120);
  }

  update(dt: number, time: number) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uFocus.value = this.focus;
    u.uDrift.value = this.drift;
    // the fog re-forms: fade the wipe map back toward black
    const ctx = this.wipeCtx;
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 0.45).toFixed(3)})`;
    ctx.fillRect(0, 0, 160, 90);
    this.wipeTex.needsUpdate = true;
  }
}
