import * as THREE from 'three';
import {
  bases,
  chromatidRadius,
  chromatin,
  CHROMOSOME,
  letterAt,
  NUCLEOSOME,
  PARTNER,
  phosphate,
  sugar,
  type BasePair,
  type Fibre,
  type Letter,
  type Spool,
} from '../app/chromatin';
import { INSIDE_PLACES } from '../app/leafInside';
import { Rng } from '../util/rng';
import { BallBuf, ballMaterial, COILED, shellMaterial, type Depths } from './balls';
import { puff } from './gen';
import { Layer, type FrameState } from './layer';
import { PointBuf, pointsMaterial, scaleRgb, type RGB } from './points';
import { electronHaze, EMPTINESS } from './subatomic';

type Vec3 = [number, number, number];

/** The four bases of DNA, each with its own colour. */
const BASE_COLORS: Record<Letter, RGB> = {
  A: [0.3, 0.85, 0.42],
  T: [0.97, 0.38, 0.36],
  G: [1.0, 0.84, 0.3],
  C: [0.74, 0.5, 1.0],
};
/** The two backbones of the helix, in two blues so that they can be told apart. */
const BACKBONE: RGB[] = [[0.26, 0.56, 1.0], [0.42, 0.74, 1.0]];
const PHOSPHATE: RGB = [0.2, 0.47, 1.0];
const SUGAR: RGB = [0.56, 0.78, 1.0];
/** The proteins DNA is wound on: two kinds of pair, in two colours. */
const HISTONES: RGB[] = [[0.82, 0.46, 0.88], [0.98, 0.52, 0.72]];
const HISTONE_TAIL: RGB = [0.96, 0.66, 0.88];

/** CPK-style element colours and ball radii (layer units of the `molecule` stop: 0.5 nm). */
const ELEMENTS: Record<string, { color: RGB; radius: number }> = {
  C: { color: [0.36, 0.38, 0.42], radius: 0.115 },
  N: { color: [0.3, 0.46, 1.0], radius: 0.11 },
  O: { color: [0.95, 0.26, 0.2], radius: 0.105 },
  P: { color: [1.0, 0.6, 0.15], radius: 0.15 },
  H: { color: [0.92, 0.92, 0.92], radius: 0.065 },
};

/**
 * A cell's nucleus, centred on the origin: its envelope, the nucleolus, the chromosomes and the
 * loose chromatin between them. Always built from the same random numbers, so every layer
 * that shows the nucleus shows the same one.
 * @param dots takes the parts too small to need a finely made sphere
 * @param um layer units per micrometre
 */
