/**
 * Catalog of named objects. Data, not code: layers build markers from it and the HUD builds labels.
 *
 * `pos` is in layer-local units: 1 unit = half the frame height at the layer's stop
 * (see `STOPS[..].s`), with the layer's centre at the origin: us, or the Sun in the layers of the
 * Solar System. `size` is the real diameter in metres.
 * Figures are approximate and still need a sourcing pass, see docs/SOURCES.md.
 */

import { LIGHT_YEAR } from '../util/format';
import { inFemtometres, NUCLEONS, NUCLEUS_CENTRE, NUCLEUS_RADIUS, QUARKS } from './atomicNucleus';
import { chromatin as chromatinModel, groove, inLayerUnits, phosphate, type BasePair, type Vec3 } from './chromatin';
import { awayFromSite, nearSite, onEarth } from './earthSite';
import { LEAF, onLeaf, sideVeinAt } from './leaf';
import { INSIDE_LEAF, INSIDE_PLACES, insideLeaf, onSkin } from './leafInside';
import { galactic } from './sky';
import {
  aphelion,
  beside,
  between,
  EARTH_LONGITUDE,
  EARTH_ON_SUN,
  heliocentric,
  HELIOPAUSE,
  heliopauseRadius,
  inLayer,
  MOON_DISTANCE,
  MOON_LONGITUDE,
  onLimb,
  onSun,
  PLACES,
  SUNSPOTS,
  terminationShockRadius,
} from './solarSystem';
import { STOPS } from './timeline';

export type Kind =
  | 'you'
  | 'structure'
  | 'void'
  | 'supercluster'
  | 'cluster'
  | 'galaxy'
  | 'blackhole'
  | 'globular'
  | 'starcluster'
  | 'nebula'
  | 'star'
  | 'planet'
  | 'dwarf'
  | 'moon'
  | 'comet'
  | 'craft'
  | 'place'
  | 'bio'
  | 'molecule'
  | 'atom';

export interface CatalogItem {
  id: string;
  name: string;
  kind: Kind;
  /** Stop id of the layer this object lives in. */
  layer: string;
  /** Diameter in metres. */
  size: number;
  pos: [number, number, number];
  note?: string;
  /** Marker colour override (hex). */
  color?: number;
  /** Label only: the layer draws this object itself, or it is a region with no single dot. */
  noMarker?: boolean;
}

export const KIND_COLOR: Record<Kind, number> = {
  you: 0x7df9ff,
  structure: 0xc9b6ff,
  void: 0x6f7c99,
  supercluster: 0xffd58a,
  cluster: 0xffb070,
  galaxy: 0xcfe2ff,
  blackhole: 0xffa94d,
  globular: 0xfff0b8,
  starcluster: 0xcfe0ff,
  nebula: 0xff7fb0,
  star: 0xffffff,
  planet: 0x9fc4ff,
  dwarf: 0xc8c2b8,
  moon: 0xd8d8d8,
  comet: 0xbfefff,
  craft: 0xffffff,
  place: 0xffe9c4,
  bio: 0x9be37a,
  molecule: 0xffc46b,
  atom: 0x8fd3ff,
};

type Extra = Partial<Pick<CatalogItem, 'note' | 'color' | 'noMarker'>>;

function group(layer: string) {
  return (
    id: string,
    name: string,
    kind: Kind,
    size: number,
    pos: [number, number, number],
    extra: Extra = {},
  ): CatalogItem => ({ id, name, kind, layer, size, pos, ...extra });
}

const universe = group('universe');
const walls = group('walls');
const superclusters = group('superclusters');
const clusters = group('clusters');
const galaxies = group('galaxies');
const localGroup = group('localGroup');
const milkyWay = group('milkyWay');
const globulars = group('globulars');
const nebulae = group('nebulae');
const giants = group('giants');
const brightStars = group('brightStars');
const neighborhood = group('neighborhood');
const oort = group('oort');
const farSolar = group('farSolar');
const heliosphere = group('heliosphere');
const kuiper = group('kuiper');
const outer = group('outer');
const inner = group('inner');
const sun = group('sun');
const au = group('au');
const earthMoon = group('earthMoon');
const earth = group('earth');
const orbit = group('orbit');
const edge = group('edge');
const clouds = group('clouds');
const landscape = group('landscape');
const tree = group('tree');
const leaf = group('leaf');
const veins = group('veins');
const tissue = group('tissue');
const stoma = group('stoma');
const cell = group('cell');
const nucleus = group('nucleus');
const chromosomes = group('chromosomes');
const chromatin = group('chromatin');
const dna = group('dna');
const molecule = group('molecule');
const atom = group('atom');
const atomNucleus = group('atomNucleus');
const proton = group('proton');

/**
 * Where something lies in one of the layers inside the Milky Way, from its place on the sky:
 * galactic longitude and latitude in degrees, distance in light-years. Those layers are drawn
 * in galactic coordinates (see sky.ts), so real positions need no placing by hand.
 */
