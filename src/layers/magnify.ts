/**
 * Galaxies are tiny compared with the space between them: drawn to scale, the Local Group
 * would be a few specks. So the galaxy-scale layers draw them larger than life, and say so
 * in the HUD. These numbers keep that honest and continuous across layers.
 */

/** How much larger than life the members of the Local Group are drawn. */
export const LOCAL_GROUP_MAGNIFICATION = 6;

/** How much larger than life the named neighbouring galaxies are drawn. */
export const NEIGHBOR_MAGNIFICATION = 80;

/** Scale (log10 of the frame height in metres) at and below which the Milky Way is true to scale. */
const TRUE_SCALE_BELOW = 21.0;
/** Scale at and above which the Milky Way is drawn at the full Local Group magnification. */
const FULL_ABOVE = 23.2;

/**
 * Magnification of our own galaxy at scale `s`. It relaxes to 1 on the way in, spread over more
 * than two decades of zoom so that the galaxy keeps growing on screen at a steady pace the whole
 * time: nothing ever appears to shrink, or to hang still.
 */
export function homeMagnification(s: number): number {
  const t = Math.min(1, Math.max(0, (s - TRUE_SCALE_BELOW) / (FULL_ABOVE - TRUE_SCALE_BELOW)));
  return LOCAL_GROUP_MAGNIFICATION ** (t * t * (3 - 2 * t));
}
