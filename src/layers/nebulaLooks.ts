import { hashString } from '../util/rng';
import type { NebulaBuf, NebulaInstance } from './nebulaSprites';
import type { RGB } from './points';

type Vec3 = [number, number, number];

/** How one named nebula is drawn: everything about the sprite except where it is. */
export type NebulaLook = Omit<NebulaInstance, 'center' | 'seed'> & {
  /** Hot young stars scattered through it, if it is a nursery. */
  stars?: number;
};

export const HYDROGEN: RGB = [1.0, 0.3, 0.42];
export const REFLECTION: RGB = [0.42, 0.5, 1.0];
const OXYGEN: RGB = [0.3, 0.95, 0.85];
const SULFUR: RGB = [1.0, 0.5, 0.25];

/**
 * The named nebulae, keyed by catalog id. `radius` is in layer units and far larger than life:
 * at true scale the biggest would be a few pixels across and the planetary nebulae invisible.
 */
export const NEBULAE: Record<string, NebulaLook> = {
  orion: { kind: 'emission', radius: 0.16, color: HYDROGEN, color2: REFLECTION, a: 0.55, angle: 0.6, stars: 6 },
  eagle: { kind: 'emission', radius: 0.16, color: [1.0, 0.42, 0.3], color2: [0.3, 0.7, 0.75], a: 0.4, c: 1, stars: 5 },
  lagoon: { kind: 'emission', radius: 0.135, color: HYDROGEN, color2: [0.6, 0.4, 0.95], a: 0.95, angle: 2.2, stars: 5 },
  rosette: { kind: 'emission', radius: 0.17, color: [1.0, 0.26, 0.34], color2: [0.85, 0.3, 0.5], a: 0.5, b: 0.3, stars: 8 },
  carina: { kind: 'emission', radius: 0.055, color: [1.0, 0.36, 0.42], color2: [0.45, 0.4, 1.0], a: 0.75 },
  'taurus-cloud': { kind: 'emission', radius: 0.07, color: [0.6, 0.36, 0.3], color2: [0.3, 0.34, 0.6], a: 1, brightness: 0.7 },
  crab: { kind: 'crab', radius: 0.135, color: SULFUR, color2: [0.55, 0.75, 1.0], a: 0.8, b: 0.5, angle: 0.5 },
  veil: { kind: 'shell', radius: 0.11, color: [1.0, 0.36, 0.4], color2: OXYGEN, a: 0.62, b: 0.5 },
  vela: { kind: 'shell', radius: 0.115, color: [1.0, 0.45, 0.35], color2: [0.45, 0.75, 1.0], a: 0.6, b: 0.55, angle: 1.9 },
  dumbbell: { kind: 'bipolar', radius: 0.066, color: [1.0, 0.4, 0.42], color2: OXYGEN, a: 0.3, angle: 0.9 },
  'cats-eye': { kind: 'ring', radius: 0.07, color: [1.0, 0.5, 0.3], color2: OXYGEN, a: 0.32, b: 0.15, c: 1, angle: 0.5 },
  butterfly: { kind: 'bipolar', radius: 0.1, color: SULFUR, color2: [0.8, 0.9, 1.0], a: 1, angle: -0.4 },
  helix: { kind: 'ring', radius: 0.06, color: [1.0, 0.42, 0.26], color2: OXYGEN, a: 0.6, b: 0.1, c: 0.5 },
};

/** Adds the sprite for catalog nebula `id` at `center`; returns how far its picture reaches. */
export function addNebula(buf: NebulaBuf, id: string, center: Vec3): number {
  const look = NEBULAE[id];
  // A stable per-nebula seed, so its clouds don't change if the list is reordered.
  buf.add({ ...look, center, seed: (hashString(id) % 997) / 9.97 });
  return look.radius * 0.75;
}
