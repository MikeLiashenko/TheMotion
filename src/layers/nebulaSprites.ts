import * as THREE from 'three';
import { CAM_DIST, FRAME } from './constants';
import type { LayerUniforms, RGB } from './points';

type Vec3 = [number, number, number];

/**
 * - `emission`: a cloud of glowing hydrogen with dark dust lanes (Orion, Lagoon, Eagle, Rosette)
 * - `ring`: the shell a dying Sun-like star puffs off (Ring, Helix, Cat's Eye)
 * - `crab`: a filled supernova remnant, a web of filaments around a haze (Crab)
 * - `shell`: an old supernova remnant, wisps along a thin shell (Veil, Vela)
 * - `bipolar`: two lobes either side of a pinched waist (Butterfly, Dumbbell)
 */
export type NebulaKind = 'emission' | 'ring' | 'crab' | 'shell' | 'bipolar';
const KIND_INDEX: Record<NebulaKind, number> = { emission: 0, ring: 1, crab: 2, shell: 3, bipolar: 4 };

export interface NebulaInstance {
  center: Vec3;
  radius: number;
  kind: NebulaKind;
  /** Main colour, and the second colour the kind mixes it with. */
  color: RGB;
  color2: RGB;
  seed?: number;
  /** Rotation of the picture, radians. */
  angle?: number;
  /**
   * Three kind-specific knobs, each 0..1:
   * - emission: dustiness, radius of a central hole, dark pillars (0 or 1)
   * - ring: ring radius, ellipticity, style (0 plain, 0.5 streaked, 1 concentric shells)
   * - crab: filament strength, elongation, unused
   * - shell: shell radius, how much of the shell survives, unused
   * - bipolar: how pinched the waist is, unused, unused
   */
  a?: number;
  b?: number;
  c?: number;
  brightness?: number;
}

const VERT = /* glsl */ `
attribute vec4 aColorA;  // rgb, kind
attribute vec4 aColorB;  // rgb, brightness
attribute vec4 aParams;  // seed, angle, a, b
attribute float aC;
uniform float uPxWorld;
uniform float uDpr;
varying vec2 vUv;
varying vec3 vColorA;
varying vec3 vColorB;
varying vec4 vParams;    // seed, a, b, c
varying float vKind;
varying float vPx;
varying float vLight;

void main() {
  mat4 m = modelMatrix * instanceMatrix;
  float s = length(m[0].xyz);
  vec4 mv = viewMatrix * vec4(m[3].xyz, 1.0);
  // Always faces the camera.
  mv.xy += position.xy * s;
  gl_Position = projectionMatrix * mv;

  float c = cos(aParams.y);
  float sn = sin(aParams.y);
  vUv = vec2(c * position.x + sn * position.y, c * position.y - sn * position.x);
  vColorA = aColorA.rgb;
  vColorB = aColorB.rgb;
  vParams = vec4(aParams.x, aParams.z, aParams.w, aC);
  vKind = aColorA.a;

  float depth = max(-mv.z, 0.05);
  float onScreen = 2.0 * s * ${CAM_DIST.toFixed(1)} / depth;
  vPx = onScreen * uPxWorld * uDpr;
  // A nebula the camera is about to fly through washes out rather than filling the screen.
  float tooLarge = 1.0 - smoothstep(1.3, 2.4, onScreen / ${FRAME.toFixed(1)});
  vLight = aColorB.a * tooLarge * smoothstep(0.5, 2.5, depth);
}
`;

