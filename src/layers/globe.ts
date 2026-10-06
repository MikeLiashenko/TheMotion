import * as THREE from 'three';
import { NORTH_ROLL, SITE, SITE_TO_GEO, SUN_AT_SITE, SUN_ELEVATION } from '../app/earthSite';
import { EARTH_RADIUS, SUNLIGHT_ON_EARTH } from '../app/solarSystem';
import { CAM_DIST } from './constants';
import { earthMaps } from './earthMaps';
import { ATMOSPHERE_GLSL, CUMULUS_GLSL, LEVEL_SLOTS, TERRAIN_GLSL } from './earthShaders';
import type { FrameState } from './layer';
import type { LayerUniforms } from './points';
import { AERIAL_TO_SATELLITE } from './siteColours';

/** Direction to the Sun as the screen sees it: where the Solar System layers have just shown it to be. */
const SUN_DIR = new THREE.Vector3(...SUNLIGHT_ON_EARTH).normalize();

/** Heights of the three sheets the fair-weather clouds are drawn on, metres above the ground. */
export const CLOUD_HEIGHTS = [3800, 4400, 5000];
/**
 * From a point on the ground, where to look for the cloud that might be shading it: metres east
 * and north, towards the Sun, for a cloud at the middle height.
 */
const SHADOW_SHIFT = new THREE.Vector2(SUN_AT_SITE[0], SUN_AT_SITE[1]).normalize().multiplyScalar(CLOUD_HEIGHTS[1] / Math.tan(SUN_ELEVATION));

/** What changes about the Earth as the camera comes down: shared by everything one layer draws of it. */
export interface EarthUniforms {
  /** Height of the camera above the landing site, metres. */
  uAltitude: { value: number };
  /** 0 while the aerial photographs are toned to match the satellite pictures around them, 1 once they show their own colours. */
  uGrade: { value: number };
  /** How much of the whole-Earth cloud map shows: it is far too coarse to be looked at from close by. */
  uCloudCover: { value: number };
  /** How thick the cloud is that the camera is flying through, 0..1. */
  uFog: { value: number };
  /** Metres of ground to one pixel of screen, right below the camera. */
  uPixel: { value: number };
}

