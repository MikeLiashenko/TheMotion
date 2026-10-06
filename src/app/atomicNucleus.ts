/**
 * The nucleus of the carbon atom, and one of its protons: where the journey ends. Lengths are
 * in femtometres (10⁻¹⁵ m) from the middle of that proton, z towards the camera.
 */
import { Rng } from '../util/rng';
import { stopIndex, STOPS } from './timeline';

export type Vec3 = [number, number, number];

/** Radius of a proton or a neutron: neither has an edge, but this is about how far its charge reaches. */
export const NUCLEON_RADIUS = 0.85;

export interface Nucleon {
  at: Vec3;
  proton: boolean;
}

/**
 * Carbon-12: six protons and six neutrons, drawn as a round cluster. The first is the proton
 * the camera closes in on, at the origin and on the near side of the cluster; the next five are
 * its neighbours, around it.
 */
export const NUCLEONS: Nucleon[] = (() => {
  const rng = new Rng('carbon-12');
  // Twelve balls that all touch their neighbours sit at the corners of an icosahedron.
  const golden = (1 + Math.sqrt(5)) / 2;
  const radius = NUCLEON_RADIUS * 1.03 * Math.sqrt(golden * golden + 1);
  // One corner towards the camera, five in a ring around it, five in a second ring further back, one behind.
  const ring = (2 * radius) / Math.sqrt(5);
  const corners: Vec3[] = [[0, 0, radius]];
  for (let k = 0; k < 5; k++) corners.push([ring * Math.cos(k * 1.2566 + 0.5), ring * Math.sin(k * 1.2566 + 0.5), radius / Math.sqrt(5)]);
  for (let k = 0; k < 5; k++) corners.push([-ring * Math.cos(k * 1.2566 + 0.5), -ring * Math.sin(k * 1.2566 + 0.5), -radius / Math.sqrt(5)]);
  corners.push([0, 0, -radius]);
  // Opposite corners hold one proton and one neutron, which mixes the two kinds evenly.
  const proton = [true, false, true, false, true, false, true, false, true, false, true, false];
  // The whole cluster is tipped a little, so that it is not seen dead along one of its axes.
  const tip = 0.26;
  return corners.map((corner, i) => {
    const jitter = i === 0 ? [0, 0, 0] : rng.inSphere().map((v) => v * 0.07);
    const x = corner[0] + jitter[0];
    const y = corner[1] + jitter[1];
    const z = corner[2] - radius + jitter[2];
    return { at: [x, y * Math.cos(tip) - z * Math.sin(tip), y * Math.sin(tip) + z * Math.cos(tip)], proton: proton[i] };
  });
})();

/** The middle of the nucleus. */
export const NUCLEUS_CENTRE: Vec3 = (() => {
  const sum = NUCLEONS.reduce((s, n) => [s[0] + n.at[0], s[1] + n.at[1], s[2] + n.at[2]], [0, 0, 0]);
  return [sum[0] / NUCLEONS.length, sum[1] / NUCLEONS.length, sum[2] / NUCLEONS.length];
})();

/** How far the nucleus reaches from its middle. */
export const NUCLEUS_RADIUS = Math.max(...NUCLEONS.map((n) => Math.hypot(n.at[0] - NUCLEUS_CENTRE[0], n.at[1] - NUCLEUS_CENTRE[1], n.at[2] - NUCLEUS_CENTRE[2]))) + NUCLEON_RADIUS;

export interface Quark {
  at: Vec3;
  flavour: 'up' | 'down';
  /** Its "colour": the name physicists give to the three kinds of the charge the strong force acts on. */
  colour: 'red' | 'green' | 'blue';
}

/** The three quarks of the proton at the origin: two up and one down. Where they are drawn is a convention; they have no fixed places. */
export const QUARKS: Quark[] = [
  { at: [0.02, 0.4, 0.06], flavour: 'up', colour: 'red' },
  { at: [-0.36, -0.2, -0.05], flavour: 'up', colour: 'green' },
  { at: [0.35, -0.22, 0.02], flavour: 'down', colour: 'blue' },
];

/** A place in the nucleus (femtometres) in the units of the layer of one of the stops. */
export function inFemtometres(layer: string, p: Vec3): Vec3 {
  const unit = (10 ** STOPS[stopIndex(layer)].s / 2) * 1e15;
  return [p[0] / unit, p[1] / unit, p[2] / unit];
}
