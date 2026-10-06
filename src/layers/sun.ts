import * as THREE from 'three';
import { onDisc, PROMINENCES, SUNSPOTS } from '../app/solarSystem';
import { CAM_DIST } from './constants';
import { NOISE_GLSL } from './noise';
import type { LayerUniforms } from './points';

const VERT = /* glsl */ `
uniform vec3 uCenter;
uniform float uRadius;
uniform float uGlow;
uniform float uPxWorld;
uniform float uDpr;
varying vec3 vView;
varying vec3 vCenter;
varying float vRadius;
varying float vGlow;
varying float vPx;
varying vec3 vRotX;
varying vec3 vRotY;
varying vec3 vRotZ;

void main() {
  vec4 c = modelViewMatrix * vec4(uCenter, 1.0);
  float k = length(modelViewMatrix[0].xyz);
  float glow = uGlow * k;
  if (length(c.xyz) < 2.4 * glow) {
    // Close to the Sun, or inside its glow: cover the whole screen.
    gl_Position = vec4(position.xy, 0.0, 1.0);
    vView = vec3(position.x / projectionMatrix[0][0], position.y / projectionMatrix[1][1], -1.0);
  } else {
    vec4 mv = c;
    mv.xy += position.xy * glow * 1.5;
    gl_Position = projectionMatrix * mv;
    vView = mv.xyz;
  }
  vCenter = c.xyz;
  vRadius = uRadius * k;
  vGlow = glow;
  // Device pixels per radian of the Sun's surface where it is nearest: decides how much detail is worth drawing.
  // From afar this is simply the radius of the disc on screen.
  vPx = vRadius * uPxWorld * uDpr * ${CAM_DIST.toFixed(1)} / max(length(c.xyz) - vRadius, 0.5);
  mat3 toView = mat3(modelViewMatrix) / k;
  vRotX = toView[0];
  vRotY = toView[1];
  vRotZ = toView[2];
}
`;

