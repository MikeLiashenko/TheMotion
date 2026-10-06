import * as THREE from 'three';
import { CAM_DIST } from './constants';
import { NOISE_GLSL } from './noise';
import type { LayerUniforms, RGB } from './points';

/**
 * How the surface of a body is painted:
 * - `rock`: airless and cratered, two tones (the Moon, Mercury, asteroids, most moons)
 * - `bands`: a gas giant's belts and zones (Jupiter, Saturn)
 * - `ice`: an ice giant, almost featureless (Uranus, Neptune)
 * - `clouds`: wrapped in unbroken cloud or haze (Venus, Titan)
 * - `earth`: oceans, land and weather, for when Earth is only a few pixels wide
 * - `mars`: rust, dark plains and polar caps
 * - `pluto`: pale and dark terrain with one large bright plain
 */
export type BodyKind = 'rock' | 'bands' | 'ice' | 'clouds' | 'earth' | 'mars' | 'pluto';
const KIND_INDEX: Record<BodyKind, number> = { rock: 0, bands: 1, ice: 2, clouds: 3, earth: 4, mars: 5, pluto: 6 };

export interface BodyLook {
  kind: BodyKind;
  color: RGB;
  color2: RGB;
  seed?: number;
  /** Strength of the markings, 0..1. */
  contrast?: number;
  /** `saturn`: broad bright rings. `thin`: a few narrow dark ones (Uranus, Haumea). */
  rings?: 'saturn' | 'thin';
  /** Semi-axes across and along the spin axis, as fractions of the radius: [1, 1, 0.9] is flattened at the poles. */
  shape?: [number, number, number];
  /** Tilt of the spin axis: Euler angles in the space the mesh is added to. Unset = upright in that space. */
  axis?: [number, number, number];
  /** Radians per second about the spin axis. */
  spin?: number;
}

const VERT = /* glsl */ `
attribute vec4 aBody;     // centre, radius
attribute vec4 aLook;     // kind, seed, contrast, rings
attribute vec4 aAxis;     // quaternion: the body's own frame → the mesh's space
attribute vec4 aShape;    // semi-axes y and z, spin rate, spin phase
attribute vec3 aColorA;
attribute vec3 aColorB;
uniform vec3 uSunPos;
uniform float uTime;
uniform float uPxWorld;
uniform float uDpr;
varying vec3 vView;
varying vec3 vCenter;
varying float vRadius;
varying vec3 vSun;
varying vec3 vRotX;
varying vec3 vRotY;
varying vec3 vRotZ;
varying vec4 vLook;
varying vec2 vShape;
varying vec3 vColorA;
varying vec3 vColorB;
varying float vPx;

vec3 turn(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

void main() {
  vec4 c = modelViewMatrix * vec4(aBody.xyz, 1.0);
  float k = length(modelViewMatrix[0].xyz);
  float r = aBody.w * k;
  // Rings reach well beyond the globe.
  float margin = aLook.w > 0.5 ? 2.5 : 1.15;
  vec4 mv = c;
  mv.xy += position.xy * r * margin;
  gl_Position = projectionMatrix * mv;

  vView = mv.xyz;
  vCenter = c.xyz;
  vRadius = r;
  vSun = normalize((modelViewMatrix * vec4(uSunPos, 1.0)).xyz - c.xyz);

  // The body's own axes as the camera sees them, spun about its pole.
  mat3 toView = mat3(modelViewMatrix) / k;
  float a = aShape.z * uTime + aShape.w;
  float ca = cos(a);
  float sa = sin(a);
  vRotX = toView * turn(aAxis, vec3(ca, sa, 0.0));
  vRotY = toView * turn(aAxis, vec3(-sa, ca, 0.0));
  vRotZ = toView * turn(aAxis, vec3(0.0, 0.0, 1.0));

  vLook = aLook;
  vShape = aShape.xy;
  vColorA = aColorA;
  vColorB = aColorB;
  // Radius on screen in device pixels: decides how much detail is worth drawing.
  vPx = r * uPxWorld * uDpr * ${CAM_DIST.toFixed(1)} / max(-c.z, 0.05);
}
`;

