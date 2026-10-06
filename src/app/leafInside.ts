/**
 * Inside the leaf. The camera reaches the surface at a pore, goes through it, crosses the air
 * space underneath and comes to one cell, ending at that cell's nucleus. Everything below the
 * surface is laid out in micrometres measured from the middle of that nucleus, z towards the camera.
 */
import { stopIndex, STOPS } from './timeline';

type Vec3 = [number, number, number];

export const INSIDE_LEAF = {
  /** The outer surface of the leaf's skin, where the pore opens. */
  skin: 47,
  /** The underside of the skin: the roof of the air space below the pore. */
  roof: 31,
  /** Radius of the nucleus the journey ends at. */
  nucleus: 3,
  /**
   * The cell that nucleus belongs to: where its axis stands, half its width, its top, and half
   * its height. The nucleus is not in its middle: the vacuole has pushed it against the wall.
   */
  cell: { x: -3.6, y: -2.0, wide: 11.5, top: 7, tall: 18 },
  /** That cell's vacuole, a bag of water taking up most of its room: its middle and half its width and height. */
  vacuole: { x: -6.6, y: -3.7, z: -11.5, wide: 6.2, tall: 13 },
  /** How far apart the cells stand. */
  spacing: 24,
  /** The guard cells of the pore, under the skin: how far each lies from the pore's own line, and half its length, width and height. */
  guard: { off: 5.8, long: 15, wide: 3.9, tall: 6.8, depth: 7.2 },
};

/**
 * A point on the wall of our cell, `turn` radians round its axis and `up` of the way from its
 * waist (0) to its top (1) or bottom (-1). `inset` below 1 gives a point that far inside the wall.
 */
export function onCellWall(turn: number, up: number, inset = 1): Vec3 {
  const { x, y, wide, top, tall } = INSIDE_LEAF.cell;
  const out = Math.sqrt(1 - up * up);
  return [x + inset * wide * out * Math.cos(turn), y + inset * wide * out * Math.sin(turn), top - tall + inset * tall * up];
}

/**
 * Things inside the leaf that get a label, in micrometres from the middle of the nucleus. The
 * model puts one of each exactly here.
 */
export const INSIDE_PLACES = {
  nucleus: [0, 0, 0],
  nucleolus: [1.8, 1.0, 0],
  envelope: [-2.12, 2.12, 0],
  pore: [0.75, -1.75, 2.3],
  /** Chloroplasts lie flat against the inside of the wall. */
  chloroplast: onCellWall(-0.5, 0.25, 0.86),
  mitochondrion: [-3.9, 4.3, 1.6],
  vacuole: [INSIDE_LEAF.vacuole.x, INSIDE_LEAF.vacuole.y, INSIDE_LEAF.vacuole.z + INSIDE_LEAF.vacuole.tall],
  wall: onCellWall(1.3, 0),
  /** Where our cell and two of its neighbours leave a gap between them. */
  air: [INSIDE_LEAF.cell.x + (INSIDE_LEAF.spacing / Math.sqrt(3)) * Math.cos(Math.PI / 6), INSIDE_LEAF.cell.y + (INSIDE_LEAF.spacing / Math.sqrt(3)) * Math.sin(Math.PI / 6), -8],
  reticulum: [2.61, 3.29, -1.4],
  golgi: [5.2, -2.6, -2.6],
  ribosomes: [-3.0, 2.9, 1.2],
  /** Inside the nucleus: where one of the loose threads of chromatin begins. */
  thread: [-2.0, 0.55, 0.5],
} satisfies Record<string, Vec3>;

const STOMA = stopIndex('stoma');

/**
 * How far the camera's aim has sunk from the surface of the leaf towards the nucleus, 0..1, at
 * journey position `at`: still on the surface at the Stoma stop, at the nucleus from the next
 * stop on. The layers on either side use this one function, so they stay aligned on the way.
 */
export function leafDive(at: number): number {
  const t = Math.min(1, Math.max(0, (at - STOMA - 0.04) / 0.92));
  return t * t * (3 - 2 * t);
}

/** A point inside the leaf (micrometres from the middle of the nucleus) in the units of a layer. */
export function insideLeaf(layer: string, x: number, y: number, z: number): Vec3 {
  const unit = 10 ** STOPS[stopIndex(layer)].s / 2;
  return [(x * 1e-6) / unit, (y * 1e-6) / unit, (z * 1e-6) / unit];
}

/** A point on the skin of the leaf, micrometres from the middle of the pore, in the units of a layer that shows the skin. */
export function onSkin(layer: string, x: number, y: number): Vec3 {
  return insideLeaf(layer, x, y, INSIDE_LEAF.skin);
}