export function earthUniforms(): EarthUniforms {
  return { uAltitude: { value: 1e9 }, uGrade: { value: 0 }, uCloudCover: { value: 1 }, uFog: { value: 0 }, uPixel: { value: 1e6 } };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const FIRST_AERIAL = SITE.levels.findIndex((level) => level.source === 'aerial');

/**
 * Sets what depends on how high the camera is. It looks straight down, so its height above the
 * landing site is the same as the height of the frame.
 */
export function lookDown(u: EarthUniforms, state: FrameState): void {
  const altitude = 10 ** state.s;
  const aspect = state.aspect;
  u.uAltitude.value = altitude;
  u.uPixel.value = altitude / state.viewportH;
  u.uCloudCover.value = smoothstep(6e5, 2.6e6, altitude);
  // The aerial photographs may show their true colours once nothing else is left in the frame
  // to compare them with: when the frame fits well inside the widest of them.
  const widest = SITE.levels[FIRST_AERIAL].extent;
  u.uGrade.value = 1 - smoothstep(0.5 * widest, 0.9 * widest, altitude * Math.max(aspect, 1));
  // The camera goes down through the cloud that stands over the site: the view whitens as it
  // nears the top of the cloud and clears again below its base.
  const top = CLOUD_HEIGHTS[CLOUD_HEIGHTS.length - 1];
  const base = CLOUD_HEIGHTS[0];
  u.uFog.value = smoothstep(top + 1500, top, altitude) * smoothstep(base - 900, base, altitude);
}

/** Uniforms for the site pictures listed in `levels` (indices into the site's levels, widest first). */
function terrainUniforms(levels: number[], u: EarthUniforms) {
  if (levels.length > LEVEL_SLOTS) throw new Error(`At most ${LEVEL_SLOTS} site levels fit in one material`);
  const maps = earthMaps();
  const slot = (i: number) => levels[i];
  const texture = (i: number) => (slot(i) === undefined ? maps.levels[0] : maps.levels[slot(i)]);
  const on = (i: number) => (slot(i) === undefined ? { value: 0 } : maps.levelOn[slot(i)]);
  const slots = Array.from({ length: LEVEL_SLOTS }, (_, i) => i);
  return {
    uLevel0: texture(0),
    uLevel1: texture(1),
    uLevel2: texture(2),
    uLevel3: texture(3),
    uLevel4: texture(4),
    uOn0: on(0),
    uOn1: on(1),
    uOn2: on(2),
    uOn3: on(3),
    uOn4: on(4),
    uExtent: { value: slots.map((i) => (slot(i) === undefined ? 1 : SITE.levels[slot(i)].extent)) },
    uAerial: { value: slots.map((i) => (slot(i) !== undefined && SITE.levels[slot(i)].source === 'aerial' ? 1 : 0)) },
    uAerialGain: { value: new THREE.Vector3(...AERIAL_TO_SATELLITE.gain) },
    uAerialOffset: { value: new THREE.Vector3(...AERIAL_TO_SATELLITE.offset) },
    uGrade: u.uGrade,
  };
}

let sphere: THREE.BufferGeometry | undefined;

/**
 * A unit sphere whose "pole" is the landing site: x east, y north, z up there. Its rings are
 * packed tightly around the site and spread out with distance, so that the ground stays round
 * (not faceted) however close the camera comes, without millions of triangles elsewhere.
 */
function siteSphere(): THREE.BufferGeometry {
  if (sphere) return sphere;
  const around = 192;
  // Angular distances of the rings from the site: growing by a tenth each time, then evenly.
  const rings: number[] = [];
  for (let angle = 5e-5; angle < 0.0245; angle *= 1.1) rings.push(angle);
  const even = Math.round((Math.PI - 0.0245) / 0.0245);
  for (let i = 0; i < even; i++) rings.push(0.0245 + ((Math.PI - 0.0245) * i) / even);

  const positions: number[] = [0, 0, 1];
  for (const angle of rings) {
    for (let j = 0; j < around; j++) {
      const turn = (j / around) * Math.PI * 2;
      positions.push(Math.sin(angle) * Math.cos(turn), Math.sin(angle) * Math.sin(turn), Math.cos(angle));
    }
  }
  positions.push(0, 0, -1);
  const last = positions.length / 3 - 1;

  const index: number[] = [];
  const at = (ring: number, j: number) => 1 + ring * around + (j % around);
  for (let j = 0; j < around; j++) index.push(0, at(0, j), at(0, j + 1));
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let j = 0; j < around; j++) {
      index.push(at(ring, j), at(ring + 1, j), at(ring + 1, j + 1), at(ring, j), at(ring + 1, j + 1), at(ring, j + 1));
    }
  }
  for (let j = 0; j < around; j++) index.push(last, at(rings.length - 1, j + 1), at(rings.length - 1, j));

  sphere = new THREE.BufferGeometry();
  sphere.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  sphere.setIndex(index);
  return sphere;
}

const GLOBE_VERT = /* glsl */ `
varying vec3 vSite;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vSite = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = mat3(modelViewMatrix) * position;
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const GLOBE_FRAG = /* glsl */ `
uniform float uFade;
uniform float uTime;
uniform vec3 uSun;          // towards the Sun, as the screen sees it
uniform vec3 uSunSite;      // the same, in the site's frame: east, north, up
uniform mat3 uSiteToGeo;
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform float uAltitude;
uniform float uCloudCover;
uniform vec2 uShadowShift;
varying vec3 vSite;
varying vec3 vNormal;
varying vec3 vView;
${TERRAIN_GLSL}
${ATMOSPHERE_GLSL}
#ifdef CUMULUS
${CUMULUS_GLSL}
#endif

const float PI = 3.14159265;
const float RADIUS = ${EARTH_RADIUS.toExponential(6)};

