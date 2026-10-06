/**
 * Chromatin, the way DNA is packed inside a chromosome: the thread is wound onto spools of
 * protein, and a stretch of bare thread links each spool to the next, so that the whole runs
 * in a zigzag. The journey zooms into one such stretch. Three fibres are laid out in full here,
 * with the path of their DNA down to each base pair; around them a tangle of more, in outline.
 *
 * Lengths are in nanometres, measured from the spot the journey zooms in on: x to the right,
 * y up, z towards the camera. The layers that draw chromatin and DNA, and the labels on them,
 * all read their places from here, which is what keeps them in step.
 */
import { Rng } from '../util/rng';
import { stopIndex, STOPS } from './timeline';

export type Vec3 = [number, number, number];

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => mul(a, 1 / (length(a) || 1));
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** `v` turned by `angle` radians about the unit vector `axis`. */
function turned(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = dot(axis, v) * (1 - c);
  const x = cross(axis, v);
  return [v[0] * c + x[0] * s + axis[0] * k, v[1] * c + x[1] * s + axis[1] * k, v[2] * c + x[2] * s + axis[2] * k];
}

/** Some unit vector at right angles to `v`. */
function acrossFrom(v: Vec3, hint: Vec3 = [0, 0, 1]): Vec3 {
  const side = sub(hint, mul(v, dot(hint, v)));
  return length(side) > 1e-3 ? unit(side) : acrossFrom(v, [0, 1, 0]);
}

/** The double helix, in round numbers. */
export const DNA = {
  /** From one base pair to the next along the helix. */
  rise: 0.34,
  /** How far the helix turns from one base pair to the next: once round in ten and a half. */
  twist: (2 * Math.PI) / 10.5,
  /** How far from the axis the phosphates of the two backbones are, and the sugars. */
  phosphate: 0.9,
  sugar: 0.62,
  /** The angle between the two backbones on their near side, where the narrow groove is. */
  groove: 2.4,
};

/** A nucleosome: DNA coiled round a core of eight proteins. */
export const NUCLEOSOME = {
  /** Radius of the coil, to the middle of the DNA. */
  radius: 4.18,
  /** How far the coil climbs in one turn. */
  pitch: 2.39,
  turns: 1.65,
  /** Radius of the protein core. */
  core: 3.2,
};

/** By how much the thread has changed direction when it leaves a spool: 1.65 turns leave it 0.35 of a turn short. */
const HOME_TURN = 2 * Math.PI * (2 - NUCLEOSOME.turns);
const CLIMB = NUCLEOSOME.pitch * NUCLEOSOME.turns;

export interface Spool {
  centre: Vec3;
  /** The DNA winds round this axis anticlockwise as seen from its tip, moving away from the tip as it goes. */
  axis: Vec3;
  /** Two directions across the axis: the winding angle is measured from `u` towards `v`. */
  u: Vec3;
  v: Vec3;
  /** The winding angle at which the DNA comes onto the spool; it leaves 1.65 turns later. */
  from: number;
  /** The loose ends of its proteins, the histone tails: each a short row of points. */
  tails: Vec3[][];
}

export interface BasePair {
  /** Its place on the axis of the helix. */
  at: Vec3;
  /** The direction of the helix here, and two directions across it. */
  along: Vec3;
  across: Vec3;
  up: Vec3;
  /** How far round the helix has turned by here, radians. */
  turn: number;
}

export interface Fibre {
  spools: Spool[];
  pairs: BasePair[];
  /** The number of the first base pair in `pairs`. Pair 0 of the first fibre is where the journey ends up. */
  first: number;
}

/** A point of a base pair: `radius` from the axis, `angle` round it, `shift` along it. */
export function onPair(pair: BasePair, radius: number, angle: number, shift = 0): Vec3 {
  const c = Math.cos(pair.turn + angle) * radius;
  const s = Math.sin(pair.turn + angle) * radius;
  return [
    pair.at[0] + pair.across[0] * c + pair.up[0] * s + pair.along[0] * shift,
    pair.at[1] + pair.across[1] * c + pair.up[1] * s + pair.along[1] * shift,
    pair.at[2] + pair.across[2] * c + pair.up[2] * s + pair.along[2] * shift,
  ];
}

