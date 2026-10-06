import * as THREE from 'three';
import type { Rng } from '../util/rng';
import { CAM_DIST } from './constants';
import type { LayerUniforms, RGB } from './points';

type Vec3 = [number, number, number];

/**
 * Everything that makes one galaxy look different from another.
 * Lengths are fractions of the sprite's radius; the disc reaches out to about 0.95.
 */
export interface GalaxyLook {
  /** Number of spiral arms (0 = none). */
  arms: number;
  /** Tangent of the pitch angle: small = tightly wound. */
  pitch: number;
  /** 0 = smooth disc, 1 = nearly all the light in the arms. */
  armContrast: number;
  /** Half-length of the central bar (0 = none). The arms start at its ends. */
  bar: number;
  /** Core radius of the bulge. */
  bulge: number;
  /** Bulge height over width: 1 = round. */
  bulgeFlatten: number;
  /** Exponential scale length of the disc. */
  discScale: number;
  /** Scale height of the disc. */
  thickness: number;
  /** Central surface brightness of the disc, seen face-on. */
  disc: number;
  /** Central surface brightness of the bulge. */
  bulgeLight: number;
  /** Optical depth of the dust at the centre, seen face-on. */
  dust: number;
  /** 0 = old and yellow, 1 = blue arms studded with pink nebulae. */
  starFormation: number;
  /** 0 = clean arms, 1 = broken into patches. */
  flocculence: number;
  /** Radius of a ring (0 = none). */
  ring: number;
  /** Brightness of a star-forming ring at that radius. */
  ringLight: number;
  /** 1 = the dust sits in the ring instead of following the disc. */
  dustRing: number;
  /** Brightness of a jet shooting out of the nucleus. */
  jet: number;
}

const SPIRAL: GalaxyLook = {
  arms: 2,
  pitch: 0.3,
  armContrast: 0.8,
  bar: 0,
  bulge: 0.065,
  bulgeFlatten: 0.8,
  discScale: 0.24,
  thickness: 0.028,
  disc: 0.85,
  bulgeLight: 1.5,
  dust: 1.1,
  starFormation: 0.8,
  flocculence: 0.22,
  ring: 0,
  ringLight: 0,
  dustRing: 0,
  jet: 0,
};

const ELLIPTICAL: GalaxyLook = {
  ...SPIRAL,
  arms: 0,
  armContrast: 0,
  bulge: 0.17,
  bulgeFlatten: 0.75,
  disc: 0,
  bulgeLight: 1.9,
  dust: 0,
  starFormation: 0,
  flocculence: 0,
};

/** The Hubble tuning fork, more or less. */
export const LOOKS = {
  grandDesign: { ...SPIRAL, pitch: 0.34, armContrast: 0.95, starFormation: 1 },
  multiArm: { ...SPIRAL, arms: 4, pitch: 0.26, armContrast: 0.7, flocculence: 0.35 },
  flocculent: { ...SPIRAL, arms: 5, pitch: 0.22, armContrast: 0.4, flocculence: 0.95, bulge: 0.05 },
  barred: { ...SPIRAL, pitch: 0.38, armContrast: 0.95, bar: 0.3, bulge: 0.05 },
  lenticular: { ...SPIRAL, arms: 0, armContrast: 0, bulge: 0.15, bulgeLight: 2.2, disc: 0.55, dust: 0.35, starFormation: 0, flocculence: 0.1 },
  elliptical: ELLIPTICAL,
  giantElliptical: { ...ELLIPTICAL, bulge: 0.26, bulgeFlatten: 0.9, bulgeLight: 2.4 },
  dwarfElliptical: { ...ELLIPTICAL, bulge: 0.3, bulgeFlatten: 0.8, bulgeLight: 0.55 },
  irregular: {
    ...SPIRAL,
    arms: 0,
    armContrast: 0,
    bulge: 0.04,
    bulgeLight: 0.25,
    discScale: 0.33,
    thickness: 0.09,
    disc: 0.8,
    dust: 0.3,
    starFormation: 1,
    flocculence: 1,
  },
} satisfies Record<string, GalaxyLook>;