export function nucleus(balls: BallBuf, dots: BallBuf, shells: BallBuf, um: number): void {
  const rng = new Rng('nucleus');
  // Lengths below are in units of 2 µm, the scale this model was first built at.
  const k = 2 * um;
  const at = (p: Vec3): Vec3 => [p[0] * k, p[1] * k, p[2] * k];
  const [lx, ly, lz] = INSIDE_PLACES.nucleolus;
  const nucleolus: Vec3 = [lx / 2, ly / 2, lz / 2];
  shells.add([0, 0, 0], 1.5 * k, [0.55, 0.45, 0.9]);
  balls.add(at(nucleolus), 0.375 * k, [0.42, 0.3, 0.62]);

  // Pores stud the envelope: the gates everything entering or leaving the nucleus must pass.
  const pore = (x: number, y: number, z: number) => dots.add(at([x * 1.5, y * 1.5, z * 1.5]), 0.03 * k, [0.8, 0.74, 1.0]);
  const [px, py, pz] = INSIDE_PLACES.pore;
  pore(px / 3, py / 3, pz / 3);
  for (let i = 0; i < 320; i++) pore(...rng.onSphere());

  const palette: RGB[] = [[0.95, 0.4, 0.75], [0.4, 0.8, 0.95], [1.0, 0.8, 0.35], [0.6, 0.9, 0.5], [1.0, 0.55, 0.35], [0.7, 0.6, 1.0]];
  // The chromosome in the middle is the one the journey goes into: its shape is fixed (see app/chromatin.ts).
  // The others also keep clear of the thread of loose chromatin that gets a label.
  const [tx, ty, tz] = INSIDE_PLACES.thread;
  const thread: Vec3 = [tx / 2, ty / 2, tz / 2];
  const placed: Vec3[] = [[0, 0, 0], thread];
  const reach = CHROMOSOME.reach / 2000;
  for (const direction of CHROMOSOME.chromatids) {
    for (let i = -14; i <= 14; i++) {
      const along = (i / 14) * reach;
      balls.add(at([direction[0] * along, direction[1] * along, direction[2] * along]), (chromatidRadius(along * 2000) / 2000) * k, palette[0]);
    }
  }
  const addChromosome = (center: Vec3, color: RGB) => {
    placed.push(center);
    const spin = rng.range(0, Math.PI);
    const length = rng.range(0.34, 0.5);
    for (const side of [-1, 1]) {
      const a = spin + side * 0.3;
      const dir: Vec3 = [Math.cos(a), Math.sin(a), rng.range(-0.25, 0.25)];
      for (let i = -9; i <= 9; i++) {
        const t = i / 9;
        // Pinched at the centromere.
        const radius = 0.07 * (0.62 + 0.38 * Math.min(1, Math.abs(t) * 3));
        balls.add(at([center[0] + dir[0] * t * length, center[1] + dir[1] * t * length, center[2] + dir[2] * t * length]), radius * k, color);
      }
    }
  };
  for (let i = 1; i < 11; i++) {
    for (let tries = 0; tries < 60; tries++) {
      const [x, y, z] = rng.inSphere();
      const c: Vec3 = [x * 1.25, y * 1.25, z * 0.9];
      const clear = placed.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 0.62);
      // None may come between the camera and the chromosome in the middle.
      const inTheWay = c[2] > -0.25 && Math.hypot(c[0], c[1]) < 0.85;
      if (clear && !inTheWay && Math.hypot(c[0] - nucleolus[0], c[1] - nucleolus[1], c[2] - nucleolus[2]) > 0.75) {
        // The colour of the chromosome in the middle is left to it alone.
        addChromosome(c, palette[1 + (i % (palette.length - 1))]);
        break;
      }
    }
  }
  // Loose chromatin threads filling the rest of the nucleus.
  for (let strand = 0; strand < 70; strand++) {
    let [x, y, z] = strand === 0 ? thread : (rng.inSphere().map((v) => v * 1.35) as Vec3);
    let dir = rng.onSphere();
    for (let i = 0; i < 46; i++) {
      const turn = rng.onSphere();
      dir = normalize([dir[0] + turn[0] * 0.5, dir[1] + turn[1] * 0.5, dir[2] + turn[2] * 0.5]);
      x += dir[0] * 0.022;
      y += dir[1] * 0.022;
      z += dir[2] * 0.022;
      if (Math.hypot(x, y, z) > 1.42) break;
      dots.add(at([x, y, z]), 0.011 * k, [0.5, 0.56, 0.8]);
    }
  }
}

/** How each of these layers darkens with depth, where it does. */
const DEPTHS: Record<string, Depths> = {
  chromosomes: { from: 1.0, to: 2.4, floor: 0.3 },
  chromatin: { from: 1.15, to: 2.05, floor: 0.1 },
  dna: { from: 1.2, to: 4.5, floor: 0.2 },
};

const CAVEATS: Record<string, string> = {
  chromosomes: 'Chromosomes are this compact only while a cell divides',
  chromatin: 'A model, loosened so that you can see into it',
  dna: 'A model: each ball stands for a group of atoms',
  molecule: 'A model: a ball for each atom, a stick for each bond; most hydrogens left out',
};

/** The molecular world, built from lit spheres. */
export class BallLayer extends Layer {
  /** Sets of spheres, by how finely each is made: the smaller something is on screen, the less it needs. */
  private readonly sets = new Map<number, BallBuf>();
  private readonly balls = this.made(20);
  private readonly beads = this.made(10);
  private readonly dots = this.made(8);
  private readonly shells = new BallBuf();
  /** The coil of DNA on each of the nucleosomes that are too far off to be drawn in full. */
  private readonly coils = new BallBuf();

  private made(detail: number): BallBuf {
    let set = this.sets.get(detail);
    if (!set) this.sets.set(detail, (set = new BallBuf()));
    return set;
  }

