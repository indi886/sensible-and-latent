// Shared GLSL helpers: hash, value noise, fbm, and the thermal "ironbow" palette.
export const NOISE_GLSL = /* glsl */ `
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; }
    return s;
  }
`;

export const IRONBOW_GLSL = /* glsl */ `
  // ironbow: violet-black → magenta → orange → yellow → white
  vec3 ironbow(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.02, 0.01, 0.08);
    vec3 c1 = vec3(0.17, 0.04, 0.33);
    vec3 c2 = vec3(0.55, 0.07, 0.48);
    vec3 c3 = vec3(0.90, 0.29, 0.18);
    vec3 c4 = vec3(0.99, 0.66, 0.10);
    vec3 c5 = vec3(1.00, 0.95, 0.72);
    if (t < 0.2) return mix(c0, c1, t / 0.2);
    if (t < 0.42) return mix(c1, c2, (t - 0.2) / 0.22);
    if (t < 0.64) return mix(c2, c3, (t - 0.42) / 0.22);
    if (t < 0.84) return mix(c3, c4, (t - 0.64) / 0.2);
    return mix(c4, c5, (t - 0.84) / 0.16);
  }
`;