export interface GalaxyInstance {
  /** Centre, in the space of whatever the mesh is added to. */
  center: Vec3;
  /** Radius of the sphere that bounds the galaxy. */
  radius: number;
  look: GalaxyLook;
  /** Inclination in degrees: 0 = face-on, 90 = edge-on. */
  incl?: number;
  /** Direction of the major axis on the sky, degrees counter-clockwise from +x. */
  pa?: number;
  /** Rotation of the spiral pattern about the disc's own axis, radians. */
  spin?: number;
  /** Explicit orientation; overrides `incl` and `pa`. */
  orientation?: THREE.Quaternion;
  seed?: number;
  brightness?: number;
  tint?: RGB;
  /** Dissolve as the camera closes in, rather than growing to fill the screen. For background galaxies. */
  fadeNear?: boolean;
}

const VERT = /* glsl */ `
attribute vec4 aShape;
attribute vec4 aBody;
attribute vec4 aLook;
attribute vec4 aMisc;
attribute vec4 aMore;
attribute vec4 aTint;
uniform float uPxWorld;
uniform float uDpr;
varying vec3 vRo;
varying vec3 vPos;
varying vec4 vShape;
varying vec4 vBody;
varying vec4 vLook;
varying vec4 vMisc;
varying vec4 vMore;
varying vec3 vTint;
varying float vPx;
varying float vNear;

void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec3 center = m[3].xyz;
  mat3 basis = mat3(m);
  float s2 = dot(basis[0], basis[0]);
  float s = sqrt(s2);
  // World → the galaxy's own space, where its bounding sphere has radius 1 and the disc lies in xy.
  mat3 toLocal = transpose(basis) / s2;
  vec3 toCam = cameraPosition - center;
  float dist = length(toCam);
  vec3 world;
  if (dist < s * 1.25) {
    // The camera is inside (or almost inside) the galaxy: cover the whole screen.
    gl_Position = vec4(position.xy, 0.0, 1.0);
    vec3 dir = vec3(position.x / projectionMatrix[0][0], position.y / projectionMatrix[1][1], -1.0);
    world = cameraPosition + transpose(mat3(viewMatrix)) * dir;
  } else {
    // A camera-facing quad just large enough to cover the sphere's silhouette.
    vec3 fwd = toCam / dist;
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.001), fwd));
    vec3 up = cross(fwd, right);
    float grow = 1.03 / sqrt(1.0 - s2 / (dist * dist));
    world = center + (right * position.x + up * position.y) * s * grow;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
  vRo = toLocal * toCam;
  vPos = toLocal * (world - center);
  vShape = aShape;
  vBody = aBody;
  vLook = aLook;
  vMisc = aMisc;
  vMore = aMore;
  vTint = aTint.rgb;
  // Diameter on screen in device pixels: drives the level of detail.
  vPx = 2.0 * s * uPxWorld * uDpr * ${CAM_DIST.toFixed(1)} / max(dist, 0.5);
  // Background galaxies bow out as the camera sweeps past them, before they loom large or get close.
  float tooClose = smoothstep(s * 1.6 + 0.4, s * 3.0 + 2.0, dist);
  float tooLarge = 1.0 - smoothstep(60.0, 150.0, vPx / uDpr);
  vNear = mix(1.0, tooClose * tooLarge, aTint.a);
}
`;

/**
 * A galaxy is ray-marched through a small 3D model: an exponential disc of stars with spiral
 * arms, a thinner layer of dust inside it, and a bulge. Marching the real volume is what makes
 * edge-on views work: the dust lane crossing the bulge comes for free.
 */
