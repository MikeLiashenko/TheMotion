/**
 * The journey: a list of stops, each defined by `s` = log10 of the height of the frame in metres.
 * Scrolling zooms at one even pace from stop to stop, inwards all the way except for one step back past the Sun;
 * every stop owns one layer of the scene. It runs from the observable universe to an atom, and
 * then, as an epilogue, on into the atom's nucleus.
 */

export type Part = 'cosmos' | 'galaxy' | 'solar' | 'earth' | 'micro' | 'atom';

export interface Stop {
  id: string;
  title: string;
  /** log10(frame height in metres) when the camera rests at this stop. */
  s: number;
  part: Part;
  tag: string;
  /**
   * Stretches (or, below 1, shortens) the scroll distance of the trip into this stop: longer where
   * the camera travels more than the scale changes, shorter where there is nothing to see on the way.
   */
  approach?: number;
  /**
   * A stretch of the trip into this stop with nothing in it, between two scales, and how much
   * faster than usual the zoom runs through it.
   */
  hurry?: { from: number; to: number; times: number };
}

export const STOPS: Stop[] = [
  // Part A: cosmos
  { id: 'universe', title: 'Observable Universe', s: 27.2, part: 'cosmos', tag: 'Everything we can ever see: 93 billion light-years across.' },
  { id: 'walls', title: 'Great Walls & Voids', s: 26.2, part: 'cosmos', tag: 'Galaxies gather into walls and filaments around vast empty voids.' },
  { id: 'superclusters', title: 'Superclusters', s: 25.3, part: 'cosmos', tag: 'Laniakea, our home supercluster, holds about 100,000 galaxies.' },
  { id: 'clusters', title: 'Galaxy Clusters', s: 24.6, part: 'cosmos', tag: 'Hundreds to thousands of galaxies bound together by gravity.' },
  { id: 'galaxies', title: 'Neighboring Galaxies', s: 23.9, part: 'cosmos', tag: 'Spirals, ellipticals and collisions in our corner of the cosmos.' },
  { id: 'localGroup', title: 'Local Group', s: 22.8, part: 'cosmos', tag: 'Our home group: the Milky Way, Andromeda and dozens of dwarf galaxies.' },
  { id: 'milkyWay', title: 'Milky Way', s: 21.0, part: 'cosmos', tag: 'A barred spiral galaxy of 100–400 billion stars.' },

  // Part B: inside the galaxy
  { id: 'globulars', title: 'Globular Clusters', s: 20.65, part: 'galaxy', tag: 'Ancient balls of stars swarm around the galaxy, and giant bubbles rise from its heart.' },
  // On the way in, the camera dives through the plane of the galaxy: give that some room.
  { id: 'nebulae', title: 'Nebulae', s: 19.95, part: 'galaxy', tag: 'Clouds of gas and dust where stars are born, and where they die.', approach: 1.5 },
  { id: 'giants', title: 'Star Clusters & Giants', s: 19.2, part: 'galaxy', tag: 'Young clusters, giant stars, and the bubble of hot gas the Sun drifts through.' },
  { id: 'brightStars', title: 'Familiar Stars', s: 18.4, part: 'galaxy', tag: 'The stars of our constellations, and how far our radio signals have reached.' },
  { id: 'neighborhood', title: 'Stellar Neighborhood', s: 17.6, part: 'galaxy', tag: 'The nearest stars. Light from Alpha Centauri takes 4.4 years to reach us.' },

  // Part C: Solar System
  { id: 'oort', title: 'Oort Cloud', s: 16.85, part: 'solar', tag: 'A vast shell of icy bodies thought to surround the Solar System.' },
  { id: 'farSolar', title: 'The Far Solar System', s: 14.6, part: 'solar', tag: 'Beyond the planets: lonely worlds on orbits that last thousands of years.' },
  { id: 'heliosphere', title: 'The Heliosphere', s: 13.85, part: 'solar', tag: 'The bubble the Sun’s wind blows in the gas between the stars. Both Voyagers have left it.' },
  { id: 'kuiper', title: 'Kuiper Belt', s: 13.3, part: 'solar', tag: 'A ring of icy worlds beyond Neptune. Pluto is one of thousands.' },
  { id: 'outer', title: 'Outer Planets', s: 12.75, part: 'solar', tag: 'Gas and ice giants: Jupiter, Saturn, Uranus, Neptune.' },
  { id: 'inner', title: 'Inner Solar System', s: 11.9, part: 'solar', tag: 'Four rocky planets and a belt of asteroids, circling the Sun.' },
  // The camera does not dive into the Sun: it flies past it, close by, on its way to Earth.
  { id: 'sun', title: 'The Sun', s: 9.4, part: 'solar', tag: 'Our star: 1.39 million km across, holding 99.86% of the Solar System’s mass.' },
  // The only stop that is reached by zooming out: past the Sun, the view opens up until Earth comes into it.
  { id: 'au', title: 'Sun to Earth', s: 11.4, part: 'solar', tag: 'One astronomical unit: 150 million km. Sunlight needs 8 minutes 19 seconds to cross it.', approach: 1.15 },
  { id: 'earthMoon', title: 'Earth & Moon', s: 8.9, part: 'solar', tag: 'The Moon orbits 384,400 km away: about 30 Earths would fit in the gap.' },

  // Part D: Earth down to the atom
  { id: 'earth', title: 'Earth', s: 7.2, part: 'earth', tag: 'Home. 12,742 km across.' },
  { id: 'orbit', title: 'From Orbit', s: 5.6, part: 'earth', tag: '400 km up, the height at which the International Space Station flies.' },
  { id: 'edge', title: 'Edge of Space', s: 5.0, part: 'earth', tag: '100 km up: the Kármán line, where space is said to begin.' },
  { id: 'clouds', title: 'Above the Clouds', s: 4.0, part: 'earth', tag: '10 km up, where airliners cruise. The weather is below.' },
  { id: 'landscape', title: 'Landscape', s: 3.3, part: 'earth', tag: 'Meadows on the bank of the Rhine, two kilometres across.' },
  { id: 'tree', title: 'Tree', s: 1.3, part: 'earth', tag: 'A single tree, carrying many thousands of leaves.' },
  { id: 'leaf', title: 'Leaf', s: -0.6, part: 'earth', tag: 'A solar panel built by life.' },
  { id: 'veins', title: 'Veins', s: -1.9, part: 'earth', tag: 'The leaf’s plumbing: water in, sugar out, through an ever finer net.' },
  { id: 'tissue', title: 'Skin of the Leaf', s: -3.0, part: 'micro', tag: 'Cells that fit together like jigsaw pieces, and among them the pores the leaf breathes through.' },
  { id: 'stoma', title: 'Stoma', s: -4.15, part: 'micro', tag: 'A pore three hundredths of a millimetre long. Carbon dioxide goes in here; oxygen and water come out.' },
  // Through the pore and into the leaf: the scale hardly changes, but the camera travels.
  { id: 'cell', title: 'Plant Cell', s: -4.52, part: 'micro', tag: 'Inside the leaf: cells packed with chloroplasts, each a living factory.', approach: 2.6 },
  { id: 'nucleus', title: 'Nucleus', s: -4.95, part: 'micro', tag: 'The cell’s library: its whole genome in a ball six thousandths of a millimetre wide.' },
  { id: 'chromosomes', title: 'Chromosomes', s: -5.4, part: 'micro', tag: 'Tightly packed DNA inside the cell nucleus.' },
  { id: 'chromatin', title: 'Chromatin', s: -7.2, part: 'micro', tag: 'DNA wound around protein spools called nucleosomes.' },
  { id: 'dna', title: 'DNA', s: -8.4, part: 'micro', tag: 'The double helix, just 2 nanometers wide.' },
  { id: 'molecule', title: 'Nucleotide', s: -9.0, part: 'micro', tag: 'The letters of the genetic code, built from C, H, N, O and P atoms.' },
  { id: 'atom', title: 'Carbon Atom', s: -9.7, part: 'micro', tag: 'Six protons, six neutrons, six electrons, and almost entirely empty space.' },

  // Epilogue: inside the atom. The way to its nucleus is four and a half powers of ten of nothing at all.
  { id: 'atomNucleus', title: 'Atomic Nucleus', s: -14.15, part: 'atom', tag: 'Six protons and six neutrons: nearly all of the atom’s mass, in a speck 25,000 times smaller than the atom.', hurry: { from: -10.4, to: -13.6, times: 4 } },
  { id: 'proton', title: 'Proton', s: -14.62, part: 'atom', tag: 'Two up quarks and a down quark, held by gluons. Nothing smaller has ever been seen: the journey ends here.' },
];