function sky(layer: string, l: number, b: number, distanceLy: number): [number, number, number] {
  const stop = STOPS.find((s) => s.id === layer);
  if (!stop) throw new Error(`Unknown layer "${layer}"`);
  const unitLy = 10 ** stop.s / 2 / LIGHT_YEAR;
  const [x, y, z] = galactic(l, b, distanceLy);
  return [x / unitLy, y / unitLy, z / unitLy];
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Where the guard cell on one side of the pore lies on the skin of the leaf, micrometres from the pore's middle. */
const GUARD_CELL: [number, number] = (() => {
  const turned = LEAF.angle + LEAF.stomaAngle;
  return [Math.sin(turned) * INSIDE_LEAF.guard.off, -Math.cos(turned) * INSIDE_LEAF.guard.off];
})();

// Places in the chromatin and on its DNA come from the model both layers are built from (app/chromatin.ts).
const FIBRE = chromatinModel().fibres[0];
const LINK = chromatinModel().link;
const basePair = (number: number): BasePair => FIBRE.pairs[number - FIBRE.first];
/** Of the base pairs from `from` to `to`, the point given by `at` that faces the camera most squarely. */
function facing(from: number, to: number, at: (pair: BasePair) => Vec3): Vec3 {
  let best = at(basePair(from));
  for (let number = from + 1; number <= to; number++) {
    const p = at(basePair(number));
    if (p[2] > best[2]) best = p;
  }
  return best;
}
/** The tip of the histone tail that reaches furthest towards the camera, on the spool before the stretch the journey zooms into. */
const TAIL_TIP = FIBRE.spools[LINK].tails.map((tail) => tail[tail.length - 1]).reduce((a, b) => (b[2] + 0.4 * b[1] > a[2] + 0.4 * a[1] ? b : a));

// Star colours by temperature, coolest first.
const RED = 0xff6a3d;
const ORANGE = 0xffb070;
const YELLOW = 0xfff2c0;
const WHITE = 0xffffff;
const BLUE = 0xa8c8ff;

export const CATALOG: CatalogItem[] = [
  // ───────────── Part A: cosmos ─────────────
  universe('observable-universe', 'Observable Universe', 'structure', 8.8e26, [0.4, 0.39, 0], { note: '93 billion light-years across', noMarker: true }),
  universe('cmb', 'Cosmic Microwave Background', 'structure', 8.8e26, [0.38, -0.41, 0], { note: 'The oldest light, released 380,000 years after the Big Bang', noMarker: true }),
  universe('you-universe', 'You are here', 'you', 1e21, [0, 0, 0]),

  walls('hercules-crb', 'Hercules–Corona Borealis Great Wall', 'structure', 9.5e25, [0.95, 0.55, -0.3], { note: '≈10 billion light-years long, possibly the largest structure known' }),
  walls('huge-lqg', 'Huge Large Quasar Group', 'structure', 3.8e25, [-0.9, -0.52, 0.2], { note: '73 quasars spanning 4 billion light-years' }),
  walls('giant-arc', 'Giant Arc', 'structure', 3.1e25, [-0.55, 0.82, 0.1], { note: 'An arc of galaxies 3.3 billion light-years long' }),
  walls('boss-wall', 'BOSS Great Wall', 'structure', 9.5e24, [0.42, -0.5, 0], { note: 'A billion light-years of superclusters' }),
  walls('bullet', 'Bullet Cluster', 'cluster', 2e22, [-0.34, 0.27, 0], { note: 'Two galaxy clusters in collision, 3.7 billion light-years away' }),
  walls('you-walls', 'You are here', 'you', 1e21, [0, 0, 0]),

  superclusters('laniakea', 'Laniakea', 'supercluster', 4.9e24, [0.06, 0.16, 0], { note: 'Our home supercluster, 520 million light-years across', noMarker: true }),
  superclusters('great-attractor', 'Great Attractor', 'structure', 5e23, [0.19, -0.1, 0], { note: 'A gravitational focus pulling our galaxy along' }),
  superclusters('shapley', 'Shapley Supercluster', 'supercluster', 1.9e24, [0.55, -0.3, 0], { note: 'The largest concentration of galaxies in our cosmic neighborhood' }),
  superclusters('perseus-pisces', 'Perseus–Pisces Supercluster', 'supercluster', 2.8e24, [-0.2, -0.12, 0.05], { note: 'A chain of galaxies almost 300 million light-years long' }),
  superclusters('coma-sc', 'Coma Supercluster', 'supercluster', 1.9e23, [0.2, 0.25, 0]),
  superclusters('hercules-sc', 'Hercules Superclusters', 'supercluster', 3e24, [0.35, 0.4, 0]),
  superclusters('corona-borealis-sc', 'Corona Borealis Supercluster', 'supercluster', 3e24, [0.75, 0.6, 0], { note: 'About 1 billion light-years away' }),
  superclusters('horologium', 'Horologium–Reticulum Supercluster', 'supercluster', 5.2e24, [-0.35, -0.55, 0], { note: '550 million light-years long' }),
  superclusters('bootes-void', 'Boötes Void', 'void', 3.1e24, [-0.25, 0.6, 0], { note: 'A nearly empty bubble 330 million light-years wide' }),
  superclusters('sloan', 'Sloan Great Wall', 'structure', 1.3e25, [-0.85, -0.42, 0], { note: 'A wall of galaxies 1.4 billion light-years long' }),
  superclusters('cartwheel', 'Cartwheel Galaxy', 'galaxy', 1.4e21, [0.45, 0.12, 0], { note: 'A ring galaxy shaped by a head-on collision' }),

  clusters('virgo-sc', 'Virgo Supercluster', 'supercluster', 1.04e24, [0.13, -0.09, 0], { note: 'Our local supercluster, 110 million light-years across', noMarker: true }),
  clusters('local-void', 'Local Void', 'void', 1.4e24, [-0.33, 0.33, 0], { note: 'An empty region about 150 million light-years across, right on our doorstep', noMarker: true }),
  clusters('virgo', 'Virgo Cluster', 'cluster', 1.4e23, [0.224, 0.126, 0], { note: 'Over a thousand galaxies, 54 million light-years away' }),
  clusters('fornax', 'Fornax Cluster', 'cluster', 6e22, [-0.139, -0.26, 0], { note: '62 million light-years away' }),
  clusters('ursa-major', 'Ursa Major Cluster', 'cluster', 6e22, [0.051, 0.279, 0], { note: 'A loose cluster of spiral galaxies' }),
  clusters('eridanus', 'Eridanus Cluster', 'cluster', 5e22, [-0.316, -0.164, 0]),
  clusters('antlia', 'Antlia Cluster', 'cluster', 5e22, [0.19, -0.603, 0]),
  clusters('centaurus', 'Centaurus Cluster', 'cluster', 1e23, [0.696, -0.411, 0]),
  clusters('hydra', 'Hydra Cluster', 'cluster', 9e22, [0.352, -0.832, 0]),
  clusters('norma', 'Norma Cluster', 'cluster', 9e22, [0.947, -0.455, 0], { note: 'Heart of the Great Attractor' }),
  clusters('perseus', 'Perseus Cluster', 'cluster', 1e23, [-0.949, 0.633, 0], { note: 'Thousands of galaxies in a cloud of hot gas' }),
  clusters('coma', 'Coma Cluster', 'cluster', 1.9e23, [1.419, 0.565, 0], { note: 'Over 1,000 galaxies, 320 million light-years away' }),
  clusters('leo', 'Leo Cluster', 'cluster', 9e22, [1.5, 0.33, 0], { note: 'A neighbor of Coma in the same supercluster' }),

  // Neighbors are drawn about 80 times larger than life, so their shapes can be seen (see layers/magnify.ts).
  galaxies('local-group', 'Local Group', 'you', 9.5e22, [0, 0, 0], { note: 'Home' }),
  galaxies('m81', 'Bode’s Galaxy & Cigar Galaxy', 'galaxy', 8.5e20, [-0.121, 0.259, 0], { note: 'M81 and M82, a close pair 12 million light-years away' }),
  galaxies('sculptor', 'Sculptor Galaxy', 'galaxy', 8.5e20, [-0.181, -0.2, 0], { note: 'A starburst galaxy 11 million light-years away' }),
  galaxies('cen-a', 'Centaurus A', 'galaxy', 5.7e20, [0.2, -0.2, 0], { note: 'An elliptical galaxy that swallowed a spiral; a dust lane crosses it' }),
  galaxies('ic342', 'IC 342', 'galaxy', 7.1e20, [0.195, 0.164, 0], { note: 'The Hidden Galaxy: veiled by the dust of our own Milky Way' }),
  galaxies('m83', 'Southern Pinwheel', 'galaxy', 5e20, [0.36, 0.05, 0], { note: 'A barred spiral ablaze with newborn stars' }),
  galaxies('m94', 'Messier 94', 'galaxy', 4.7e20, [0.066, 0.374, 0], { note: 'A ring of newborn stars circles its core' }),
  galaxies('black-eye', 'Black Eye Galaxy', 'galaxy', 5e20, [0.249, 0.319, 0], { note: 'Named for the dark band of dust in front of its core' }),
  galaxies('pinwheel', 'Pinwheel Galaxy', 'galaxy', 1.6e21, [-0.5, 0.1, 0], { note: 'A face-on spiral 170,000 light-years across' }),
  galaxies('whirlpool', 'Whirlpool Galaxy', 'galaxy', 7.2e20, [-0.3, 0.46, 0], { note: 'A grand-design spiral tugging on a smaller companion' }),
  galaxies('m106', 'Messier 106', 'galaxy', 1.28e21, [0.53, 0.19, 0], { note: 'Its central black hole is among the best measured of all' }),
  galaxies('ngc6946', 'Fireworks Galaxy', 'galaxy', 3.8e20, [-0.564, -0.205, 0], { note: 'Ten supernovae seen here in the last hundred years' }),
  galaxies('m63', 'Sunflower Galaxy', 'galaxy', 9.3e20, [0.24, 0.593, 0], { note: 'A flocculent spiral: its arms are broken into many short pieces' }),
  galaxies('sombrero', 'Sombrero Galaxy', 'galaxy', 4.7e20, [0.45, -0.55, 0], { note: 'A brilliant bulge ringed by a dark lane of dust' }),
  galaxies('ngc891', 'NGC 891', 'galaxy', 9.5e20, [0.03, -0.71, 0], { note: 'A spiral seen edge-on, much as our own galaxy would look from outside' }),
  galaxies('m74', 'Phantom Galaxy', 'galaxy', 9e20, [-0.658, 0.38, 0], { note: 'A near-perfect spiral seen face-on' }),
  galaxies('leo-triplet', 'Leo Triplet', 'galaxy', 4e21, [0.8, -0.215, 0], { note: 'Three spirals in a tight group, 35 million light-years away' }),
  galaxies('needle', 'Needle Galaxy', 'galaxy', 9.5e20, [0.6, 0.75, 0], { note: 'A spiral seen exactly edge-on' }),
  galaxies('antennae', 'Antennae Galaxies', 'galaxy', 4.7e21, [-1.15, -0.2, 0], { note: 'Two galaxies in the middle of a collision' }),
  galaxies('m87', 'Messier 87', 'galaxy', 1.2e21, [1.13, 0.56, 0], { note: 'Giant elliptical; its black hole was the first ever imaged' }),
  galaxies('ngc1365', 'Great Barred Spiral', 'galaxy', 1.9e21, [1.15, -0.665, 0], { note: 'NGC 1365, 200,000 light-years across' }),
  galaxies('ngc1300', 'NGC 1300', 'galaxy', 1e21, [-1.3, 0.62, 0], { note: 'A textbook barred spiral' }),

  // Local Group members are drawn about 4 times larger than life.
  localGroup('milky-way', 'Milky Way', 'you', 1e21, [0, 0, 0], { note: 'Home' }),
  localGroup('andromeda', 'Andromeda Galaxy', 'galaxy', 2.1e21, [0.62, 0.42, 0.1], { note: 'Our nearest large galaxy, 2.5 million light-years away' }),
  localGroup('triangulum', 'Triangulum Galaxy', 'galaxy', 5.7e20, [0.8, 0.18, 0], { note: 'The third-largest member of the Local Group' }),
  localGroup('ic10', 'IC 10', 'galaxy', 4.7e19, [0.42, 0.56, 0], { note: 'The only starburst galaxy in the Local Group' }),
  localGroup('ngc147-185', 'NGC 147 & NGC 185', 'galaxy', 1e20, [0.6, 0.56, 0], { note: 'Two dwarf companions of Andromeda' }),
  localGroup('ngc6822', 'Barnard’s Galaxy', 'galaxy', 6.6e19, [-0.4, -0.27, 0]),
  localGroup('ic1613', 'IC 1613', 'galaxy', 1e20, [-0.3, 0.65, 0]),
  localGroup('leo-i', 'Leo I', 'galaxy', 1.9e19, [-0.2, 0.15, 0]),
  localGroup('leo-a', 'Leo A', 'galaxy', 6e19, [-0.55, 0.55, 0]),
  localGroup('sextans-a', 'Sextans A', 'galaxy', 7.6e19, [-1.1, 0.68, 0], { note: 'At the very edge of the Local Group' }),
  localGroup('wlm', 'WLM Galaxy', 'galaxy', 7.6e19, [-0.85, -0.3, 0]),
  localGroup('pegasus-dwarf', 'Pegasus Dwarf', 'galaxy', 4.7e19, [0.9, -0.12, 0]),
  localGroup('phoenix', 'Phoenix Dwarf', 'galaxy', 1.5e19, [0.2, -0.38, 0]),
  localGroup('cetus-dwarf', 'Cetus Dwarf', 'galaxy', 4.3e19, [0.05, -0.75, 0], { note: 'An isolated dwarf, far from either large galaxy' }),
  localGroup('tucana', 'Tucana Dwarf', 'galaxy', 1.5e19, [0.5, -0.7, 0]),
  // These two belong to the Milky Way system, which this layer magnifies as one: their positions are
  // galactic coordinates at true scale, not screen positions.
  localGroup('lmc-lg', 'Large Magellanic Cloud', 'galaxy', 3e20, sky('localGroup', 280.5, -32.9, 163_000), { note: 'A satellite of the Milky Way, 160,000 light-years away' }),
  localGroup('smc-lg', 'Small Magellanic Cloud', 'galaxy', 1.8e20, sky('localGroup', 302.8, -44.3, 200_000), { note: 'A satellite of the Milky Way, 200,000 light-years away' }),

  // From here to the stellar neighborhood, layers are drawn in galactic coordinates (see sky.ts).
  // The arm and bar labels follow the stylised model of the galaxy in layers/galaxyModel.ts.
  milkyWay('sun-mw', 'Sun', 'you', 1.39e9, [0, 0, 0], { note: 'You are here: the Orion Spur, 26,000 light-years from the center' }),
  milkyWay('sgr-a', 'Sagittarius A*', 'blackhole', 2.4e10, sky('milkyWay', 0, 0, 26_000), { note: 'A black hole of 4 million solar masses' }),
  milkyWay('bar', 'Galactic Bar', 'structure', 3e20, [0.6, 0.14, 0], { noMarker: true }),
  milkyWay('perseus-arm', 'Perseus Arm', 'structure', 2e20, [0.02, -0.6, 0], { noMarker: true }),
  milkyWay('sagittarius-arm', 'Sagittarius Arm', 'structure', 2e20, [0.27, 0.28, 0], { noMarker: true }),
  milkyWay('scutum-arm', 'Scutum–Centaurus Arm', 'structure', 2e20, [1.11, 0.01, 0], { noMarker: true }),
  milkyWay('outer-arm', 'Outer Arm', 'structure', 2e20, [0.02, 0.55, 0], { noMarker: true }),
  milkyWay('fermi-bubbles-mw', 'Fermi Bubbles', 'structure', 2.4e20, sky('milkyWay', 0, 34, 31_400), { note: 'Two lobes of hot gas above and below the center, seen in gamma rays', noMarker: true }),
  milkyWay('sgr-dwarf', 'Sagittarius Dwarf Galaxy', 'galaxy', 9.5e19, sky('milkyWay', 5.6, -14, 70_000), { note: 'A small galaxy being pulled apart by the Milky Way' }),
  milkyWay('lmc', 'Large Magellanic Cloud', 'galaxy', 3e20, sky('milkyWay', 280.5, -32.9, 163_000), { note: 'A satellite galaxy 160,000 light-years away' }),
  milkyWay('smc', 'Small Magellanic Cloud', 'galaxy', 1.8e20, sky('milkyWay', 302.8, -44.3, 200_000), { note: 'A satellite galaxy 200,000 light-years away' }),

  // ───────────── Part B: inside the galaxy ─────────────
  // Every position below comes from the object's place on the sky: sky(layer, longitude, latitude, light-years).
  globulars('sun-gc', 'Sun', 'you', 1.39e9, [0, 0, 0]),
  globulars('galactic-center', 'Galactic Center', 'blackhole', 2.4e10, sky('globulars', 0, 0, 26_000), { note: '26,000 light-years away' }),
  globulars('fermi-bubbles', 'Fermi Bubbles', 'structure', 2.4e20, sky('globulars', 0, 25.7, 28_850), { note: 'Two lobes of hot gas blown out of the galactic center, each 25,000 light-years tall', noMarker: true }),
  globulars('omega-cen', 'Omega Centauri', 'globular', 1.4e18, sky('globulars', 309.1, 15.0, 17_000), { note: 'The largest globular cluster of the Milky Way: about 10 million stars' }),
  globulars('47-tuc', '47 Tucanae', 'globular', 1.1e18, sky('globulars', 305.9, -44.9, 14_500), { note: 'Visible to the naked eye from the southern hemisphere' }),
  globulars('m13', 'Great Hercules Cluster', 'globular', 1.4e18, sky('globulars', 59.0, 40.9, 22_200), { note: 'M13, 22,000 light-years away' }),
  globulars('m5', 'Messier 5', 'globular', 1.6e18, sky('globulars', 3.9, 46.8, 24_500), { note: 'About 13 billion years old' }),
  globulars('m4', 'Messier 4', 'globular', 7.1e17, sky('globulars', 351.0, 16.0, 7_200), { note: 'One of the closest globular clusters to the Sun' }),
  globulars('m10', 'Messier 10', 'globular', 7.9e17, sky('globulars', 15.1, 23.1, 14_300), { note: '14,000 light-years away, above the plane of the galaxy' }),
  globulars('ngc6752', 'NGC 6752', 'globular', 9.5e17, sky('globulars', 336.5, -25.6, 13_000), { note: 'One of the brightest globular clusters in our sky' }),
  globulars('carina', 'Carina Nebula', 'nebula', 4.3e18, sky('globulars', 287.7, -0.8, 8_500), { note: 'One of the largest nebulae in the galaxy, home of the erupting star Eta Carinae' }),

  nebulae('sun-neb', 'Sun', 'you', 1.39e9, [0, 0, 0]),
  nebulae('orion', 'Orion Nebula', 'nebula', 2.3e17, sky('nebulae', 209.0, -19.4, 1_344), { note: 'The nearest great stellar nursery, 1,344 light-years away' }),
  nebulae('eagle', 'Eagle Nebula', 'nebula', 6.6e17, sky('nebulae', 16.9, 0.8, 5_700), { note: 'Home of the Pillars of Creation' }),
  nebulae('lagoon', 'Lagoon Nebula', 'nebula', 1.0e18, sky('nebulae', 6.0, -1.2, 4_100), { note: 'A stellar nursery crossed by a dark lane of dust' }),
  nebulae('rosette', 'Rosette Nebula', 'nebula', 1.2e18, sky('nebulae', 206.5, -1.6, 5_200), { note: 'Young stars at its heart have blown the middle clear' }),
  nebulae('crab', 'Crab Nebula', 'nebula', 1.0e17, sky('nebulae', 184.6, -5.8, 6_500), { note: 'The remains of a supernova seen in the year 1054' }),
  nebulae('veil', 'Veil Nebula', 'nebula', 1.2e18, sky('nebulae', 73.3, -7.6, 2_400), { note: 'The wreckage of a star that exploded 10,000–20,000 years ago' }),
  nebulae('vela', 'Vela Supernova Remnant', 'nebula', 9.5e17, sky('nebulae', 263.6, -2.8, 936), { note: 'The remains of a star that exploded about 11,000 years ago' }),
  nebulae('dumbbell', 'Dumbbell Nebula', 'nebula', 2.7e16, sky('nebulae', 60.8, -3.7, 1_360), { note: 'The glowing shell of a dying Sun-like star; the first such nebula ever found, in 1764' }),
  nebulae('cats-eye', 'Cat’s Eye Nebula', 'nebula', 3.8e15, sky('nebulae', 96.5, 30.0, 3_300), { note: 'A dying star puffing off shell after shell' }),
  nebulae('butterfly', 'Butterfly Nebula', 'nebula', 2.8e16, sky('nebulae', 349.5, 1.1, 3_400), { note: 'Two wings of gas racing away from a dying star at about a million km/h' }),

  giants('sun-giants', 'Sun', 'you', 1.39e9, [0, 0, 0]),
  giants('local-bubble', 'Local Bubble', 'structure', 9.5e18, [0.39, 0.39, 0], { note: 'A cavity blown out by ancient supernovae; new stars are forming on its surface', noMarker: true }),
  giants('pleiades', 'Pleiades', 'starcluster', 1.6e17, sky('giants', 166.6, -23.5, 444), { note: 'The Seven Sisters: hot blue stars 444 light-years away' }),
  giants('beehive', 'Beehive Cluster', 'starcluster', 2.2e17, sky('giants', 205.5, 32.5, 577), { note: 'About 1,000 stars, 600 light-years away' }),
  giants('alpha-persei', 'Alpha Persei Cluster', 'starcluster', 2.8e17, sky('giants', 146.6, -5.9, 570), { note: 'A young cluster around the bright star Mirfak' }),
  giants('coma-star-cluster', 'Coma Star Cluster', 'starcluster', 2.2e17, sky('giants', 222.5, 83.4, 280), { note: 'A loose cluster almost straight above the galactic plane' }),
  giants('southern-pleiades', 'Southern Pleiades', 'starcluster', 1.4e17, sky('giants', 289.6, -4.9, 480)),
  giants('sco-cen', 'Scorpius–Centaurus Association', 'starcluster', 2.8e18, sky('giants', 351.5, 20.0, 470), { note: 'The nearest nursery of massive stars' }),
  giants('taurus-cloud', 'Taurus Molecular Cloud', 'nebula', 9.5e17, sky('giants', 174.1, -13.5, 430), { note: 'One of the nearest places where stars are being born' }),
  giants('helix', 'Helix Nebula', 'nebula', 2.4e16, sky('giants', 36.2, -57.1, 655), { note: 'One of the closest planetary nebulae, 650 light-years away' }),
  giants('betelgeuse', 'Betelgeuse', 'star', 1.1e12, sky('giants', 199.8, -9.0, 550), { note: 'A red supergiant about 760 times the width of the Sun', color: RED }),
  giants('antares', 'Antares', 'star', 9.5e11, sky('giants', 351.9, 15.1, 550), { note: 'A red supergiant, heart of the Scorpion', color: RED }),
  giants('rigel', 'Rigel', 'star', 1.1e11, sky('giants', 209.2, -25.2, 860), { note: 'A blue supergiant 860 light-years away', color: BLUE }),
  giants('mira', 'Mira', 'star', 5e11, sky('giants', 167.8, -58.0, 300), { note: 'A pulsating red giant: over 11 months its brightness changes a thousandfold', color: RED }),
  giants('polaris', 'Polaris', 'star', 6.4e10, sky('giants', 123.3, 26.5, 433), { note: 'The North Star', color: YELLOW }),
  giants('canopus', 'Canopus', 'star', 9.9e10, sky('giants', 261.2, -25.3, 310), { note: 'The second-brightest star in the night sky', color: YELLOW }),
  giants('spica', 'Spica', 'star', 1.0e10, sky('giants', 316.1, 50.8, 250), { color: BLUE }),
  giants('bellatrix', 'Bellatrix', 'star', 8e9, sky('giants', 196.9, -16.0, 250), { note: 'Orion’s left shoulder', color: BLUE }),
  giants('acrux', 'Acrux', 'star', 1.1e10, sky('giants', 300.1, -0.4, 320), { note: 'The brightest star of the Southern Cross', color: BLUE }),

  brightStars('sun-bright', 'Sun', 'you', 1.39e9, [0, 0, 0]),
  brightStars('radio-bubble', 'Radio Bubble', 'structure', 2.3e18, [0.64, 0.64, 0], { note: 'Our earliest radio broadcasts have travelled this far: about 120 light-years', noMarker: true }),
  brightStars('hyades', 'Hyades', 'starcluster', 1.9e17, sky('brightStars', 180.1, -22.3, 153), { note: 'The nearest open cluster, 153 light-years away' }),
  brightStars('aldebaran', 'Aldebaran', 'star', 6.1e10, sky('brightStars', 181.0, -20.2, 65), { note: 'It only looks like one of the Hyades: this red giant is less than half as far away', color: ORANGE }),
  brightStars('big-dipper', 'Ursa Major Moving Group', 'starcluster', 2.4e17, sky('brightStars', 122.2, 61.2, 82.6), { note: 'Five of the Big Dipper’s seven stars travel through space together' }),
  brightStars('arcturus', 'Arcturus', 'star', 3.5e10, sky('brightStars', 15.1, 69.1, 36.7), { note: 'A red giant 25 times wider than the Sun', color: ORANGE }),
  brightStars('vega', 'Vega', 'star', 3.3e9, sky('brightStars', 67.4, 19.2, 25), { note: '25 light-years away', color: BLUE }),
  brightStars('trappist-1', 'TRAPPIST-1', 'star', 1.7e8, sky('brightStars', 69.7, -56.6, 40.7), { note: 'A tiny red dwarf with seven Earth-sized planets', color: RED }),
  brightStars('pollux', 'Pollux', 'star', 1.2e10, sky('brightStars', 192.2, 23.4, 33.8), { note: 'The nearest giant star, and it has a planet', color: ORANGE }),
  brightStars('castor', 'Castor', 'star', 3.3e9, sky('brightStars', 187.4, 22.5, 51), { note: 'One point of light to the eye, six stars in reality', color: WHITE }),
  brightStars('capella', 'Capella', 'star', 1.7e10, sky('brightStars', 162.6, 4.6, 43), { note: 'Two yellow giants circling each other every 104 days', color: YELLOW }),
  brightStars('regulus', 'Regulus', 'star', 5e9, sky('brightStars', 226.4, 48.9, 79), { note: 'The heart of the Lion', color: BLUE }),
  brightStars('algol', 'Algol', 'star', 3.8e9, sky('brightStars', 149.0, -14.9, 90), { note: 'The Demon Star: it dims every 2.87 days as a companion passes in front', color: BLUE }),
  brightStars('gacrux', 'Gacrux', 'star', 1.2e11, sky('brightStars', 300.2, 5.6, 88), { note: 'The nearest red giant', color: RED }),
  brightStars('achernar', 'Achernar', 'star', 1.3e10, sky('brightStars', 290.8, -58.8, 139), { note: 'Spins so fast that it bulges at the equator: the flattest star known', color: BLUE }),

  neighborhood('sun-near', 'Sun', 'you', 1.39e9, [0, 0, 0]),
  neighborhood('local-cloud', 'Local Interstellar Cloud', 'structure', 2.8e17, [0.62, 0.22, 0], { note: 'The wisp of gas the Sun is drifting through, about 30 light-years across', noMarker: true }),
  neighborhood('alpha-cen', 'Alpha Centauri', 'star', 1.7e9, sky('neighborhood', 315.7, -0.7, 4.37), { note: 'The closest star system, 4.37 light-years away: two Sun-like stars and Proxima', color: YELLOW }),
  neighborhood('proxima', 'Proxima Centauri', 'star', 2.1e8, sky('neighborhood', 313.9, -1.9, 4.24), { note: 'The nearest star of all: a red dwarf 4.24 light-years away, with at least one planet', color: RED }),
  // Listed roughly by how much each deserves a label when there is not room for all: earlier wins.
  neighborhood('sirius', 'Sirius', 'star', 2.4e9, sky('neighborhood', 227.2, -8.9, 8.6), { note: 'The brightest star in our night sky, 8.6 light-years away', color: BLUE }),
  neighborhood('barnard', 'Barnard’s Star', 'star', 2.7e8, sky('neighborhood', 31.0, 14.1, 5.96), { note: 'A dim red dwarf, 6 light-years away', color: RED }),
  neighborhood('luhman-16', 'Luhman 16', 'star', 1.4e8, sky('neighborhood', 285.2, 5.3, 6.5), { note: 'A pair of brown dwarfs, the nearest known, found only in 2013', color: 0xc86a4a }),
  neighborhood('wolf-359', 'Wolf 359', 'star', 2.0e8, sky('neighborhood', 244.1, 56.1, 7.86), { color: RED }),
  neighborhood('lalande-21185', 'Lalande 21185', 'star', 5.5e8, sky('neighborhood', 185.1, 65.4, 8.3), { note: 'The brightest red dwarf in the northern sky', color: RED }),
  neighborhood('eps-eri', 'Epsilon Eridani', 'star', 1.0e9, sky('neighborhood', 195.8, -48.1, 10.5), { note: 'A young Sun-like star with at least one planet', color: ORANGE }),
  neighborhood('ross-128', 'Ross 128', 'star', 2.7e8, sky('neighborhood', 270.1, 59.6, 11.0), { note: 'A quiet red dwarf with an Earth-mass planet', color: RED }),
  neighborhood('61-cyg', '61 Cygni', 'star', 9.3e8, sky('neighborhood', 82.3, -5.8, 11.4), { note: 'The first star to have its distance measured (1838)', color: ORANGE }),
  neighborhood('procyon', 'Procyon', 'star', 2.85e9, sky('neighborhood', 213.7, 13.0, 11.46), { color: YELLOW }),
  neighborhood('eps-indi', 'Epsilon Indi', 'star', 9.9e8, sky('neighborhood', 336.2, -48.0, 11.9), { note: 'An orange star circled by two brown dwarfs and a giant planet', color: ORANGE }),
  neighborhood('tau-ceti', 'Tau Ceti', 'star', 1.1e9, sky('neighborhood', 173.1, -73.4, 11.9), { color: YELLOW }),
  neighborhood('kapteyn', 'Kapteyn’s Star', 'star', 4.1e8, sky('neighborhood', 250.5, -36.0, 12.8), { note: 'A visitor from the galactic halo, far older than the Sun', color: RED }),
  neighborhood('altair', 'Altair', 'star', 2.5e9, sky('neighborhood', 47.7, -8.9, 16.7), { note: 'Spins once every 9 hours', color: WHITE }),

  // ───────────── Part C: Solar System ─────────────
  // Places come from app/solarSystem.ts. Each layer is centred on the Sun, except the last, which is centred on Earth.
  oort('sun-oort', 'Sun', 'you', 1.39e9, [0, 0, 0]),
  oort('oort-cloud', 'Oort Cloud', 'structure', 3e16, inLayer('oort', heliocentric(80_000, 40)), { note: 'Perhaps trillions of icy bodies, out to 100,000 AU', noMarker: true }),
  oort('hills-cloud', 'Inner Oort Cloud', 'structure', 6e15, inLayer('oort', heliocentric(17_000, 320)), { note: 'A denser inner region, 2,000–20,000 AU from the Sun', noMarker: true }),
  oort('long-comet', 'Long-period comet', 'comet', 1e4, inLayer('oort', heliocentric(60_000, 150, 15_000)), { note: 'Comets fall inward from here on orbits lasting millions of years' }),
  // The same star as in the layer before, still in galactic coordinates.
  oort('alpha-cen-oort', 'Alpha Centauri', 'star', 1.7e9, sky('oort', 315.7, -0.7, 4.37), { note: 'The nearest stars are less than three times farther than the edge of the cloud', color: YELLOW }),

  // Orbit labels sit at each orbit's farthest point from the Sun.
  farSolar('sun-far', 'Sun', 'you', 1.39e9, [0, 0, 0]),
  farSolar('sedna-orbit', 'Sedna’s orbit', 'dwarf', 1.4e14, inLayer('farSolar', aphelion('sedna')), { note: 'Swings out to 937 AU; one lap takes about 11,400 years', noMarker: true }),
  farSolar('vp113-orbit', '2012 VP113', 'dwarf', 6.6e13, inLayer('farSolar', aphelion('vp113')), { note: 'Never comes closer to the Sun than 80 AU', noMarker: true }),
  farSolar('leleakuhonua', 'Leleākūhonua', 'dwarf', 3.2e14, inLayer('farSolar', aphelion('leleakuhonua')), { note: 'Travels out to roughly 2,000 AU', noMarker: true }),
  farSolar('planet-nine', 'Planet Nine?', 'planet', 1.5e14, inLayer('farSolar', aphelion('planetNine')), { note: 'Hypothetical: an unseen planet proposed to explain how these far orbits line up. Never observed.', noMarker: true }),
  farSolar('gravity-lens', 'Solar Gravitational Lens', 'structure', 1.6e14, inLayer('farSolar', heliocentric(550, 100)), { note: 'From 550 AU outward, the Sun’s gravity focuses starlight like a telescope', noMarker: true }),
  farSolar('voyager-1-far', 'Voyager 1', 'craft', 3.7, inLayer('farSolar', PLACES.voyager1), { note: 'Launched in 1977; now about 172 AU from the Sun' }),

  heliosphere('sun-helio', 'Sun', 'you', 1.39e9, [0, 0, 0]),
  heliosphere('heliopause', 'Heliopause', 'structure', 3.6e13, inLayer('heliosphere', heliocentric(heliopauseRadius(radians(75)), HELIOPAUSE.longitude - 75)), { note: 'Where the solar wind gives way to the gas between the stars, about 120 AU out', noMarker: true }),
  heliosphere('voyager-1', 'Voyager 1', 'craft', 3.7, inLayer('heliosphere', PLACES.voyager1), { note: 'The most distant human-made object: almost one light-day away' }),
  heliosphere('voyager-2', 'Voyager 2', 'craft', 3.7, inLayer('heliosphere', PLACES.voyager2), { note: 'Launched in 1977; crossed into interstellar space in 2018' }),
  heliosphere('termination-shock', 'Termination Shock', 'structure', 2.7e13, inLayer('heliosphere', heliocentric(terminationShockRadius(radians(60)), HELIOPAUSE.longitude + 60)), { note: 'Here the solar wind abruptly slows from supersonic speed', noMarker: true }),
  heliosphere('eris-helio', 'Eris', 'dwarf', 2.326e6, inLayer('heliosphere', PLACES.eris), { note: 'More massive than Pluto, currently about 96 AU from the Sun' }),
  heliosphere('sedna', 'Sedna', 'dwarf', 1.0e6, inLayer('heliosphere', PLACES.sedna), { note: 'One orbit takes about 11,400 years' }),
  heliosphere('gonggong', 'Gonggong', 'dwarf', 1.23e6, inLayer('heliosphere', PLACES.gonggong), { note: 'One of the reddest worlds known' }),
  heliosphere('interstellar', 'Interstellar space', 'structure', 3e13, inLayer('heliosphere', heliocentric(215, HELIOPAUSE.longitude + 12)), { note: 'The Sun ploughs through the thin gas between the stars at about 26 km/s', noMarker: true }),
  heliosphere('kuiper-belt-helio', 'Kuiper Belt', 'structure', 1.5e13, inLayer('heliosphere', heliocentric(46, 255)), { noMarker: true }),

  kuiper('sun-kuiper', 'Sun', 'you', 1.39e9, [0, 0, 0]),
  kuiper('pluto', 'Pluto', 'dwarf', 2.377e6, inLayer('kuiper', PLACES.pluto), { note: 'A dwarf planet 2,377 km wide, with a heart of nitrogen ice' }),
  kuiper('kuiper-belt', 'Kuiper Belt', 'structure', 1.5e13, inLayer('kuiper', heliocentric(42, 198)), { note: 'A ring of icy bodies 30 to 50 AU from the Sun', noMarker: true }),
  kuiper('eris', 'Eris', 'dwarf', 2.326e6, inLayer('kuiper', PLACES.eris), { note: 'More massive than Pluto, currently about 96 AU from the Sun' }),
  kuiper('haumea', 'Haumea', 'dwarf', 1.6e6, inLayer('kuiper', PLACES.haumea), { note: 'An egg-shaped world with a ring; it spins once every 4 hours' }),
  kuiper('makemake', 'Makemake', 'dwarf', 1.43e6, inLayer('kuiper', PLACES.makemake), { note: 'A reddish dwarf planet, found at Easter 2005' }),
  kuiper('new-horizons', 'New Horizons', 'craft', 2.7, inLayer('kuiper', PLACES.newHorizons), { note: 'Flew past Pluto in 2015 and is still heading out' }),
  kuiper('arrokoth', 'Arrokoth', 'dwarf', 3.6e4, inLayer('kuiper', PLACES.arrokoth), { note: 'Two lobes stuck together: the most distant object ever visited by a spacecraft' }),
  kuiper('quaoar', 'Quaoar', 'dwarf', 1.09e6, inLayer('kuiper', PLACES.quaoar), { note: 'Has a ring farther out than rings were thought able to exist' }),
  kuiper('orcus', 'Orcus', 'dwarf', 9.1e5, inLayer('kuiper', PLACES.orcus), { note: 'Shares Pluto’s orbit but always stays on the opposite side of the Sun' }),
  kuiper('neptune-kuiper', 'Neptune', 'planet', 4.9244e7, inLayer('kuiper', PLACES.neptune), { note: 'Its gravity shapes the inner edge of the belt' }),
  kuiper('charon', 'Charon', 'moon', 1.212e6, inLayer('kuiper', PLACES.pluto), { note: 'Half as wide as Pluto: the two circle each other like a double planet' }),

  outer('sun-outer', 'Sun', 'star', 1.3914e9, [0, 0, 0]),
  outer('jupiter', 'Jupiter', 'planet', 1.3982e8, inLayer('outer', PLACES.jupiter), { note: 'More massive than all the other planets combined' }),
  outer('saturn', 'Saturn', 'planet', 1.1646e8, inLayer('outer', PLACES.saturn), { note: 'Its main rings span about 280,000 km, yet are mostly less than 100 m thick' }),
  outer('uranus', 'Uranus', 'planet', 5.0724e7, inLayer('outer', PLACES.uranus), { note: 'An ice giant tipped on its side, rings and all' }),
  outer('neptune', 'Neptune', 'planet', 4.9244e7, inLayer('outer', PLACES.neptune), { note: '30 AU from the Sun: one orbit takes 165 years' }),
  outer('galilean-moons', 'Galilean moons', 'moon', 5.27e6, inLayer('outer', PLACES.jupiter), { note: 'Io, Europa, Ganymede and Callisto, first seen by Galileo in 1610' }),
  outer('titan', 'Titan', 'moon', 5.15e6, inLayer('outer', PLACES.saturn), { note: 'Saturn’s largest moon: orange haze over lakes of liquid methane' }),
  outer('triton', 'Triton', 'moon', 2.707e6, inLayer('outer', PLACES.neptune), { note: 'Orbits Neptune backwards: probably a captured dwarf planet' }),
  outer('halley', 'Halley’s Comet', 'comet', 1.1e4, inLayer('outer', PLACES.halley), { note: 'At the far end of its 76-year orbit; it returns in 2061' }),
  outer('chiron', 'Chiron', 'dwarf', 2.1e5, inLayer('outer', PLACES.chiron), { note: 'A centaur: part asteroid, part comet, wandering between the giant planets' }),
  outer('kuiper-belt-outer', 'Kuiper Belt', 'structure', 1.5e13, inLayer('outer', heliocentric(41, 100)), { noMarker: true }),

  inner('sun-inner', 'Sun', 'star', 1.3914e9, [0, 0, 0], { note: '1.39 million km wide: 109 Earths side by side' }),
  inner('earth-inner', 'Earth', 'you', 1.2742e7, inLayer('inner', PLACES.earth)),
  inner('venus', 'Venus', 'planet', 1.2104e7, inLayer('inner', PLACES.venus), { note: 'The hottest planet: about 465 °C under a blanket of cloud' }),
  inner('mercury', 'Mercury', 'planet', 4.879e6, inLayer('inner', PLACES.mercury), { note: 'A year lasts just 88 days' }),
  inner('mars', 'Mars', 'planet', 6.779e6, inLayer('inner', PLACES.mars), { note: 'Home of Olympus Mons, the tallest volcano known' }),
  inner('jupiter-inner', 'Jupiter', 'planet', 1.3982e8, inLayer('inner', PLACES.jupiter), { note: '5.2 AU from the Sun' }),
  inner('ceres', 'Ceres', 'dwarf', 9.39e5, inLayer('inner', PLACES.ceres), { note: 'The largest object in the asteroid belt: 940 km' }),
  inner('comet', 'Comet 67P', 'comet', 4.1e3, inLayer('inner', PLACES.comet), { note: 'A comet’s tails always point away from the Sun. This one was visited by the Rosetta probe.' }),
  inner('asteroid-belt', 'Asteroid Belt', 'structure', 8e11, inLayer('inner', heliocentric(2.75, 65)), { note: 'Millions of rocky bodies between Mars and Jupiter', noMarker: true }),
  inner('vesta', 'Vesta', 'dwarf', 5.25e5, inLayer('inner', PLACES.vesta), { note: 'The brightest asteroid in our sky' }),
  inner('ganymede', 'Ganymede', 'moon', 5.268e6, inLayer('inner', PLACES.jupiter), { note: 'The largest moon in the Solar System, bigger than Mercury' }),
  inner('io', 'Io', 'moon', 3.643e6, inLayer('inner', PLACES.jupiter), { note: 'The most volcanic world known' }),
  inner('europa', 'Europa', 'moon', 3.122e6, inLayer('inner', PLACES.jupiter), { note: 'An ocean of water under a shell of ice' }),
  inner('callisto', 'Callisto', 'moon', 4.821e6, inLayer('inner', PLACES.jupiter), { note: 'One of the most heavily cratered surfaces known' }),
  inner('trojans', 'Jupiter Trojans', 'structure', 2e11, inLayer('inner', heliocentric(5.2, 70)), { note: 'Asteroids sharing Jupiter’s orbit, 60° ahead of it and 60° behind', noMarker: true }),
  inner('parker', 'Parker Solar Probe', 'craft', 3, inLayer('inner', PLACES.parker), { note: 'The fastest spacecraft ever: it dives to within 6 million km of the Sun’s surface' }),

  // Features of the Sun's face: see SUNSPOTS and PROMINENCES in app/solarSystem.ts.
  sun('prominence', 'Prominence', 'structure', 1.9e8, inLayer('sun', onLimb(0)), { note: 'A loop of glowing gas held up by magnetism, tall enough to arch over a dozen Earths', noMarker: true }),
  sun('sunspots', 'Sunspots', 'structure', 1.2e8, inLayer('sun', onSun(SUNSPOTS[3].x, SUNSPOTS[3].y)), { note: 'Patches about 1,500 °C cooler than the surface around them, where magnetic fields break through: some are larger than Earth', noMarker: true }),
  sun('earth-scale', 'Earth, to scale', 'planet', 1.2742e7, inLayer('sun', onSun(EARTH_ON_SUN.x, EARTH_ON_SUN.y)), { note: 'About 109 Earths would span the Sun; 1.3 million would fit inside', noMarker: true }),
  sun('corona', 'Corona', 'structure', 1.9e9, inLayer('sun', onLimb(1, 0.34)), { note: 'The Sun’s outer atmosphere: over a million °C, far hotter than the surface below', noMarker: true }),
  sun('photosphere', 'Photosphere', 'structure', 1.3914e9, inLayer('sun', onSun(0.3, 0.52)), { note: 'The visible surface: about 5,500 °C', noMarker: true }),


  au('sun-au', 'Sun', 'star', 1.3914e9, [0, 0, 0]),
  au('earth-au', 'Earth', 'you', 1.2742e7, inLayer('au', PLACES.earth)),
  au('one-au', '1 astronomical unit', 'structure', 1.496e11, inLayer('au', between(PLACES.sun, PLACES.earth, 0.5)), { note: '149.6 million km: the yardstick of the Solar System', noMarker: true }),
  au('sunlight', 'Sunlight', 'structure', 3e8, inLayer('au', between(PLACES.sun, PLACES.earth, 0.25)), { note: 'These dots move at the true speed of light. Watch how long they take.', noMarker: true }),
  au('venus-au', 'Venus', 'planet', 1.2104e7, inLayer('au', PLACES.venus)),
  au('mercury-au', 'Mercury', 'planet', 4.879e6, inLayer('au', PLACES.mercury)),
  au('moon-au', 'Moon', 'moon', 3.4748e6, inLayer('au', PLACES.earth)),
  au('parker-au', 'Parker Solar Probe', 'craft', 3, inLayer('au', PLACES.parker), { note: 'The fastest spacecraft ever: it dives to within 6 million km of the Sun’s surface' }),

  earthMoon('earth-em', 'Earth', 'you', 1.2742e7, [0, 0, 0]),
  earthMoon('moon', 'Moon', 'moon', 3.4748e6, inLayer('earthMoon', beside(PLACES.earth, MOON_DISTANCE, MOON_LONGITUDE)), { note: '3,475 km wide; it always shows us the same face' }),
  earthMoon('geo', 'Geostationary Orbit', 'structure', 8.4e7, inLayer('earthMoon', beside(PLACES.earth, 4.2164e7, 135)), { note: 'Satellites here hover above one point, 35,786 km up', noMarker: true }),
  earthMoon('jwst', 'James Webb Space Telescope', 'craft', 21, inLayer('earthMoon', beside(PLACES.earth, 1.5e9, EARTH_LONGITUDE)), { note: 'Orbits the L2 point, 1.5 million km from Earth, always on the far side from the Sun' }),

  // ───────────── Part D: Earth down to the atom ─────────────
  // The Earth layers are centred on the landing site (app/earthSite.ts): onEarth() takes a latitude and
  // longitude, awayFromSite() a distance and compass bearing from the site, nearSite() metres east and north.
  earth('site-earth', 'Lower Rhine', 'you', 3e4, [0, 0, 0], { note: 'Where the journey comes down: a meadow by the river, in western Germany' }),
  earth('night-lights', 'North America by night', 'structure', 3e6, awayFromSite('earth', 55, 291), { note: 'The lights of the east coast, an hour before dawn', noMarker: true }),
  earth('terminator', 'Terminator', 'structure', 2e6, awayFromSite('earth', 33, 318), { note: 'The line between night and day. At this latitude it sweeps west at about 1,000 km/h.', noMarker: true }),
  earth('sahara', 'Sahara', 'structure', 4.8e6, awayFromSite('earth', 28, 176), { note: 'The largest hot desert: about 9 million km²', noMarker: true }),
  earth('atlantic', 'Atlantic Ocean', 'structure', 5e6, awayFromSite('earth', 31, 246), { noMarker: true }),
  earth('iss', 'International Space Station', 'craft', 109, awayFromSite('earth', 26, 62, 4.08e5), { note: 'Circles the Earth every 90 minutes, about 400 km up' }),
  earth('hubble', 'Hubble Space Telescope', 'craft', 13, awayFromSite('earth', 33, 205, 5.3e5), { note: 'In orbit since 1990' }),
  earth('atmosphere', 'Atmosphere', 'structure', 1.2742e7, awayFromSite('earth', 73, 95, 6e4), { note: 'Half of all the air lies below 5.6 km: seen from here, a thin blue line', noMarker: true }),
  earth('mediterranean', 'Mediterranean Sea', 'structure', 3.8e6, awayFromSite('earth', 18.5, 152), { noMarker: true }),
  earth('greenland', 'Greenland', 'structure', 2.6e6, onEarth('earth', 70, -40), { note: 'An ice sheet up to 3 km thick', noMarker: true }),

  orbit('site-orbit', 'Lower Rhine', 'you', 3e4, [0, 0, 0]),
  orbit('north-sea', 'North Sea', 'structure', 6e5, onEarth('orbit', 53.7, 3.9), { noMarker: true }),
  orbit('ruhr', 'Ruhr', 'place', 1.2e5, onEarth('orbit', 51.48, 7.2), { note: 'Five million people in a chain of cities grown together' }),
  orbit('amsterdam', 'Amsterdam', 'place', 3e4, onEarth('orbit', 52.37, 4.9)),
  orbit('cologne', 'Cologne', 'place', 3e4, onEarth('orbit', 50.94, 6.96)),
  orbit('rotterdam', 'Rotterdam', 'place', 4e4, onEarth('orbit', 51.92, 4.48), { note: 'Europe’s largest port, at the mouth of the Rhine' }),
  orbit('brussels', 'Brussels', 'place', 3e4, onEarth('orbit', 50.85, 4.35)),
  orbit('ijsselmeer', 'IJsselmeer', 'structure', 6e4, onEarth('orbit', 52.8, 5.35), { note: 'A bay of the North Sea until a dam closed it off in 1932', noMarker: true }),
  orbit('frankfurt', 'Frankfurt', 'place', 3e4, onEarth('orbit', 50.11, 8.68)),
  orbit('hanover', 'Hanover', 'place', 3e4, onEarth('orbit', 52.37, 9.73)),
  orbit('antwerp', 'Antwerp', 'place', 3e4, onEarth('orbit', 51.22, 4.4)),

  edge('wesel', 'Wesel', 'place', 1e4, onEarth('edge', 51.66, 6.62)),
  edge('rhine-edge', 'Rhine', 'structure', 1.2e6, onEarth('edge', 51.83, 6.23), { note: '1,230 km from the Alps to the North Sea', noMarker: true }),
  edge('nijmegen', 'Nijmegen', 'place', 1.5e4, onEarth('edge', 51.84, 5.86), { note: 'The oldest city of the Netherlands' }),
  edge('duisburg', 'Duisburg', 'place', 2e4, onEarth('edge', 51.43, 6.76), { note: 'The largest inland port in the world' }),
  edge('xanten-edge', 'Xanten', 'place', 6e3, onEarth('edge', 51.662, 6.454)),
  edge('arnhem', 'Arnhem', 'place', 1.5e4, onEarth('edge', 51.98, 5.91)),
  edge('essen', 'Essen', 'place', 2e4, onEarth('edge', 51.46, 7.01)),
  edge('kleve', 'Kleve', 'place', 8e3, onEarth('edge', 51.79, 6.14)),
  edge('reichswald', 'Reichswald', 'structure', 1.4e4, onEarth('edge', 51.745, 6.03), { note: 'A forest of 51 km²', noMarker: true }),
  edge('fair-weather', 'Fair-weather clouds', 'structure', 3e3, nearSite('edge', 14_000, -16_000, 4400), { note: 'Each is made of droplets about a hundredth of a millimetre wide', noMarker: true }),

  clouds('cloud', 'Cloud', 'structure', 1.6e3, nearSite('clouds', 500, 420, 5000), { note: 'About a thousand tonnes of water, in droplets too small to fall', noMarker: true }),
  clouds('xanten', 'Xanten', 'place', 3e3, onEarth('clouds', 51.662, 6.454), { note: 'Founded by the Romans, as Colonia Ulpia Traiana' }),
  clouds('rhine-clouds', 'Rhine', 'structure', 1.2e6, onEarth('clouds', 51.6935, 6.455), { noMarker: true }),
  clouds('bislicher-insel', 'Bislicher Insel', 'structure', 4e3, onEarth('clouds', 51.642, 6.492), { note: 'An old arm of the Rhine, now a nature reserve', noMarker: true }),
  clouds('wesel-clouds', 'Wesel', 'place', 6e3, onEarth('clouds', 51.659, 6.617)),

  landscape('our-tree', 'A tree', 'you', 19, [0, 0, 0], { note: 'Its crown is 19 m across' }),
  landscape('rhine', 'Rhine', 'structure', 1.2e6, nearSite('landscape', -150, 1080), { note: 'About 400 m wide here', noMarker: true }),
  landscape('meadow', 'Floodplain meadow', 'structure', 6e2, nearSite('landscape', -420, 330), { note: 'Under water when the river runs high', noMarker: true }),
  landscape('groynes', 'Groynes', 'structure', 80, nearSite('landscape', -640, 560), { note: 'Stone spurs that keep the current, and the shipping channel, in the middle of the river', noMarker: true }),

  // The leaf: positions are leaf coordinates (app/leaf.ts) or, on the tree, metres on the screen.
  tree('our-leaf', 'One leaf', 'you', 0.09, [0, 0, 0], { note: 'At the top of the crown, in full sunlight: where the journey goes next' }),
  tree('crown', 'Crown', 'bio', 19, [0.42, 0.52, 0], { note: 'A tree of this size carries something like 200,000 leaves', noMarker: true }),
  tree('shadow', 'Shadow', 'structure', 15, [-0.95, 0.2, 0], { note: 'It falls to the north-west: the photograph was taken in the morning', noMarker: true }),
  tree('grass', 'Meadow', 'bio', 1, [1.32, -0.3, 0], { note: 'Short grass on the floodplain of the Rhine', noMarker: true }),

  leaf('hero-leaf', 'Our leaf', 'you', LEAF.length, [0, 0, 0], { note: '9 cm long, and lying flat to the light' }),
  leaf('midrib', 'Midrib', 'bio', LEAF.length, onLeaf('leaf', 0.086, 0), { note: 'The main vein: the leaf’s water main, and its backbone', noMarker: true }),
  leaf('side-veins', 'Side veins', 'bio', 0.03, onLeaf('leaf', sideVeinAt(2, 0.012), 0.012), { noMarker: true }),
  leaf('stalk', 'Leaf stalk', 'bio', 0.03, onLeaf('leaf', -0.017, -0.0022, -0.007), { note: 'Supple enough to let the blade turn to the light and give way to the wind', noMarker: true }),
  leaf('twig', 'Twig', 'bio', 0.005, onLeaf('leaf', -0.015, 0.101, -0.023), { note: 'Half a centimetre thick: this year’s growth', noMarker: true }),

  veins('side-vein', 'Side vein', 'bio', 3e-4, onLeaf('veins', sideVeinAt(4, LEAF.origin[1]), LEAF.origin[1]), { note: 'One of a dozen pairs that branch off the midrib', noMarker: true }),
  // A point of the third net of veins, found by working through the shader's arithmetic (layers/leafShaders.ts).
  veins('vein-net', 'Vein network', 'bio', 1.3e-3, onLeaf('veins', 0.05074, 0.010104), { note: 'Veins branch finer and finer, until no cell is more than a few cells away from one', noMarker: true }),
  veins('areole', 'Areole', 'bio', 4e-4, [0, 0, 0], { note: 'The smallest island of leaf between veins: less than half a millimetre across', noMarker: true }),

  tissue('stoma-tissue', 'Stoma', 'bio', LEAF.stoma, [0, 0, 0], { note: 'A pore. This patch of leaf has about 70 to the square millimetre', noMarker: true }),
  tissue('pavement', 'Pavement cells', 'bio', LEAF.cell, [0.2, -0.35, 0], { note: 'A single layer of interlocking cells, sealed with wax to keep the water in', noMarker: true }),
  // A point of the finest net of veins, found the same way.
  tissue('fine-vein', 'Vein', 'bio', 2.8e-5, onLeaf('tissue', 0.0472, 0.00964), { note: 'The finest veins run just under the skin', noMarker: true }),

  // Under the skin of the leaf: micrometres from the middle of the nucleus the journey goes to (app/leafInside.ts).
  stoma('pore', 'Pore', 'bio', 1.4e-5, onSkin('stoma', 0, 0), { note: 'About 14 µm long when it is wide open, as here', noMarker: true }),
  stoma('guard-cells', 'Guard cells', 'bio', LEAF.stoma, onSkin('stoma', ...GUARD_CELL), { note: 'Filled with water they bow apart and the pore opens; slack, they close it', noMarker: true }),
  stoma('pavement-cell', 'Pavement cell', 'bio', LEAF.cell, onSkin('stoma', 25, -17), { noMarker: true }),

  cell('nucleus', 'Nucleus', 'bio', 6e-6, insideLeaf('cell', ...INSIDE_PLACES.nucleus), { note: 'Holds the cell’s DNA', noMarker: true }),
  cell('chloroplast', 'Chloroplast', 'bio', 5e-6, insideLeaf('cell', ...INSIDE_PLACES.chloroplast), { note: 'Makes sugar out of sunlight, water and carbon dioxide. A cell like this has dozens', noMarker: true }),
  cell('mitochondrion', 'Mitochondrion', 'bio', 2e-6, insideLeaf('cell', ...INSIDE_PLACES.mitochondrion), { note: 'Burns sugar to power the cell', noMarker: true }),
  cell('vacuole', 'Vacuole', 'bio', 2.6e-5, insideLeaf('cell', ...INSIDE_PLACES.vacuole), { note: 'A bag of water that takes up most of the cell and keeps it taut', noMarker: true }),
  cell('cell-wall', 'Cell wall', 'bio', 2.3e-5, insideLeaf('cell', ...INSIDE_PLACES.wall), { note: 'A stiff case of cellulose, the stuff of wood and paper', noMarker: true }),
  cell('air-space', 'Air space', 'bio', 1e-5, insideLeaf('cell', ...INSIDE_PLACES.air), { note: 'The air that came in through the pore reaches every cell', noMarker: true }),

  nucleus('nuclear-envelope', 'Nuclear envelope', 'bio', 6e-6, insideLeaf('nucleus', ...INSIDE_PLACES.envelope), { note: 'Two membranes that keep the DNA apart from the rest of the cell', noMarker: true }),
  nucleus('nuclear-pore', 'Nuclear pore', 'bio', 1.2e-7, insideLeaf('nucleus', ...INSIDE_PLACES.pore), { note: 'A gate: copies of the DNA’s instructions leave through thousands of these', noMarker: true }),
  nucleus('nucleolus-outside', 'Nucleolus', 'bio', 1.5e-6, insideLeaf('nucleus', ...INSIDE_PLACES.nucleolus), { note: 'Where ribosomes are made', noMarker: true }),
  nucleus('reticulum', 'Endoplasmic reticulum', 'bio', 9e-6, insideLeaf('nucleus', ...INSIDE_PLACES.reticulum), { note: 'Folded membranes on which proteins and fats are made', noMarker: true }),
  nucleus('golgi', 'Golgi apparatus', 'bio', 2.3e-6, insideLeaf('nucleus', ...INSIDE_PLACES.golgi), { note: 'Sorts what the cell makes and sends it where it is needed', noMarker: true }),
  nucleus('ribosomes', 'Ribosomes', 'bio', 2.5e-8, insideLeaf('nucleus', ...INSIDE_PLACES.ribosomes), { note: 'The machines that build proteins: drawn four times too large, to be seen at all', noMarker: true }),

  chromosomes('chromosome', 'Chromosome', 'bio', 1.7e-6, [0, 0, 0], { note: 'One long molecule of DNA with its proteins, packed about 10,000-fold', noMarker: true }),
  chromosomes('nucleolus', 'Nucleolus', 'bio', 1.5e-6, insideLeaf('chromosomes', ...INSIDE_PLACES.nucleolus), { note: 'Where ribosomes are made', noMarker: true }),
  chromosomes('loose-chromatin', 'Chromatin', 'bio', 3e-8, insideLeaf('chromosomes', ...INSIDE_PLACES.thread), { note: 'Between divisions, all of the DNA is spread out in threads like these', noMarker: true }),

  chromatin('nucleosome', 'Nucleosome', 'molecule', 1.04e-8, inLayerUnits('chromatin', FIBRE.spools[LINK + 1].centre), { note: 'DNA wound 1.65 times round a core of eight proteins: the first step of its packing', noMarker: true }),
  chromatin('linker', 'Linker DNA', 'molecule', 2e-9, inLayerUnits('chromatin', basePair(-20).at), { note: 'The bare stretch from one spool to the next', noMarker: true }),
  chromatin('histone-tail', 'Histone tail', 'molecule', 4e-9, inLayerUnits('chromatin', TAIL_TIP), { note: 'A loose end of one of the proteins. Chemical tags on these help switch genes on and off', noMarker: true }),

  dna('backbone', 'Sugar–phosphate backbone', 'molecule', 2e-9, inLayerUnits('dna', facing(-7, -2, (pair) => phosphate(pair, 0))), { note: 'Two strands, running in opposite directions and winding round each other once every 3.6 nm', noMarker: true }),
  dna('base-pair', 'Base pair', 'molecule', 1e-9, [0, 0, 0], { note: 'A with T, G with C, stacked 0.34 nm apart: the letters of the genetic code', noMarker: true }),
  dna('major-groove', 'Major groove', 'molecule', 2.2e-9, inLayerUnits('dna', facing(4, 9, (pair) => groove(pair, true))), { note: 'Wide enough for proteins to read the bases without opening the helix', noMarker: true }),
  dna('minor-groove', 'Minor groove', 'molecule', 1.2e-9, inLayerUnits('dna', facing(-2, 4, (pair) => groove(pair, false))), { noMarker: true }),

  molecule('phosphate', 'Phosphate Group', 'molecule', 3e-10, [-1.07, 0.06, 0], { noMarker: true }),
  molecule('sugar', 'Deoxyribose', 'molecule', 4e-10, [-0.24, 0, 0], { note: 'The sugar in DNA’s backbone', noMarker: true }),
  molecule('base', 'Adenine', 'molecule', 5e-10, [0.71, 0.32, 0], { note: 'A base: one letter of the genetic code', noMarker: true }),

  atom('electron-cloud', 'Electron cloud', 'atom', 1.4e-10, [0.5, 0.45, 0], { note: 'Six electrons, smeared into clouds of probability. In a molecule the outer clouds merge with the neighbours’', noMarker: true }),
  atom('nucleus-atom', 'Nucleus', 'atom', 5.4e-15, [0, 0, 0], { note: 'Tens of thousands of times smaller than the atom, yet 99.97% of its mass', noMarker: true }),

  // Epilogue. Places are in femtometres from the proton the camera ends up in (app/atomicNucleus.ts).
  atomNucleus('carbon-12', 'Carbon-12', 'atom', 5e-15, inFemtometres('atomNucleus', [NUCLEUS_CENTRE[0] - 0.72 * NUCLEUS_RADIUS, NUCLEUS_CENTRE[1] + 0.62 * NUCLEUS_RADIUS, NUCLEUS_CENTRE[2]]), { note: 'Twelve particles, 5 femtometres across. All the rest of the atom is electrons and empty space', noMarker: true }),
  atomNucleus('proton-front', 'Proton', 'atom', 1.7e-15, [0, 0, 0], { note: 'Positive charge. Six of them are what makes this atom carbon', noMarker: true }),
  atomNucleus('neutron', 'Neutron', 'atom', 1.7e-15, inFemtometres('atomNucleus', NUCLEONS[1].at), { note: 'No charge. Neutrons help to hold the protons together', noMarker: true }),
  atomNucleus('strong-force', 'Strong force', 'atom', 1e-15, inFemtometres('atomNucleus', [(NUCLEONS[0].at[0] + NUCLEONS[3].at[0]) / 2, (NUCLEONS[0].at[1] + NUCLEONS[3].at[1]) / 2, (NUCLEONS[0].at[2] + NUCLEONS[3].at[2]) / 2]), { note: 'Holds the nucleus together, against the push of the protons’ charges on one another', noMarker: true }),

  proton('up-quark', 'Up quark', 'atom', 1e-17, inFemtometres('proton', QUARKS[0].at), { note: 'Charge +⅔. Two of these and one down quark make a proton', noMarker: true }),
  proton('up-quark-2', 'Up quark', 'atom', 1e-17, inFemtometres('proton', QUARKS[1].at), { note: 'Charge +⅔', noMarker: true }),
  proton('down-quark', 'Down quark', 'atom', 1e-17, inFemtometres('proton', QUARKS[2].at), { note: 'Charge −⅓. With two of these and one up, this would be a neutron', noMarker: true }),
  proton('gluons', 'Gluons', 'atom', 1e-16, inFemtometres('proton', [(QUARKS[1].at[0] + QUARKS[2].at[0]) / 2, (QUARKS[1].at[1] + QUARKS[2].at[1]) / 2, (QUARKS[1].at[2] + QUARKS[2].at[2]) / 2]), { note: 'They carry the strong force, and bind the quarks so tightly that none has ever been seen alone', noMarker: true }),
  proton('quark-sea', 'Quark sea', 'atom', 1e-16, inFemtometres('proton', [0.45, 0.3, 0.2]), { note: 'Pairs of quarks and antiquarks that come and go: there is more in a proton than its three quarks', noMarker: true }),
  proton('neutron-beside', 'Neutron', 'atom', 1.7e-15, inFemtometres('proton', NUCLEONS[1].at), { noMarker: true }),
];

export function itemsFor(layer: string): CatalogItem[] {
  return CATALOG.filter((item) => item.layer === layer);
}