const FRAG = /* glsl */ `
uniform float uFade;
varying vec3 vRo;
varying vec3 vPos;
varying vec4 vShape; // arms, pitch, armContrast, bar
varying vec4 vBody;  // bulge, bulgeFlatten, discScale, thickness
varying vec4 vLook;  // disc, bulgeLight, dust, starFormation
varying vec4 vMisc;  // seed, phase, flocculence, ring
varying vec4 vMore;  // ringLight, dustRing, jet, brightness
varying vec3 vTint;
varying float vPx;
varying float vNear;

const vec3 OLD = vec3(1.0, 0.84, 0.64);
const vec3 YOUNG = vec3(0.56, 0.72, 1.0);
const vec3 HII = vec3(1.0, 0.3, 0.46);
const vec3 CORE = vec3(1.0, 0.83, 0.6);

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

float dither(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// Integral of the vertical profile exp(-|z|/h) / 2h along a ray step whose height runs z1 → z2.
// Exact, so a thin disc never slips between two samples.
float column(float z1, float z2, float h, float dt) {
  float dz = z2 - z1;
  if (abs(dz) < 0.02 * h) return dt * exp(-abs(0.5 * (z1 + z2)) / h) / (2.0 * h);
  float g1 = sign(z1) * (1.0 - exp(-abs(z1) / h));
  float g2 = sign(z2) * (1.0 - exp(-abs(z2) / h));
  return dt * 0.5 * (g2 - g1) / dz;
}

// The bulge is a (1 + m²)^-3/2 spheroid, which has a closed-form integral along any ray:
// set up once per pixel, then bulgeF(b) - bulgeF(a) is the light between ray distances a and b.
float gBulgeShift;
float gBulgeA2;
float bulgeF(float t) {
  float u = t + gBulgeShift;
  return u / (gBulgeA2 * sqrt(gBulgeA2 + u * u));
}

float armWave(float r, float th, float r0, float offset, float sharpness) {
  float winding = log(max(r, 0.001) / r0) / vShape.y;
  return pow(0.5 + 0.5 * cos(vShape.x * (th - winding - vMisc.y) + offset), sharpness);
}

// Starlight and dust at a point of the disc plane, before the vertical profile is applied.
void discAt(vec2 q, bool detail, out vec3 light, out float dust) {
  float r = length(q);
  float edge = 1.0 - smoothstep(0.78, 0.97, r);
  float fall = exp(-r / vBody.z) * edge;
  if (!detail) {
    light = mix(OLD, YOUNG, 0.35 * vLook.w) * fall * vLook.x;
    dust = 0.4 * vLook.z * fall;
    return;
  }

  float th = atan(q.y, q.x);
  float n1 = vnoise(q * 8.0 + vMisc.x);
  float n2 = vnoise(q * 30.0 + vMisc.x * 1.7);
  float flocc = vMisc.z;
  float contrast = vShape.z;
  float sf = vLook.w;

  float arm = 0.0;
  float lane = 0.0;
  if (vShape.x > 0.5) {
    float r0 = max(vShape.w, 0.1);
    float grow = smoothstep(r0 * 0.6, r0 * 1.3, r);
    float warp = (n1 - 0.5) * flocc * 4.0;
    arm = armWave(r, th, r0, warp, 2.4) * grow;
    // Dust gathers on the inner edge of each arm.
    lane = armWave(r, th, r0, warp + 1.0, 3.0) * grow;
  }

  float ring = 0.0;
  float dustRing = 0.0;
  if (vMisc.w > 0.0) {
    float d = (r - vMisc.w) / 0.06;
    ring = exp(-d * d) * vMore.x;
    d = (r - vMisc.w) / 0.1;
    dustRing = exp(-d * d);
  }

  float patches = mix(1.0, 0.35 + 1.3 * n1, flocc);
  float structure = mix(1.0, 0.2 + 1.9 * arm, contrast) * patches;
  float young = sf * (arm * contrast * 1.2 + flocc * (1.0 - contrast) * smoothstep(0.45, 0.8, n1) + 0.25 * smoothstep(0.15, 0.7, r)) + ring;
  light = mix(OLD, YOUNG, clamp(young, 0.0, 1.0)) * (fall * structure + ring * edge * 0.6) * vLook.x;

  if (vShape.w > 0.0) {
    float c = cos(vMisc.y);
    float s = sin(vMisc.y);
    vec2 b = vec2(c * q.x + s * q.y, c * q.y - s * q.x) / vShape.w;
    light += CORE * vLook.x * 1.6 * exp(-b.x * b.x / 0.22 - b.y * b.y / 0.03);
  }

  // Glowing hydrogen clouds wherever stars are forming.
  float knots = smoothstep(0.66, 0.92, n2) * sf * (arm * contrast + ring + flocc * (1.0 - contrast) * n1);
  light += HII * knots * (fall + ring * 0.3) * 2.2 * vLook.x;

  float spread = mix(exp(-r / (vBody.z * 1.5)) * edge, dustRing, vMore.y);
  dust = vLook.z * spread * mix(1.0, 0.25 + 1.9 * lane, contrast) * (0.5 + n1);
}

// A thin beam along the galaxy's +x axis, seen where the ray passes closest to it.
float jetAt(vec3 ro, vec3 rd) {
  float denom = 1.0 - rd.x * rd.x;
  if (denom < 0.0001) return 0.0;
  float t = (rd.x * ro.x - dot(rd, ro)) / denom;
  vec3 p = ro + rd * t;
  float width = 0.007 + 0.022 * p.x;
  float along = smoothstep(0.01, 0.05, p.x) * (1.0 - smoothstep(0.35, 0.7, p.x));
  float knots = 0.55 + 0.9 * vnoise(vec2(p.x * 22.0, vMisc.x));
  return along * knots * exp(-(p.y * p.y + p.z * p.z) / (width * width));
}

void main() {
  vec3 ro = vRo;
  vec3 rd = normalize(vPos - vRo);

  // Where the ray is inside the bounding sphere.
  float b = dot(ro, rd);
  float h = b * b - (dot(ro, ro) - 1.0);
  if (h <= 0.0) discard;
  h = sqrt(h);
  float t0 = max(-b - h, 0.0);
  float t1 = -b + h;
  if (t1 <= t0) discard;

  float rb = vBody.x;
  float q = vBody.y;
  float hz = vBody.w;

  vec3 o = vec3(ro.xy, ro.z / q);
  vec3 d = vec3(rd.xy, rd.z / q);
  float a = dot(d, d);
  float bo = dot(o, d);
  gBulgeShift = bo / a;
  gBulgeA2 = (rb * rb + max(dot(o, o) - bo * bo / a, 0.0)) / a;
  float bulgeK = vLook.y * rb * rb / (2.0 * a * sqrt(a));

  // The disc and its dust only matter within a few scale heights of the mid-plane.
  // [ta, tb] is the stretch of the ray inside that slab; a galaxy with no disc has none.
  float slab = 5.0 * hz;
  float ta = t1;
  float tb = t1;
  if (vLook.x + vLook.z > 0.0) {
    if (abs(rd.z) > 0.0001) {
      float za = (-slab - ro.z) / rd.z;
      float zb = (slab - ro.z) / rd.z;
      ta = clamp(min(za, zb), t0, t1);
      tb = clamp(max(za, zb), t0, t1);
    } else if (abs(ro.z) <= slab) {
      ta = t0;
    }
  }

  // Front to back: bulge light in front of the disc, the disc itself, then whatever the dust lets through.
  vec3 col = CORE * bulgeK * (bulgeF(ta) - bulgeF(t0));
  float through = 1.0;
  if (tb > ta) {
    bool detail = vPx > 18.0;
    // The larger a galaxy is on screen, the finer it is sampled.
    float finest = vPx > 260.0 ? 0.022 : (vPx > 70.0 ? 0.035 : 0.07);
    float most = vPx > 260.0 ? 28.0 : (vPx > 70.0 ? 18.0 : 10.0);
    // Face-on rays cross the same spot of the disc however many samples are taken; edge-on rays need more.
    float span = (tb - ta) * length(rd.xy);
    float count = detail ? clamp(ceil(span / finest), 3.0, most) : 4.0;
    int steps = int(count);
    float dt = (tb - ta) / count;
    float jitter = dither(gl_FragCoord.xy);
    float f0 = bulgeF(ta);
    for (int i = 0; i < 28; i++) {
      if (i >= steps) break;
      float ts = ta + dt * float(i);
      float z1 = ro.z + rd.z * ts;
      float z2 = z1 + rd.z * dt;
      // Each step samples at its own offset (golden-ratio sequence), which turns banding into fine grain.
      vec3 p = ro + rd * (ts + dt * fract(jitter + float(i) * 0.61803));
      vec3 light;
      float dust;
      discAt(p.xy, detail, light, dust);
      float tau = dust * column(z1, z2, hz * 0.4, dt);
      float fade = exp(-tau);
      float mean = tau > 0.001 ? (1.0 - fade) / tau : 1.0 - 0.5 * tau;
      float f1 = bulgeF(ts + dt);
      col += through * mean * (light * column(z1, z2, hz, dt) + CORE * bulgeK * (f1 - f0));
      f0 = f1;
      through *= fade;
    }
  }
  col += through * CORE * bulgeK * (bulgeF(t1) - bulgeF(tb));

  if (vMore.z > 0.0) col += vec3(0.7, 0.85, 1.0) * vMore.z * jetAt(ro, rd);

  col *= vTint * vMore.w;
  // Soft shoulder, so bright cores roll off instead of clipping.
  col = 1.0 - exp(-col * 1.25);
  gl_FragColor = vec4(col, uFade * vNear);
}
`;

