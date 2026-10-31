// GPU build animation shared by the install take. Every piece is an instance with its own start
// time, duration, fly-in offset and (optional) exit time, all driven by one uniform: uBuild.
// The same vertex patch goes on the shadow-depth material, so shadows build with the pieces.
import * as THREE from 'three';

export type Piece = {
  /** world transform of the finished piece */
  matrix: THREE.Matrix4;
  start: number;
  dur: number;
  /** world-space offset the piece flies in from (it overshoots on arrival) */
  from: THREE.Vector3;
  /** build value at which the piece leaves again (2 = never) */
  out?: number;
  color?: THREE.Color;
};

export type BuildUniforms = { uBuild: { value: number }; uTime: { value: number } };

const VERT_HEAD = /* glsl */ `
  attribute float aStart;
  attribute float aDur;
  attribute vec3 aFrom;
  attribute float aOut;
  uniform float uBuild;
  varying float vHot;
  varying float vK;
  float bEaseOutBack(float t) { float s = 1.9; t -= 1.0; return 1.0 + (s + 1.0) * t * t * t + s * t * t; }
`;
const VERT_BODY = /* glsl */ `
  float bk = clamp((uBuild - aStart) / aDur, 0.0, 1.0);
  float bo = clamp((uBuild - aOut) / 0.025, 0.0, 1.0);
  float be = bEaseOutBack(bk);
  float bs = smoothstep(0.0, 0.2, bk) * (1.0 - bo);
  transformed = transformed * max(bs, 0.0001) + aFrom * (1.0 - be);
  vK = bk;
  vHot = (1.0 - smoothstep(0.35, 1.0, bk)) * step(0.0001, bk);
`;

/** Patch a lit material (and return its matching depth material) for per-instance building. */
export function buildMaterial<T extends THREE.MeshStandardMaterial>(mat: T, u: BuildUniforms, hot = new THREE.Color(1.0, 0.45, 0.12), extraFrag = '') {
  const hotU = { value: hot };
  // identical closures would otherwise share one cached program across different patches
  mat.customProgramCacheKey = () => `build-${extraFrag}`;
  mat.onBeforeCompile = (s) => {
    s.uniforms.uBuild = u.uBuild;
    s.uniforms.uTime = u.uTime;
    s.uniforms.uHot = hotU;
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n${VERT_HEAD}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHot; uniform float uTime; varying float vHot; varying float vK;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += uHot * vHot * vHot * 3.2;\n${extraFrag}`);
  };
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (s) => {
    s.uniforms.uBuild = u.uBuild;
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n${VERT_HEAD}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
  };
  return depth;
}

/** Create an InstancedMesh whose instances assemble themselves from `pieces`. */
export function buildMesh(geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, depth: THREE.Material, pieces: Piece[]) {
  const n = pieces.length;
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const aStart = new Float32Array(n), aDur = new Float32Array(n), aOut = new Float32Array(n), aFrom = new Float32Array(n * 3);
  const inv = new THREE.Matrix3();
  const local = new THREE.Vector3();
  pieces.forEach((p, i) => {
    mesh.setMatrixAt(i, p.matrix);
    if (p.color) mesh.setColorAt(i, p.color);
    aStart[i] = p.start;
    aDur[i] = p.dur;
    aOut[i] = p.out ?? 2;
    // the offset is applied in instance space, so take it back through the rotation/scale
    inv.setFromMatrix4(p.matrix).invert();
    local.copy(p.from).applyMatrix3(inv);
    aFrom.set([local.x, local.y, local.z], i * 3);
  });
  const g = geo.clone();
  g.setAttribute('aStart', new THREE.InstancedBufferAttribute(aStart, 1));
  g.setAttribute('aDur', new THREE.InstancedBufferAttribute(aDur, 1));
  g.setAttribute('aOut', new THREE.InstancedBufferAttribute(aOut, 1));
  g.setAttribute('aFrom', new THREE.InstancedBufferAttribute(aFrom, 3));
  mesh.geometry = g;
  geo.dispose();
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** Matrix for a box stretched between two points (used for ducts, hangers, straps). */
export function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, up = new THREE.Vector3(0, 1, 0)) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  const x = dir;
  let z = new THREE.Vector3().crossVectors(x, up);
  if (z.lengthSq() < 1e-6) z = new THREE.Vector3().crossVectors(x, new THREE.Vector3(1, 0, 0));
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x.multiplyScalar(len), y.multiplyScalar(h), z.multiplyScalar(w));
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  return m;
}
