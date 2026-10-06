import { LOOKS, type GalaxyLook } from './galaxySprites';
import { NEIGHBOR_MAGNIFICATION } from './magnify';

/** How one named galaxy is drawn. Keys below are catalog ids. */
export interface ZooEntry {
  look: GalaxyLook;
  /** Inclination in degrees: 0 = face-on, 90 = edge-on. */
  incl: number;
  /** Direction of the major axis on the sky, degrees counter-clockwise from +x. */
  pa: number;
  /** Rotation of the pattern about the galaxy's own axis, radians. */
  spin?: number;
  /** Visible radius in layer units, when the default (true size × the layer's magnification) won't do. */
  radius?: number;
  brightness?: number;
}

/**
 * The part of a sprite's bounding radius that actually reads as "the galaxy": the disc fades
 * exponentially, so the outer third is too faint to see.
 */
export const VISIBLE_FRACTION = 0.62;

/**
 * Visible radius of a neighbouring galaxy, in layer units: its true radius magnified, but kept
 * within limits so that neither the smallest nor the largest spoils the picture.
 * @param size true diameter, in layer units
 */
export function neighborRadius(entry: ZooEntry, size: number): number {
  return entry.radius ?? Math.min(0.13, Math.max(0.065, (size / 2) * NEIGHBOR_MAGNIFICATION));
}

/** Visible radius of the neighbours that are groups of several sprites rather than one galaxy. */
export const NEIGHBOR_GROUPS: Record<string, number> = {
  antennae: 0.07,
  'leo-triplet': 0.08,
};

const { grandDesign, multiArm, flocculent, barred, lenticular, giantElliptical, irregular, dwarfElliptical } = LOOKS;

/** Galaxies of the `galaxies` stop: our neighbours out to about 60 million light-years. */
export const NEIGHBORS: Record<string, ZooEntry> = {
  m87: { look: { ...giantElliptical, bulgeFlatten: 0.93, jet: 1.5 }, incl: 0, pa: 0, spin: 0.5 },
  sombrero: {
    look: { ...lenticular, bulge: 0.2, bulgeFlatten: 0.72, bulgeLight: 2.5, disc: 0.75, discScale: 0.3, thickness: 0.02, ring: 0.7, dustRing: 1, dust: 3.6 },
    incl: 84,
    pa: -5,
    radius: 0.085,
  },
  whirlpool: { look: { ...grandDesign, pitch: 0.32, armContrast: 1 }, incl: 22, pa: 30, spin: 0.9, radius: 0.085 },
  pinwheel: { look: { ...multiArm, arms: 3, pitch: 0.38, armContrast: 0.8, flocculence: 0.5, bulge: 0.035 }, incl: 18, pa: 40 },
  'cen-a': {
    look: { ...giantElliptical, bulge: 0.22, bulgeFlatten: 0.86, disc: 0.25, discScale: 0.25, dust: 4.2, thickness: 0.035, flocculence: 0.8, starFormation: 0.6 },
    incl: 80,
    pa: 122,
    radius: 0.075,
  },
  m81: { look: { ...grandDesign, pitch: 0.24, bulge: 0.09, bulgeLight: 1.9, armContrast: 0.85 }, incl: 58, pa: 155 },
  sculptor: { look: { ...multiArm, flocculence: 0.7, dust: 2, disc: 1, starFormation: 1 }, incl: 76, pa: 52 },
  m83: { look: { ...barred, bar: 0.22, pitch: 0.36, starFormation: 1, flocculence: 0.3 }, incl: 24, pa: 45, radius: 0.075 },
  'black-eye': {
    look: { ...multiArm, arms: 2, pitch: 0.2, armContrast: 0.5, dust: 3.2, bulge: 0.08, starFormation: 0.4, discScale: 0.2 },
    incl: 60,
    pa: 115,
    radius: 0.068,
  },
  needle: { look: { ...grandDesign, bulge: 0.07, bulgeFlatten: 0.7, dust: 2.6, thickness: 0.02, disc: 1 }, incl: 87.5, pa: 135 },
  ngc1300: { look: { ...barred, bar: 0.36, pitch: 0.33, armContrast: 1, bulge: 0.04 }, incl: 35, pa: 106 },
  ic342: { look: { ...multiArm, arms: 3, pitch: 0.3, armContrast: 0.75, bulge: 0.03, flocculence: 0.45 }, incl: 20, pa: 60 },
  m94: {
    look: { ...multiArm, arms: 2, pitch: 0.14, armContrast: 0.45, ring: 0.3, ringLight: 1.1, bulge: 0.08, bulgeLight: 2.2, discScale: 0.22, flocculence: 0.4 },
    incl: 30,
    pa: 115,
    radius: 0.068,
  },
  m106: { look: { ...multiArm, arms: 2, pitch: 0.3, armContrast: 0.8, bulge: 0.06 }, incl: 64, pa: 150 },
  ngc6946: { look: { ...multiArm, pitch: 0.33, armContrast: 0.8, flocculence: 0.55, starFormation: 1, bulge: 0.03 }, incl: 30, pa: 62, radius: 0.07 },
  m63: { look: flocculent, incl: 58, pa: 105 },
  ngc891: { look: { ...grandDesign, dust: 3, thickness: 0.024, bulge: 0.06, bulgeFlatten: 0.75, disc: 1 }, incl: 89, pa: 22 },
  m74: { look: { ...grandDesign, pitch: 0.36, bulge: 0.035, armContrast: 1 }, incl: 8, pa: 0 },
  ngc1365: { look: { ...barred, bar: 0.34, pitch: 0.42, armContrast: 1, bulge: 0.05, starFormation: 0.9 }, incl: 42, pa: 32 },
};

