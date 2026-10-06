/**
 * Galactic coordinates, the frame every layer inside the Milky Way is drawn in:
 * the Sun at the origin, +x towards the galactic centre, +y in the direction the disc
 * rotates, +z towards the north galactic pole.
 */

const DEG = Math.PI / 180;

/**
 * Position of something seen at galactic longitude `l` and latitude `b` (degrees), `distance`
 * away. The result is in the same unit as `distance`.
 */
export function galactic(l: number, b: number, distance: number): [number, number, number] {
  const inPlane = distance * Math.cos(b * DEG);
  return [inPlane * Math.cos(l * DEG), inPlane * Math.sin(l * DEG), distance * Math.sin(b * DEG)];
}
