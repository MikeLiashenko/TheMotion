import * as THREE from 'three';
import { CAM_DIST } from './constants';

export type RGB = [number, number, number];

/** Display-space colour from a hex literal. Custom shaders here write display values directly. */
export function rgb(hex: number): RGB {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scaleRgb(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** Uniforms shared by every material of one layer; the layer updates them once per frame. */
export interface LayerUniforms {
  uFade: { value: number };
  /** CSS px per layer-local unit at the focus plane. */
  uPxScale: { value: number };
  /** CSS px per world unit at the focus plane. */
  uPxWorld: { value: number };
  uDpr: { value: number };
  uMaxPx: { value: number };
  uTime: { value: number };
}

export function createLayerUniforms(): LayerUniforms {
  return {
    uFade: { value: 0 },
    uPxScale: { value: 1 },
    uPxWorld: { value: 1 },
    uDpr: { value: 1 },
    uMaxPx: { value: 256 },
    uTime: { value: 0 },
  };
}

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;   // real diameter, layer-local units
attribute float aPx;     // minimum on-screen diameter, CSS px
attribute float aPhase;
uniform float uPxScale;
uniform float uDpr;
uniform float uMaxPx;
uniform float uTime;
uniform float uFade;
uniform float uTwinkle;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.05);
  float persp = ${CAM_DIST.toFixed(1)} / depth;
  float px = max(aSize * uPxScale * persp, aPx) * uDpr;
  // Sprites can't exceed the GPU's point size: fade them out instead of popping.
  float tooBig = smoothstep(uMaxPx * 0.5, uMaxPx, px);
  // Points sweeping past the camera dissolve rather than clip.
  float tooNear = smoothstep(0.4, 2.5, depth);
  gl_PointSize = clamp(px, 1.0, uMaxPx);
  float twinkle = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (0.8 + aPhase * 2.4) + aPhase * 40.0));
  vColor = aColor * twinkle;
  vAlpha = uFade * (1.0 - tooBig) * tooNear;
}
`;

const FRAG = /* glsl */ `
uniform float uSoft;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float a = pow(1.0 - d, uSoft) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}
`;

// A star as a camera sees it: a hard core, a soft glow, and four diffraction spikes.
// The sprite is much larger than the core, so `aPx` should be several times the size of a plain point.
const FRAG_STAR = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float edge = 1.0 - sqrt(d2);
  float core = exp(-d2 * 90.0);
  float glow = 0.05 / (d2 + 0.02) * edge * edge;
  float spikes = exp(-abs(c.y) * 55.0) * pow(1.0 - abs(c.x), 3.0) + exp(-abs(c.x) * 55.0) * pow(1.0 - abs(c.y), 3.0);
  // White-hot in the middle, the star's own colour in the glow.
  vec3 col = mix(vColor, vec3(1.0), clamp(core * 1.2 + glow * 0.2, 0.0, 1.0));
  gl_FragColor = vec4(col * (core * 1.4 + glow + spikes * 0.5), vAlpha);
}
`;

export interface PointStyle {
  /** Falloff exponent: ~1 = soft puff, 3+ = tight star. */
  soft?: number;
  twinkle?: number;
}

/** Material for the few stars bright enough to deserve a proper glint. Use with the same `PointBuf`. */
export function starsMaterial(u: LayerUniforms, twinkle = 0.12): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG_STAR,
    uniforms: { ...u, uTwinkle: { value: twinkle } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function pointsMaterial(u: LayerUniforms, style: PointStyle = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      ...u,
      uSoft: { value: style.soft ?? 2.2 },
      uTwinkle: { value: style.twinkle ?? 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Growable buffer of point sprites. */
export class PointBuf {
  private pos: number[] = [];
  private col: number[] = [];
  private size: number[] = [];
  private px: number[] = [];
  private phase: number[] = [];

  get count(): number {
    return this.size.length;
  }

  /** Position of the i-th point: lets other things be scattered along the same structure. */
  positionOf(i: number): [number, number, number] {
    return [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]];
  }

  /**
   * @param size real diameter in layer-local units (0 = pure point)
   * @param px   minimum on-screen diameter in CSS px
   */
  add(x: number, y: number, z: number, color: RGB, size: number, px: number, phase = 0): void {
    this.pos.push(x, y, z);
    this.col.push(color[0], color[1], color[2]);
    this.size.push(size);
    this.px.push(px);
    this.phase.push(phase);
  }

  toPoints(material: THREE.ShaderMaterial): THREE.Points {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(this.size, 1));
    geo.setAttribute('aPx', new THREE.Float32BufferAttribute(this.px, 1));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(this.phase, 1));
    const points = new THREE.Points(geo, material);
    points.frustumCulled = false;
    return points;
  }
}