function galaxyMaterial(u: LayerUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uFade: u.uFade, uPxWorld: u.uPxWorld, uDpr: u.uDpr },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * Orientation of a disc with the given inclination and major-axis direction as seen from
 * `viewFrom`. The camera's field of view is wide, so a galaxy near the edge of the frame is
 * looked at from well off to one side; tilting relative to the true line of sight is what
 * keeps an edge-on galaxy edge-on wherever it sits.
 */
export function orient(center: Vec3, incl: number, pa: number, viewFrom?: Vec3): THREE.Quaternion {
  // Tip the disc about its major axis, which stays put on the sky.
  const angle = THREE.MathUtils.degToRad(pa);
  const tilt = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0),
    THREE.MathUtils.degToRad(incl),
  );
  if (!viewFrom) return tilt;
  const toCamera = new THREE.Vector3(viewFrom[0] - center[0], viewFrom[1] - center[1], viewFrom[2] - center[2]).normalize();
  return new THREE.Quaternion().setFromUnitVectors(Z_AXIS, toCamera).multiply(tilt);
}

/** Collects galaxies and turns them into one instanced mesh: one draw call however many there are. */
export class GalaxyBuf {
  private readonly items: GalaxyInstance[] = [];

  /** @param viewFrom where the camera is, in the mesh's space, when inclinations should read true */
  constructor(private readonly viewFrom?: Vec3) {}