  protected build(): void {
    switch (this.stop.id) {
      case 'chromosomes':
        nucleus(this.balls, this.dots, this.shells, 1e-6 / this.unitM);
        break;
      case 'chromatin':
        this.chromatin();
        break;
      case 'dna':
        this.dna();
        break;
      default:
        this.nucleotide();
    }
    const depths = DEPTHS[this.stop.id];
    for (const [detail, set] of this.sets) {
      if (set.count > 0) this.content.add(set.toMesh(ballMaterial(this.uniforms, depths), detail));
    }
    if (this.coils.count > 0) {
      // Two turns of DNA side by side: a ring, which each of them stretches to be taller than it is thick.
      const ring = new THREE.TorusGeometry(NUCLEOSOME.radius, 1, 6, 20);
      this.content.add(this.coils.toMesh(ballMaterial(this.uniforms, depths), 0, ring));
    }
    if (this.shells.count === 0) return;
    const shells = this.shells.toMesh(shellMaterial(this.uniforms, depths), 48);
    shells.renderOrder = 2;
    this.content.add(shells);
  }

  /** The eight proteins a spool is made of, and their loose tails. */
  private spool(spool: Spool, nm: number): void {
    const { centre, axis, u, v } = spool;
    for (let k = 0; k < 8; k++) {
      const side = k < 4 ? 1 : -1;
      const angle = (k % 4) * (Math.PI / 2) + (side > 0 ? 0.3 : 0.3 + Math.PI / 4);
      const c = Math.cos(angle) * 1.55;
      const s = Math.sin(angle) * 1.55;
      const p: Vec3 = [
        (centre[0] + u[0] * c + v[0] * s + axis[0] * side * 0.95) * nm,
        (centre[1] + u[1] * c + v[1] * s + axis[1] * side * 0.95) * nm,
        (centre[2] + u[2] * c + v[2] * s + axis[2] * side * 0.95) * nm,
      ];
      this.balls.add(p, 1.7 * nm, scaleRgb(HISTONES[(k + (side > 0 ? 0 : 1)) % 2], 0.88 + 0.2 * this.rng.next()));
    }
    this.balls.add([centre[0] * nm, centre[1] * nm, centre[2] * nm], 2.0 * nm, HISTONES[0]);
    for (const tail of spool.tails) {
      for (const p of tail) this.dots.add([p[0] * nm, p[1] * nm, p[2] * nm], 0.27 * nm, HISTONE_TAIL);
    }
  }