export const S_START = STOPS[0].s;
export const S_END = STOPS[STOPS.length - 1].s;

/**
 * Scroll distance (vh) spent travelling one decade of scale. It is the same everywhere: the
 * camera does not stop at the stops, it passes them, and the zoom follows the wheel evenly.
 */
const VH_PER_DECADE = 58;
/** At the very start the picture rests for this much scrolling (vh): the first touch of the wheel clears the title card. */
export const LEAD_IN = 12;
/** And at the very end, so that the last stop is reached before the page runs out. */
const LEAD_OUT = 40;

interface Knots {
  y: number[];
  s: number[];
  slope: number[];
  /** Scroll position (vh) at which the camera is exactly at each stop. */
  stopY: number[];
  total: number;
}

function buildKnots(stops: Stop[]): Knots {
  const y = [0];
  const s = [stops[0].s];
  const stopY = [0];
  let cursor = LEAD_IN;
  stops.forEach((stop, i) => {
    if (i > 0) {
      const pace = VH_PER_DECADE * (stop.approach ?? 1);
      let from = stops[i - 1].s;
      if (stop.hurry) {
        // The empty stretch gets knots of its own, so that the hurry begins and ends where the emptiness does.
        for (const [edge, rate] of [[stop.hurry.from, pace], [stop.hurry.to, pace / stop.hurry.times]] as const) {
          cursor += Math.abs(edge - from) * rate;
          y.push(cursor);
          s.push(edge);
          from = edge;
        }
      }
      cursor += Math.abs(stop.s - from) * pace;
      stopY.push(cursor);
    }
    y.push(cursor);
    s.push(stop.s);
  });
  cursor += LEAD_OUT;
  y.push(cursor);
  s.push(stops[stops.length - 1].s);
  return { y, s, slope: pchipSlopes(y, s), stopY, total: cursor };
}