  get count(): number {
    return this.items.length;
  }

  add(galaxy: GalaxyInstance): void {
    this.items.push(galaxy);
  }

  toMesh(u: LayerUniforms): THREE.InstancedMesh {
    const n = this.items.length;
    const shape = new Float32Array(n * 4);
    const body = new Float32Array(n * 4);
    const look = new Float32Array(n * 4);
    const misc = new Float32Array(n * 4);
    const more = new Float32Array(n * 4);
    const tint = new Float32Array(n * 4);

    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), galaxyMaterial(u), n);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const tilt = new THREE.Quaternion();
    const twist = new THREE.Quaternion();

    this.items.forEach((g, i) => {
      const l = g.look;
      const spin = g.spin ?? 0;
      shape.set([l.arms, l.pitch, l.armContrast, l.bar], i * 4);
      body.set([l.bulge, l.bulgeFlatten, l.discScale, l.thickness], i * 4);
      look.set([l.disc, l.bulgeLight, l.dust, l.starFormation], i * 4);
      // The pattern's phase is fixed in the galaxy's own frame; `spin` turns the whole galaxy instead.
      misc.set([g.seed ?? i * 7.31 + 1.7, 0, l.flocculence, l.ring], i * 4);
      more.set([l.ringLight, l.dustRing, l.jet, g.brightness ?? 1], i * 4);
      tint.set([...(g.tint ?? [1, 1, 1]), g.fadeNear ? 1 : 0], i * 4);

      tilt.copy(g.orientation ?? orient(g.center, g.incl ?? 0, g.pa ?? 0, this.viewFrom));
      tilt.multiply(twist.setFromAxisAngle(Z_AXIS, spin));
      position.set(g.center[0], g.center[1], g.center[2]);
      mesh.setMatrixAt(i, matrix.compose(position, tilt, scale.setScalar(g.radius)));
    });

    const geo = mesh.geometry;
    geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 4));
    geo.setAttribute('aBody', new THREE.InstancedBufferAttribute(body, 4));
    geo.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 4));
    geo.setAttribute('aMisc', new THREE.InstancedBufferAttribute(misc, 4));
    geo.setAttribute('aMore', new THREE.InstancedBufferAttribute(more, 4));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }
}

/** A plausible mix of galaxy types for the unnamed background population. */
export function randomLook(rng: Rng): GalaxyLook {
  const roll = rng.next();
  if (roll < 0.2) return { ...LOOKS.elliptical, bulge: rng.range(0.12, 0.24), bulgeFlatten: rng.range(0.55, 1), bulgeLight: rng.range(1, 2) };
  if (roll < 0.3) return LOOKS.lenticular;
  if (roll < 0.5) return LOOKS.irregular;
  const base = rng.pick([LOOKS.grandDesign, LOOKS.multiArm, LOOKS.flocculent, LOOKS.barred]);
  return { ...base, pitch: base.pitch * rng.range(0.8, 1.25), starFormation: rng.range(0.5, 1) };
}