  private chromatin(): void {
    const nm = 1e-9 / this.unitM;
    const { fibres, tangle } = chromatin();
    const scaled = (p: Vec3): Vec3 => [p[0] * nm, p[1] * nm, p[2] * nm];
    fibres.forEach((fibre, index) => {
      // The fibre in front is the one the camera closes in on: its thread is made more finely.
      const thread = index === 0 ? this.beads : this.made(6);
      fibre.pairs.forEach((pair, i) => {
        const letter = letterAt(index, fibre.first + i);
        thread.add(scaled(phosphate(pair, 0)), 0.4 * nm, BACKBONE[0]);
        thread.add(scaled(phosphate(pair, 1)), 0.4 * nm, BACKBONE[1]);
        // Between the two backbones, the pair of bases: one bead, in the colour of the first of the two.
        const [, , a, b] = bases(pair);
        thread.add(scaled([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]), 0.5 * nm, scaleRgb(BASE_COLORS[letter], 0.85));
      });
      for (const spool of fibre.spools) this.spool(spool, nm);
    });

    // The rest of the chromosome: thousands more spools, too far off to need more than their outline.
    const flat = new THREE.Vector3(0, 0, 1);
    const lengthwise = new THREE.Vector3(1, 0, 0);
    const towards = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    for (const spool of tangle) {
      quat.setFromUnitVectors(flat, towards.set(...spool.axis));
      this.made(12).add(scaled(spool.centre), [3.3 * nm, 3.3 * nm, 2.7 * nm], scaleRgb(HISTONES[this.rng.int(2)], 0.8 + 0.25 * this.rng.next()), quat);
      this.coils.add(scaled(spool.centre), [1.05 * nm, 1.05 * nm, 2.2 * nm], BACKBONE[0], quat, COILED);
      if (!spool.next) continue;
      const [ax, ay, az] = spool.centre;
      const [bx, by, bz] = spool.next;
      const span = Math.hypot(bx - ax, by - ay, bz - az);
      quat.setFromUnitVectors(lengthwise, towards.set((bx - ax) / span, (by - ay) / span, (bz - az) / span));
      this.dots.add(scaled([(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2]), [(span / 2) * nm, 1.0 * nm, 1.0 * nm], [0.34, 0.64, 1.0], quat);
    }
  }

  /** Every part of one base pair: the two backbones, and the two bases that reach across between them. */
  private basePair(pair: BasePair, letter: Letter, nm: number, into: BallBuf): void {
    const scaled = (p: Vec3): Vec3 => [p[0] * nm, p[1] * nm, p[2] * nm];
    for (const strand of [0, 1] as const) {
      into.add(scaled(phosphate(pair, strand)), 0.27 * nm, PHOSPHATE);
      into.add(scaled(sugar(pair, strand)), 0.24 * nm, SUGAR);
    }
    bases(pair).forEach((p, k) => into.add(scaled(p), 0.17 * nm, BASE_COLORS[k < 3 ? letter : PARTNER[letter]]));
  }

  /** The stretch of DNA between two spools, and what can be seen of the spools at its ends. */
  private dna(): void {
    const nm = 1e-9 / this.unitM;
    const { fibres, link } = chromatin();
    const fibre: Fibre = fibres[0];
    for (let number = -170; number <= 170; number++) {
      const pair = fibre.pairs[number - fibre.first];
      if (!pair) continue;
      // Only the part under the camera is ever seen from close by.
      this.basePair(pair, letterAt(0, number), nm, Math.abs(number) <= 30 ? this.balls : this.beads);
    }
    this.spool(fibre.spools[link], nm);
    this.spool(fibre.spools[link + 1], nm);
  }

  /** One nucleotide (deoxyadenosine monophosphate) as a ball-and-stick model, C1′ at the origin. */
  private nucleotide(): void {
    const rng = this.rng;
    const atoms: Record<string, { el: string; p: Vec3 }> = {};
    const atom = (name: string, el: string, x: number, y: number) => {
      atoms[name] = { el, p: [x, y, rng.range(-0.07, 0.07)] };
    };
    atom("C1'", 'C', 0, 0);
    atoms["C1'"].p[2] = 0;
    atom("C2'", 'C', -0.166, 0.228);
    atom("C3'", 'C', -0.434, 0.141);
    atom("C4'", 'C', -0.434, -0.141);
    atom("O4'", 'O', -0.166, -0.228);
    atom("O3'", 'O', -0.61, 0.36);
    atom("C5'", 'C', -0.65, -0.32);
    atom("O5'", 'O', -0.89, -0.18);
    atom('P', 'P', -1.07, 0.06);
    atom('OP1', 'O', -1.35, 0.08);
    atom('OP2', 'O', -1.02, 0.35);
    atom('OP3', 'O', -1.21, -0.18);
    atom('N9', 'N', 0.202, 0.0935);
    atom('C8', 'C', 0.037, 0.32);
    atom('N7', 'N', 0.202, 0.5465);
    atom('C5', 'C', 0.468, 0.46);
    atom('C4', 'C', 0.468, 0.18);
    atom('N3', 'N', 0.71, 0.04);
    atom('C2', 'C', 0.952, 0.18);
    atom('N1', 'N', 0.952, 0.46);
    atom('C6', 'C', 0.71, 0.6);
    atom('N6', 'N', 0.71, 0.88);
    atom('H61', 'H', 0.55, 0.99);
    atom('H62', 'H', 0.87, 0.99);
    atom('H8', 'H', -0.14, 0.38);
    atom('H2', 'H', 1.13, 0.08);
    const bonds: [string, string][] = [
      ["C1'", "C2'"], ["C2'", "C3'"], ["C3'", "C4'"], ["C4'", "O4'"], ["O4'", "C1'"],
      ["C3'", "O3'"], ["C4'", "C5'"], ["C5'", "O5'"], ["O5'", 'P'], ['P', 'OP1'], ['P', 'OP2'], ['P', 'OP3'],
      ["C1'", 'N9'], ['N9', 'C8'], ['C8', 'N7'], ['N7', 'C5'], ['C5', 'C4'], ['C4', 'N9'],
      ['C4', 'N3'], ['N3', 'C2'], ['C2', 'N1'], ['N1', 'C6'], ['C6', 'C5'], ['C6', 'N6'],
      ['N6', 'H61'], ['N6', 'H62'], ['C8', 'H8'], ['C2', 'H2'],
    ];
    for (const { el, p } of Object.values(atoms)) this.balls.add(p, ELEMENTS[el].radius, ELEMENTS[el].color);
    for (const [a, b] of bonds) this.balls.chain(atoms[a].p, atoms[b].p, 0.032, [0.7, 0.72, 0.76], 0.04);
  }

  caveat(): string {
    return CAVEATS[this.stop.id];
  }
}

/**
 * A carbon atom on its own: a nucleus far too small to see, inside clouds that show where its
 * six electrons are likely to be found. Each dot is one place an electron might turn up; where
 * the dots are dense, it is there often. Lengths are in units of 100 pm, about the size of the atom.
 */
export class AtomLayer extends Layer {
  /** Its own fade for the specks that fill the screen once the camera has left the clouds behind. */
  private readonly haze = { ...this.uniforms, uFade: { value: 0 } };