/** Monotone cubic (Fritsch–Carlson) slopes: smooth, and never overshoots between knots. */
function pchipSlopes(x: number[], v: number[]): number[] {
  const n = x.length;
  const h: number[] = [];
  const d: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    h.push(x[k + 1] - x[k]);
    d.push((v[k + 1] - v[k]) / h[k]);
  }
  const m = new Array<number>(n).fill(0);
  // The ends are at rest.
  m[0] = 0;
  m[n - 1] = 0;
  for (let k = 1; k < n - 1; k++) {
    if (d[k - 1] * d[k] <= 0) continue;
    const w1 = 2 * h[k] + h[k - 1];
    const w2 = h[k] + 2 * h[k - 1];
    m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]);
  }
  return m;
}

const KNOTS = buildKnots(STOPS);

/** Total scroll length of the journey, in vh. */
export const TOTAL_VH = KNOTS.total;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Scroll progress (0..1) → scale exponent `s`. It falls from stop to stop, except on the one
 * leg that pulls back from the Sun; between two neighbouring stops it never turns round.
 */
export function progressToS(progress: number): number {
  const { y, s, slope, total } = KNOTS;
  const pos = clamp01(progress) * total;
  let k = 0;
  let hi = y.length - 1;
  while (hi - k > 1) {
    const mid = (k + hi) >> 1;
    if (y[mid] <= pos) k = mid;
    else hi = mid;
  }
  const h = y[k + 1] - y[k];
  const t = (pos - y[k]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * s[k] +
    (t3 - 2 * t2 + t) * h * slope[k] +
    (-2 * t3 + 3 * t2) * s[k + 1] +
    (t3 - t2) * h * slope[k + 1]
  );
}

/** Scroll progress (0..1) at which the camera is exactly at stop `index`. */
export function stopProgress(index: number): number {
  return KNOTS.stopY[index] / KNOTS.total;
}

/** Index of the stop with this id. */
export function stopIndex(id: string): number {
  const index = STOPS.findIndex((stop) => stop.id === id);
  if (index < 0) throw new Error(`Unknown stop "${id}"`);
  return index;
}

/**
 * Where the journey is, counted in stops: 12 is stop 12 exactly, 12.5 is halfway (in scale) to
 * stop 13. Unlike `s` it only ever grows, so it tells apart the two times the
 * camera passes the same scale around the Sun.
 */
export function journeyAt(progress: number): number {
  const { stopY, total } = KNOTS;
  const pos = clamp01(progress) * total;
  let k = 0;
  while (k < STOPS.length - 2 && stopY[k + 1] <= pos) k++;
  const from = STOPS[k].s;
  const to = STOPS[k + 1].s;
  return k + clamp01((progressToS(progress) - from) / (to - from));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** How much of each leg between two stops the crossfade takes up, as a fraction of the change in scale. */
const FADE_SPAN = STOPS.slice(0, -1).map((stop, i) => {
  const gap = Math.abs(stop.s - STOPS[i + 1].s);
  return Math.min(1.4, gap * 0.6) / gap;
});

/**
 * Opacity of every stop's layer at journey position `at` (see `journeyAt`). Neighbours
 * crossfade around the midpoint between their stops, so two weights are in play at most and
 * they always sum to 1.
 */
export function layerWeights(at: number, out: number[] = []): number[] {
  const k = Math.min(STOPS.length - 2, Math.max(0, Math.floor(at)));
  const span = FADE_SPAN[k];
  const next = smoothstep(0.5 - span / 2, 0.5 + span / 2, at - k);
  for (let i = 0; i < STOPS.length; i++) out[i] = 0;
  out[k] = 1 - next;
  out[k + 1] = next;
  return out;
}