const FRAG = /* glsl */ `
uniform float uFade;
varying vec2 vUv;
varying vec3 vColorA;
varying vec3 vColorB;
varying vec4 vParams;
varying float vKind;
varying float vPx;
varying float vLight;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * vnoise(p);
    p = p * 2.03 + vec2(13.7, 7.1);
    amp *= 0.5;
  }
  return sum / 0.96875;
}

// Noise folded into sharp ridges: filaments and wisps.
float ridged(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    float n = 1.0 - abs(2.0 * vnoise(p) - 1.0);
    sum += amp * n * n;
    p = p * 2.1 + vec2(5.3, 9.1);
    amp *= 0.5;
  }
  return sum / 0.9375;
}

float capsule(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

vec3 emission(vec2 uv, float r, float seed, float dustiness, float hole, float pillars) {
  vec2 p = uv * 1.7 + seed;
  vec2 warp = vec2(fbm(p + 1.7), fbm(p + 9.2)) - 0.5;
  float n = fbm(p + 2.2 * warp);
  // A ragged outline rather than a disc.
  float reach = 0.72 + 0.5 * (fbm(uv * 1.1 + seed + 4.0) - 0.5);
  float gas = smoothstep(0.25, 0.85, n) * (1.0 - smoothstep(reach * 0.35, reach, r));
  // A cavity blown clear by the stars born inside.
  if (hole > 0.0) gas *= smoothstep(hole * 0.55, hole * 1.25, r + 0.12 * (n - 0.5));
  // Dust lanes.
  float lanes = smoothstep(0.42, 0.62, fbm(p * 1.9 - 2.6 * warp + 5.0));
  gas *= 1.0 - dustiness * 0.9 * lanes;

  float rim = 0.0;
  if (pillars > 0.5) {
    // Columns of cold dust standing up into the glow, their tips lit by the stars above.
    for (int i = 0; i < 3; i++) {
      float k = float(i);
      float x = (k - 1.0) * 0.17 + 0.03 * sin(seed + k * 2.1);
      float top = 0.12 - 0.13 * abs(k - 1.0) + 0.05 * sin(seed * 1.3 + k);
      vec2 q = uv + vec2(0.035 * sin(uv.y * 9.0 + k * 1.7 + seed), 0.0);
      float d = capsule(q, vec2(x, -1.0), vec2(x, top)) - (0.045 + 0.05 * max(top - uv.y, 0.0));
      gas *= 1.0 - 0.95 * (1.0 - smoothstep(-0.012, 0.012, d));
      rim += exp(-d * d / 0.0005) * step(0.0, d) * smoothstep(top - 0.25, top, uv.y);
    }
  }

  vec3 col = mix(vColorB, vColorA, smoothstep(0.05, 0.6, gas)) * gas;
  col += vec3(1.0, 0.9, 0.85) * pow(gas, 3.0) * 0.6;
  col += vColorA * rim * 0.9;
  return col * 1.6;
}

vec3 ringNebula(vec2 uv, float seed, float radius, float squash, float style) {
  vec2 e = uv * vec2(1.0, 1.0 + squash);
  float rr = length(e);
  float angle = atan(e.y, e.x);
  float n = fbm(uv * 5.0 + seed);
  float wobble = 0.04 * sin(angle * 3.0 + seed) + 0.05 * (n - 0.5);
  float d = rr - radius - wobble;
  float ring = exp(-d * d / 0.012);
  float d2 = rr - radius * 1.32;
  float halo = exp(-d2 * d2 / 0.04) * 0.35;
  float inside = 1.0 - smoothstep(0.0, radius, rr);
  vec3 col = vColorA * ring * (0.7 + 0.7 * n) + vColorB * inside * (0.35 + 0.3 * n) + vColorA * halo * (0.5 + n);
  if (style > 0.25 && style < 0.75) {
    // Knots streaming away from the star.
    col *= 0.7 + 0.6 * vnoise(vec2(cos(angle), sin(angle)) * 14.0 + rr * 3.0 + seed);
  }
  if (style >= 0.75) {
    // Shell after shell, puffed off at intervals.
    for (int i = 0; i < 4; i++) {
      float dk = rr - radius * (1.25 + 0.2 * float(i));
      col += vColorB * exp(-dk * dk / 0.0005) * 0.22;
    }
    // The bright, intricate inner figure.
    vec2 f = vec2(uv.x * 0.8 + uv.y * 0.6, uv.y * 0.8 - uv.x * 0.6);
    float fig = exp(-pow(length(f * vec2(1.0, 2.0)) / (radius * 0.75), 4.0)) + exp(-pow(length(f * vec2(2.0, 1.0)) / (radius * 0.75), 4.0));
    col += mix(vColorB, vec3(1.0), 0.4) * fig * 0.6;
  }
  // The white dwarf at the centre.
  col += vec3(1.0) * exp(-rr * rr / 0.0012) * 1.5;
  return col;
}

vec3 crabNebula(vec2 uv, float seed, float strength, float elongation) {
  float rr = length(uv * vec2(1.0, 1.0 + 0.5 * elongation));
  float reach = 0.8 + 0.25 * (fbm(uv * 1.6 + seed) - 0.5);
  float body = 1.0 - smoothstep(reach * 0.6, reach, rr);
  vec2 p = uv * 3.2 + seed;
  vec2 warp = vec2(fbm(p + 3.1), fbm(p + 7.7)) - 0.5;
  float filaments = pow(ridged(p + 1.6 * warp), 2.2);
  // Blue-white haze of electrons spiralling in the magnetic field, inside a cage of filaments.
  vec3 col = vColorB * exp(-rr * rr * 2.6) * 0.5 * body;
  col += mix(vColorA, vec3(0.6, 1.0, 0.5), 0.25 * vnoise(p * 2.0)) * filaments * body * (1.0 + 1.4 * strength);
  // The pulsar.
  col += vec3(1.0) * exp(-rr * rr / 0.0008);
  return col;
}

vec3 shellNebula(vec2 uv, float seed, float radius, float survives) {
  float rr = length(uv);
  vec2 dir = uv / max(rr, 0.001);
  float d = rr - radius - 0.14 * (fbm(dir * 2.0 + seed) - 0.5);
  float band = exp(-d * d / 0.02);
  vec2 p = uv * 4.2 + seed;
  vec2 warp = vec2(fbm(p + 2.3), fbm(p + 6.1)) - 0.5;
  float wisps = pow(ridged(p + 1.9 * warp), 2.6);
  // Only parts of the shell still glow.
  float arcs = smoothstep(0.62 - 0.4 * survives, 0.78 - 0.4 * survives, fbm(dir * 1.4 + seed * 1.7));
  float tint = vnoise(p * 1.3 + 3.0);
  return mix(vColorA, vColorB, smoothstep(0.35, 0.65, tint)) * wisps * band * arcs * 3.2;
}

vec3 bipolar(vec2 uv, float seed, float pinch) {
  float ax = abs(uv.x);
  // The lobes widen away from the star; a strong pinch leaves a dark, dusty waist.
  float width = mix(0.55, 0.08 + 0.75 * ax, pinch);
  float lobes = exp(-pow(uv.y / width, 2.0)) * (1.0 - smoothstep(0.55, 0.95, ax));
  lobes *= mix(1.0, smoothstep(0.0, 0.12, ax), pinch);
  float n = fbm(uv * 4.0 + seed);
  float filaments = ridged(uv * 5.0 + seed * 1.3);
  vec3 col = mix(vColorB, vColorA, smoothstep(0.1, 0.7, ax)) * lobes * (0.5 + 0.9 * n) + vColorA * lobes * filaments * 0.6;
  // A fainter round halo and a visible central star, where the waist is not choked with dust.
  col += vColorB * (1.0 - smoothstep(0.5, 0.8, length(uv))) * (1.0 - pinch) * 0.35;
  col += vec3(1.0) * exp(-dot(uv, uv) / 0.001) * (1.0 - pinch);
  return col * 0.95;
}

void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float seed = vParams.x;
  vec3 col;
  if (vPx < 22.0) {
    // Too small to show any structure.
    col = vColorA * exp(-r * r * 5.0) * 0.9;
  } else if (vKind < 0.5) {
    col = emission(vUv, r, seed, vParams.y, vParams.z, vParams.w);
  } else if (vKind < 1.5) {
    col = ringNebula(vUv, seed, vParams.y, vParams.z, vParams.w);
  } else if (vKind < 2.5) {
    col = crabNebula(vUv, seed, vParams.y, vParams.z);
  } else if (vKind < 3.5) {
    col = shellNebula(vUv, seed, vParams.y, vParams.z);
  } else {
    col = bipolar(vUv, seed, vParams.y);
  }
  col *= (1.0 - smoothstep(0.85, 1.0, r)) * vLight;
  gl_FragColor = vec4(col, uFade);
}
`;