const FRAG = /* glsl */ `
uniform float uFade;
varying vec3 vView;
varying vec3 vCenter;
varying float vRadius;
varying vec3 vSun;
varying vec3 vRotX;
varying vec3 vRotY;
varying vec3 vRotZ;
varying vec4 vLook;
varying vec2 vShape;
varying vec3 vColorA;
varying vec3 vColorB;
varying float vPx;
${NOISE_GLSL}

// How much light the rings stop at distance rho from the planet's axis, in planet radii.
float ringDensity(float rho, float kind, float soft) {
  if (kind > 1.5) {
    // A few narrow rings; the outermost is the densest. Too thin to resolve, it stays a hairline
    // about a pixel wide, and the fainter ones inside it only appear close up.
    float w = max(0.02, soft * 0.6);
    float close = clamp(0.02 / w, 0.0, 1.0);
    float d = 0.5 * exp(-pow((rho - 2.0) / w, 2.0));
    d += close * 0.16 * exp(-pow((rho - 1.8) / w, 2.0));
    d += close * 0.1 * exp(-pow((rho - 1.64) / w, 2.0));
    return d;
  }
  float edge = max(soft, 0.004);
  float inC = smoothstep(1.23, 1.23 + edge, rho) * (1.0 - smoothstep(1.525, 1.525 + edge, rho));
  float inB = smoothstep(1.525, 1.525 + edge, rho) * (1.0 - smoothstep(1.95, 1.95 + edge, rho));
  float inA = smoothstep(2.025, 2.025 + edge, rho) * (1.0 - smoothstep(2.27, 2.27 + edge, rho));
  float gap = 1.0 - 0.8 * exp(-pow((rho - 2.214) / max(0.006, soft), 2.0));
  // Countless ringlets.
  float fine = 0.82 + 0.18 * sin(rho * 173.0) * sin(rho * 61.0 + 1.3);
  fine = mix(1.0, fine, clamp(0.02 / max(soft, 0.001), 0.0, 1.0));
  return (0.13 * inC + (0.75 + 0.35 * smoothstep(1.55, 1.9, rho)) * inB + 0.04 * (1.0 - inA) * step(1.95, rho) * step(rho, 2.03) + 0.55 * inA * gap) * fine;
}

// The noise is worked out once, whatever the kind of surface: three patterns that every kind
// draws from. Kept out of the branches below, where it would make the shader slow to compile.
vec3 paint(vec3 q, float kind, float seed, float contrast, bool detail) {
  float coarse = fbm(q * 2.3 + seed);
  float fine = fbm(q * 7.5 + seed * 1.7);
  // Stretched along the lines of latitude: belts, streaks and cloud bands.
  float banded = fbm(vec3(q.xy * 2.6, q.z * 8.0) + seed);
  float pits = noise3(q * 13.0 + seed * 3.1);
  float lon = atan(q.y, q.x);
  vec3 col;
  if (kind < 0.5) {
    col = mix(vColorA, vColorB, smoothstep(0.42, 0.62, coarse) * contrast);
    col *= (0.8 + 0.4 * fine) * (1.0 - 0.25 * smoothstep(0.66, 0.74, pits));
  } else if (kind < 1.5) {
    float turb = banded - 0.5;
    float lat = q.z + 0.07 * turb * contrast;
    float belts = 0.5 + 0.5 * sin(lat * 21.0 + 1.4 * sin(lat * 8.0 + seed));
    float thin = 0.5 + 0.5 * sin(lat * 63.0 + 4.0 * turb);
    col = mix(vColorA, vColorB, smoothstep(0.25, 0.75, mix(belts, thin, 0.28)) * (0.35 + 0.65 * contrast));
    col *= 1.0 - 0.3 * smoothstep(0.62, 0.97, abs(q.z));
    // A great storm in the southern belts.
    float storm = exp(-(pow(lon - 0.6, 2.0) / 0.05 + pow(q.z + 0.37, 2.0) / 0.009));
    col = mix(col, vec3(0.74, 0.3, 0.18), storm * step(0.8, contrast) * 0.9);
  } else if (kind < 2.5) {
    col = mix(vColorA, vColorB, 0.5 + 0.5 * sin(q.z * 11.0 + seed) * 0.6 * contrast);
    col = mix(col, vec3(0.9, 0.95, 1.0), smoothstep(0.66, 0.78, banded) * contrast * 0.55);
    // A dark storm.
    float storm = exp(-(pow(lon + 0.4, 2.0) / 0.06 + pow(q.z + 0.33, 2.0) / 0.012));
    col *= 1.0 - 0.45 * storm * step(0.5, contrast);
  } else if (kind < 3.5) {
    // Unbroken cloud, in soft bands.
    col = mix(vColorA, vColorB, smoothstep(0.3, 0.72, 0.6 * banded + 0.4 * coarse) * contrast);
  } else if (kind < 4.5) {
    col = mix(vec3(0.04, 0.2, 0.46), vec3(0.24, 0.36, 0.16), smoothstep(0.5, 0.53, coarse));
    col = mix(col, vec3(0.93, 0.95, 1.0), smoothstep(0.78, 0.9, abs(q.z)));
    col = mix(col, vec3(1.0), smoothstep(0.42, 0.72, 0.5 * (fine + banded)) * 0.9);
  } else if (kind < 5.5) {
    col = mix(vColorA, vColorB, smoothstep(0.5, 0.68, coarse) * contrast) * (0.85 + 0.3 * fine);
    col = mix(col, vec3(0.96, 0.95, 0.93), smoothstep(0.84, 0.92, abs(q.z) + 0.07 * (fine - 0.5)));
  } else {
    // Pluto: a dark band of old terrain, and a bright heart-shaped plain of ice.
    col = mix(vColorA, vColorB, smoothstep(0.4, 0.62, coarse + 0.25 * (0.25 - abs(q.z + 0.2))) * contrast);
    float heart = distance(q, normalize(vec3(0.75, -0.55, 0.1))) + 0.14 * (fine - 0.5);
    col = mix(col, vec3(0.97, 0.93, 0.86), 1.0 - smoothstep(0.38, 0.5, heart));
  }
  // Too small on screen to show any of that: one flat colour.
  vec3 plain = kind > 3.5 && kind < 4.5 ? vec3(0.3, 0.45, 0.7) : mix(vColorA, vColorB, 0.35);
  return detail ? col : plain;
}

void main() {
  vec3 rd = normalize(vView);
  vec3 oc = -vCenter;
  // The ray in the body's own frame, where its radius is 1 and its pole points along z.
  vec3 ro = vec3(dot(oc, vRotX), dot(oc, vRotY), dot(oc, vRotZ)) / vRadius;
  vec3 dir = vec3(dot(rd, vRotX), dot(rd, vRotY), dot(rd, vRotZ));
  vec3 sun = vec3(dot(vSun, vRotX), dot(vSun, vRotY), dot(vSun, vRotZ));
  vec3 axes = vec3(1.0, vShape);

  vec3 o2 = ro / axes;
  vec3 d2 = dir / axes;
  float a = dot(d2, d2);
  float b = dot(o2, d2);
  // 1 - (distance of the ray from the centre)²: positive on the globe, zero at its edge.
  float h = b * b / a - (dot(o2, o2) - 1.0);
  float cover = clamp(h / max(fwidth(h), 1e-5) + 0.5, 0.0, 1.0);
  float tGlobe = (-b - sqrt(max(h * a, 0.0))) / a;

  // Where the ray crosses the plane of the rings. Worked out for every pixel, ringed or not:
  // screen-space derivatives must not sit inside a branch, or the whole shader compiles slowly.
  float tRing = abs(dir.z) > 0.0002 ? -ro.z / dir.z : -1.0;
  vec3 pr = ro + tRing * dir;
  float rho = length(pr.xy);
  float ringSoft = fwidth(rho);

  float kind = vLook.x;
  bool detail = vPx > 3.0;
  vec3 globe = vec3(0.0);
  if (cover > 0.0) {
    vec3 p = ro + tGlobe * dir;
    vec3 q = normalize(p / axes);
    vec3 nBody = normalize(p / (axes * axes));
    float facing = max(-dot(nBody, dir), 0.0);
    float lambert = dot(nBody, sun);
    // A soft terminator; the night side keeps a trace of light so the disc still reads as a globe.
    float light = 0.035 + 0.965 * smoothstep(-0.08, 0.22, lambert) * (0.3 + 0.7 * max(lambert, 0.0));

    // The rings cast their shadow on the globe.
    if (vLook.w > 0.5 && abs(sun.z) > 0.001) {
      float ts = -p.z / sun.z;
      if (ts > 0.0) {
        vec3 hit = p + ts * sun;
        light *= exp(-1.3 * ringDensity(length(hit.xy), vLook.w, 0.02));
      }
    }

    globe = paint(q, kind, vLook.y, vLook.z, detail) * light;
    // Atmospheres darken towards the limb, and a thin rim of haze catches the light.
    if (kind > 0.5 && kind < 4.5) {
      globe *= 0.5 + 0.5 * pow(facing, 0.45);
      vec3 haze = kind > 3.5 ? vec3(0.3, 0.55, 1.0) : mix(vColorA, vec3(1.0), 0.3);
      globe += haze * pow(1.0 - facing, 3.5) * smoothstep(-0.1, 0.4, lambert) * 0.5;
    }
  }

  vec4 color = vec4(globe * cover, cover);

  if (vLook.w > 0.5 && tRing > 0.0) {
    {
      float density = ringDensity(rho, vLook.w, ringSoft);
      if (density > 0.001) {
        float opacity = 1.0 - exp(-2.2 * density);
        // Lit from the side we look at, the rings reflect; from the other, sunlight filters through.
        float sameSide = step(0.0, sun.z * ro.z);
        float brightness = vLook.w > 1.5 ? 0.85 : mix(0.5 * exp(-1.6 * density), 1.0, sameSide);
        // The globe's shadow falls across the rings.
        vec3 so = pr / axes;
        vec3 sd = sun / axes;
        float sb = dot(so, sd);
        // How far this point of the rings is from the axis of the shadow, in globe radii; soft at the edge.
        float off = sqrt(max(dot(so, so) - sb * sb / dot(sd, sd), 0.0));
        if (sb < 0.0) brightness *= mix(0.06, 1.0, smoothstep(0.94, 1.05, off));
        vec3 tint = vLook.w > 1.5 ? vec3(0.72, 0.8, 0.86) : mix(vColorA, vec3(1.0, 0.95, 0.85), 0.5) * (0.75 + 0.3 * smoothstep(1.5, 2.3, rho));
        vec4 ring = vec4(tint * brightness * opacity, opacity);
        bool inFront = cover <= 0.0 || tRing < tGlobe;
        color = inFront ? ring + color * (1.0 - ring.a) : color + ring * (1.0 - color.a);
      }
    }
  }

  if (color.a < 0.004) discard;
  // Bodies are solid: where two layers both draw one mid-crossfade, they must add up to opaque.
  float fade = 1.0 - pow(1.0 - uFade, 3.0);
  gl_FragColor = color * fade;
}
`;