/**
 * The Cartwheel: a ring of newborn stars thrown outwards by a head-on collision, joined to the
 * old core by faint spokes. Too far away for the zoo; it appears among the superclusters.
 */
export const CARTWHEEL: ZooEntry = {
  look: {
    ...multiArm,
    arms: 7,
    pitch: 0.7,
    armContrast: 0.4,
    ring: 0.76,
    ringLight: 1.7,
    bulge: 0.05,
    bulgeLight: 1.5,
    disc: 0.4,
    discScale: 0.55,
    dust: 0.2,
    starFormation: 1,
    flocculence: 0.6,
  },
  incl: 42,
  pa: 60,
};

/** Members of the Local Group (other than the Milky Way and its Magellanic Clouds). */
export const LOCAL_GROUP: Record<string, ZooEntry> = {
  andromeda: {
    look: { ...grandDesign, pitch: 0.16, armContrast: 0.55, ring: 0.48, ringLight: 0.55, bulge: 0.085, bulgeLight: 2.1, dust: 1.9, discScale: 0.26, starFormation: 0.55, flocculence: 0.4 },
    incl: 77,
    pa: 38,
  },
  triangulum: { look: { ...flocculent, arms: 2, pitch: 0.4, armContrast: 0.55, bulge: 0.02, bulgeLight: 0.8, starFormation: 1 }, incl: 54, pa: 23 },
  ic10: { look: { ...irregular, disc: 1.1 }, incl: 40, pa: 130 },
  ngc6822: { look: { ...irregular, bar: 0.3 }, incl: 50, pa: 100 },
  ic1613: { look: irregular, incl: 35, pa: 50 },
  wlm: { look: irregular, incl: 70, pa: 86 },
  'leo-a': { look: irregular, incl: 55, pa: 110 },
  'sextans-a': { look: { ...irregular, disc: 0.95 }, incl: 30, pa: 0 },
  'pegasus-dwarf': { look: irregular, incl: 60, pa: 120 },
  'ngc147-185': { look: dwarfElliptical, incl: 0, pa: 0 },
  'leo-i': { look: dwarfElliptical, incl: 0, pa: 0 },
  phoenix: { look: dwarfElliptical, incl: 0, pa: 0 },
  tucana: { look: dwarfElliptical, incl: 0, pa: 0 },
  'cetus-dwarf': { look: dwarfElliptical, incl: 0, pa: 0 },
};
