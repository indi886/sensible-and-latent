// 03 · IR SURVEY. Each service is a photograph seen through a technician's thermal imager. Outside
// the lens the scene is the plain visible image, dimmed. Inside it (the pointer is the imager) it is
// false-coloured on the ironbow scale, read off the image's own luminance and a heat bias. Services
// change with a whip pan: a fast lateral move with directional motion blur.
import * as THREE from 'three';
import { ScreenGL } from './screen';
import { loadTexture } from './stage';
import { NOISE_GLSL, IRONBOW_GLSL } from './noise';
import type { Stage } from '../core/scroll';

const FRAG = /* glsl */ `
  uniform sampler2D uA; uniform sampler2D uB;
  uniform vec2 uRes; uniform float uTime; uniform float uMix; uniform vec2 uLens; uniform float uRadius;
  uniform vec2 uSize; uniform float uHeatA; uniform float uHeatB;
  varying vec2 vUv;
  ${NOISE_GLSL}
  ${IRONBOW_GLSL}
  vec2 cover(vec2 uv) {
    float ra = uRes.x / uRes.y, ia = uSize.x / uSize.y;
    vec2 s = ra > ia ? vec2(1.0, ia / ra) : vec2(ra / ia, 1.0);
    return (uv - 0.5) * s + 0.5;
  }
  vec3 whip(sampler2D t, vec2 uv, float blur) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float o = (float(i) / 11.0 - 0.5) * blur;
      acc += texture2D(t, uv + vec2(o, 0.0)).rgb;
    }
    return acc / 12.0;
  }
  float heatOf(vec3 c, vec2 uv, float bias) {
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    float warm = clamp(c.r - c.b, -0.3, 0.6);
    return smoothstep(0.04, 0.78, l * 0.95 + warm * 0.55 + bias + (fbm(uv * 5.0) - 0.5) * 0.14);
  }
  void main() {
    vec2 uv = vUv;
    // whip pan: A exits left, B enters from the right, blurred along the move
    float m = uMix;
    float blur = sin(m * 3.14159) * 0.22;
    vec2 ua = cover(uv + vec2(m * 1.15, 0.0));
    vec2 ub = cover(uv - vec2((1.0 - m) * 1.15, 0.0));
    vec3 ca = whip(uA, ua, blur);
    vec3 cb = whip(uB, ub, blur);
    vec3 vis = m < 0.001 ? ca : (m > 0.999 ? cb : mix(ca, cb, smoothstep(0.42, 0.58, m)));
    float bias = mix(uHeatA, uHeatB, smoothstep(0.42, 0.58, m));
    vec2 suv = m < 0.5 ? ua : ub;

    // the imager's lens
    vec2 p = (uv - uLens) * vec2(uRes.x / uRes.y, 1.0);
    float r = length(p);
    float lens = smoothstep(uRadius, uRadius - 0.004, r);
    // barrel distortion and a coarser sensor inside the lens
    vec2 luv = uv + (uv - uLens) * (r * r) * 1.2;
    vec2 cell = vec2(uRes.x / uRes.y, 1.0) * 210.0;
    vec2 q = (floor(luv * cell) + 0.5) / cell;
    vec3 ci = m < 0.5 ? whip(uA, cover(q + vec2(m * 1.15, 0.0)), blur) : whip(uB, cover(q - vec2((1.0 - m) * 1.15, 0.0)), blur);
    float heat = heatOf(ci, suv, bias);
    vec3 ir = ironbow(heat);
    // scan noise and a faint hot-spot crosshair
    ir *= 0.94 + 0.06 * hash12(floor(q * 400.0) + floor(uTime * 24.0));
    float ring = smoothstep(0.004, 0.0, abs(r - uRadius)) * 0.9;
    float ticks = (smoothstep(0.0025, 0.0, abs(p.x)) + smoothstep(0.0025, 0.0, abs(p.y))) * step(uRadius * 0.82, r) * step(r, uRadius);

    vec3 outside = mix(vis, vec3(dot(vis, vec3(0.299, 0.587, 0.114))), 0.35) * 0.62 + vec3(0.015, 0.008, 0.03);
    // outside the lens, a faint false-colour wash keeps the IR world present
    outside = mix(outside, ironbow(heatOf(vis, suv, bias)) * 0.4, 0.16);
    vec3 col = mix(outside, ir, lens);
    col += vec3(1.0, 0.85, 0.7) * (ring + ticks) * 0.7;
    float v = smoothstep(1.25, 0.3, length((uv - 0.5) * vec2(1.3, 1.0)));
    col *= mix(0.55, 1.0, v);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class ImagerGL extends ScreenGL {
  /** service position 0…n-1 (fractional during a whip) */
  S = 0;
  lensPos = new THREE.Vector2(0.62, 0.5);
  private tex: THREE.Texture[] = [];
  /** per-service heat bias: the discharge line runs hot, the return air is mild */
  private bias = [0.12, -0.02, 0.18, -0.08, 0.02];
  /** small CPU copies of each image for the spot-temperature readout */
  private probes: Array<{ data: Uint8ClampedArray; w: number; h: number }> = [];

  constructor(canvas: HTMLCanvasElement, stage: Stage, urls: string[]) {
    super(canvas, stage, FRAG, {
      uA: { value: null }, uB: { value: null }, uMix: { value: 0 }, uLens: { value: new THREE.Vector2(0.62, 0.5) },
      uRadius: { value: 0.2 }, uSize: { value: new THREE.Vector2(1920, 1072) }, uHeatA: { value: 0 }, uHeatB: { value: 0 },
    });
    urls.forEach((u, i) => {
      this.pending.push(loadTexture(u).then((t) => {
        this.tex[i] = t;
        const img = t.image as HTMLImageElement;
        const c = document.createElement('canvas');
        c.width = 96; c.height = 54;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, 96, 54);
        this.probes[i] = { data: ctx.getImageData(0, 0, 96, 54).data, w: 96, h: 54 };
      }));
    });
  }

  /** the luminance-derived heat (0–1) at a screen point, matching the shader */
  heatAt(x: number, y: number) {
    const i = Math.round(this.S);
    const pr = this.probes[i];
    if (!pr) return 0.5;
    const px = Math.min(pr.w - 1, Math.max(0, Math.floor(x * pr.w)));
    const py = Math.min(pr.h - 1, Math.max(0, Math.floor((1 - y) * pr.h)));
    const o = (py * pr.w + px) * 4;
    const r = pr.data[o] / 255, g = pr.data[o + 1] / 255, b = pr.data[o + 2] / 255;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const v = l * 0.95 + Math.min(0.6, Math.max(-0.3, r - b)) * 0.55 + this.bias[i];
    const t = Math.min(1, Math.max(0, (v - 0.04) / 0.74));
    return t * t * (3 - 2 * t);
  }

  update(_dt: number, time: number) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    const n = this.tex.length;
    const a = Math.min(n - 1, Math.floor(this.S));
    const b = Math.min(n - 1, a + 1);
    u.uA.value = this.tex[a];
    u.uB.value = this.tex[b];
    u.uMix.value = this.S - a;
    u.uHeatA.value = this.bias[a];
    u.uHeatB.value = this.bias[b];
    (u.uLens.value as THREE.Vector2).copy(this.lensPos);
    u.uRadius.value = this.width < 700 ? 0.26 : 0.21;
  }
}