void main() {
  vec3 site = normalize(vSite);
  vec3 n = normalize(vNormal);
  vec3 v = normalize(-vView);
  float muView = max(dot(n, v), 0.0);
  float muSun = dot(n, uSun);

  // Where this point is on the maps of the whole Earth.
  vec3 geo = uSiteToGeo * site;
  float lon = atan(geo.y, geo.x);
  float lat = asin(clamp(geo.z, -1.0, 1.0));
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
  // Longitude jumps from one edge of the map to the other on the far side of the world. Its
  // rate of change across the screen is taken from whichever of two ways of counting it does
  // not jump here, or the jump would show as a seam.
  float other = fract(uv.x + 0.5) - 0.5;
  vec2 ddx = vec2(abs(dFdx(uv.x)) < abs(dFdx(other)) ? dFdx(uv.x) : dFdx(other), dFdx(uv.y));
  vec2 ddy = vec2(abs(dFdy(uv.x)) < abs(dFdy(other)) ? dFdy(uv.x) : dFdy(other), dFdy(uv.y));

  vec3 ground = textureGrad(uDay, uv, ddx, ddy).rgb;
  // Open water: the map draws it far bluer than any land. It shines where it reflects the Sun.
  float water = smoothstep(0.03, 0.12, ground.b - max(ground.r, ground.g) * 1.02);

  // The pictures of the landing site, on the side of the world that faces it.
  vec2 metres = site.xy * RADIUS;
  float facing = smoothstep(0.0, 0.08, site.z);
  ground = siteGround(metres, vec4(ground, 1.0), facing).rgb;

  // Clouds, drifting slowly, and the shadows they throw towards the night side.
  vec2 drift = vec2(uTime * 0.00002, 0.0);
  float cloud = textureGrad(uClouds, uv + drift, ddx, ddy).r;
  vec3 east = normalize(vec3(-geo.y, geo.x, 0.0001));
  vec3 north = cross(geo, east);
  vec3 sunGeo = uSiteToGeo * uSunSite;
  vec2 towardsSun = vec2(dot(sunGeo, east) / max(cos(lat), 0.2) / (2.0 * PI), -dot(sunGeo, north) / PI);
  float shade = textureGrad(uClouds, uv + drift + towardsSun * 0.006, ddx, ddy).r;
  // The sky is kept clear around the landing site, and the cloud map bows out on the way down.
  float clearing = 1.0 - facing * exp(-dot(metres, metres) / 1.6e11);
  float veil = smoothstep(0.08, 0.72, cloud) * clearing * uCloudCover;
  ground *= 1.0 - 0.45 * smoothstep(0.1, 0.8, shade) * clearing * uCloudCover;
#ifdef CUMULUS
  ground *= 1.0 - 0.45 * cumulus(metres + uShadowShift, 0.0).x * facing;
#endif

  // Daylight. Scaled so that the ground at the landing site is shown exactly as photographed.
  float day = smoothstep(-0.06, 0.18, muSun);
  float light = min(pow(max(muSun, 0.0) / uSunSite.z, 0.45), 1.2) * day;
  vec3 sun = sunlight(muSun);
  vec3 lit = ground * light * sun;
  vec3 halfway = normalize(uSun + v);
  lit += sun * water * pow(max(dot(n, halfway), 0.0), 70.0) * 0.6 * day;
  lit = mix(lit, vec3(0.97, 0.98, 1.0) * (0.12 + 0.88 * light) * sun, veil);

  vec3 col = throughAir(lit, muView, muSun, uAltitude);

  // The night side: the lights of cities, dimmed where cloud covers them.
  float night = 1.0 - smoothstep(-0.12, 0.04, muSun);
  float lights = textureGrad(uNight, uv, ddx, ddy).r;
  col += vec3(1.0, 0.78, 0.46) * lights * lights * night * (1.0 - 0.8 * veil) * 2.4;
  col += vec3(0.012, 0.018, 0.035) * night * (0.4 + veil);

  // The planet is solid: where two layers both draw it mid-crossfade, they must add up to opaque.
  gl_FragColor = vec4(col, 1.0 - pow(1.0 - uFade, 3.0));
}
`;

const LIMB_VERT = /* glsl */ `
varying vec3 vView;
varying vec3 vCenter;
varying float vRadius;
void main() {
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float radius = length(modelViewMatrix[0].xyz);
  if (length(c.xyz) < 2.4 * radius) {
    // Close to the Earth: cover the whole screen.
    gl_Position = vec4(position.xy, 0.0, 1.0);
    vView = vec3(position.x / projectionMatrix[0][0], position.y / projectionMatrix[1][1], -1.0);
  } else {
    vec4 mv = c;
    mv.xy += position.xy * radius * 1.12;
    gl_Position = projectionMatrix * mv;
    vView = mv.xyz;
  }
  vCenter = c.xyz;
  vRadius = radius;
}
`;

// The air seen edge-on beyond the rim of the planet: the thin blue line.
const LIMB_FRAG = /* glsl */ `
uniform float uFade;
uniform vec3 uSun;
varying vec3 vView;
varying vec3 vCenter;
varying float vRadius;
${ATMOSPHERE_GLSL}