const FRAG = /* glsl */ `
#define SPOTS ${SUNSPOTS.length}
#define PROMINENCES ${PROMINENCES.length}
uniform float uFade;
uniform float uTime;
uniform vec4 uSpots[SPOTS];        // direction on the sphere, angular radius
uniform vec3 uProminences[PROMINENCES];  // angle on the limb, half-width, height
varying vec3 vView;
varying vec3 vCenter;
varying float vRadius;
varying float vGlow;
varying float vPx;
varying vec3 vRotX;
varying vec3 vRotY;
varying vec3 vRotZ;
${NOISE_GLSL}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Distances to the nearest and second-nearest of a field of drifting points: the cells between
// them are convection cells, and the cell walls are where the two distances meet.
vec2 cells(vec3 x, float t) {
  vec3 base = floor(x);
  vec3 f = x - base;
  float d1 = 8.0;
  float d2 = 8.0;
  for (int k = -1; k <= 1; k++) {
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 o = 0.5 + 0.4 * sin(t + 6.2831 * hash33(base + g));
        vec3 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
  }
  return sqrt(vec2(d1, d2));
}

// Bright cells with dark lanes between them; 0 in a lane, about 1 in the middle of a cell.
float convection(vec3 x, float t) {
  vec2 c = cells(x, t);
  return smoothstep(0.03, 0.26, c.y - c.x) * (1.08 - 0.3 * c.x);
}

float angleBetween(float a, float b) {
  return abs(mod(a - b + 3.14159265, 6.2831853) - 3.14159265);
}

void main() {
  vec3 rd = normalize(vView);
  vec3 oc = -vCenter;
  float b = dot(oc, rd);
  // The ray's closest approach to the Sun's centre.
  vec3 near = oc - b * rd;
  float d2 = dot(near, near);
  float d = sqrt(d2);
  float rho = d / vRadius;
  float h = vRadius * vRadius - d2;
  bool ahead = b < 0.0;
  float cover = ahead ? clamp(h / max(fwidth(h), 1e-6) + 0.5, 0.0, 1.0) : 0.0;

  vec3 disc = vec3(0.0);
  if (cover > 0.0) {
    vec3 p = oc + (-b - sqrt(max(h, 0.0))) * rd;
    vec3 n = p / vRadius;
    // The same point in the Sun's own frame, so its face stays put while the view slides around.
    vec3 q = normalize(vec3(dot(n, vRotX), dot(n, vRotY), dot(n, vRotZ)));
    float mu = max(-dot(n, rd), 0.0);

    // Three sizes of convection, each drawn only once its cells are wide enough to resolve.
    float light = 1.0 + 0.16 * (fbm(q * 5.0 + uTime * 0.004) - 0.5);
    float wNetwork = smoothstep(2.5, 7.0, vPx / 30.0);
    float wMeso = smoothstep(2.5, 7.0, vPx / 160.0);
    float wGranule = smoothstep(2.5, 7.0, vPx / 600.0);
    // The largest cells show only as a soft mottling, never as sharp lanes.
    if (wNetwork > 0.0) light *= mix(1.0, 1.06 - 0.16 * cells(q * 30.0, uTime * 0.03).x, wNetwork * (1.0 - 0.7 * wGranule));
    if (wMeso > 0.0) light *= mix(1.0, 0.93 + 0.09 * convection(q * 160.0, uTime * 0.08), wMeso * (1.0 - 0.5 * wGranule));
    if (wGranule > 0.0) light *= mix(1.0, 0.52 + 0.6 * convection(q * 600.0, uTime * 0.3), wGranule);
    // Fine grain where the granules are still too small to make out.
    light *= 1.0 + 0.1 * (fbm(q * 70.0 + uTime * 0.01) - 0.5) * wNetwork * (1.0 - wGranule);

    // Sunspots: a dark umbra inside a striated penumbra. The spot a point belongs to is found
    // first, so that its texture is only worked out once.
    vec4 nearest = vec4(0.0);
    float reach = 1.7;
    float which = 0.0;
    for (int i = 0; i < SPOTS; i++) {
      float a = length(q - uSpots[i].xyz) / uSpots[i].w;
      if (a < reach) {
        reach = a;
        nearest = uSpots[i];
        which = float(i);
      }
    }
    if (nearest.w > 0.0) {
      vec3 sd = nearest.xyz;
      float sr = nearest.w;
      vec3 dv = q - sd;
      vec3 t1 = normalize(cross(sd, vec3(0.3, 0.2, 1.0)));
      vec3 t2 = cross(sd, t1);
      float th = atan(dot(dv, t2), dot(dv, t1));
      vec3 around = vec3(cos(th), sin(th), which * 3.7);
      float x = length(dv) / (sr * (0.8 + 0.4 * fbm(around * 1.6)));
      // Fibrils combed outwards, each ending at its own length; visible only when the spot is large on screen.
      float comb = noise3(vec3(around.xy * 15.0, x * 1.2 + around.z));
      float fine = smoothstep(6.0, 20.0, sr * vPx);
      float umbra = 1.0 - smoothstep(0.38, 0.47, x + 0.07 * (comb - 0.5) * fine);
      float inside = 1.0 - smoothstep(0.92, 1.0, x + 0.22 * (comb - 0.5) * fine);
      float fibrils = mix(0.62, 0.36 + 0.5 * noise3(vec3(around.xy * 40.0, x * 2.0 + around.z)), fine) * (0.8 + 0.2 * x);
      // Inside a spot the fibrils replace the granules.
      light = mix(light, mix(fibrils, 0.07 + 0.06 * comb, umbra), inside);
    }

    // Darker and redder towards the limb, where we look through more of the cooler upper layers.
    float limb = 0.32 + 0.68 * pow(mu, 0.6);
    vec3 tone = mix(vec3(1.0, 0.3, 0.04), vec3(1.0, 0.66, 0.2), pow(mu, 0.8));
    disc = tone * limb * light;
    // The brightest granule tops run to white-hot.
    disc += vec3(0.35, 0.3, 0.16) * smoothstep(0.95, 1.3, light) * limb;
    // Bright patches of faculae near the limb.
    disc += vec3(0.3, 0.2, 0.08) * (1.0 - mu) * smoothstep(0.55, 0.75, fbm(q * 14.0 + 3.0));
  }

  // Everything beyond the edge of the disc is light added on top of the sky.
  vec3 sky = vec3(0.0);
  float out1 = 1.0 - cover;
  if (out1 > 0.0 && ahead) {
    float height = max(rho - 1.0, 0.0);
    float phi = atan(near.y, near.x);
    vec3 dir2 = vec3(cos(phi), sin(phi), 0.0);

    // From afar the Sun is a point of light in a soft halo.
    float x = clamp(d / vGlow, 0.0, 1.0);
    float core = max(vRadius, 0.05 * vGlow);
    sky += vec3(1.0, 0.97, 0.88) * exp(-d2 / (core * core)) * (1.0 - smoothstep(4.0, 12.0, vPx));
    sky += vec3(1.0, 0.8, 0.46) * (0.2 * pow(1.0 - x, 3.0) + 0.42 * pow(1.0 - x, 14.0));

    if (vPx > 12.0) {
      float resolved = smoothstep(12.0, 40.0, vPx);
      // The corona: streamers reaching out, fading fast with height.
      float streamers = 0.35 + 1.3 * pow(fbm(dir2 * 2.2 + 4.0), 2.0);
      float rays = 0.6 + 0.8 * fbm(vec3(dir2.xy * 9.0, rho * 0.7));
      vec3 corona = vec3(1.0, 0.86, 0.66) * (0.55 * pow(rho, -7.0) * rays + 0.16 * pow(rho, -2.6) * streamers);
      sky += corona * resolved * (1.0 - smoothstep(0.5, 1.0, x));

      // The chromosphere: a thin red fringe of spicules.
      float fringe = exp(-height / 0.012) * (0.55 + 0.6 * noise3(vec3(dir2.xy * 90.0, uTime * 0.2)));
      vec3 glowing = vec3(1.0, 0.36, 0.14) * fringe;

      // Prominences: arches of gas along loops of the magnetic field. They do not overlap,
      // so at most one of them crosses this line of sight.
      vec3 pr = vec3(0.0);
      float which = 0.0;
      for (int i = 0; i < PROMINENCES; i++) {
        if (angleBetween(phi, uProminences[i].x) < uProminences[i].y * 1.4) {
          pr = uProminences[i];
          which = float(i);
        }
      }
      if (pr.z > 0.0 && height < pr.z * 1.6) {
        float side = mod(phi - pr.x + 3.14159265, 6.2831853) - 3.14159265;
        float u = abs(side) / pr.y;
        float arch = pr.z * sqrt(max(1.0 - u * u, 0.0));
        float strands = 0.45 + 1.1 * fbm(vec3(side / pr.y * 4.0, height / pr.z * 5.0, which * 7.0 + uTime * 0.03));
        float thickness = pr.z * 0.2;
        float loop = exp(-pow((height - arch) / thickness, 2.0)) * smoothstep(1.02, 0.85, u);
        // Gas hanging below the arch, thinning out upwards.
        float curtain = step(u, 1.0) * smoothstep(arch, arch * 0.2, height) * 0.5;
        glowing += vec3(1.0, 0.4, 0.16) * (loop + curtain) * strands;
      }
      sky += glowing * resolved;
    }
  }

  // The disc is solid: where two layers both draw it mid-crossfade, they must add up to opaque.
  float solid = cover * (1.0 - pow(1.0 - uFade, 3.0));
  gl_FragColor = vec4(disc * solid + sky * out1 * uFade, solid);
}
`;

