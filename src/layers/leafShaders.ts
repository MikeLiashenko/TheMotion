import { siteToView, SUN_AT_SITE } from '../app/earthSite';
import { LEAF, PROFILE_PEAK } from '../app/leaf';
import { NOISE_GLSL } from './noise';

/** Direction to the Sun as the screen sees it, the same as in the layers above. */
const SUN = (() => {
  const [x, y, z] = siteToView(SUN_AT_SITE);
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
})();

/**
 * GLSL for the upper side of the leaf. `leafSurface(p, ...)` takes a point in metres from the
 * spot under the camera, along and across the leaf, and returns its colour; each kind of
 * detail (veins of four sizes, the skin's cells, the stomata) appears once it is a few pixels wide.
 */
export const LEAF_GLSL = /* glsl */ `
${NOISE_GLSL}
uniform float uPixel;     // metres of leaf to one pixel of screen

const float LEAF_LENGTH = ${LEAF.length.toFixed(4)};
const float LEAF_WIDTH = ${LEAF.width.toFixed(4)};
const vec2 LEAF_ORIGIN = vec2(${LEAF.origin[0].toFixed(5)}, ${LEAF.origin[1].toFixed(5)});
const float CELL = ${LEAF.cell.toExponential(3)};
// How far apart the stomata are, counted in cells: one to every six or seven cells of the skin.
const float STOMA_PITCH = 2.6;
// A stoma is this long and wide, and its pore this long and wide when open: halves, in cells.
const vec2 STOMA_SIZE = vec2(0.36, 0.23);
const vec2 PORE_SIZE = vec2(0.17, 0.045);
// The Sun, as the screen sees it.
const vec3 LEAF_SUN = vec3(${SUN.map((v) => v.toFixed(4)).join(', ')});

float bladeHalfWidth(float x) {
  float t = clamp(x / LEAF_LENGTH, 0.0, 1.0);
  return 0.5 * LEAF_WIDTH * pow(sin(3.14159265 * pow(t, 0.8)), 0.85) * (1.0 - 0.22 * t) / ${PROFILE_PEAK.toFixed(5)};
}

// 1 on the blade, 0 off it, with small teeth along the edge. \`l\` is in leaf coordinates.
float blade(vec2 l, float soft) {
  float teeth = 1.0 + 0.035 * (fract(l.x / 0.0034) - 0.5);
  float edge = bladeHalfWidth(l.x) * teeth - abs(l.y);
  return smoothstep(0.0, soft, edge) * step(0.0, l.x) * step(l.x, LEAF_LENGTH);
}

// The main veins: the midrib, and the side veins that leave it at an angle and sweep towards the tip.
// Returns how much vein there is at a point, 0..1.
float mainVeins(vec2 l, float soft) {
  float y = abs(l.y);
  float t = clamp(l.x / LEAF_LENGTH, 0.0, 1.0);
  float midrib = 1.0 - smoothstep(0.0, soft, y - mix(0.0009, 0.00022, t));
  // Along a side vein this stays constant: it leaves the midrib at about 50° and bends forward.
  float along = l.x - y * 0.85 - 9.0 * y * y;
  float spacing = ${LEAF.sideVeins.toFixed(4)};
  float nearest = abs(fract(along / spacing) - 0.5) * spacing * 0.76;
  float reach = bladeHalfWidth(l.x);
  float thin = mix(0.00028, 0.00008, clamp(y / max(reach, 1e-5), 0.0, 1.0));
  float side = (1.0 - smoothstep(0.0, soft, nearest - thin)) * step(0.004, along) * smoothstep(1.0, 0.86, y / max(reach, 1e-5));
  return max(midrib, side);
}

// The skin of the leaf: an irregular honeycomb of cells, one of which is centred exactly under
// the camera. x, y: from the point to the centre of its cell; z: distance to the nearest cell
// wall; w: a number that tells the cells apart (below zero for the one under the camera).
// \`inward\` is the distance to the walls again, but rounded off where two walls meet, so that
// it can serve as the height of a smooth cushion.
vec4 skinCell(vec2 q, out float inward) {
  vec2 n = floor(q);
  vec2 f = fract(q);
  vec2 nearest = -q;
  float best = dot(q, q);
  float id = -1.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + hash22(n + g) - f;
      float d = dot(r, r);
      if (d < best) {
        best = d;
        nearest = r;
        id = hash21(n + g + 0.37);
      }
    }
  }
  float wall = 8.0;
  float walls = 0.0;
  if (dot(nearest + q, nearest + q) > 0.0001) {
    float d = dot(0.5 * (nearest - q), normalize(-q - nearest));
    wall = min(wall, d);
    walls += exp(-20.0 * d);
  }
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + hash22(n + g) - f;
      if (dot(nearest - r, nearest - r) > 0.0001) {
        float d = dot(0.5 * (nearest + r), normalize(r - nearest));
        wall = min(wall, d);
        walls += exp(-20.0 * d);
      }
    }
  }
  inward = max(-log(max(walls, 1e-9)) / 20.0, 0.0);
  return vec4(nearest, wall, id);
}

// A point as the stoma under the camera sees it: along its pore, and across. \`q\` is in cells.
vec2 ownStoma(vec2 q) {
  return vec2(${Math.cos(LEAF.stomaAngle).toFixed(5)} * q.x + ${Math.sin(LEAF.stomaAngle).toFixed(5)} * q.y, ${Math.cos(LEAF.stomaAngle).toFixed(5)} * q.y - ${Math.sin(LEAF.stomaAngle).toFixed(5)} * q.x);
}

// How open a pore is at point \`c\` of its stoma: 1 inside the hole, 0 on the guard cells.
float poreAt(vec2 c, float edge) {
  vec2 n = c / PORE_SIZE;
  return 1.0 - smoothstep(1.0 - edge * 12.0, 1.0 + edge * 12.0, dot(n, n));
}

// The same for the pore under the camera, from a point \`p\` in metres: for telling what can be seen through it.
float ownPore(vec2 p) {
  return poreAt(ownStoma(p / CELL), 2.5 * max(uPixel, 1e-9) / CELL);
}

// \`p\`: metres from the spot under the camera, along and across the leaf.
// \`pore\` comes back as 1 inside the open pore of the stoma under the camera.
vec3 leafSurface(vec2 p, out float pore) {
  vec2 l = p + LEAF_ORIGIN;
  // How many pixels wide a feature of a given size is: decides what is worth drawing.
  float soft = max(uPixel, 1e-9);

  vec3 green = mix(vec3(0.13, 0.31, 0.08), vec3(0.27, 0.47, 0.13), fbm(vec3(l * 55.0, 1.0)));
  green *= 0.88 + 0.24 * fbm(vec3(l * 420.0, 4.0));
  vec3 veinColour = vec3(0.56, 0.69, 0.33);

  // Veins, largest first. The two finest sizes form a net; the blade between them is slightly darker.
  // The nets are shifted so that the spot under the camera lies in the middle of a mesh of each,
  // well clear of any vein.
  float veins = mainVeins(l, soft * 1.5) * smoothstep(0.6, 2.0, 0.0005 / soft);
  vec3 net = voronoi(p / 0.0013 + vec2(30.75, 22.25));
  float third = (1.0 - smoothstep(0.0, soft * 1.5, net.y * 0.0013 - 0.00004)) * smoothstep(1.2, 3.0, 0.00011 / soft);
  vec3 mesh = voronoi(p / 0.00042 + vec2(8.5, 12.25));
  float fourth = (1.0 - smoothstep(0.0, soft * 1.5, mesh.y * 0.00042 - 0.000014)) * smoothstep(1.2, 3.0, 0.00004 / soft);
  vec3 col = green * (0.93 + 0.1 * net.z);
  col = mix(col, veinColour * 0.82, fourth * 0.5);
  col = mix(col, veinColour * 0.9, third * 0.7);
  col = mix(col, veinColour, veins);

  // The skin's cells: jigsaw pieces with wavy walls. Over a vein they are long and narrow, which is
  // not drawn; there the vein simply shows through.
  float cells = smoothstep(1.5, 4.0, CELL / soft) * (1.0 - max(veins, third));
  vec2 q = p / CELL;
  // (The cell under the camera is left unbent, so that its stoma keeps its true shape.)
  vec2 wavy = q + 0.2 * smoothstep(0.7, 1.7, length(q)) * vec2(sin(q.y * 4.1 + 1.7 * sin(q.x * 2.3)), sin(q.x * 3.7 + 1.9 * sin(q.y * 2.9)));
  float inward;
  vec4 cell = skinCell(wavy, inward);
  float tone = cell.w < 0.0 ? 0.5 : fract(cell.w * 7.31);
  col = mix(col, col * (0.86 + 0.26 * tone), cells);

  // Stomata: scattered over the skin a few cells apart, each turned its own way, and one of them
  // exactly under the camera. Each is two sausage-shaped guard cells around a slit of a pore.
  // They sit on a loose grid of their own rather than in the cells drawn above, whose wavy walls
  // would bend them out of shape.
  vec2 spot = q / STOMA_PITCH + 0.5;
  vec2 square = floor(spot);
  float own = step(dot(square, square), 0.5);
  float has = max(own, step(hash21(square + 5.7), 0.8));
  float turn = hash21(square + 3.1) * 6.2832;
  vec2 c = (spot - square - mix(0.22 + 0.56 * hash22(square + 7.3), vec2(0.5), own)) * STOMA_PITCH;
  c = mix(vec2(cos(turn) * c.x + sin(turn) * c.y, cos(turn) * c.y - sin(turn) * c.x), ownStoma(q), own);
  float edge = 2.5 * soft / CELL;
  vec2 n = c / STOMA_SIZE;
  float rho = length(n);
  float guard = (1.0 - smoothstep(1.0 - edge * 4.0, 1.0 + edge * 4.0, rho * rho)) * has * cells;
  float opening = poreAt(c, edge) * has * cells;
  // Each guard cell is plump in the middle: fattest half-way between the pore and its outer wall.
  vec2 ray = n / max(rho, 1e-4) * STOMA_SIZE / PORE_SIZE;
  float lip = inversesqrt(dot(ray, ray));
  float plump = sin(3.14159 * clamp((rho - lip) / (1.0 - lip), 0.0, 1.0));

  // Seen close, the skin is not flat: every cell is a low cushion, with a groove along each wall,
  // and it dips where it meets a stoma.
  float cushion = (1.0 - exp(-inward / 0.09)) * mix(1.0, smoothstep(1.0, 1.4, rho), has);
  float height = 0.034 * cushion * (1.0 - guard) + 0.06 * plump * guard - 0.2 * opening;
  float relief = cells * smoothstep(5.0, 16.0, CELL / soft);
  vec2 slope = vec2(dFdx(height), dFdy(height)) * (CELL / soft) * relief;
  float lit = (LEAF_SUN.z - dot(slope, LEAF_SUN.xy)) * inversesqrt(1.0 + dot(slope, slope)) / LEAF_SUN.z;
  float wall = 1.0 - smoothstep(0.012, 0.012 + 2.0 * edge / 2.5, cell.z);
  col = mix(col, mix(vec3(0.45, 0.62, 0.3), col * 0.62, relief), wall * cells * 0.75);

  // Guard cells are the only cells of the skin with chloroplasts: paler, and speckled with green.
  vec3 guardColour = vec3(0.37, 0.57, 0.2) * (0.66 + 0.44 * plump);
  vec2 grain = c * 11.0 + turn * 3.0;
  float speck = 1.0 - smoothstep(0.22, 0.36, length(fract(grain) - 0.5 - 0.3 * (hash22(floor(grain)) - 0.5)));
  guardColour = mix(guardColour, vec3(0.12, 0.38, 0.09), speck * plump * 0.8 * smoothstep(8.0, 24.0, CELL / soft));
  // The two cells meet end to end beyond the tips of the pore, and around it their walls are thick and pale.
  guardColour *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.012 + edge * 2.0, abs(c.y))) * step(PORE_SIZE.x, abs(c.x));
  vec2 inner = c / (PORE_SIZE * 1.5);
  guardColour = mix(guardColour, vec3(0.6, 0.74, 0.4), (1.0 - smoothstep(0.6, 1.0, dot(inner, inner))) * 0.7);
  col = mix(col, guardColour, guard);
  col *= mix(1.0, clamp(lit, 0.45, 1.6), relief);
  col = mix(col, vec3(0.02, 0.05, 0.02), opening);
  pore = opening * own;
  return col;
}
`;
