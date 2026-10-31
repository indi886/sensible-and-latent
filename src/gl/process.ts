// 04 · THE INSTALL. One Tucson ranch house, already standing as a glass ghost; the systems go into
// it. Survey (thermal heat gain) → design ghost → ductwork hung piece by piece → condenser craned onto
// its pad and the air handler set → line set brazed under nitrogen → pressure test & vacuum →
// charge & start → air on, as noon turns to dusk and the rooms light up. One progress value drives it.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLStage, fitFov } from './stage';
import { buildMaterial, buildMesh, beam, type Piece } from './build';
import { NOISE_GLSL, IRONBOW_GLSL } from './noise';
import type { Stage } from '../core/scroll';
import { clamp, invLerp, lerp, smoother, easeOutBack, mulberry32, range } from '../core/math';
import { isNarrow } from '../core/env';

/** stage boundaries on the build value P */
export const STAGES = [0, 0.11, 0.21, 0.42, 0.52, 0.63, 0.73, 0.84, 1.0];
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const FLOOR = 0.15, CEIL = 2.85, TRUNK_Y = 3.14, TRUNK_Z = 1.25;
const CONDENSER = V(8.75, 0, 2.4);
const AHU = V(0.0, 0, TRUNK_Z);
const REGISTERS = [V(-5.0, CEIL, -2.3), V(-2.2, CEIL, -2.4), V(1.6, CEIL, -2.4), V(5.3, CEIL, -2.4), V(-5.1, CEIL, 3.2), V(-1.4, CEIL, 3.3), V(1.5, CEIL, 3.4), V(4.8, CEIL, 3.2)];
const RETURN = V(-1.1, CEIL, TRUNK_Z);

export type Callout = { stage: number; pos: THREE.Vector3; title: string; detail: string };
export const CALLOUTS: Callout[] = [
  { stage: 0, pos: V(-3.5, 1.6, 4.5), title: 'Manual J · room by room', detail: '29,600 BTU/h · 6,100 latent · 104 °F DB' },
  { stage: 0, pos: V(1.5, 4.0, -1.0), title: 'Roof deck 162 °F at 3 pm', detail: 'attic air 141 °F · R-30 batts' },
  { stage: 1, pos: V(-3.2, TRUNK_Y, TRUNK_Z), title: 'Manual D · 18 × 10 in trunk', detail: '8 branches · 960 CFM design' },
  { stage: 1, pos: V(8.75, 1.0, 2.4), title: 'Manual S · 2.5 tons', detail: 'variable speed · SEER2 17.4' },
  { stage: 2, pos: V(3.6, TRUNK_Y + 0.1, TRUNK_Z), title: 'Sheet-metal trunk, R-8', detail: 'mastic on every seam · 3.1 CFM25' },
  { stage: 2, pos: V(-5.0, CEIL, -2.3), title: 'Boot + register 10 × 6 in', detail: '112 CFM to the living room' },
  { stage: 3, pos: V(8.75, 1.15, 2.4), title: 'Heat pump · R-454B', detail: 'pad 36 × 36 in · 18 in clearance' },
  { stage: 3, pos: V(0.0, 1.7, TRUNK_Z), title: 'Air handler · hall closet', detail: 'A2L leak sensor fitted' },
  { stage: 4, pos: V(7.22, 1.7, 2.55), title: '3/8 × 3/4 in line set · 28 ft', detail: '6 joints · 15% silver · N₂ 3 SCFH' },
  { stage: 5, pos: V(9.7, 0.85, 3.25), title: 'Standing test 450 psig · 30 min', detail: 'vacuum 380 µ · decay held 470 µ' },
  { stage: 6, pos: V(8.75, 1.25, 2.4), title: 'Charge +8 oz for 28 ft', detail: 'subcooling 9 °F · superheat 10 °F' },
  { stage: 7, pos: V(-1.4, CEIL, 3.3), title: 'Supply 54.8 °F · return 75.1 °F', detail: 'ΔT 20.3 °F · TESP 0.48 in. w.c.' },
  { stage: 7, pos: V(4.8, 1.5, 3.2), title: 'Room-to-room spread 1 °F', detail: 'commissioning report handed over' },
];

/**
 * Bakes a group of static meshes into one draw call per material (lines per line material). Meshes
 * flagged userData.vc share one vertex-coloured material, so furniture and floor finishes in many
 * colours become a single mesh. The section model drops from ~90 draw calls (x2 with shadows) to 6.
 */
function mergeStatic(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; line: boolean; cast: boolean; receive: boolean }>();
  const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 });
  for (const child of group.children) {
    const obj = child as THREE.Mesh | THREE.LineSegments;
    const src = obj.material as THREE.Material;
    const mat = obj.userData.vc ? vcMat : src;
    const g = obj.geometry.clone().applyMatrix4(obj.matrixWorld);
    if (obj.userData.vc) {
      const c = (src as THREE.MeshStandardMaterial).color;
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      src.dispose();
    }
    const b = buckets.get(mat) ?? { geos: [], line: obj instanceof THREE.LineSegments, cast: false, receive: false };
    b.geos.push(g);
    b.cast ||= (obj as THREE.Mesh).castShadow;
    b.receive ||= (obj as THREE.Mesh).receiveShadow;
    buckets.set(mat, b);
    obj.geometry.dispose();
  }
  const out = new THREE.Group();
  for (const [mat, b] of buckets) {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const o = b.line ? new THREE.LineSegments(merged, mat) : new THREE.Mesh(merged, mat);
    o.castShadow = b.cast;
    o.receiveShadow = b.receive;
    out.add(o);
  }
  return out;
}

/** brazed joints along the line set (path parameter) */
const JOINTS = [0.04, 0.17, 0.33, 0.52, 0.78, 0.96];

