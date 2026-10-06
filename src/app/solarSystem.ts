/**
 * The Solar System as the journey shows it: where each body sits, and where the camera looks
 * on the way from the outer planets past the Sun and on to Earth.
 *
 * Positions are heliocentric, in AU: x and y span the plane of the planets, z points north of it.
 * Distances from the Sun are real; the directions are chosen for the picture and match no date
 * (see docs/SOURCES.md).
 */

import { AU } from '../util/format';
import { stopIndex, STOPS } from './timeline';

export type Vec3 = [number, number, number];

/**
 * How the plane of the planets is turned to the screen, radians about the screen's x axis:
 * we look down on it from 33° above, so circular orbits read as ellipses.
 */
export const ECLIPTIC_TILT = -1.0;

export const SUN_RADIUS = 6.957e8;
export const EARTH_RADIUS = 6.371e6;
export const MOON_DISTANCE = 3.844e8;
/**
 * Earth's direction from the Sun, degrees. It is on the far side of the Sun from the camera,
 * so most of the face it turns to us is in daylight, and off to the left, so that the light
 * falls on the landing site from the south-east, as it does in the aerial photographs used
 * for the descent (see app/earthSite.ts).
 */
export const EARTH_LONGITUDE = 140;
/** The Moon's direction from Earth, degrees: to the lower right of the frame, on the near side. */
export const MOON_LONGITUDE = -35;

/**
 * A point given by its distance from the Sun within the plane of the planets (AU), its
 * direction there (degrees) and its height above the plane (AU).
 */
export function heliocentric(distance: number, longitude: number, height = 0): Vec3 {
  const a = (longitude * Math.PI) / 180;
  return [distance * Math.cos(a), distance * Math.sin(a), height];
}

/** The point `distance` metres from `place` in direction `longitude` (degrees) within the plane of the planets, in AU. */
export function beside(place: Vec3, distance: number, longitude: number): Vec3 {
  const offset = heliocentric(distance / AU, longitude);
  return [place[0] + offset[0], place[1] + offset[1], place[2] + offset[2]];
}

/** The point a fraction `t` of the way from `a` to `b`. */
export function between(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Where everything is, in AU. Planets sit at their mean distance from the Sun. */
export const PLACES = {
  sun: [0, 0, 0] as Vec3,
  mercury: heliocentric(0.387, 350),
  venus: heliocentric(0.723, 20),
  earth: heliocentric(1, EARTH_LONGITUDE),
  mars: heliocentric(1.524, 170),
  vesta: heliocentric(2.36, 30),
  ceres: heliocentric(2.77, 100),
  jupiter: heliocentric(5.203, 130),
  saturn: heliocentric(9.58, 10),
  chiron: heliocentric(14, 80),
  uranus: heliocentric(19.19, 165),
  neptune: heliocentric(30.07, 35),
  // A comet near the Sun, tail and all, and one at the far end of its orbit.
  comet: heliocentric(1.3, 300),
  halley: heliocentric(33.6, 322, -9.9),
  parker: heliocentric(0.25, 220),
  // Beyond Neptune. Heights come from the tilt of each orbit.
  pluto: heliocentric(39, 70, 6),
  // On Pluto's orbit, but always on the far side of the Sun from it.
  orcus: heliocentric(38, 250, -9),
  arrokoth: heliocentric(44.6, 105, 1.5),
  quaoar: heliocentric(43.4, 30, 5),
  haumea: heliocentric(41, 185, 13),
  makemake: heliocentric(43, 140, 16),
  newHorizons: heliocentric(65, 60, 3),
  sedna: heliocentric(82, 300, -14),
  gonggong: heliocentric(85, 120, 26),
  eris: heliocentric(86, 160, 41),
  // Both Voyagers left by the nose of the heliosphere, one above the plane of the planets and one below.
  voyager2: heliocentric(137, 0, -45),
  voyager1: heliocentric(141, 0, 99),
} satisfies Record<string, Vec3>;

export type Place = keyof typeof PLACES;

/** Orbits that are far from circular: semi-major axis (AU), eccentricity, direction of the farthest point (degrees). */
export const ECCENTRIC_ORBITS = {
  sedna: { a: 506, e: 0.85, aphelion: 200 },
  vp113: { a: 262, e: 0.69, aphelion: 320 },
  leleakuhonua: { a: 1090, e: 0.94, aphelion: 60 },
  // Hypothetical: proposed to explain how the orbits above line up. Never observed.
  planetNine: { a: 500, e: 0.25, aphelion: 265 },
} satisfies Record<string, { a: number; e: number; aphelion: number }>;

/**
 * The heliopause, the edge of the Sun's bubble in the gas between the stars: blunt where the
 * Sun ploughs into that gas, drawn out into a tail behind. A schematic shape.
 */
export const HELIOPAUSE = { nose: 120, longitude: 0 };

/** Distance from the Sun to the heliopause, in AU, `angle` radians away from its nose. */
export function heliopauseRadius(angle: number): number {
  return HELIOPAUSE.nose * (2 / (1 + Math.cos(angle))) ** 0.6;
}

/**
 * Distance from the Sun to the termination shock, in AU: where the solar wind slows down,
 * well inside the heliopause and rounder than it.
 */
export function terminationShockRadius(angle: number): number {
  return 90 * (2 / (1 + Math.cos(angle))) ** 0.35;
}

/** The farthest point of one of the eccentric orbits, in AU. */
export function aphelion(orbit: keyof typeof ECCENTRIC_ORBITS): Vec3 {
  const { a, e, aphelion: direction } = ECCENTRIC_ORBITS[orbit];
  return heliocentric(a * (1 + e), direction);
}

/** A direction in the plane-of-the-planets frame, as the screen sees it: x right, y up, z towards the camera. */
export function toScreen(v: Vec3): Vec3 {
  const c = Math.cos(ECLIPTIC_TILT);
  const sn = Math.sin(ECLIPTIC_TILT);
  return [v[0], v[1] * c - v[2] * sn, v[1] * sn + v[2] * c];
}

/** The reverse: a direction given as the screen sees it, in the plane-of-the-planets frame. */
export function fromScreen(v: Vec3): Vec3 {
  const c = Math.cos(ECLIPTIC_TILT);
  const sn = Math.sin(ECLIPTIC_TILT);
  return [v[0], v[1] * c + v[2] * sn, -v[1] * sn + v[2] * c];
}

/**
 * The point of a sphere's face that appears at (x, y) on its disc, in radii from the disc's
 * centre, as a direction in the plane-of-the-planets frame.
 */
export function onDisc(x: number, y: number): Vec3 {
  return fromScreen([x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))]);
}