/** The phosphate group of one of the two backbones at a base pair. */
export function phosphate(pair: BasePair, strand: 0 | 1): Vec3 {
  return onPair(pair, DNA.phosphate, strand ? DNA.groove : 0);
}

/** The sugar of one of the two backbones at a base pair: what its base hangs from. */
export function sugar(pair: BasePair, strand: 0 | 1): Vec3 {
  return onPair(pair, DNA.sugar, strand ? DNA.groove - 0.3 : 0.3, strand ? -0.12 : 0.12);
}

/** Six points across a base pair, from one sugar to the other: three for each of its two bases. */
export function bases(pair: BasePair): Vec3[] {
  const a = sugar(pair, 0);
  const b = sugar(pair, 1);
  return [0, 1, 2, 3, 4, 5].map((k) => mix(a, b, 0.14 + (0.72 * k) / 5));
}

/** The middle of one of the two grooves that wind round the helix, at a base pair. */
export function groove(pair: BasePair, wide: boolean): Vec3 {
  return onPair(pair, DNA.phosphate, wide ? Math.PI + DNA.groove / 2 : DNA.groove / 2);
}

const LETTERS = ['A', 'T', 'G', 'C'] as const;
export type Letter = (typeof LETTERS)[number];
export const PARTNER: Record<Letter, Letter> = { A: 'T', T: 'A', G: 'C', C: 'G' };

/**
 * The base on the first strand of a base pair. The sequence is made up, but always the same;
 * the pair the journey ends up in carries an A, which the next stop shows atom by atom.
 */
