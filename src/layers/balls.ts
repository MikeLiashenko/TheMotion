import * as THREE from 'three';
import { segments } from '../app/quality';
import { CAM_DIST } from './constants';
import { NOISE_GLSL } from './noise';
import type { LayerUniforms, RGB } from './points';

type Vec3 = [number, number, number];

/** What a ball is painted like, besides its colour. */
export const PLAIN = 0;
/** A chloroplast: grainy with the stacks of membranes that catch the light. */
export const GRAINY = 1;
/** A mitochondrion: banded by the folds of its inner membrane. */
export const BANDED = 2;
/** The DNA round a nucleosome seen from too far to make out its parts: two turns of thread, side by side. */
export const COILED = 3;

const BALL_VERT = /* glsl */ `
attribute float aStyle;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vColor;
varying vec3 vObject;
varying float vDepth;
varying float vStyle;
void main() {
  // Instances may be ellipsoids, so normals need the inverse scale.
  mat3 m = mat3(instanceMatrix);
  vec3 scale2 = vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]));
  vNormal = normalize(normalMatrix * (m * (normal / scale2)));
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  vDepth = -mv.z;
  vColor = instanceColor;
  vObject = position;
  vStyle = aStyle;
  gl_Position = projectionMatrix * mv;
}
`;

const BALL_COMMON = /* glsl */ `
uniform float uFade;
uniform vec3 uDepths;   // where things start to sink into the dark behind what the camera looks at, where they have sunk, how dark that is
uniform vec2 uNear;     // how near the camera things are gone, and how near they start to go
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vColor;
varying vec3 vObject;
varying float vDepth;
varying float vStyle;

// Interleaved gradient noise: a stable screen-door pattern.
float dither(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// Whatever the camera is about to fly into dissolves instead of being sliced by the near plane.
void dissolveNear() {
  float near = smoothstep(uNear.x, uNear.y, vDepth);
  if (near < dither(gl_FragCoord.xy)) discard;
}

// 1 at the depth the camera looks at, less for what lies far behind it.
float sunk() {
  return mix(1.0, uDepths.z, smoothstep(uDepths.x, uDepths.y, vDepth));
}
`;

const BALL_FRAG = /* glsl */ `
${BALL_COMMON}
${NOISE_GLSL}
void main() {
  dissolveNear();
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  vec3 l = normalize(vec3(-0.5, 0.6, 0.65));
  float wrap = 0.5 + 0.5 * dot(n, l);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.5);
  float spec = pow(max(dot(n, normalize(l + v)), 0.0), 42.0);

  vec3 base = vColor;
  if (vStyle > 2.5) {
    float turn = sin(3.14159 * vObject.z);
    base *= 0.66 + 0.34 * turn * turn;
  } else if (vStyle > 1.5) {
    base *= 0.84 + 0.2 * sin(vObject.z * 15.0 + 1.6 * sin(vObject.x * 4.0 + vObject.y * 3.0));
  } else if (vStyle > 0.5) {
    base *= mix(1.05, 0.66, smoothstep(0.56, 0.7, noise3(vObject * 11.0 + vColor.g * 31.0)));
  }
  vec3 col = base * (0.2 + 0.8 * wrap * wrap) + base * rim * 0.45 + vec3(spec * 0.28);
  gl_FragColor = vec4(col * sunk(), uFade);
}
`;

const SHELL_FRAG = /* glsl */ `
${BALL_COMMON}
void main() {
  dissolveNear();
  float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.8);
  float deep = sunk();
  gl_FragColor = vec4(vColor * (0.55 + 0.6 * rim) * deep, (0.07 + 0.6 * rim) * uFade * (0.35 + 0.65 * deep));
}
`;

/** Growable set of instanced spheres / ellipsoids. */
export class BallBuf {
  private matrices: number[] = [];
  private colors: number[] = [];
  private styles: number[] = [];
  private static readonly scratch = {
    m: new THREE.Matrix4(),
    p: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    s: new THREE.Vector3(),
    e: new THREE.Euler(),
  };

  /**
   * @param rotation Euler angles, or a quaternion
   * @param style how the ball is painted: PLAIN, GRAINY, BANDED or SPOOL
   */
  add(pos: Vec3, radius: number | Vec3, color: RGB, rotation: Vec3 | THREE.Quaternion = [0, 0, 0], style = PLAIN): void {
    const { m, p, q, s, e } = BallBuf.scratch;
    p.set(pos[0], pos[1], pos[2]);
    if (typeof radius === 'number') s.setScalar(radius);
    else s.set(radius[0], radius[1], radius[2]);
    if (rotation instanceof THREE.Quaternion) q.copy(rotation);
    else q.setFromEuler(e.set(rotation[0], rotation[1], rotation[2]));
    m.compose(p, q, s);
    this.matrices.push(...m.elements);
    this.colors.push(color[0], color[1], color[2]);
    this.styles.push(style);
  }

  /** A row of touching spheres from `a` to `b`: bonds, strands, fibres. */
  chain(a: Vec3, b: Vec3, radius: number, color: RGB, spacing = radius * 1.3): void {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const steps = Math.max(1, Math.round(length / spacing));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.add([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], radius, color);
    }
  }

  get count(): number {
    return this.colors.length / 3;
  }

  /**
   * @param detail how finely each sphere is made: segments around its equator
   * @param shape something other than a sphere to make every one of them from
   */
  toMesh(material: THREE.ShaderMaterial, detail = 20, shape?: THREE.BufferGeometry): THREE.InstancedMesh {
    const around = segments(detail);
    const geometry = shape ?? new THREE.SphereGeometry(1, around, Math.round(around * 0.7));
    geometry.setAttribute('aStyle', new THREE.InstancedBufferAttribute(new Float32Array(this.styles), 1));
    const mesh = new THREE.InstancedMesh(geometry, material, this.count);
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(this.matrices), 16);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.colors), 3);
    mesh.frustumCulled = false;
    return mesh;
  }
}

/**
 * How things darken with depth: from `from` to `to`, measured in distances from the camera to
 * what it looks at (1 is that very depth), brightness falls to `floor`.
 */
export interface Depths {
  from: number;
  to: number;
  floor: number;
}

const NO_DEPTHS: Depths = { from: 1e6, to: 2e6, floor: 1 };

/**
 * How near the camera things dissolve, in distances from the camera to what it looks at: gone
 * at the first, whole from the second on.
 */
export type Nearness = [gone: number, whole: number];
const NEARNESS: Nearness = [0.12, 0.55];

function uniforms(u: LayerUniforms, depths: Depths, near: Nearness) {
  return {
    uFade: u.uFade,
    uDepths: { value: new THREE.Vector3(depths.from * CAM_DIST, depths.to * CAM_DIST, depths.floor) },
    uNear: { value: new THREE.Vector2(near[0] * CAM_DIST, near[1] * CAM_DIST) },
  };
}

/** Solid, lit balls. */
export function ballMaterial(u: LayerUniforms, depths: Depths = NO_DEPTHS, near: Nearness = NEARNESS): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: BALL_VERT,
    fragmentShader: BALL_FRAG,
    uniforms: uniforms(u, depths, near),
    transparent: true,
  });
}

/** Clear bubbles that show mostly by their rims: membranes and walls. */
export function shellMaterial(u: LayerUniforms, depths: Depths = NO_DEPTHS): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: BALL_VERT,
    fragmentShader: SHELL_FRAG,
    uniforms: uniforms(u, depths, NEARNESS),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