/**
 * Sunspots, placed as the screen sees the Sun's disc: x right, y up and the spot's own radius
 * (penumbra included), all in solar radii.
 */
export const SUNSPOTS: { x: number; y: number; radius: number }[] = [
  { x: 0.0384, y: 0.003, radius: 0.026 },
  { x: 0.088, y: -0.022, radius: 0.013 },
  { x: 0.112, y: 0.012, radius: 0.008 },
  { x: -0.45, y: 0.32, radius: 0.03 },
  { x: -0.375, y: 0.295, radius: 0.016 },
  { x: -0.525, y: 0.345, radius: 0.011 },
  { x: 0.55, y: -0.25, radius: 0.022 },
  { x: 0.625, y: -0.215, radius: 0.012 },
  { x: -0.3, y: -0.43, radius: 0.017 },
];

/** Prominences on the Sun's limb: where (degrees anticlockwise from the right), half-width (radians) and height (solar radii). */
export const PROMINENCES: { angle: number; width: number; height: number }[] = [
  { angle: 38, width: 0.17, height: 0.14 },
  { angle: 118, width: 0.12, height: 0.06 },
  { angle: 163, width: 0.05, height: 0.035 },
  { angle: 207, width: 0.1, height: 0.095 },
  { angle: 288, width: 0.07, height: 0.05 },
  { angle: 332, width: 0.13, height: 0.075 },
];

/** Where a circle the size of Earth is drawn on the Sun's face for comparison: disc coordinates, solar radii. */
export const EARTH_ON_SUN = { x: -0.022, y: 0.013 };

const metres = (p: Vec3): Vec3 => [p[0] * AU, p[1] * AU, p[2] * AU];

const SUN_M: Vec3 = [0, 0, 0];
const EARTH_M = metres(PLACES.earth);

/**
 * Each Solar System layer keeps its own origin, so its coordinates stay small: the Sun's centre
 * for all but the last one, which has Earth's. Heliocentric metres.
 */
export function solarOrigin(layer: string): Vec3 {
  return layer === 'earthMoon' ? EARTH_M : SUN_M;
}

/** A point on the Sun's surface, given by where it appears on the disc (solar radii), in AU. */
export function onSun(x: number, y: number): Vec3 {
  return onDisc(x, y).map((v) => (v * SUN_RADIUS) / AU) as Vec3;
}

/**
 * A point above the Sun's edge as the screen sees it, at the place of prominence `index`, in AU.
 * @param height how far above the edge, in solar radii; by default just under the prominence's top
 */
export function onLimb(index: number, height = PROMINENCES[index].height * 0.6): Vec3 {
  const a = (PROMINENCES[index].angle * Math.PI) / 180;
  const r = ((1 + height) * SUN_RADIUS) / AU;
  return fromScreen([Math.cos(a) * r, Math.sin(a) * r, 0]);
}