void main() {
  vec3 rd = normalize(vView);
  vec3 oc = -vCenter;
  float b = dot(oc, rd);
  // The point of the line of sight that passes closest to the Earth's centre.
  vec3 nearest = oc - b * rd;
  float d = length(nearest);
  // Its height above the ground, metres. Drawn half again as tall as life, or it would be barely a pixel.
  float height = (d / vRadius - 1.0) * ${EARTH_RADIUS.toExponential(6)} / 1.5;
  float outside = clamp(height / max(fwidth(height), 1e-3) + 0.5, 0.0, 1.0) * step(b, 0.0);
  // Looking along the ground, a ray crosses about seventy times as much air as one going straight up.
  vec3 tau = RAYLEIGH * 70.0 * exp(-max(height, 0.0) / SCALE_HEIGHT);
  float muSun = dot(nearest / max(d, 1e-6), uSun);
  float dusk = smoothstep(-0.25, 0.1, muSun);
  vec3 glow = (1.0 - exp(-tau)) * dusk * exp(-RAYLEIGH * airMass(muSun) * 0.3);
  gl_FragColor = vec4(glow * vec3(0.62, 0.8, 1.0) * outside * 0.95, uFade);
}
`;

export interface Globe {
  /** Centred on the Earth's centre. Must sit in a space that is not turned relative to the screen. */
  object: THREE.Group;
  uniforms: EarthUniforms;
}

export interface GlobeOptions {
  /** Which pictures of the landing site to lay over the globe: indices into the site's levels. */
  levels?: number[];
  /** Whether the fair-weather clouds near the site throw their shadows on the ground. */
  cumulus?: boolean;
}

/**
 * The Earth: real maps of day, night and cloud, the pictures of the landing site, and its air.
 * Every layer that shows the Earth builds it with this, so they all show the same one.
 */
export function createGlobe(radius: number, u: LayerUniforms, options: GlobeOptions = {}): Globe {
  const maps = earthMaps();
  const uniforms = earthUniforms();
  const surface = new THREE.Mesh(
    siteSphere(),
    new THREE.ShaderMaterial({
      vertexShader: GLOBE_VERT,
      fragmentShader: GLOBE_FRAG,
      defines: options.cumulus ? { CUMULUS: 1 } : {},
      uniforms: {
        uFade: u.uFade,
        uTime: u.uTime,
        uSun: { value: SUN_DIR },
        uSunSite: { value: new THREE.Vector3(...SUN_AT_SITE) },
        uSiteToGeo: { value: new THREE.Matrix3().fromArray(SITE_TO_GEO) },
        uDay: maps.day,
        uNight: maps.night,
        uClouds: maps.clouds,
        uAltitude: uniforms.uAltitude,
        uCloudCover: uniforms.uCloudCover,
        uShadowShift: { value: SHADOW_SHIFT },
        ...terrainUniforms(options.levels ?? [], uniforms),
      },
      transparent: true,
    }),
  );
  // The sphere is built around the site, with north along its y axis: turn north to where it belongs on screen.
  surface.rotation.z = NORTH_ROLL;
  surface.scale.setScalar(radius);

  const limb = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: LIMB_VERT,
      fragmentShader: LIMB_FRAG,
      uniforms: { uFade: u.uFade, uSun: { value: SUN_DIR } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  limb.scale.setScalar(radius);
  limb.renderOrder = 1;

  const object = new THREE.Group();
  for (const mesh of [surface, limb]) {
    mesh.frustumCulled = false;
    object.add(mesh);
  }
  return { object, uniforms };
}

const PATCH_VERT = /* glsl */ `
uniform float uUnit;       // metres per unit of the mesh
varying vec2 vMetres;
varying vec3 vView;
void main() {
  vMetres = position.xy * uUnit;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const GROUND_FRAG = /* glsl */ `
uniform float uFade;
uniform vec3 uSunSite;
uniform float uAltitude;
uniform vec2 uShadowShift;
uniform float uPixel;
varying vec2 vMetres;
varying vec3 vView;
${TERRAIN_GLSL}
${ATMOSPHERE_GLSL}
${CUMULUS_GLSL}

void main() {
  vec4 ground = siteGround(vMetres, vec4(0.0), 1.0);
  vec3 col = ground.rgb / max(ground.a, 1e-4);
#ifdef FOLIAGE
  // Closer than the aerial photograph can follow, the leaves of the tree and the grass around it
  // are drawn in: finer detail laid over what the photograph shows, each kind appearing once it
  // would be more than a few pixels wide.
  float reach = 9.3 * (1.0 + 0.09 * sin(atan(vMetres.y, vMetres.x) * 3.0 + 1.0) + 0.05 * sin(atan(vMetres.y, vMetres.x) * 7.0 + 4.0));
  float crown = 1.0 - smoothstep(reach - 1.4, reach + 0.2, length(vMetres));
  vec3 sprays = voronoi(vMetres / 0.45 + 17.0);
  vec3 leaves = voronoi(vMetres / 0.085 + 31.0);
  float foliage = mix(1.0, 0.74 + 0.5 * sprays.z, 0.6 * smoothstep(2.0, 5.0, 0.45 / uPixel));
  foliage *= mix(1.0, (0.62 + 0.7 * leaves.z) * (0.55 + 0.45 * smoothstep(0.0, 0.14, leaves.y)), smoothstep(2.0, 4.5, 0.085 / uPixel));
  float blades = 0.82 + 0.36 * noise3(vec3(vMetres.x / 0.012, vMetres.y / 0.05, 2.0));
  float tufts = 0.86 + 0.28 * noise3(vec3(vMetres / 0.11, 5.0));
  float grass = mix(1.0, tufts, smoothstep(2.0, 5.0, 0.11 / uPixel)) * mix(1.0, blades, smoothstep(1.5, 4.0, 0.03 / uPixel));
  col *= mix(grass, foliage, crown);
  // From this close the haze of the aerial photograph is gone: the leaves show their own green, and so does the grass.
  float close = smoothstep(0.7, 3.0, 0.085 / uPixel);
  col = mix(col, col * mix(vec3(0.84, 1.08, 0.5), vec3(0.62, 1.12, 0.36), crown) * 1.15, close * mix(0.55, 0.8, crown));
#endif
  col *= 1.0 - 0.45 * cumulus(vMetres + uShadowShift, 0.0).x;
  // The same light and the same air as on the globe at this spot, so the two can be swapped.
  float muView = normalize(-vView).z;
  col = throughAir(col * sunlight(uSunSite.z), muView, uSunSite.z, uAltitude);
  gl_FragColor = vec4(col, ground.a * (1.0 - pow(1.0 - uFade, 3.0)));
}
`;

const CLOUD_FRAG = /* glsl */ `
uniform float uFade;
uniform float uLift;
uniform vec3 uSunSite;
varying vec2 vMetres;
varying vec3 vView;
${ATMOSPHERE_GLSL}
${CUMULUS_GLSL}

void main() {
  vec2 c = cumulus(vMetres, uLift);
  // Seen from above, a cloud is bright all over; only where it slopes away from the Sun is it
  // greyer, and that shows as more cloud standing between the point and the light.
  float towardsSun = cumulus(vMetres + normalize(uSunSite.xy) * 260.0, uLift).x;
  float lit = clamp(0.9 - 0.55 * (towardsSun - c.x) + 0.1 * (c.y - 0.5), 0.55, 1.0);
  vec3 col = mix(vec3(0.6, 0.66, 0.76), vec3(1.0), lit);
  // A sheet the camera is about to pass through melts away instead of being sliced.
  float near = smoothstep(0.12, ${(CAM_DIST * 0.16).toFixed(2)}, -vView.z);
  gl_FragColor = vec4(col * sunlight(uSunSite.z), c.x * near * uFade);
}
`;

/**
 * A square piece of the Earth's surface around the landing site, `size` metres across, in a
 * mesh whose units are `unit` metres. It curves away exactly as the globe does.
 * @param height metres above the ground
 */
function patchGeometry(size: number, unit: number, height = 0, segments = 96): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(size / unit, size / unit, segments, segments);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) * unit;
    const y = position.getY(i) * unit;
    position.setZ(i, (height - (x * x + y * y) / (2 * EARTH_RADIUS)) / unit);
  }
  return geometry;
}

