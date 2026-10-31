// 09 · DEFROST. The closing transition. Frost grows in from the edges of the frame the way it does on
// an outdoor coil at a January dawn: feathery ice ferns branching at 60°, with glints. Then the
// reversing valve shifts, hot gas reaches the coil, and the frost melts from the centre out, leaving
// a wet rim and beads of meltwater. The canvas is transparent where it has melted, revealing the copy
// beneath; the lens zooms out as it clears.
import { ScreenGL } from './screen';
import { NOISE_GLSL } from './noise';
import type { Stage } from '../core/scroll';

const FRAG = /* glsl */ `
  uniform vec2 uRes; uniform float uTime; uniform float uGrow; uniform float uMelt; uniform float uZoom;
  varying vec2 vUv;
  ${NOISE_GLSL}
  // thin bright ridges of value noise
  float ridge(vec2 p) { return pow(1.0 - abs(vnoise(p) * 2.0 - 1.0), 6.0); }
  // one family of ice needles: long along x, short along y, with branching secondary needles
  float needles(vec2 p) {
    float a = ridge(vec2(p.x * 1.6, p.y * 9.0));
    float b = ridge(vec2(p.x * 3.4 + 7.1, p.y * 18.0 + 2.3)) * 0.7;
    float c = ridge(vec2(p.x * 7.0 + 3.7, p.y * 34.0 + 9.1)) * 0.45;
    return a + b + c;
  }
  mat2 rot(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }
  void main() {
    vec2 asp = vec2(uRes.x / uRes.y, 1.0);
    vec2 c = (vUv - 0.5) * asp / uZoom;
    // frost advances from the frame edges, ragged
    vec2 e = 0.5 * asp - abs((vUv - 0.5) * asp);
    float edgeDist = min(e.x, e.y);
    float n = fbm(c * 3.0 + 1.7);
    float grow = uGrow * 0.62 * max(asp.x, 1.0);
    float cover = smoothstep(grow + 0.015, grow - 0.05, edgeDist + (n - 0.5) * 0.28) * smoothstep(0.0, 0.06, uGrow);
    // ferns: three needle families at 60°, domain-warped so they curve like real frost
    vec2 w = c * 5.0 + 0.6 * vec2(fbm(c * 2.0), fbm(c * 2.0 + 9.2));
    float f = needles(rot(0.35) * w) + needles(rot(0.35 + 2.094) * w + 4.0) + needles(rot(0.35 + 4.189) * w + 8.0);
    float fern = clamp(f * 0.45, 0.0, 1.0);
    // frost is thickest at the edges, feathery toward its growing front
    float body = smoothstep(0.0, 0.25, grow - edgeDist);
    // thick, nearly opaque ice at the edges; a thin veil of needles toward the middle
    float centre = smoothstep(0.75, 0.0, length(c));
    float thick = cover * clamp(fern * (0.6 + 0.5 * body) + body * 0.3 * (1.0 - centre), 0.0, 1.0) * (1.0 - centre * 0.5);
    // the melt: a hot-gas front from the centre (nothing melts before the valve shifts)
    float rr = length(c) + (fbm(c * 6.0) - 0.5) * 0.12;
    float melting = step(0.001, uMelt);
    float melt = mix(1.0, smoothstep(uMelt - 0.02, uMelt + 0.07, rr), melting);
    float wetRim = smoothstep(0.06, 0.0, abs(rr - uMelt - 0.025)) * melting * cover;
    thick *= melt;
    // meltwater beads just inside the rim
    vec2 g = c * 26.0;
    vec2 id = floor(g);
    vec2 h = hash22(id);
    float bead = smoothstep(0.32, 0.18, length(fract(g) - 0.5 - (h - 0.5) * 0.5)) * step(0.72, h.x);
    float wetZone = smoothstep(uMelt - 0.18, uMelt - 0.02, rr) * (1.0 - melt) * melting * cover;
    vec3 ice = mix(vec3(0.5, 0.63, 0.74), vec3(0.93, 0.97, 1.0), fern);
    float glint = step(0.994, hash12(floor(c * 420.0))) * (0.5 + 0.5 * sin(uTime * 4.0 + hash12(floor(c * 420.0)) * 40.0)) * cover * melt;
    vec3 col = ice + glint * 1.5;
    float alpha = clamp(thick * 0.95, 0.0, 1.0);
    col = mix(col, vec3(0.8, 0.92, 1.0), wetRim * 0.7);
    alpha = max(alpha, wetRim * 0.45);
    alpha = max(alpha, bead * wetZone * 0.55);
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

export class FrostGL extends ScreenGL {
  grow = 0;
  melt = 0;
  zoom = 1.4;
  constructor(canvas: HTMLCanvasElement, stage: Stage) {
    super(canvas, stage, FRAG, { uGrow: { value: 0 }, uMelt: { value: 0 }, uZoom: { value: 1.4 } }, true);
    this.material.premultipliedAlpha = true;
  }
  update(_dt: number, time: number) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uGrow.value = this.grow;
    u.uMelt.value = this.melt;
    u.uZoom.value = this.zoom;
  }
}