/** A heliocentric point (AU) in the units of a layer: 1 = half the frame height at its stop. */
export function inLayer(layer: string, point: Vec3): Vec3 {
  const unit = 10 ** STOPS[stopIndex(layer)].s / 2;
  const origin = solarOrigin(layer);
  return [(point[0] * AU - origin[0]) / unit, (point[1] * AU - origin[1]) / unit, (point[2] * AU - origin[2]) / unit];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const PLANETS = stopIndex('inner');
const SUN = stopIndex('sun');
const HALFWAY = stopIndex('au');
const HOME = stopIndex('earthMoon');
/** Half the frame height at the stop that shows the Sun and Earth together, metres. */
const HALFWAY_FRAME = 10 ** STOPS[HALFWAY].s / 2;

/**
 * Where the Sun stands on the screen at its own stop, in half-frames from the middle: to the
 * left and high, clear of the caption below it. The camera does not head into it, it passes it.
 */
export const SUN_AT_ITS_STOP: [number, number] = [-0.5, 0.38];

/** From the Sun to the middle of the frame, as the screen sees it and in half-frames, at the Sun's stop… */
const BESIDE_THE_SUN: Vec3 = [-SUN_AT_ITS_STOP[0], -SUN_AT_ITS_STOP[1], 0];
/** …and at the stop that shows the Sun and Earth together, where the middle of the frame is half-way between them. */
const HALFWAY_TO_EARTH = toScreen(EARTH_M).map((v) => (0.5 * v) / HALFWAY_FRAME) as Vec3;

export interface SolarView {
  /** The point at the centre of the frame, heliocentric metres. */
  focus: Vec3;
  /**
   * How far the scene is pushed back from the camera, metres. On the way down to Earth the
   * camera aims at the point of its surface right below it, not at its centre, so that the zoom
   * lands on the ground.
   */
  lift: number;
}

/**
 * Where the camera looks at journey position `at` and scale `s`. Every Solar System layer uses
 * this one function, so they stay aligned while they crossfade.
 *
 * Down to the inner planets the Sun is in the middle. From there the camera makes for a point
 * beside the Sun, so that the Sun grows off to one side; it flies on over the Sun, which slides
 * across the frame and falls behind as the view opens up, until Earth has come into the frame
 * as well; then it closes in on Earth.
 */
export function solarView(at: number, s: number, out: SolarView = { focus: [0, 0, 0], lift: 0 }): SolarView {
  // Offsets are measured in frames, not metres: the Sun and Earth then glide across the screen
  // at an even pace, however much the scale changes on the way.
  const halfFrame = 10 ** s / 2;
  out.lift = 0;
  if (at <= PLANETS) {
    out.focus[0] = out.focus[1] = out.focus[2] = 0;
    return out;
  }
  if (at <= HALFWAY) {
    let across: Vec3;
    if (at <= SUN) {
      const turn = smoothstep(0.25, 1, at - PLANETS);
      across = [BESIDE_THE_SUN[0] * turn, BESIDE_THE_SUN[1] * turn, 0];
    } else {
      // Most of the way across is covered at once, while the Sun is still large: that is the fly-by.
      // (The scale hardly changes just after the stop, where the zoom turns round; the square root
      // makes the slide begin with the scrolling all the same, not with the scale.)
      const passed = 1 - (1 - Math.sqrt(Math.min(1, at - SUN))) ** 3;
      across = [0, 1, 2].map((k) => BESIDE_THE_SUN[k] + (HALFWAY_TO_EARTH[k] - BESIDE_THE_SUN[k]) * passed) as Vec3;
    }
    const offset = fromScreen(across);
    for (let k = 0; k < 3; k++) out.focus[k] = offset[k] * halfFrame;
    return out;
  }
  // Closing in on Earth: half-way there to begin with, as measured in frames.
  const turn = at <= HOME ? smoothstep(0, 0.6, at - HALFWAY) : 1;
  const short = 0.5 * (1 - turn) * Math.min(1, halfFrame / HALFWAY_FRAME);
  for (let k = 0; k < 3; k++) out.focus[k] = EARTH_M[k] * (1 - short);
  out.lift = EARTH_RADIUS * turn;
  return out;
}

/** Direction from Earth to the Sun as the screen sees it. Lights Earth in every layer that shows it. */
export const SUNLIGHT_ON_EARTH: Vec3 = (() => {
  const d = Math.hypot(...PLACES.earth);
  return toScreen([-PLACES.earth[0] / d, -PLACES.earth[1] / d, -PLACES.earth[2] / d]);
})();

/**
 * The Sun is drawn no smaller than this, in half-frames: at true size it would be a dot from
 * anywhere beyond the inner planets. Further out than that it shrinks, down to a glint.
 */
export function sunMinRadius(s: number): number {
  return 0.03 * 10 ** (-0.6 * Math.max(0, s - 12));
}