/** The Sun: a ray-traced sphere with a boiling surface, spots, prominences and a corona. */
export class SunMesh {
  readonly mesh: THREE.Mesh;
  private readonly radius = { value: 1 };
  private readonly glow = { value: 1 };

  /**
   * @param center the Sun's centre, in the space the mesh is added to; its face is fixed in that space
   */
  constructor(u: LayerUniforms, center: THREE.Vector3) {
    const spots = SUNSPOTS.map((spot) => {
      const [x, y, z] = onDisc(spot.x, spot.y);
      return new THREE.Vector4(x, y, z, spot.radius);
    });
    const prominences = PROMINENCES.map((p) => new THREE.Vector3(THREE.MathUtils.degToRad(p.angle), p.width, p.height));
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uFade: u.uFade,
        uTime: u.uTime,
        uPxWorld: u.uPxWorld,
        uDpr: u.uDpr,
        uCenter: { value: center },
        uRadius: this.radius,
        uGlow: this.glow,
        uSpots: { value: spots },
        uProminences: { value: prominences },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // The disc covers what is behind it, the glow is added: colours come out already multiplied by opacity.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
  }

  /** @param radius drawn radius of the disc; @param glow how far its light reaches. Both in the mesh's space. */
  set(radius: number, glow: number): void {
    this.radius.value = radius;
    this.glow.value = glow;
  }
}
