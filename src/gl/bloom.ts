// A light bloom for integrated GPUs: bright-pass to quarter resolution, separable 9-tap blur at
// 1/4 and 1/8, added back over the HDR frame. Three programs in total (UnrealBloomPass compiles
// eight, synchronously, on first render), and far fewer full-resolution passes.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class LiteBloom extends Pass {
  strength: number;
  threshold: number;
  radius: number;
  private a: THREE.WebGLRenderTarget;
  private b: THREE.WebGLRenderTarget;
  private c: THREE.WebGLRenderTarget;
  private d: THREE.WebGLRenderTarget;
  private bright: THREE.ShaderMaterial;
  private blur: THREE.ShaderMaterial;
  private comp: THREE.ShaderMaterial;
  private quad = new FullScreenQuad();

  constructor(strength: number, radius: number, threshold: number) {
    super();
    this.strength = strength;
    this.threshold = threshold;
    this.radius = radius;
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.a = rt(); this.b = rt(); this.c = rt(); this.d = rt();
    this.bright = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: threshold }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: VERT,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uThreshold; uniform vec2 uTexel; varying vec2 vUv;
        void main(){
          // 4-tap box downsample, then a soft knee above the threshold
          vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(1.0, -1.0)).rgb
                 + texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(1.0, 1.0)).rgb;
          c *= 0.25;
          float l = max(c.r, max(c.g, c.b));
          float k = smoothstep(uThreshold, uThreshold + 0.35, l);
          gl_FragColor = vec4(min(c * k, vec3(24.0)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: VERT,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
        void main(){
          vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270;
          s += (texture2D(tDiffuse, vUv + uDir * 1.385).rgb + texture2D(tDiffuse, vUv - uDir * 1.385).rgb) * 0.3162;
          s += (texture2D(tDiffuse, vUv + uDir * 3.231).rgb + texture2D(tDiffuse, vUv - uDir * 3.231).rgb) * 0.0703;
          gl_FragColor = vec4(s, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.comp = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tA: { value: null }, tB: { value: null }, uStrength: { value: strength } },
      vertexShader: VERT,
      fragmentShader: `uniform sampler2D tDiffuse, tA, tB; uniform float uStrength; varying vec2 vUv;
        void main(){
          vec4 base = texture2D(tDiffuse, vUv);
          vec3 glow = texture2D(tA, vUv).rgb * 0.6 + texture2D(tB, vUv).rgb * 0.9;
          gl_FragColor = vec4(base.rgb + glow * uStrength, base.a);
        }`,
      depthTest: false, depthWrite: false,
    });
  }

  override setSize(w: number, h: number) {
    const w4 = Math.max(1, Math.round(w / 4)), h4 = Math.max(1, Math.round(h / 4));
    const w8 = Math.max(1, Math.round(w / 8)), h8 = Math.max(1, Math.round(h / 8));
    this.a.setSize(w4, h4); this.b.setSize(w4, h4);
    this.c.setSize(w8, h8); this.d.setSize(w8, h8);
    (this.bright.uniforms.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
  }

  private pass(renderer: THREE.WebGLRenderer, mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const u = this.blur.uniforms;
    this.bright.uniforms.tDiffuse.value = readBuffer.texture;
    this.bright.uniforms.uThreshold.value = this.threshold;
    this.pass(renderer, this.bright, this.a);
    const r = this.radius * 1.6;
    u.tDiffuse.value = this.a.texture; (u.uDir.value as THREE.Vector2).set(r / this.a.width, 0); this.pass(renderer, this.blur, this.b);
    u.tDiffuse.value = this.b.texture; (u.uDir.value as THREE.Vector2).set(0, r / this.a.height); this.pass(renderer, this.blur, this.a);
    u.tDiffuse.value = this.a.texture; (u.uDir.value as THREE.Vector2).set(r / this.c.width, 0); this.pass(renderer, this.blur, this.d);
    u.tDiffuse.value = this.d.texture; (u.uDir.value as THREE.Vector2).set(0, r / this.c.height); this.pass(renderer, this.blur, this.c);
    this.comp.uniforms.tDiffuse.value = readBuffer.texture;
    this.comp.uniforms.tA.value = this.a.texture;
    this.comp.uniforms.tB.value = this.c.texture;
    this.comp.uniforms.uStrength.value = this.strength;
    this.pass(renderer, this.comp, this.renderToScreen ? null : writeBuffer);
  }

  override dispose() {
    for (const t of [this.a, this.b, this.c, this.d]) t.dispose();
    this.bright.dispose(); this.blur.dispose(); this.comp.dispose();
    this.quad.dispose();
  }
}