/** Collects nebulae and turns them into one instanced mesh of camera-facing sprites. */
export class NebulaBuf {
  private readonly items: NebulaInstance[] = [];

  get count(): number {
    return this.items.length;
  }

  add(nebula: NebulaInstance): void {
    this.items.push(nebula);
  }

  toMesh(u: LayerUniforms): THREE.InstancedMesh {
    const n = this.items.length;
    const colorA = new Float32Array(n * 4);
    const colorB = new Float32Array(n * 4);
    const params = new Float32Array(n * 4);
    const extra = new Float32Array(n);

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uFade: u.uFade, uPxWorld: u.uPxWorld, uDpr: u.uDpr },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), material, n);
    const matrix = new THREE.Matrix4();

    this.items.forEach((item, i) => {
      colorA.set([...item.color, KIND_INDEX[item.kind]], i * 4);
      colorB.set([...item.color2, item.brightness ?? 1], i * 4);
      params.set([item.seed ?? i * 3.7 + 0.9, item.angle ?? 0, item.a ?? 0, item.b ?? 0], i * 4);
      extra[i] = item.c ?? 0;
      matrix.makeScale(item.radius, item.radius, item.radius).setPosition(item.center[0], item.center[1], item.center[2]);
      mesh.setMatrixAt(i, matrix);
    });

    const geo = mesh.geometry;
    geo.setAttribute('aColorA', new THREE.InstancedBufferAttribute(colorA, 4));
    geo.setAttribute('aColorB', new THREE.InstancedBufferAttribute(colorB, 4));
    geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
    geo.setAttribute('aC', new THREE.InstancedBufferAttribute(extra, 1));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }
}