export function letterAt(fibre: number, pair: number): Letter {
  if (fibre === 0 && pair === 0) return 'A';
  let h = Math.imul(pair + 7919 * (fibre + 1), 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return LETTERS[(h ^ (h >>> 13)) & 3];
}

/**
 * The chromosome the journey goes into, in the middle of the nucleus: two chromatids that cross
 * at its waist. The fibres laid out here fill the part of it around that crossing.
 */
export const CHROMOSOME = {
  /** Which way its two chromatids run. */
  chromatids: [1.15, 1.75].map((angle, i) => unit([Math.cos(angle), Math.sin(angle), i ? -0.16 : 0.12])),
  /** How far each reaches from the waist. */
  reach: 840,
  /** How thick a chromatid is at the waist, and along its arms: radii. */
  waist: 87,
  arm: 140,
};

/** Radius of a chromatid at distance `along` from the waist. */
export function chromatidRadius(along: number): number {
  return CHROMOSOME.waist + (CHROMOSOME.arm - CHROMOSOME.waist) * Math.min(1, (Math.abs(along) * 3) / CHROMOSOME.reach);
}

/** How far the tangle of fibres is followed from the waist of the chromosome. */
const TANGLE_REACH = 330;

function insideChromosome(p: Vec3, inset = 0.84): boolean {
  return CHROMOSOME.chromatids.some((direction) => {
    const along = dot(p, direction);
    return Math.abs(along) < TANGLE_REACH && length(sub(p, mul(direction, along))) < inset * chromatidRadius(along);
  });
}

/** Height of the frame at the Chromatin stop, which is also how far the camera is from the origin there. */
const CAMERA = 10 ** STOPS[stopIndex('chromatin')].s * 1e9;
/** Nearer than this, only the three fibres drawn in full may come between the camera and its aim. */
const BACKDROP = -42;

/** How far the three fibres drawn in full reach to the sides of the view, and up and down. */
const STAGE: [number, number] = [105, 62];

/**
 * Whether a point could come between the camera and the fibres drawn in full, at the Chromatin
 * stop or anywhere on the way to it: it lies in front of the backdrop, and either in the
 * camera's view at the stop or straight in front of those fibres.
 */
function inFront(p: Vec3, margin = 8): boolean {
  if (p[2] < BACKDROP) return false;
  const depth = CAMERA - p[2];
  const inView = Math.abs(p[1]) < depth * 0.5 * 1.25 + margin && Math.abs(p[0]) < depth * 0.89 * 1.2 + margin;
  return inView || (Math.abs(p[0]) < STAGE[0] + margin && Math.abs(p[1]) < STAGE[1] + margin);
}

/** The axis the path of a zigzag turns round at spool `b`, coming from `a` and going on to `c`. */
function turnAxis(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const axis = cross(sub(c, b), sub(b, a));
  return length(axis) > 1e-6 ? unit(axis) : acrossFrom(unit(sub(b, a)));
}

/**
 * Carries a zigzag of spools on by up to `steps` more. At each spool the path doubles back
 * on itself by about two thirds of a half-turn, to one side and then the other, which is what
 * 1.65 turns of winding leave it to do.
 * @param axis the axis to turn round at the last spool so far
 * @param fits whether a spool may be put at a point, coming from the one before
 */
function zigzag(rng: Rng, centres: Vec3[], axis: Vec3, steps: number, fits: (c: Vec3, from: Vec3) => boolean): void {
  let turnRound = axis;
  for (let step = 0; step < steps; step++) {
    const from = centres[centres.length - 1];
    const heading = unit(sub(from, centres[centres.length - 2]));
    let placed = false;
    for (let attempt = 0; attempt < 40 && !placed; attempt++) {
      // The plane of the zigzag wanders: the fibre is a loose ribbon, not a flat one.
      const leaning = turned(turnRound, heading, rng.gauss() * (0.4 + attempt * 0.05));
      const round = unit(sub(leaning, mul(heading, dot(leaning, heading))));
      const next = add(from, mul(turned(heading, round, -rng.range(1.9, 2.5)), rng.range(22, 29)));
      if (!fits(next, from)) continue;
      centres.push(next);
      turnRound = mul(round, -1);
      placed = true;
    }
    if (!placed) return;
  }
}

/** Works out how the DNA lies on each spool of a zigzag, so that it comes off one heading for the next. */
function wind(centres: Vec3[]): Spool[] {
  const n = centres.length;
  // Where the DNA comes onto each spool and where it leaves: to begin with, the spools' centres.
  const entry = centres.slice();
  const exit = centres.slice();
  // The zigzag repeats every second spool: that tells where the thread would come from and go to at the ends.
  const before = n > 2 ? sub(centres[1], sub(centres[2], centres[0])) : sub(centres[0], sub(centres[1], centres[0]));
  const after = n > 2 ? add(centres[n - 2], sub(centres[n - 1], centres[n - 3])) : add(centres[n - 1], sub(centres[n - 1], centres[n - 2]));
  let spools: Spool[] = [];
  for (let pass = 0; pass < 6; pass++) {
    spools = centres.map((centre, i) => {
      const incoming = unit(sub(entry[i], i > 0 ? exit[i - 1] : before));
      const outgoing = unit(sub(i < n - 1 ? entry[i + 1] : after, exit[i]));
      const axis = length(cross(outgoing, incoming)) > 1e-6 ? unit(cross(outgoing, incoming)) : acrossFrom(incoming);
      const u = unit(sub(incoming, mul(axis, dot(incoming, axis))));
      const v = cross(axis, u);
      // The thread cannot both arrive and leave exactly on course: the difference is shared between the two.
      const bend = -Math.atan2(dot(outgoing, v), dot(outgoing, u));
      const from = (HOME_TURN - bend) / 2 - Math.PI / 2;
      const to = from + NUCLEOSOME.turns * 2 * Math.PI;
      entry[i] = add(centre, add(add(mul(u, Math.cos(from) * NUCLEOSOME.radius), mul(v, Math.sin(from) * NUCLEOSOME.radius)), mul(axis, CLIMB / 2)));
      exit[i] = add(centre, add(add(mul(u, Math.cos(to) * NUCLEOSOME.radius), mul(v, Math.sin(to) * NUCLEOSOME.radius)), mul(axis, -CLIMB / 2)));
      return { centre, axis, u, v, from, tails: [] };
    });
  }
  return spools;
}

/** A point of the DNA on a spool, `turns` of the way round from where it comes on. */
function onSpool(spool: Spool, turns: number): Vec3 {
  const angle = spool.from + turns * 2 * Math.PI;
  const r = NUCLEOSOME.radius;
  const climb = CLIMB / 2 - turns * NUCLEOSOME.pitch;
  return add(spool.centre, add(add(mul(spool.u, Math.cos(angle) * r), mul(spool.v, Math.sin(angle) * r)), mul(spool.axis, climb)));
}

/** The direction the DNA runs in on a spool, `turns` of the way round. */
function headingOnSpool(spool: Spool, turns: number): Vec3 {
  const angle = spool.from + turns * 2 * Math.PI;
  return unit(add(mul(spool.u, -Math.sin(angle)), mul(spool.v, Math.cos(angle))));
}

/** Points along the path are this far apart, before the base pairs are counted off along it. */
const STEP = 0.17;
/** How much bare thread is left sticking out beyond the first and last spool. */
const LOOSE_END = 9;

interface Path {
  points: Vec3[];
  /** Indices of the points where the thread comes onto each spool, and where it leaves. */
  on: number[];
  off: number[];
}

/** The line the DNA follows along a whole fibre: round each spool and straight across to the next. */
function threadPath(spools: Spool[]): Path {
  const points: Vec3[] = [];
  const on: number[] = [];
  const off: number[] = [];
  const straight = (a: Vec3, b: Vec3) => {
    const steps = Math.max(1, Math.round(length(sub(b, a)) / STEP));
    for (let k = 1; k < steps; k++) points.push(mix(a, b, k / steps));
  };
  const start = onSpool(spools[0], 0);
  points.push(sub(start, mul(headingOnSpool(spools[0], 0), LOOSE_END)));
  straight(points[0], start);
  spools.forEach((spool, i) => {
    on.push(points.length);
    const steps = Math.round((NUCLEOSOME.turns * 2 * Math.PI * NUCLEOSOME.radius) / STEP);
    for (let k = 0; k <= steps; k++) points.push(onSpool(spool, (k / steps) * NUCLEOSOME.turns));
    off.push(points.length - 1);
    const leaving = points[points.length - 1];
    const next = spools[i + 1];
    const to = next ? onSpool(next, 0) : add(leaving, mul(headingOnSpool(spool, NUCLEOSOME.turns), LOOSE_END));
    straight(leaving, to);
    if (!next) points.push(to);
  });

  // Where the thread comes onto a spool or leaves it, it bends rather than kinks.
  const reach = Math.round(4 / STEP);
  const window = Math.round(1.2 / STEP);
  const give = new Float32Array(points.length);
  for (const joint of [...on, ...off]) {
    for (let i = Math.max(0, joint - reach); i <= Math.min(points.length - 1, joint + reach); i++) {
      const t = 1 - Math.abs(i - joint) / reach;
      give[i] = Math.max(give[i], t * t * (3 - 2 * t));
    }
  }
  let current = points;
  for (let pass = 0; pass < 3; pass++) {
    const source = current;
    current = source.map((p, i) => {
      if (give[i] === 0) return p;
      const sum: Vec3 = [0, 0, 0];
      const lo = Math.max(0, i - window);
      const hi = Math.min(source.length - 1, i + window);
      for (let k = lo; k <= hi; k++) {
        sum[0] += source[k][0];
        sum[1] += source[k][1];
        sum[2] += source[k][2];
      }
      return mix(p, mul(sum, 1 / (hi - lo + 1)), give[i]);
    });
  }
  return { points: current, on, off };
}

/**
 * Counts the base pairs off along a path, each with the directions that fix how its two bases lie.
 * @param origin distance along the path at which base pair 0 sits
 */
function countPairs(path: Path, origin: number): { pairs: BasePair[]; first: number } {
  const { points } = path;
  const travelled = [0];
  for (let i = 1; i < points.length; i++) travelled.push(travelled[i - 1] + length(sub(points[i], points[i - 1])));
  const total = travelled[travelled.length - 1];
  const first = -Math.floor(origin / DNA.rise);
  const last = Math.floor((total - origin) / DNA.rise);

  const pairs: BasePair[] = [];
  let segment = 0;
  for (let number = first; number <= last; number++) {
    const distance = origin + number * DNA.rise;
    while (segment < points.length - 2 && travelled[segment + 1] < distance) segment++;
    const t = (distance - travelled[segment]) / (travelled[segment + 1] - travelled[segment] || 1);
    const along = unit(sub(points[Math.min(points.length - 1, segment + 2)], points[Math.max(0, segment - 1)]));
    pairs.push({ at: mix(points[segment], points[segment + 1], t), along, across: [0, 0, 0], up: [0, 0, 0], turn: number * DNA.twist });
  }
  // Carry a direction across the helix along the whole path without letting it spin: the helix's own
  // twist is then the only turning there is.
  const middle = -first;
  const frame = (pair: BasePair, across: Vec3) => {
    pair.across = unit(sub(across, mul(pair.along, dot(across, pair.along))));
    pair.up = cross(pair.along, pair.across);
  };
  frame(pairs[middle], acrossFrom(pairs[middle].along));
  for (let i = middle + 1; i < pairs.length; i++) frame(pairs[i], pairs[i - 1].across);
  for (let i = middle - 1; i >= 0; i--) frame(pairs[i], pairs[i + 1].across);
  return { pairs, first };
}

/** Distance along a path to the middle of the bare stretch between spool `i` and the next. */
function middleOfLink(path: Path, i: number): number {
  let distance = 0;
  const target = (path.off[i] + path.on[i + 1]) / 2;
  for (let k = 1; k <= target; k++) distance += length(sub(path.points[k], path.points[k - 1]));
  return distance;
}

/** Gives every spool the loose tails of its eight proteins. */
function growTails(rng: Rng, spools: Spool[]): void {
  for (const spool of spools) {
    for (let k = 0; k < 8; k++) {
      // Half of them come out between the two turns of DNA, half through the flat faces of the spool.
      const angle = (k / 4) * Math.PI * 2 + rng.range(-0.5, 0.5);
      const outward = add(mul(spool.u, Math.cos(angle)), mul(spool.v, Math.sin(angle)));
      const face = k < 4 ? rng.range(-0.15, 0.15) : (k % 2 ? 1 : -1) * rng.range(0.9, 1.5);
      let heading = unit(add(outward, mul(spool.axis, face)));
      let p = add(spool.centre, mul(heading, NUCLEOSOME.core * (k < 4 ? 0.95 : 0.8)));
      const tail = [p];
      const steps = Math.round(rng.range(9, 15));
      for (let step = 0; step < steps; step++) {
        const [x, y, z] = rng.onSphere();
        heading = unit(add(heading, [x * 0.55, y * 0.55, z * 0.55]));
        p = add(p, mul(heading, 0.42));
        tail.push(p);
      }
      spool.tails.push(tail);
    }
  }
}

function moved(fibre: Fibre, by: Vec3): Fibre {
  return {
    first: fibre.first,
    spools: fibre.spools.map((spool) => ({ ...spool, centre: add(spool.centre, by), tails: spool.tails.map((tail) => tail.map((p) => add(p, by))) })),
    pairs: fibre.pairs.map((pair) => ({ ...pair, at: add(pair.at, by) })),
  };
}

/** Makes a fibre of a zigzag of spools. `link`: which bare stretch holds base pair 0, counted from the first spool. */
function fibreFrom(centres: Vec3[], link: number): Fibre {
  const spools = wind(centres);
  const path = threadPath(spools);
  return { spools, ...countPairs(path, middleOfLink(path, link)) };
}

/** A spool of the tangle, too far off to be drawn in full, and the thread from it to the next. */
export interface FarSpool {
  centre: Vec3;
  axis: Vec3;
  /** The spool the thread goes on to, if any. */
  next?: Vec3;
}

export interface Chromatin {
  /** The three fibres drawn in full. The first holds the stretch of DNA the journey zooms into. */
  fibres: Fibre[];
  /** Which spools of the first fibre that stretch runs between: this one and the next. */
  link: number;
  tangle: FarSpool[];
}

/** How the stretch of DNA under the camera lies on the screen: rising to the right, and nearly flat to it. */
const AIM: Vec3 = unit([Math.cos(0.6), Math.sin(0.6), -0.07]);

/** Every spool put down so far, kept so that a new one can be checked against its neighbours quickly. */
class Crowd {
  private static readonly CELL = 32;
  private readonly cells = new Map<number, Vec3[]>();

  private static key(x: number, y: number, z: number): number {
    return ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  }

  add(...centres: Vec3[]): void {
    for (const c of centres) {
      const key = Crowd.key(Math.floor(c[0] / Crowd.CELL), Math.floor(c[1] / Crowd.CELL), Math.floor(c[2] / Crowd.CELL));
      const cell = this.cells.get(key);
      if (cell) cell.push(c);
      else this.cells.set(key, [c]);
    }
  }

  remove(...centres: Vec3[]): void {
    for (const cell of this.cells.values()) {
      for (const c of centres) {
        const at = cell.indexOf(c);
        if (at >= 0) cell.splice(at, 1);
      }
    }
  }

  /** Whether a spool at `c`, with thread running to it from the spool at `from`, keeps clear of all the others. */
  clear(c: Vec3, from: Vec3, gap: number): boolean {
    const reach = Math.max(gap, 7);
    const lo = [0, 1, 2].map((k) => Math.floor((Math.min(c[k], from[k]) - reach) / Crowd.CELL));
    const hi = [0, 1, 2].map((k) => Math.floor((Math.max(c[k], from[k]) + reach) / Crowd.CELL));
    const way = sub(c, from);
    const span = dot(way, way);
    for (let x = lo[0]; x <= hi[0]; x++) {
      for (let y = lo[1]; y <= hi[1]; y++) {
        for (let z = lo[2]; z <= hi[2]; z++) {
          for (const other of this.cells.get(Crowd.key(x, y, z)) ?? []) {
            if (other === from) continue;
            if (length(sub(other, c)) < gap) return false;
            // The thread on its way here must not run through another spool either.
            const t = span > 0 ? Math.min(1, Math.max(0, dot(sub(other, from), way) / span)) : 0;
            if (length(sub(other, add(from, mul(way, t)))) < 7) return false;
          }
        }
      }
    }
    return true;
  }
}

function build(): Chromatin {
  const rng = new Rng('chromatin');

  // The fibre the journey goes into. Four of its spools are put down by hand: the two the camera
  // ends up between, with the stretch from one to the other lying across the view, and their
  // neighbours, which sit further back.
  const half = 13;
  const back = (side: number): Vec3 => [side * (half - 26 * 0.588), side * 26 * 0.809 * Math.cos(0.87), -26 * 0.809 * Math.sin(0.87)];
  let seeds: Vec3[] = [back(-1), [-half, 0, 0], [half, 0, 0], back(1)];
  // Turn them so that the stretch lies as wanted, and shift them so that it runs through the origin.
  const trial = fibreFrom(seeds, 1);
  const lies = trial.pairs[-trial.first].along;
  const round = length(cross(lies, AIM)) > 1e-6 ? unit(cross(lies, AIM)) : ([0, 0, 1] as Vec3);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(lies, AIM))));
  const pivot = trial.pairs[-trial.first].at;
  seeds = seeds.map((c) => turned(sub(c, pivot), round, angle));

  // From there the fibre wanders off both ways, into the depths of the chromosome.
  const own = new Crowd();
  own.add(...seeds);
  const deeper = (c: Vec3, from: Vec3) => c[2] < -14 && insideChromosome(c) && own.clear(c, from, 13);
  const grow = (centres: Vec3[], steps: number) => {
    const before = centres.length;
    for (let step = 0; step < steps; step++) {
      const count = centres.length;
      const axis = mul(turnAxis(centres[count - 3], centres[count - 2], centres[count - 1]), -1);
      zigzag(rng, centres, axis, 1, deeper);
      if (centres.length === count) break;
      own.add(centres[count]);
    }
    return centres.length - before;
  };
  const forwards = seeds.slice();
  grow(forwards, 4);
  const backwards = seeds.slice().reverse();
  const added = grow(backwards, 4);
  const link = added + 1;
  let hero = fibreFrom([...backwards.slice(seeds.length).reverse(), ...forwards], link);
  growTails(rng, hero.spools);
  // The origin is not on the axis of the helix but in one of its bases: the next stop shows that base atom by atom.
  hero = moved(hero, mul(bases(hero.pairs[-hero.first])[2], -1));

  const crowd = new Crowd();
  crowd.add(...hero.spools.map((spool) => spool.centre));
  /** Carries a zigzag on spool by spool, so that each new spool is in the way of the next. */
  const extend = (centres: Vec3[], steps: number, fits: (c: Vec3, from: Vec3) => boolean) => {
    let axis = acrossFrom(unit(sub(centres[1], centres[0])), rng.onSphere());
    for (let step = 0; step < steps; step++) {
      const count = centres.length;
      if (count > 2) axis = mul(turnAxis(centres[count - 3], centres[count - 2], centres[count - 1]), -1);
      zigzag(rng, centres, axis, 1, fits);
      if (centres.length === count) return;
      crowd.add(centres[count]);
    }
  };

  // Two more fibres drawn in full, behind the first: one crossing the view above its middle, one below.
  const fibres = [hero];
  const behind = (c: Vec3, from: Vec3) =>
    c[2] < -17 && c[2] > -44 && Math.abs(c[0]) < STAGE[0] && Math.abs(c[1]) < STAGE[1] && insideChromosome(c) && crowd.clear(c, from, 13);
  for (const [start, heading] of [
    [[-88, 30, -30], [0.75, -0.6, -0.25]],
    [[80, -30, -34], [-0.8, 0.5, 0.1]],
  ] as [Vec3, Vec3][]) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const first = add(start, mul(rng.inSphere(), 4 + attempt * 0.5));
      const second = add(first, mul(unit(add(heading, mul(rng.inSphere(), 0.3))), 25));
      if (!behind(first, first) || !behind(second, first)) continue;
      const centres = [first, second];
      crowd.add(first, second);
      extend(centres, 9, behind);
      if (centres.length < 6) {
        crowd.remove(...centres);
        continue;
      }
      const fibre = fibreFrom(centres, 0);
      growTails(rng, fibre.spools);
      fibres.push(fibre);
      break;
    }
  }

  // The rest of the chromosome around them: fibre upon fibre, in outline only.
  const tangle: FarSpool[] = [];
  const far = (c: Vec3, from: Vec3) => insideChromosome(c) && !inFront(c) && crowd.clear(c, from, 12.5);
  for (let i = 0; i < 1000; i++) {
    // The first few hundred are started right behind what the camera looks at, so that it has a backdrop.
    const first: Vec3 =
      i < 300
        ? [rng.range(-110, 110), rng.range(-90, 90), rng.range(-CHROMOSOME.waist, BACKDROP)]
        : [rng.range(-1, 1) * TANGLE_REACH, rng.range(-1, 1) * TANGLE_REACH, rng.range(-1, 1) * CHROMOSOME.arm];
    const second = add(first, mul(rng.onSphere(), rng.range(22, 29)));
    if (!far(first, first) || !far(second, first)) continue;
    const centres = [first, second];
    crowd.add(first, second);
    extend(centres, 12, far);
    centres.forEach((centre, k) => {
      const inner = k > 0 && k < centres.length - 1;
      tangle.push({ centre, axis: inner ? turnAxis(centres[k - 1], centre, centres[k + 1]) : rng.onSphere(), next: centres[k + 1] });
    });
  }
  return { fibres, link, tangle };
}

let built: Chromatin | undefined;

/** The whole arrangement. Always the same: it is worked out once, from fixed random numbers. */
export function chromatin(): Chromatin {
  built ??= build();
  return built;
}

/** A place in this model (nanometres) in the units of the layer of one of the stops. */
export function inLayerUnits(layer: string, p: Vec3): Vec3 {
  const unit = (10 ** STOPS[stopIndex(layer)].s / 2) * 1e9;
  return [p[0] / unit, p[1] / unit, p[2] / unit];
}