/** Collects planets and moons and draws them as one instanced mesh of ray-traced spheres. */
export class BodyBuf {
  private readonly looks: BodyLook[] = [];
  private body!: THREE.InstancedBufferAttribute;

  get count(): number {
    return this.looks.length;
  }

  /** @returns the index to pass to `place` */
  add(look: BodyLook): number {
    this.looks.push(look);
    return this.looks.length - 1;
  }

  /**
   * @param sun where the light comes from, in the space the mesh is added to
   */
  toMesh(u: LayerUniforms, sun: THREE.Vector3): THREE.Mesh {
    const n = this.looks.length;
    const look = new Float32Array(n * 4);
    const axis = new Float32Array(n * 4);
    const shape = new Float32Array(n * 4);
    const colorA = new Float32Array(n * 3);
    const colorB = new Float32Array(n * 3);
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();

    this.looks.forEach((l, i) => {
      const rings = l.rings === 'saturn' ? 1 : l.rings === 'thin' ? 2 : 0;
      look.set([KIND_INDEX[l.kind], l.seed ?? i * 5.3 + 1.1, l.contrast ?? 1, rings], i * 4);
      const tilt = l.axis ?? [0, 0, 0];
      q.setFromEuler(e.set(tilt[0], tilt[1], tilt[2]));
      axis.set([q.x, q.y, q.z, q.w], i * 4);
      shape.set([l.shape?.[1] ?? 1, l.shape?.[2] ?? 1, l.spin ?? 0, i * 1.7], i * 4);
      colorA.set(l.color, i * 3);
      colorB.set(l.color2, i * 3);
    });

    const plane = new THREE.PlaneGeometry(2, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.setAttribute('position', plane.getAttribute('position'));
    geo.instanceCount = n;
    this.body = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.body.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aBody', this.body);
    geo.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 4));
    geo.setAttribute('aAxis', new THREE.InstancedBufferAttribute(axis, 4));
    geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 4));
    geo.setAttribute('aColorA', new THREE.InstancedBufferAttribute(colorA, 3));
    geo.setAttribute('aColorB', new THREE.InstancedBufferAttribute(colorB, 3));

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uFade: u.uFade, uTime: u.uTime, uPxWorld: u.uPxWorld, uDpr: u.uDpr, uSunPos: { value: sun } },
      transparent: true,
      // Colours come out already multiplied by their opacity.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Moves body `index` and sets the radius it is drawn at. Call `commit` once all are placed. */
  place(index: number, x: number, y: number, z: number, radius: number): void {
    this.body.setXYZW(index, x, y, z, radius);
  }

  commit(): void {
    this.body.needsUpdate = true;
  }
}
