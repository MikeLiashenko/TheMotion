import { NOISE_GLSL } from './noise';

/**
 * GLSL shared by everything that draws the Earth: the globe, the patch of ground under the
 * camera on the way down, and the clouds in between. Sharing it is what keeps the layers
 * identical while one fades into the next.
 */

/** How many site pictures a material can show at once. */
export const LEVEL_SLOTS = 5;

/**
 * The pictures of the landing site, laid over whatever is below them. Each is a square of
 * ground seen from straight above, centred on the site; a finer one covers the middle of a
 * coarser one and fades out towards its own edge.
 */
export const TERRAIN_GLSL = /* glsl */ `
uniform sampler2D uLevel0;
uniform sampler2D uLevel1;
uniform sampler2D uLevel2;
uniform sampler2D uLevel3;
uniform sampler2D uLevel4;
uniform float uOn0;
uniform float uOn1;
uniform float uOn2;
uniform float uOn3;
uniform float uOn4;
uniform float uExtent[${LEVEL_SLOTS}];   // metres across
uniform float uAerial[${LEVEL_SLOTS}];   // 1 where the picture is an aerial photograph
uniform vec3 uAerialGain;
uniform vec3 uAerialOffset;
uniform float uGrade;                    // 0 = aerial photographs toned to match the satellite pictures; 1 = their own colours

// How much of a level shows at a point given in metres east and north of the site.
float levelCover(vec2 metres, float extent) {
  vec2 p = abs(metres) / extent;
  return 1.0 - smoothstep(0.42, 0.49, max(p.x, p.y));
}

vec3 levelColour(sampler2D map, vec2 metres, float extent, float aerial) {
  vec3 c = texture2D(map, vec2(0.5 + metres.x / extent, 0.5 - metres.y / extent)).rgb;
  // Seen from high up, the bright aerial photographs are toned down to the look of the
  // satellite pictures that surround them; close to the ground they are left as they are.
  return mix(c, mix(c * uAerialGain + uAerialOffset, c, uGrade), aerial);
}

// The ground at a point near the site: the finest picture that reaches it, over \`below\`.
// \`reach\` scales how much of each level shows (0 hides them all).
vec4 siteGround(vec2 metres, vec4 below, float reach) {
  vec4 col = below;
  float cover;
  cover = levelCover(metres, uExtent[0]) * uOn0 * reach;
  col = mix(col, vec4(levelColour(uLevel0, metres, uExtent[0], uAerial[0]), 1.0), cover);
  cover = levelCover(metres, uExtent[1]) * uOn1 * reach;
  col = mix(col, vec4(levelColour(uLevel1, metres, uExtent[1], uAerial[1]), 1.0), cover);
  cover = levelCover(metres, uExtent[2]) * uOn2 * reach;
  col = mix(col, vec4(levelColour(uLevel2, metres, uExtent[2], uAerial[2]), 1.0), cover);
  cover = levelCover(metres, uExtent[3]) * uOn3 * reach;
  col = mix(col, vec4(levelColour(uLevel3, metres, uExtent[3], uAerial[3]), 1.0), cover);
  cover = levelCover(metres, uExtent[4]) * uOn4 * reach;
  col = mix(col, vec4(levelColour(uLevel4, metres, uExtent[4], uAerial[4]), 1.0), cover);
  return col;
}
`;

/**
 * Air between the camera and the ground. A rough single-scattering model: enough to give the
 * blue haze that thickens towards the edge of the globe, the reddening of the light near the
 * line between day and night, and the way the haze thins out as the camera comes down.
 */
export const ATMOSPHERE_GLSL = /* glsl */ `
// How much light the whole atmosphere scatters out of a ray going straight up, red, green and blue.
const vec3 RAYLEIGH = vec3(0.045, 0.098, 0.235);
// Height over which the air thins by a factor of e, metres.
const float SCALE_HEIGHT = 8500.0;

// How much more air a slanted ray crosses than one going straight up. \`mu\` is the cosine of its angle from the vertical.
float airMass(float mu) {
  mu = max(mu, 0.0);
  return 1.0 / (mu + 0.025 * exp(-11.0 * mu));
}

// The colour of sunlight that has come down through the air with the Sun at this height.
vec3 sunlight(float muSun) {
  return exp(-RAYLEIGH * (airMass(muSun) - 1.0) * 0.3);
}

// What a camera \`altitude\` metres up sees of ground of colour \`lit\`: dimmed a little on the
// way up, with the light scattered by the air below the camera added on top.
vec3 throughAir(vec3 lit, float muView, float muSun, float altitude) {
  vec3 tau = RAYLEIGH * (1.0 - exp(-altitude / SCALE_HEIGHT));
  float up = airMass(muView);
  float down = airMass(muSun);
  // The air is still lit a while after the ground below it has gone dark.
  float dusk = smoothstep(-0.2, 0.1, muSun);
  vec3 glow = (1.0 - exp(-tau * (up + down))) * (up / (up + down)) * dusk * exp(-RAYLEIGH * down * 0.35);
  return lit * exp(-tau * up) + glow * vec3(0.62, 0.78, 1.0) * 1.15;
}
`;

/**
 * Fair-weather clouds near the landing site, made up rather than photographed: the cloud map
 * of the whole Earth is far too coarse to fly through. A function of the place on the ground
 * alone, so the clouds, their shadows, and the same clouds seen from another layer all agree.
 */
export const CUMULUS_GLSL = /* glsl */ `
${NOISE_GLSL}
// Returns how much cloud stands over a point (metres east and north of the site) in x, and a
// finer pattern for shading it in y. \`lift\` thins the clouds: higher in a cloud there is less of it.
vec2 cumulus(vec2 metres, float lift) {
  float busy = fbm(vec3(metres / 23000.0, 3.7));
  float puffs = fbm(vec3(metres / 3100.0, 9.1));
  float ragged = fbm(vec3(metres / 640.0, 1.3));
  float field = puffs * 0.72 + ragged * 0.28 + (busy - 0.5) * 0.45;
  float density = smoothstep(0.6 + lift, 0.74 + lift, field);
  // One cloud stands right over the landing site: the camera goes down through it.
  float own = 1.0 - smoothstep(380.0, 1050.0 - lift * 3000.0, length(metres) * (0.35 + 0.75 * puffs + 0.5 * ragged));
  // Nothing is made up far from the site: out there only the real clouds of the cloud map belong.
  float near = 1.0 - smoothstep(9.0e4, 1.5e5, length(metres));
  return vec2(max(density, own) * near, ragged);
}
`;