/**
 * The ground around the landing site for the layers below the edge of space, where the globe
 * itself would be too coarse a model: just the patch under the camera, in the layer's own units.
 * @param unit metres per layer unit
 * @param size metres across
 * @param foliage whether to draw in the leaves and the grass that the photographs are too coarse to show
 */
export function createGround(unit: number, size: number, levels: number[], u: LayerUniforms, earth: EarthUniforms, foliage = false): THREE.Mesh {
  const mesh = new THREE.Mesh(
    patchGeometry(size, unit),
    new THREE.ShaderMaterial({
      vertexShader: PATCH_VERT,
      fragmentShader: GROUND_FRAG,
      defines: foliage ? { FOLIAGE: 1 } : {},
      uniforms: {
        uPixel: earth.uPixel,
        uFade: u.uFade,
        uUnit: { value: unit },
        uSunSite: { value: new THREE.Vector3(...SUN_AT_SITE) },
        uAltitude: earth.uAltitude,
        uShadowShift: { value: SHADOW_SHIFT },
        ...terrainUniforms(levels, earth),
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  mesh.rotation.z = NORTH_ROLL;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * The fair-weather clouds near the landing site: three sheets one above the other, so that
 * they have some depth as the camera comes down past them.
 * @param unit metres per layer unit
 */
export function createClouds(unit: number, u: LayerUniforms): THREE.Group {
  const group = new THREE.Group();
  const size = 3.2e5;
  CLOUD_HEIGHTS.forEach((height, i) => {
    const mesh = new THREE.Mesh(
      patchGeometry(size, unit, height, 64),
      new THREE.ShaderMaterial({
        vertexShader: PATCH_VERT,
        fragmentShader: CLOUD_FRAG,
        uniforms: {
          uFade: u.uFade,
          uUnit: { value: unit },
          // Wide at its base, narrower towards its top.
          uLift: { value: i * 0.028 },
          uSunSite: { value: new THREE.Vector3(...SUN_AT_SITE) },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    mesh.rotation.z = NORTH_ROLL;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4 + i;
    group.add(mesh);
  });
  return group;
}

/** The inside of a cloud: the whole frame goes white for a moment as the camera passes through. */
export function createFog(u: LayerUniforms, earth: EarthUniforms): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uFade;
        uniform float uFog;
        void main() { gl_FragColor = vec4(0.93, 0.95, 0.98, uFog * uFade); }
      `,
      uniforms: { uFade: u.uFade, uFog: earth.uFog },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return mesh;
}
