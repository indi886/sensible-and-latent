// Full-screen shader takes (glass, imager, frost) share this: an orthographic camera and one quad.
import * as THREE from 'three';
import { GLStage } from './stage';
import type { Stage } from '../core/scroll';

export abstract class ScreenGL extends GLStage {
  material: THREE.ShaderMaterial;
  constructor(canvas: HTMLCanvasElement, stage: Stage, fragmentShader: string, uniforms: Record<string, THREE.IUniform>, alpha = false) {
    super(canvas, stage, { post: false, alpha });
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, ...uniforms },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader,
      transparent: alpha,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }
  protected override onResize(w: number, h: number) {
    (this.material.uniforms.uRes.value as THREE.Vector2).set(w, h);
  }
}