  protected build(): void {
    const rng = this.rng;
    const cloud = new PointBuf();
    const haze = new PointBuf();
    // Dots are sized as a share of the frame, not in pixels: the cloud looks the same on a large screen as on a small one.
    const add = (d: Vec3, r: number, color: RGB, bright: number, size: number) =>
      cloud.add(d[0] * r, d[1] * r, d[2] * r, scaleRgb(color, bright * (0.5 + 0.5 * rng.next())), 0.004 * size * (1 + 1.6 * rng.next() ** 3), 1, rng.next());
    /** How far from the nucleus an electron is found: most often at `peak`, never at the nucleus itself, now and then much further out. */
    const distance = (peak: number, shape: number) => {
      let product = 1;
      for (let i = 0; i <= shape; i++) product *= Math.max(rng.next(), 1e-12);
      return (-Math.log(product) * peak) / shape;
    };
    const inner: RGB = [0.78, 0.9, 1.0];
    const outer: RGB = [0.25, 0.6, 1.0];
    const lobes: RGB[] = [[0.74, 0.42, 1.0], [0.25, 0.95, 0.85]];
    // 1s: two electrons held close to the nucleus, most often 9 pm from it.
    for (let i = 0; i < 14_000; i++) add(rng.onSphere(), distance(0.093, 2), inner, 0.5, 1.0);
    // 2s: two more in a round cloud seven times as wide.
    for (let i = 0; i < 40_000; i++) add(rng.onSphere(), distance(0.56, 8), outer, 0.36, 1.2);
    // 2p: the last two, one each in two dumbbell-shaped clouds at right angles.
    for (let i = 0; i < 90_000; i++) {
      const axis = i % 2;
      let d: Vec3;
      do d = rng.onSphere();
      while (rng.next() > d[axis] ** 2);
      add(d, distance(0.58, 8), lobes[axis], 0.7, 1.3);
    }
    // Soft glow giving the clouds some body.
    puff(haze, rng, [0, 0, 0], 0.45, inner, 8, 0.05);
    for (const sign of [-1, 1]) {
      puff(haze, rng, [sign * 0.6, 0, 0], 0.5, lobes[0], 12, 0.028);
      puff(haze, rng, [0, sign * 0.6, 0], 0.5, lobes[1], 12, 0.024);
    }
    this.content.add(haze.toPoints(pointsMaterial(this.uniforms, { soft: 1.3 })));
    this.content.add(cloud.toPoints(pointsMaterial(this.uniforms, { soft: 2.0, twinkle: 0.7 })));

    // The nucleus: at this scale a point with no size at all.
    const nucleus = new PointBuf();
    nucleus.add(0, 0, 0, [1.0, 0.86, 0.62], 0, 9, 0);
    this.content.add(nucleus.toPoints(pointsMaterial(this.uniforms, { soft: 5.0 })));
    this.scene.add(electronHaze(this.haze));
  }

  protected animate(state: FrameState): void {
    // Further in than this stop the clouds are left behind: all that remains is the chance of meeting an electron.
    const beyond = Math.min(1, Math.max(0, (this.stop.s - 0.25 - state.s) / 0.85));
    this.haze.uFade.value = this.uniforms.uFade.value * beyond * beyond * (3 - 2 * beyond);
  }

  caveat(s: number): string {
    return s < this.stop.s - 0.9 ? EMPTINESS : 'Dots show where the electrons are likely to be; the nucleus is drawn far too large';
  }
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
