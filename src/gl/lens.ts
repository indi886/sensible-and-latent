// Final pass for the 3D takes: vignette, a horizontal anamorphic streak pulled from the brightest
// pixels, and a hint of lateral chromatic aberration toward the edges. Grain is added in the DOM.
export const LensShader = {
  name: 'LensShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1.6 },
    uVignette: { value: 0.9 },
    uFlare: { value: 0.25 },
    uAberration: { value: 0.0025 },
    uFlareTint: { value: [0.55, 0.78, 1.0] },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uVignette, uFlare, uAberration;
    uniform vec3 uFlareTint;
    varying vec2 vUv;
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
      vec2 off = c * uAberration * (0.4 + r2 * 2.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      // anamorphic streak: sample the row, keep only what is already near white
      vec3 streak = vec3(0.0);
      if (uFlare > 0.0) {
        for (int i = 1; i <= 10; i++) {
          float fi = float(i);
          float dx = fi * fi * 0.0016;
          vec3 a = texture2D(tDiffuse, vUv + vec2(dx, 0.0)).rgb;
          vec3 b = texture2D(tDiffuse, vUv - vec2(dx, 0.0)).rgb;
          float w = exp(-fi * 0.32);
          streak += (max(luma(a) - 0.82, 0.0) + max(luma(b) - 0.82, 0.0)) * w;
        }
        col += streak * uFlare * uFlareTint;
      }
      float vig = smoothstep(1.25, 0.18, r2 * 2.2);
      col *= mix(1.0, vig, uVignette);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