export class ProcessGL extends GLStage {
  P = 0;
  u = {
    uBuild: { value: 0 },
    uTime: { value: 0 },
    uDusk: { value: 0 },
    uThermal: { value: 0 },
    uCooled: { value: 0 },
    uGhost: { value: 0 },
    uBraze: { value: 0 },
    uInsul: { value: 0 },
    uCharge: { value: 0 },
    uRun: { value: 0 },
    uAir: { value: 0 },
    uLights: { value: 0 },
    uPressure: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.3, 0.9, 0.3) },
  };
  jolt = 0;
  pointer = new THREE.Vector2();
  ductEnds: number[] = [];
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private roomLights: THREE.PointLight[] = [];
  private condenser = new THREE.Group();
  private pad!: THREE.Mesh;
  private fan = new THREE.Group();
  private ahu = new THREE.Group();
  private manifold = new THREE.Group();
  private needleLo!: THREE.Object3D;
  private needleHi!: THREE.Object3D;
  private lineCurve!: THREE.CatmullRomCurve3;
  private sparks!: THREE.Points;
  private sparkData: Float32Array;
  private sparkCount = 90;
  private camPath: THREE.CatmullRomCurve3;
  private camLook: THREE.CatmullRomCurve3;
  private landed = { condenser: false, ahu: false, start: false };
  private fanAngle = 0;
  private baseFov = 36;
  private fog: THREE.Fog;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, stage: Stage) {
    super(canvas, stage, { shadows: true, bloom: { strength: 0.65, radius: 0.5, threshold: 0.92 }, lens: { vignette: 0.6, flare: 0.2, aberration: 0.002 }, exposure: 0.85 });
    const cam = this.camera as THREE.PerspectiveCamera;
    cam.near = 0.1;
    cam.far = 400;
    // image-based fill so the galvanised ducts and copper have something to reflect
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();
    this.fog = new THREE.Fog(0xcfdde6, 45, 150);
    this.scene.fog = this.fog;

    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
    this.sun.castShadow = true;
    const sm = isNarrow() ? 1024 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    Object.assign(this.sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 80 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd6ea, 0x8a6a4c, 0.9);
    this.scene.add(this.hemi);
    for (const p of [V(-4.2, 2.2, -2.2), V(2.2, 2.2, -2.2), V(-3.0, 2.2, 3.0), V(3.8, 2.2, 3.0)]) {
      const l = new THREE.PointLight(0xffb070, 0, 9, 1.6);
      l.position.copy(p);
      this.roomLights.push(l);
      this.scene.add(l);
    }

    this.buildSky();
    this.buildGround();
    this.buildHouse();
    this.buildSurvey();
    this.buildDucts();
    this.buildEquipment();
    this.buildLineSet();
    this.buildAir();
    this.sparkData = new Float32Array(this.sparkCount * 7);
    this.buildSparks();

    // the walkaround: one Catmull-Rom path through eight set-ups, never through the house
    this.camPath = new THREE.CatmullRomCurve3([
      V(-15, 12.5, 17), V(-5, 17, 10.8), V(5.5, 7.4, 10.8), V(15.2, 4.6, 9.6), V(14.2, 3.9, 8.0), V(12.6, 2.4, 6.6), V(15.5, 6.6, 13.5), V(2.5, 3.1, 17.5),
    ], false, 'centripetal');
    this.camLook = new THREE.CatmullRomCurve3([
      V(0, 1.4, 0), V(0, 2.2, 0.6), V(0.6, 3.0, 0.8), V(6.8, 1.1, 2.0), V(6.2, 2.0, 2.2), V(8.8, 0.7, 2.8), V(4.0, 1.6, 0.8), V(0, 1.7, 0),
    ], false, 'centripetal');
    this.setupPost();
  }

  // ───────────────────────── world ─────────────────────────
  private buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uDusk: this.u.uDusk, uSunDir: this.u.uSunDir, uTime: this.u.uTime },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uDusk; uniform vec3 uSunDir; uniform float uTime; varying vec3 vDir;
        ${NOISE_GLSL}
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 zen = mix(vec3(0.10, 0.33, 0.70), vec3(0.02, 0.035, 0.1), uDusk);
          vec3 hor = mix(vec3(0.72, 0.82, 0.88), vec3(0.82, 0.32, 0.13), uDusk);
          // at dusk the colour band hugs the horizon and the sky above goes to deep blue fast
          vec3 col = mix(hor, zen, pow(smoothstep(-0.02, mix(0.55, 0.22, uDusk), h), mix(0.55, 0.8, uDusk)));
          col = mix(col, vec3(0.42, 0.2, 0.42), uDusk * smoothstep(0.3, 0.08, h) * smoothstep(-0.02, 0.12, h) * 0.32);
          float s = max(dot(d, normalize(uSunDir)), 0.0);
          col += vec3(1.0, 0.78, 0.5) * pow(s, 200.0) * 6.0 + vec3(1.0, 0.55, 0.25) * pow(s, 8.0) * (0.15 + 0.6 * uDusk);
          float az = atan(d.z, d.x);
          float m = 0.03 + 0.045 * fbm(vec2(az * 2.6, 1.3)) + 0.022 * fbm(vec2(az * 9.0, 4.1));
          float mount = smoothstep(m + 0.003, m - 0.003, h);
          vec3 mc = mix(vec3(0.46, 0.50, 0.60), vec3(0.15, 0.10, 0.20), uDusk);
          col = mix(col, mc * (0.85 + 0.15 * fbm(vec2(az * 30.0, h * 40.0))), mount);
          // cirrus streaks: white at noon, lit from below in pinks and oranges at dusk
          if (h > 0.0) {
            vec2 sp = d.xz / (h + 0.08);
            float cl = fbm(vec2(sp.x * 0.32 + uTime * 0.004, sp.y * 1.5 + 3.0));
            cl = smoothstep(0.5, 0.78, cl) * smoothstep(0.0, 0.07, h) * (1.0 - smoothstep(0.3, 0.65, h));
            vec3 cc = mix(vec3(1.0, 0.98, 0.95), mix(vec3(1.0, 0.5, 0.26), vec3(0.85, 0.32, 0.5), smoothstep(0.02, 0.22, h)), uDusk);
            float lit = 0.7 + 0.6 * pow(s, 3.0);
            col = mix(col, cc * lit * mix(0.95, 0.75, uDusk), cl * mix(0.5, 0.75, uDusk));
          }
          float stars = step(0.9975, hash12(floor(d.xz / max(0.2, h) * 260.0))) * smoothstep(0.15, 0.5, h) * pow(uDusk, 4.0);
          col += stars * 0.9;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(180, 48, 24), mat));
  }

  private buildGround() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xa47b55, roughness: 1, metalness: 0 });
    mat.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vW;\n${NOISE_GLSL}`)
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat gn = fbm(vW.xz * 0.35) * 0.6 + vnoise(vW.xz * 6.0) * 0.4;\ndiffuseColor.rgb *= mix(0.78, 1.08, gn);');
    };
    const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // gravel and desert stones (static, instanced)
    const rnd = mulberry32(11);
    const n = isNarrow() ? 1200 : 2600;
    const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshStandardMaterial({ roughness: 0.95 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = 8 + Math.pow(rnd(), 0.7) * 22;
      const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r;
      if (Math.abs(x - CONDENSER.x) < 1.6 && Math.abs(z - CONDENSER.z) < 1.6) continue;
      const sc = 0.4 + rnd() * 1.6;
      q.setFromEuler(e.set(rnd() * 3, rnd() * 3, rnd() * 3));
      m.compose(V(x, 0.02 * sc, z), q, V(sc, sc * 0.6, sc));
      stones.setMatrixAt(i, m);
      stones.setColorAt(i, c.setHSL(0.07 + rnd() * 0.04, 0.2 + rnd() * 0.2, 0.32 + rnd() * 0.28));
    }
    stones.receiveShadow = true;
    this.scene.add(stones);

    // saguaros
    const cactus = new THREE.MeshStandardMaterial({ color: 0x4b6845, roughness: 0.75 });
    const add = (x: number, z: number, h: number, arms: number) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, h, 6, 12), cactus);
      trunk.position.y = h / 2 + 0.2;
      g.add(trunk);
      for (let i = 0; i < arms; i++) {
        const side = i % 2 ? 1 : -1, ay = h * (0.45 + 0.15 * i);
        const out = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.45, 4, 10), cactus);
        out.rotation.z = Math.PI / 2;
        out.position.set(side * 0.42, ay, 0);
        const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, h * 0.32, 4, 10), cactus);
        up.position.set(side * 0.68, ay + h * 0.18, 0);
        g.add(out, up);
      }
      g.position.set(x, 0, z);
      g.rotation.y = x * 1.3;
      g.traverse((o) => { o.castShadow = true; });
      this.scene.add(g);
    };
    add(-12, 7, 4.2, 2); add(14.5, -8, 5.0, 2); add(-17, -10, 3.6, 1); add(-9.5, -13, 4.6, 2); add(20, 3, 4.0, 1); add(-21, 2, 5.2, 2); add(6, -15, 3.8, 1);
  }

  private ghostMaterial(alpha: number, roof = false) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uThermal: this.u.uThermal, uCooled: this.u.uCooled, uDusk: this.u.uDusk, uSunDir: this.u.uSunDir, uTime: this.u.uTime, uAlpha: { value: alpha }, uRoof: { value: roof ? 1 : 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vW; varying vec3 vV;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uThermal, uCooled, uDusk, uTime, uAlpha, uRoof; uniform vec3 uSunDir; varying vec3 vN; varying vec3 vW; varying vec3 vV;
        ${NOISE_GLSL}
        ${IRONBOW_GLSL}
        void main(){
          vec3 n = normalize(vN); vec3 v = normalize(vV);
          float fres = pow(1.0 - abs(dot(n, v)), 2.2);
          vec3 ghost = mix(vec3(0.58, 0.68, 0.74), vec3(0.35, 0.55, 0.8), uDusk);
          float a = uAlpha + fres * 0.1;
          float heat = 0.34 + 0.3 * max(dot(n, normalize(uSunDir)), 0.0) + 0.14 * smoothstep(0.0, 4.0, vW.y) + 0.24 * uRoof + (fbm(vW.xz * 0.9 + vW.y) - 0.5) * 0.18;
          heat -= uCooled * (0.62 - 0.3 * uRoof);
          float roofFade = 1.0 - 0.75 * uRoof * uCooled;
          vec3 th = ironbow(heat);
          vec3 col = mix(ghost, th, uThermal);
          a = mix(a, (0.2 + fres * 0.26) * roofFade, uThermal);
          gl_FragColor = vec4(col, a);
        }`,
    });
  }

  private buildHouse() {
    // slab and interior floor
    const slab = new THREE.Mesh(new THREE.BoxGeometry(14.5, FLOOR, 9.5), new THREE.MeshStandardMaterial({ color: 0xa69f95, roughness: 0.9 }));
    slab.position.y = FLOOR / 2;
    slab.receiveShadow = slab.castShadow = true;
    this.scene.add(slab);

    // the house is an architectural section model: solid stucco walls cut at 1.0 m with a pale
    // section cap, the storey above the cut drawn as a ghost, so the rooms read and the ducts show
    const walls = new THREE.Group();
    const wallMat = this.ghostMaterial(0.02);
    const edges = new THREE.LineBasicMaterial({ color: 0xd9ecf6, transparent: true, opacity: 0.55, depthWrite: false });
    const solid = (color: number) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
      m.customProgramCacheKey = () => 'section-solid';
      m.onBeforeCompile = (s) => {
        Object.assign(s.uniforms, { uThermal: this.u.uThermal, uCooled: this.u.uCooled });
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        s.fragmentShader = s.fragmentShader
          .replace('#include <common>', `#include <common>\nuniform float uThermal, uCooled; varying vec3 vW;\n${NOISE_GLSL}\n${IRONBOW_GLSL}`)
          .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.9 + 0.1 * vnoise(vW.xz * 9.0 + vW.y * 7.0);\ndiffuseColor.rgb *= 1.0 - 0.85 * uThermal;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat sh = 0.46 + 0.22 * smoothstep(0.0, 1.0, vW.y) + (fbm(vW.xz * 0.8 + vW.y) - 0.5) * 0.22 - uCooled * 0.4;\ntotalEmissiveRadiance += ironbow(sh) * uThermal * 0.85;');
      };
      return m;
    };
    const stucco = solid(0xb99a78), plaster = solid(0xcfc6b8);
    const cap = new THREE.MeshBasicMaterial({ color: 0xe6dccd });
    const CUT = 1.0;
    const wall = (x1: number, z1: number, x2: number, z2: number, t = 0.2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ry = -Math.atan2(z2 - z1, x2 - x1);
      const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      const lower = new THREE.Mesh(new THREE.BoxGeometry(len, CUT - FLOOR, t), t > 0.15 ? stucco : plaster);
      lower.position.set(cx, FLOOR + (CUT - FLOOR) / 2, cz);
      lower.rotation.y = ry;
      lower.castShadow = lower.receiveShadow = true;
      const top = new THREE.Mesh(new THREE.BoxGeometry(len + 0.002, 0.014, t + 0.004), cap);
      top.position.set(cx, CUT + 0.007, cz);
      top.rotation.y = ry;
      const g = new THREE.BoxGeometry(len, CEIL - CUT, t);
      const ghost = new THREE.Mesh(g, wallMat);
      ghost.position.set(cx, CUT + (CEIL - CUT) / 2, cz);
      ghost.rotation.y = ry;
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(g), edges);
      line.position.copy(ghost.position);
      line.rotation.copy(ghost.rotation);
      walls.add(lower, top, ghost, line);
    };
    // room finishes and furniture, below the cut, so the plan reads as a lived-in house
    const finish = (x0: number, x1: number, z0: number, z1: number, color: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, FLOOR + 0.004, (z0 + z1) / 2);
      m.receiveShadow = true;
      m.userData.vc = true;
      walls.add(m);
    };
    finish(-7, -0.5, -4.5, 0.6, 0x7a5a41); finish(-0.5, 3.5, -4.5, 0.6, 0xb7afa3); finish(3.5, 7, -4.5, 0.6, 0x86674c);
    finish(-3.2, 7, 0.6, 1.9, 0x957b63); finish(-7, -3.2, 0.6, 4.5, 0x84664b); finish(-3.2, 0.5, 1.9, 4.5, 0x8c6e54);
    finish(0.5, 2.6, 1.9, 4.5, 0xc4c0b8); finish(2.6, 7, 1.9, 4.5, 0x8c6e54);
    const furniture: Array<[number, number, number, number, number, number, number]> = [
      // [x, z, w, h, d, colour, rotY]
      [-4.2, -3.75, 2.6, 0.42, 0.9, 0x5d6670, 0], [-5.95, -2.9, 0.9, 0.42, 1.6, 0x5d6670, 0], [-3.9, -2.3, 2.6, 0.01, 1.9, 0xb98d63, 0],
      [-1.8, -1.5, 1.8, 0.75, 0.9, 0x6b4e36, 0], [1.5, -4.15, 3.2, 0.9, 0.6, 0xc9c2b6, 0], [1.6, -2.2, 1.8, 0.9, 0.9, 0x2d3134, 0],
      [-5.1, 2.75, 1.9, 0.55, 2.1, 0xcfc4b3, 0], [-1.4, 3.35, 1.4, 0.5, 2.0, 0x8fa3ad, 0], [4.8, 3.25, 1.6, 0.5, 2.0, 0xb0876a, 0],
      [-5.1, 3.85, 1.9, 0.9, 0.08, 0x3b3430, 0], [-1.4, 4.38, 1.4, 0.85, 0.08, 0x3b3430, 0], [4.8, 4.38, 1.6, 0.85, 0.08, 0x3b3430, 0],
      [1.55, 4.05, 1.6, 0.55, 0.75, 0xd9dcdc, 0], [5.3, -4.05, 1.4, 0.75, 0.6, 0x4a3b2e, 0], [5.3, -2.6, 2.2, 0.42, 0.9, 0x6f6a5f, 0],
    ];
    for (const [x, z, w, h, d, color, ry] of furniture) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
      f.position.set(x, FLOOR + h / 2 + 0.005, z);
      f.rotation.y = ry;
      f.castShadow = f.receiveShadow = true;
      f.userData.vc = true;
      walls.add(f);
    }
    wall(-7, -4.5, 7, -4.5); wall(-7, 4.5, 7, 4.5); wall(-7, -4.5, -7, 4.5); wall(7, -4.5, 7, 4.5);
    wall(-7, 0.6, 7, 0.6, 0.12); wall(-3.2, 1.9, 6.0, 1.9, 0.12); wall(-3.2, 0.6, -3.2, 4.5, 0.12); wall(0.5, 1.9, 0.5, 4.5, 0.12); wall(2.6, 1.9, 2.6, 4.5, 0.12);
    wall(-0.5, -4.5, -0.5, 0.6, 0.12); wall(3.5, -4.5, 3.5, 0.6, 0.12); wall(-0.35, 0.6, -0.35, 1.9, 0.1); wall(0.35, 0.6, 0.35, 1.9, 0.1);
    this.scene.add(mergeStatic(walls));

    // windows: hot in the thermal survey, lit at dusk
    const winMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uThermal: this.u.uThermal, uLights: this.u.uLights, uDusk: this.u.uDusk, uCooled: this.u.uCooled },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uThermal, uLights, uDusk, uCooled; varying vec2 vUv;
        ${IRONBOW_GLSL}
        void main(){
          vec3 glass = mix(vec3(0.18, 0.28, 0.36), vec3(0.08, 0.10, 0.16), uDusk) + vec3(0.25) * smoothstep(0.6, 1.0, vUv.y + vUv.x * 0.3);
          vec3 lit = mix(vec3(0.85, 0.3, 0.07), vec3(0.95, 0.5, 0.18), vUv.y) * 0.85;
          vec3 col = mix(glass, lit, uLights);
          col = mix(col, ironbow(0.93 - uCooled * 0.3), uThermal);
          float frame = step(0.04, vUv.x) * step(vUv.x, 0.96) * step(0.05, vUv.y) * step(vUv.y, 0.95) * (1.0 - step(0.49, vUv.x) * step(vUv.x, 0.51));
          gl_FragColor = vec4(mix(vec3(0.12), col, frame), mix(0.95, 0.85, frame));
        }`,
      toneMapped: false,
    });
    const win = (x: number, z: number, w: number, h: number, ry: number, y = 1.05) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), winMat);
      m.position.set(x, y + h / 2, z);
      m.rotation.y = ry;
      this.scene.add(m);
    };
    for (const x of [-5.2, -1.6, 1.6, 4.8]) win(x, 4.62, 1.4, 1.15, 0);
    for (const x of [-4.6, -1.8, 5.2]) win(x, -4.62, 2.2, 1.45, Math.PI, 1.03);
    win(-7.12, -2.0, 1.6, 1.2, -Math.PI / 2); win(7.12, -2.2, 1.4, 1.15, Math.PI / 2); win(7.12, 3.4, 0.9, 0.9, Math.PI / 2, 1.3);

    // hip roof, ghosted, hottest in the thermal pass
    const e = 0.45, y0 = CEIL + 0.06, yr = 4.15;
    const A = V(-7 - e, y0, -4.5 - e), B = V(7 + e, y0, -4.5 - e), C = V(7 + e, y0, 4.5 + e), D = V(-7 - e, y0, 4.5 + e);
    const R1 = V(-3.2, yr, 0), R2 = V(3.2, yr, 0);
    const tri = (pts: THREE.Vector3[]) => pts.flatMap((p) => [p.x, p.y, p.z]);
    const pos = [...tri([D, C, R2]), ...tri([D, R2, R1]), ...tri([B, A, R1]), ...tri([B, R1, R2]), ...tri([A, D, R1]), ...tri([C, B, R2])];
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.computeVertexNormals();
    const roof = new THREE.Mesh(rg, this.ghostMaterial(0.012, true));
    const roofLines = new THREE.LineSegments(new THREE.EdgesGeometry(rg, 1), edges);
    this.scene.add(roof, roofLines);
    // ceiling plane (the attic floor the ducts sit on)
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(14, 9), this.ghostMaterial(0.01));
    ceil.rotation.x = -Math.PI / 2;
    ceil.position.y = CEIL;
    this.scene.add(ceil);
  }

  // ───────────────────────── survey & design ─────────────────────────
  private buildSurvey() {
    const rnd = mulberry32(5);
    const pieces: Piece[] = [];
    const add = (p: THREE.Vector3, i: number, total: number) => {
      const start = 0.005 + (i / total) * 0.075 + rnd() * 0.008;
      pieces.push({ matrix: new THREE.Matrix4().makeTranslation(p.x, p.y, p.z), start, dur: 0.012, from: V(0, 0.6, 0), out: 0.205 + rnd() * 0.01 });
    };
    const pts: THREE.Vector3[] = [];
    // perimeter at sill and head heights, every metre; corners at the eaves; window corners
    for (let x = -7; x <= 7.01; x += 1) for (const z of [-4.5, 4.5]) for (const y of [1.0, 2.2]) pts.push(V(x, y, z));
    for (let z = -4.5; z <= 4.51; z += 1) for (const x of [-7, 7]) for (const y of [1.0, 2.2]) pts.push(V(x, y, z));
    for (const c of [V(-7, CEIL, -4.5), V(7, CEIL, -4.5), V(7, CEIL, 4.5), V(-7, CEIL, 4.5), V(-3.2, 4.15, 0), V(3.2, 4.15, 0)]) pts.push(c);
    pts.forEach((p, i) => add(p, i, pts.length));
    const mat = new THREE.MeshStandardMaterial({ color: 0x0c1418, emissive: 0x63b3e8, emissiveIntensity: 4.5, roughness: 0.4 });
    const depth = buildMaterial(mat, this.u, new THREE.Color(0.6, 0.9, 1.0));
    this.scene.add(buildMesh(new THREE.OctahedronGeometry(0.12), mat, depth, pieces));
  }

  // ───────────────────────── ductwork ─────────────────────────
  private buildDucts() {
    const rnd = mulberry32(21);
    const galv = new THREE.MeshStandardMaterial({ color: 0xb9c2c7, metalness: 0.75, roughness: 0.38 });
    const flex = new THREE.MeshStandardMaterial({ color: 0xd4d9dc, metalness: 0.55, roughness: 0.32 });
    const strap = new THREE.MeshStandardMaterial({ color: 0x5c6267, metalness: 0.4, roughness: 0.6 });
    // seams glow while the mastic goes on, then settle to grey
    const seam = new THREE.MeshStandardMaterial({ color: 0x8e9496, metalness: 0.2, roughness: 0.8 });
    const regMat = new THREE.MeshStandardMaterial({ color: 0xe8ecee, metalness: 0.3, roughness: 0.5, emissive: 0x63b3e8, emissiveIntensity: 0 });
    const ghostLines: number[] = [];

    const trunk: Piece[] = [], seams: Piece[] = [], hangers: Piece[] = [], rings: Piece[] = [], boots: Piece[] = [];
    const S2 = STAGES[2];
    // supply plenum from the air handler up into the attic
    trunk.push({ matrix: beam(V(AHU.x, 1.55, AHU.z), V(AHU.x, TRUNK_Y + 0.14, AHU.z), 0.5, 0.56, V(1, 0, 0)), start: S2 + 0.002, dur: 0.02, from: V(0, 3, 0) });
    // extended-plenum trunk, both directions from the plenum, reducing as it goes
    const SEG = 0.95;
    for (const dir of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const x0 = dir * (0.3 + i * SEG), x1 = dir * (0.3 + (i + 1) * SEG);
        const w = i < 2 ? 0.48 : i < 4 ? 0.4 : 0.32;
        const t = S2 + 0.012 + i * 0.016 + (dir > 0 ? 0.006 : 0);
        trunk.push({ matrix: beam(V(x0, TRUNK_Y, TRUNK_Z), V(x1, TRUNK_Y, TRUNK_Z), w, 0.28), start: t, dur: 0.02, from: V(dir * 0.6, 2.4, 0) });
        seams.push({ matrix: beam(V(x1 - dir * 0.02, TRUNK_Y, TRUNK_Z), V(x1 + dir * 0.02, TRUNK_Y, TRUNK_Z), w + 0.04, 0.32), start: t + 0.016, dur: 0.012, from: V(0, 0.4, 0) });
        ghostLines.push(x0, TRUNK_Y, TRUNK_Z, x1, TRUNK_Y, TRUNK_Z);
        for (const side of [-1, 1]) {
          const hx = (x0 + x1) / 2, hz = TRUNK_Z + side * (w / 2 + 0.02);
          hangers.push({ matrix: beam(V(hx, TRUNK_Y - 0.16, hz), V(hx, TRUNK_Y + 0.62, hz), 0.025, 0.012, V(1, 0, 0)), start: t + 0.01, dur: 0.012, from: V(0, 1.2, 0) });
        }
      }
    }
    // branches: insulated flex from a takeoff on the trunk to a boot above each register
    const branchCurves: THREE.CatmullRomCurve3[] = [];
    REGISTERS.forEach((r, bi) => {
      const side = Math.sign(r.z - TRUNK_Z);
      const tx = clamp(r.x, -5.6, 5.6);
      const take = V(tx, TRUNK_Y, TRUNK_Z + side * 0.26);
      const curve = new THREE.CatmullRomCurve3([
        take, V(tx, TRUNK_Y + 0.05, TRUNK_Z + side * 0.7), V(lerp(tx, r.x, 0.5), TRUNK_Y + 0.12, lerp(TRUNK_Z, r.z, 0.55)), V(r.x, TRUNK_Y + 0.02, r.z - side * 0.35), V(r.x, CEIL + 0.16, r.z),
      ], false, 'centripetal');
      branchCurves.push(curve);
      const len = curve.getLength();
      const n = Math.max(8, Math.floor(len / 0.12));
      const t0 = S2 + 0.11 + bi * 0.0085;
      const q = new THREE.Quaternion();
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const p = curve.getPointAt(u);
        const tan = curve.getTangentAt(u);
        q.setFromUnitVectors(V(0, 0, 1), tan);
        rings.push({ matrix: new THREE.Matrix4().compose(p, q, V(1, 1, 1)), start: t0 + u * 0.05, dur: 0.008, from: V(0, 0.25 + rnd() * 0.2, 0) });
      }
      const pts = curve.getPoints(24);
      for (let i = 0; i < pts.length - 1; i++) ghostLines.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
      boots.push({ matrix: beam(V(r.x - 0.17, CEIL + 0.05, r.z), V(r.x + 0.17, CEIL + 0.05, r.z), 0.22, 0.12), start: t0 + 0.05, dur: 0.012, from: V(0, 0.8, 0) });
    });
    // return grille box in the hall ceiling
    boots.push({ matrix: beam(V(RETURN.x - 0.32, CEIL + 0.06, RETURN.z), V(RETURN.x + 0.32, CEIL + 0.06, RETURN.z), 0.5, 0.14), start: S2 + 0.17, dur: 0.014, from: V(0, 0.8, 0) });

    const mk = (geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, pieces: Piece[], hot?: THREE.Color, extra = '') => {
      const depth = buildMaterial(mat, this.u, hot, extra);
      const mesh = buildMesh(geo, mat, depth, pieces);
      this.scene.add(mesh);
      return mesh;
    };
    mk(new THREE.BoxGeometry(1, 1, 1), galv, trunk);
    mk(new THREE.BoxGeometry(1, 1, 1), seam, seams, new THREE.Color(0.5, 0.85, 1.0));
    mk(new THREE.BoxGeometry(1, 1, 1), strap, hangers);
    mk(new THREE.TorusGeometry(0.1, 0.026, 6, 18), flex, rings, new THREE.Color(1.0, 0.6, 0.25));
    // registers glow cool blue when the air comes on
    const reg = mk(new THREE.BoxGeometry(1, 1, 1), regMat, boots, undefined, 'totalEmissiveRadiance += vec3(0.3, 0.72, 1.0) * uAirGlow * 1.3;');
    const prev = regMat.onBeforeCompile;
    regMat.onBeforeCompile = (s, r) => { prev.call(regMat, s, r); s.uniforms.uAirGlow = this.u.uAir; s.fragmentShader = s.fragmentShader.replace('uniform vec3 uHot;', 'uniform vec3 uHot; uniform float uAirGlow;'); };
    regMat.customProgramCacheKey = () => 'build-register';
    reg.castShadow = false;

    // one sorted list of piece end-times feeds the "duct pieces hung" counter
    this.ductEnds = [...trunk, ...seams, ...hangers, ...rings, ...boots].map((p) => p.start + p.dur).sort((a, b) => a - b);

    // design ghost of the duct layout and equipment
    const add = (x: number, y: number, z: number, w: number, h: number, d: number) => {
      const b = new THREE.BoxGeometry(w, h, d).toNonIndexed();
      const eg = new THREE.EdgesGeometry(b);
      const arr = eg.attributes.position.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) ghostLines.push(arr[i] + x, arr[i + 1] + y, arr[i + 2] + z);
    };
    add(CONDENSER.x, 0.6, CONDENSER.z, 0.95, 0.9, 0.95);
    add(AHU.x, FLOOR + 0.68, AHU.z, 0.62, 1.35, 0.58);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(ghostLines, 3));
    const gm = new THREE.LineDashedMaterial({ color: 0x7fd0ff, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const ghost = new THREE.LineSegments(gg, gm);
    ghost.computeLineDistances();
    ghost.onBeforeRender = () => { gm.opacity = this.u.uGhost.value; };
    this.scene.add(ghost);
  }

  // ───────────────────────── equipment ─────────────────────────
  private buildEquipment() {
    const body = new THREE.MeshStandardMaterial({ color: 0x7f888d, metalness: 0.45, roughness: 0.38 });
    const slatMat = new THREE.MeshStandardMaterial({ color: 0x3e464c, metalness: 0.6, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15181b, metalness: 0.4, roughness: 0.55 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb98f3e, metalness: 1, roughness: 0.3 });
    this.pad = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 1.2), new THREE.MeshStandardMaterial({ color: 0xb8b2a8, roughness: 0.9 }));
    this.pad.position.set(CONDENSER.x, 0.05, CONDENSER.z);
    this.pad.receiveShadow = this.pad.castShadow = true;
    this.scene.add(this.pad);

    const c = this.condenser;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.9, 0.95), body);
    box.position.y = 0.45;
    c.add(box);
    // louvred coil guard on three sides
    const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.74, 0.03), slatMat, 3 * 24);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    let k = 0;
    for (const [nx, nz] of [[0, 1], [1, 0], [0, -1]]) {
      for (let i = 0; i < 24; i++) {
        const t = -0.43 + (i / 23) * 0.86;
        const pos = nx ? V(nx * 0.485, 0.47, t) : V(t, 0.47, nz * 0.485);
        q.setFromAxisAngle(V(0, 1, 0), nx ? Math.PI / 2 : 0);
        m.compose(pos, q, V(1, 1, 1));
        slats.setMatrixAt(k++, m);
      }
    }
    c.add(slats);
    // fan guard and blades on top
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.03, 40), dark);
    top.position.y = 0.915;
    c.add(top);
    for (const r of [0.14, 0.26, 0.38]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 48), slatMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.96;
      c.add(ring);
    }
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.01, 0.12), slatMat);
      blade.position.x = 0.19;
      blade.rotation.x = 0.35;
      const holder = new THREE.Group();
      holder.rotation.y = (i / 3) * Math.PI * 2;
      holder.add(blade);
      this.fan.add(holder);
    }
    this.fan.position.y = 0.94;
    c.add(this.fan);
    for (const [y, r] of [[0.28, 0.035], [0.4, 0.022]]) {
      const v = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 12), brass);
      v.rotation.z = Math.PI / 2;
      v.position.set(-0.52, y, 0.15);
      c.add(v);
    }
    c.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    c.position.copy(CONDENSER).setY(12);
    this.scene.add(c);

    // air handler: cabinet + filter door
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.35, 0.58), new THREE.MeshPhysicalMaterial({ color: 0xc9d0d3, metalness: 0.45, roughness: 0.38, clearcoat: 0.5 }));
    cab.position.y = 0.675;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.01), dark);
    door.position.set(0, 0.36, 0.295);
    this.ahu.add(cab, door);
    this.ahu.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.ahu.position.set(AHU.x, 9, AHU.z);
    this.scene.add(this.ahu);

    // service manifold that appears for the test and the charge
    const gaugeFace = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.3, emissive: 0x222222 });
    const needleMat = new THREE.MeshBasicMaterial({ color: 0xd2321e, toneMapped: false });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.06), brass);
    this.manifold.add(bar);
    const mkGauge = (x: number, ring: number) => {
      const g = new THREE.Group();
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 28), gaugeFace);
      face.rotation.x = Math.PI / 2;
      const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 28), new THREE.MeshStandardMaterial({ color: ring, metalness: 0.3, roughness: 0.4 }));
      const needle = new THREE.Group();
      const nm = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.08, 0.004), needleMat);
      nm.position.y = 0.035;
      needle.add(nm);
      needle.position.z = 0.02;
      g.add(face, bezel, needle);
      g.position.set(x, 0.12, 0);
      this.manifold.add(g);
      return needle;
    };
    this.needleLo = mkGauge(-0.12, 0x2f6fb5);
    this.needleHi = mkGauge(0.12, 0xc8372d);
    const hoseMat = (col: number) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 });
    const valve = V(CONDENSER.x - 0.52, 0.3, CONDENSER.z + 0.15);
    const mpos = V(9.55, 0.62, 3.35);
    [[0x2f6fb5, -0.12], [0xc8372d, 0.12], [0xe8b931, 0]].forEach(([col, dx], i) => {
      const a = V(mpos.x + dx, mpos.y - 0.06, mpos.z);
      const end = i === 2 ? V(mpos.x + 0.4, 0.05, mpos.z + 0.5) : valve.clone().add(V(0, i * 0.1, 0));
      const mid = a.clone().lerp(end, 0.5).setY(Math.min(a.y, end.y) - 0.25);
      const curve = new THREE.CatmullRomCurve3([a.clone().sub(mpos), mid.clone().sub(mpos), end.clone().sub(mpos)]);
      this.manifold.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.014, 6), hoseMat(col)));
    });
    this.manifold.position.copy(mpos);
    this.manifold.rotation.y = -0.5;
    this.manifold.scale.setScalar(0.0001);
    this.manifold.traverse((o) => { o.castShadow = true; });
    this.scene.add(this.manifold);
  }

  // ───────────────────────── line set ─────────────────────────
  private buildLineSet() {
    const pts = [V(8.23, 0.28, 2.55), V(7.7, 0.28, 2.55), V(7.25, 0.4, 2.55), V(7.22, 1.4, 2.55), V(7.22, 2.5, 2.55), V(7.0, 3.0, 2.45), V(6.0, 3.02, 2.2), V(3.0, 3.02, 1.75), V(0.6, 3.0, 1.5), V(0.36, 2.6, 1.48), V(0.34, 1.45, 1.48)];
    this.lineCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.2);
    const liquid = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().add(V(0, 0.1, 0.06))), false, 'centripetal', 0.2);
    const patch = (mat: THREE.MeshStandardMaterial, mode: 'copper' | 'insul' | 'liquid') => {
      mat.customProgramCacheKey = () => `lineset-${mode}`;
      mat.onBeforeCompile = (s) => {
        Object.assign(s.uniforms, { uBraze: this.u.uBraze, uInsul: this.u.uInsul, uCharge: this.u.uCharge, uRun: this.u.uRun, uTime: this.u.uTime, uPressure: this.u.uPressure, uJoints: { value: JOINTS } });
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vPath;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPath = uv.x;');
        s.fragmentShader = s.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uBraze, uInsul, uCharge, uRun, uTime, uPressure; uniform float uJoints[6]; varying float vPath;')
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nif (vPath > ${mode === 'insul' ? 'uInsul' : 'uBraze'} + 0.001) discard;`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            {
              ${mode === 'insul' ? '' : `
              float behind = uBraze - vPath;
              totalEmissiveRadiance += vec3(1.0, 0.42, 0.12) * exp(-behind * 60.0) * step(0.0, behind) * (1.0 - step(0.999, uBraze)) * 5.0;
              for (int i = 0; i < 6; i++) {
                float dj = abs(vPath - uJoints[i]);
                float since = uBraze - uJoints[i];
                totalEmissiveRadiance += vec3(1.0, 0.5, 0.15) * smoothstep(0.012, 0.0, dj) * step(0.0, since) * exp(-since * 25.0) * 6.0;
              }`}
              float press = uPressure * (0.5 + 0.5 * sin(vPath * 120.0 - uTime * 6.0));
              totalEmissiveRadiance += vec3(0.75, 0.9, 1.0) * press * 0.35;
              float front = smoothstep(uCharge + 0.004, uCharge - 0.01, vPath) * step(0.001, uCharge);
              float flow = 0.5 + 0.5 * sin(vPath * 160.0 ${mode === 'liquid' ? '-' : '+'} uTime * 7.0);
              vec3 tint = ${mode === 'liquid' ? 'vec3(1.0, 0.55, 0.25)' : 'vec3(0.3, 0.75, 1.0)'};
              totalEmissiveRadiance += tint * front * (0.35 + uRun * flow * ${mode === 'insul' ? '0.5' : '0.9'});
            }`);
      };
    };
    const copper = new THREE.MeshPhysicalMaterial({ color: 0xd07a48, metalness: 1, roughness: 0.25, clearcoat: 0.3 });
    const copper2 = copper.clone();
    const insul = new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.85, metalness: 0 });
    patch(copper, 'copper');
    patch(copper2, 'liquid');
    patch(insul, 'insul');
    const suction = new THREE.Mesh(new THREE.TubeGeometry(this.lineCurve, 260, 0.03, 10), copper);
    const sleeve = new THREE.Mesh(new THREE.TubeGeometry(this.lineCurve, 260, 0.052, 12), insul);
    const liq = new THREE.Mesh(new THREE.TubeGeometry(liquid, 260, 0.016, 8), copper2);
    for (const mesh of [suction, sleeve, liq]) { mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh); }
  }

  // ───────────────────────── particles ─────────────────────────
  private buildAir() {
    const perReg = isNarrow() ? 110 : 220;
    const n = REGISTERS.length * perReg;
    const src = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    REGISTERS.forEach((r, i) => {
      for (let j = 0; j < perReg; j++) {
        const k = i * perReg + j;
        src.set([r.x, r.y - 0.06, r.z], k * 3);
        seed.set([Math.random(), Math.random(), Math.random(), Math.random()], k * 4);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(src, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.u.uTime, uAir: this.u.uAir, uPixel: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `attribute vec4 aSeed; uniform float uTime, uAir, uPixel; varying float vA;
        void main(){
          float t = fract(aSeed.x + uTime * mix(0.22, 0.4, aSeed.y));
          float ang = aSeed.z * 6.2832;
          float spread = mix(0.4, 1.5, aSeed.w);
          vec3 p = position + vec3(cos(ang) * spread * t, -t * mix(1.6, 2.5, aSeed.y) * (1.0 - 0.35 * t), sin(ang) * spread * t * 0.8);
          p.y = max(p.y, 0.25);
          vA = uAir * smoothstep(0.0, 0.08, t) * (1.0 - t) * 0.7;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uPixel * mix(2.2, 4.6, aSeed.w) * (14.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(0.45, 0.82, 1.0) * a * 2.0, a); }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);

    // heat rejected from the condenser fan: a warm plume
    const m = 500;
    const hp = new Float32Array(m * 3), hs = new Float32Array(m * 4);
    for (let i = 0; i < m; i++) { hp.set([CONDENSER.x, 1.0, CONDENSER.z], i * 3); hs.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4); }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    hg.setAttribute('aSeed', new THREE.BufferAttribute(hs, 4));
    const hm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.u.uTime, uRun: this.u.uRun, uPixel: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `attribute vec4 aSeed; uniform float uTime, uRun, uPixel; varying float vA;
        void main(){
          float t = fract(aSeed.x + uTime * mix(0.35, 0.6, aSeed.y));
          float ang = aSeed.z * 6.2832 + t * 3.0;
          vec3 p = position + vec3(cos(ang) * (0.1 + t * 0.5) * aSeed.w, t * 3.2, sin(ang) * (0.1 + t * 0.5) * aSeed.w);
          vA = uRun * smoothstep(0.0, 0.1, t) * (1.0 - t) * 0.55;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uPixel * mix(2.0, 4.0, aSeed.w) * (8.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(1.0, 0.55, 0.22) * a * 1.6, a); }`,
    });
    const heat = new THREE.Points(hg, hm);
    heat.frustumCulled = false;
    this.scene.add(heat);
  }

  private buildSparks() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.sparkCount * 3), 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(this.sparkCount), 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uPixel: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `attribute float aLife; uniform float uPixel; varying float vL;
        void main(){ vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uPixel * (1.0 + 3.0 * aLife) * (6.0 / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vL; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vL; gl_FragColor = vec4(vec3(1.0, 0.62, 0.22) * a * 4.0, a); }`,
    });
    this.sparks = new THREE.Points(geo, mat);
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
  }

  private updateSparks(dt: number, emit: boolean) {
    const d = this.sparkData;
    const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
    const life = this.sparks.geometry.attributes.aLife as THREE.BufferAttribute;
    const origin = emit ? this.lineCurve.getPointAt(clamp(this.u.uBraze.value), this.tmp2) : null;
    for (let i = 0; i < this.sparkCount; i++) {
      const o = i * 7;
      if (d[o + 6] <= 0 && origin && Math.random() < dt * 30) {
        d.set([origin.x, origin.y, origin.z, (Math.random() - 0.5) * 2.2, Math.random() * 2.2 + 0.5, (Math.random() - 0.5) * 2.2, 0.3 + Math.random() * 0.5], o);
      }
      if (d[o + 6] > 0) {
        d[o + 4] -= 9.8 * dt;
        d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
        d[o + 6] -= dt;
      }
      pos.setXYZ(i, d[o], d[o + 1], d[o + 2]);
      life.setX(i, Math.max(0, d[o + 6]) * 2);
    }
    pos.needsUpdate = true;
    life.needsUpdate = true;
  }

  protected override onResize(w: number, h: number) {
    this.baseFov = fitFov(36, w / h, w < h ? 30 : 52);
    const cam = this.camera as THREE.PerspectiveCamera;
    if (w < h) cam.setViewOffset(w, h, 0, h * 0.08, w, h); else cam.clearViewOffset();
  }

  /** live readouts for the HUD panel, derived from the same build value */
  readings() {
    const P = this.P;
    const sIdx = STAGES.findIndex((s, i) => P >= s && P < STAGES[i + 1]);
    const stageNo = sIdx < 0 ? 8 : sIdx + 1;
    let ducts = 0;
    for (const e of this.ductEnds) if (e <= P) ducts++; else break;
    const joints = JOINTS.filter((j) => j <= this.u.uBraze.value).length;
    const s5 = invLerp(STAGES[5], STAGES[6], P);
    let psig = 0;
    let vac: number | null = null;
    if (P >= STAGES[5] && s5 < 0.45) psig = 450 * range(s5, 0, 0.12);
    if (P >= STAGES[5] && s5 >= 0.45 && P < STAGES[6]) { const t = invLerp(0.45, 0.9, s5); vac = t < 1 ? Math.pow(10, Math.log10(760000) + (Math.log10(380) - Math.log10(760000)) * t) : 380 + 90 * invLerp(0.9, 1, s5); }
    if (P >= STAGES[6]) psig = 118 * range(P, STAGES[6], STAGES[6] + 0.03);
    const run = invLerp(STAGES[6] + 0.02, STAGES[8] - 0.02, P);
    const supply = P >= STAGES[6] + 0.02 ? lerp(98, 54.8, smoother(run)) : null;
    const ret = lerp(98, 75.1, smoother(run));
    const load = 29600 * smoother(invLerp(0.01, STAGES[1] - 0.01, P));
    return { stageNo, ducts, ductTotal: this.ductEnds.length, joints, psig, vac, supply, ret, load };
  }

  update(dt: number, time: number) {
    const P = this.P;
    const u = this.u;
    u.uTime.value = time;
    u.uBuild.value = P;
    // lighting story: hard noon → long afternoon → sunset, lights on
    const dusk = range(P, 0.62, 0.97);
    u.uDusk.value = dusk;
    const elev = lerp(68, 2, smoother(clamp(P / 0.97))) * (Math.PI / 180);
    // sun on the camera side all day, swinging west (−x) and down to the horizon at dusk
    const az = lerp(0.95, 2.7, smoother(P));
    u.uSunDir.value.set(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az)).normalize();
    this.sun.position.copy(u.uSunDir.value).multiplyScalar(40);
    this.sun.intensity = lerp(3.4, 0.45, dusk);
    this.sun.color.setHSL(lerp(0.11, 0.05, dusk), lerp(0.35, 0.95, dusk), lerp(0.93, 0.62, dusk));
    this.hemi.intensity = lerp(0.75, 0.2, dusk);
    this.scene.environmentIntensity = lerp(0.35, 0.08, dusk);
    this.hemi.color.setHSL(lerp(0.58, 0.68, dusk), 0.45, lerp(0.8, 0.35, dusk));
    this.fog.color.setRGB(lerp(0.74, 0.07, dusk), lerp(0.82, 0.07, dusk), lerp(0.88, 0.13, dusk));
    this.fog.near = lerp(45, 26, dusk);
    this.fog.far = lerp(150, 95, dusk);
    this.renderer.toneMappingExposure = lerp(0.74, 0.92, dusk);
    u.uLights.value = range(P, 0.86, 0.95);
    for (const l of this.roomLights) l.intensity = u.uLights.value * 2.2;

    // thermal survey at the start, a thermal check of the cooled house near the end
    u.uThermal.value = range(P, 0.004, 0.03) * (1 - range(P, 0.095, 0.125)) + range(P, 0.865, 0.885) * (1 - range(P, 0.93, 0.955)) * 0.85;
    u.uCooled.value = range(P, 0.86, 0.93);
    u.uGhost.value = range(P, STAGES[1], STAGES[1] + 0.025) * (1 - range(P, STAGES[2] + 0.04, STAGES[3] - 0.02)) * 0.85;
    u.uBraze.value = range(P, STAGES[4] + 0.005, STAGES[5] - 0.008);
    u.uInsul.value = range(P, STAGES[4] + 0.04, STAGES[5] + 0.004);
    const s5 = invLerp(STAGES[5], STAGES[6], P);
    u.uPressure.value = range(s5, 0.02, 0.12) * (1 - range(s5, 0.4, 0.5));
    u.uCharge.value = range(P, STAGES[6] + 0.005, STAGES[6] + 0.05);
    u.uRun.value = range(P, STAGES[6] + 0.04, STAGES[6] + 0.07);
    u.uAir.value = range(P, STAGES[7] + 0.005, STAGES[7] + 0.04);

    // the condenser is craned onto its pad, overshoots, settles; the camera feels it land
    const ct = invLerp(STAGES[3] + 0.012, STAGES[3] + 0.05, P);
    this.condenser.position.set(CONDENSER.x, lerp(9, 0.1, Math.min(1.08, easeOutBack(ct, 1.4))), CONDENSER.z);
    this.condenser.rotation.y = (1 - ct) * 0.6;
    this.pad.scale.set(1, Math.max(0.0001, range(P, STAGES[3], STAGES[3] + 0.01)), 1);
    if (ct >= 0.62 && !this.landed.condenser) { this.landed.condenser = true; this.jolt = 1; }
    if (ct < 0.5) this.landed.condenser = false;
    const at = invLerp(STAGES[3] + 0.055, STAGES[3] + 0.09, P);
    this.ahu.position.set(AHU.x, lerp(8, FLOOR, Math.min(1.08, easeOutBack(at, 1.3))), AHU.z);
    if (at >= 0.62 && !this.landed.ahu) { this.landed.ahu = true; this.jolt = Math.max(this.jolt, 0.6); }
    if (at < 0.5) this.landed.ahu = false;
    if (u.uRun.value > 0.05 && !this.landed.start) { this.landed.start = true; this.jolt = Math.max(this.jolt, 0.45); }
    if (u.uRun.value <= 0.05) this.landed.start = false;
    // fan spin-up
    this.fanAngle += dt * 16 * u.uRun.value;
    this.fan.rotation.y = this.fanAngle;
    // manifold on for the tests and the charge; needles read pressure / vacuum
    const mf = range(P, STAGES[5] - 0.005, STAGES[5] + 0.01) * (1 - range(P, STAGES[7] - 0.02, STAGES[7]));
    this.manifold.scale.setScalar(Math.max(0.0001, mf));
    const rd = this.readings();
    this.needleLo.rotation.z = -2.2 + (rd.vac !== null ? 0.1 : rd.psig / 500 * 4.4);
    this.needleHi.rotation.z = -2.2 + (P >= STAGES[6] ? 340 : rd.psig) / 600 * 4.4;
    this.updateSparks(dt, u.uBraze.value > 0.002 && u.uBraze.value < 0.998);

    // camera: dwell at each set-up, travel between them
    const si = ProcessGL.stageAt(P);
    const g = si + invLerp(STAGES[si], STAGES[si + 1], P);
    const c = clamp(g - 0.5, 0, 7);
    const ci = Math.min(6, Math.floor(c));
    const t = (ci + smoother(c - ci)) / 7;
    const cam = this.camera as THREE.PerspectiveCamera;
    this.camPath.getPoint(t, this.tmp);
    this.camLook.getPoint(t, this.tmp2);
    // portrait screens: back off along the view line so the house stays framed
    const aspect = this.width / this.height;
    if (aspect < 1) this.tmp.sub(this.tmp2).multiplyScalar(0.92).add(this.tmp2);
    this.tmp.x += Math.sin(time * 0.13) * 0.25 + this.pointer.x * 0.5;
    this.tmp.y += Math.sin(time * 0.11) * 0.12 + this.pointer.y * 0.25;
    if (this.jolt > 0.002) {
      this.tmp.x += (Math.random() - 0.5) * 0.12 * this.jolt;
      this.tmp.y += (Math.random() - 0.5) * 0.12 * this.jolt;
      this.jolt *= Math.exp(-dt * 6);
    }
    // never inside the house volume (+ margin)
    if (Math.abs(this.tmp.x) < 8 && Math.abs(this.tmp.z) < 5.6 && this.tmp.y < 4.8) this.tmp.y = 4.8;
    cam.position.copy(this.tmp);
    cam.lookAt(this.tmp2);
    cam.fov = this.baseFov;
    cam.updateProjectionMatrix();
  }

  /** stage index for a build value */
  static stageAt(P: number) {
    for (let i = 0; i < STAGES.length - 1; i++) if (P < STAGES[i + 1]) return i;
    return STAGES.length - 2;
  }
}
