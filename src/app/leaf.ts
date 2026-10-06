/**
 * The leaf the journey lands on. Its own coordinates run along the midrib (x, from the stalk
 * to the tip) and across the blade (y), in metres. The camera comes down on one point of it,
 * a little off the midrib, and every layer from the twig down to the single pore draws the
 * blade with the same function of position, so the veins and cells stay put between layers.
 */
import { stopIndex, STOPS } from './timeline';

export const LEAF = {
  length: 0.09,
  width: 0.052,
  /** The point under the camera, in leaf coordinates. */
  origin: [0.047, 0.0095] as [number, number],
  /** How the midrib is turned on screen, radians anticlockwise from pointing right. */
  angle: 0.5,
  /** Epidermal cells are about this wide, metres. */
  cell: 42e-6,
  /** Length of a stoma (the pair of guard cells), metres. */
  stoma: 30e-6,
  /** How the stoma under the camera is turned within the leaf, radians from the direction of the midrib. */
  stomaAngle: 0.45,
  /** How far apart the side veins leave the midrib, metres. */
  sideVeins: 0.0078,
};

/** Width profile of the blade, 0..1, at fraction `t` of the way from stalk to tip. Mirrored in the shader (layers/leafShaders.ts). */
const profile = (t: number) => Math.sin(Math.PI * t ** 0.8) ** 0.85 * (1 - 0.22 * t);
export const PROFILE_PEAK = Math.max(...Array.from({ length: 400 }, (_, i) => profile(i / 399)));

/** Half the width of the blade at distance `x` from the stalk, metres. */
export function bladeHalfWidth(x: number): number {
  const t = Math.min(1, Math.max(0, x / LEAF.length));
  return (0.5 * LEAF.width * profile(t)) / PROFILE_PEAK;
}

/**
 * Where a side vein runs: the distance from the stalk, along the midrib, at which the vein
 * numbered `vein` (0 is nearest the stalk) is found `across` metres to the side of the midrib.
 * Side veins leave the midrib at about 50° and bend towards the tip.
 */
export function sideVeinAt(vein: number, across: number): number {
  const y = Math.abs(across);
  return (vein + 0.5) * LEAF.sideVeins + y * 0.85 + 9 * y * y;
}

/**
 * A point of the leaf, in leaf coordinates (metres along the midrib from the stalk, and across),
 * in the units of a layer that has the spot under the camera at its origin.
 * @param z metres towards the camera
 */
export function onLeaf(layer: string, along: number, across: number, z = 0): [number, number, number] {
  const unit = 10 ** STOPS[stopIndex(layer)].s / 2;
  const x = along - LEAF.origin[0];
  const y = across - LEAF.origin[1];
  const c = Math.cos(LEAF.angle);
  const s = Math.sin(LEAF.angle);
  return [(x * c - y * s) / unit, (x * s + y * c) / unit, z / unit];
}
