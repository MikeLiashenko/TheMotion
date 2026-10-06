import { describe, expect, it } from 'vitest';
import { bases, chromatin, CHROMOSOME, DNA, groove, letterAt, NUCLEOSOME, PARTNER, phosphate, sugar, type Vec3 } from './chromatin';

const { fibres, link, tangle } = chromatin();
const hero = fibres[0];
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const pairNumber = (n: number) => hero.pairs[n - hero.first];

describe('the DNA the journey zooms into', () => {
  it('has one of its bases exactly on the zoom axis', () => {
    const [x, y, z] = bases(pairNumber(0))[2];
    expect(Math.hypot(x, y, z)).toBeLessThan(1e-9);
    expect(letterAt(0, 0)).toBe('A');
  });

  it('lies across the view, between two spools', () => {
    const { along } = pairNumber(0);
    // Rising to the right, and close to flat on the screen.
    expect(along[0]).toBeGreaterThan(0.7);
    expect(along[1]).toBeGreaterThan(0.4);
    expect(Math.abs(along[2])).toBeLessThan(0.15);
    // Straight for a good way to both sides: it is the bare stretch between two spools.
    for (const n of [-20, -10, 10, 20]) expect(dot(pairNumber(n).along, along)).toBeGreaterThan(0.999);
    const a = hero.spools[link].centre;
    const b = hero.spools[link + 1].centre;
    expect(distance(a, b)).toBeGreaterThan(20);
    expect(distance(a, b)).toBeLessThan(30);
    expect(Math.hypot(a[0] + b[0], a[1] + b[1], a[2] + b[2]) / 2).toBeLessThan(8);
  });
});

describe.each(fibres.map((fibre, i) => [i, fibre] as const))('fibre %i', (_, fibre) => {
  it('counts its base pairs off evenly along a smooth path', () => {
    for (let i = 1; i < fibre.pairs.length; i++) {
      const gap = distance(fibre.pairs[i].at, fibre.pairs[i - 1].at);
      expect(gap).toBeGreaterThan(DNA.rise * 0.97);
      expect(gap).toBeLessThan(DNA.rise * 1.01);
      // On a spool the DNA bends by about five degrees from one pair to the next; nowhere much more.
      expect(dot(fibre.pairs[i].along, fibre.pairs[i - 1].along)).toBeGreaterThan(Math.cos(0.17));
    }
  });

  it('carries the helix round without letting its frame slip', () => {
    for (const pair of fibre.pairs) {
      expect(Math.abs(dot(pair.along, pair.across))).toBeLessThan(1e-9);
      expect(Math.abs(dot(pair.along, pair.up))).toBeLessThan(1e-9);
      expect(Math.abs(dot(pair.across, pair.up))).toBeLessThan(1e-9);
      expect(Math.hypot(...pair.across)).toBeCloseTo(1, 9);
    }
    for (let i = 1; i < fibre.pairs.length; i++) expect(fibre.pairs[i].turn - fibre.pairs[i - 1].turn).toBeCloseTo(DNA.twist, 9);
  });

  it('winds its DNA round the outside of every spool, about 1.65 times', () => {
    const wound = new Array<number>(fibre.spools.length).fill(0);
    for (const pair of fibre.pairs) {
      fibre.spools.forEach((spool, k) => {
        const from = distance(pair.at, spool.centre);
        // Never through the protein in the middle.
        expect(from).toBeGreaterThan(NUCLEOSOME.core + 0.5);
        if (from < NUCLEOSOME.radius + 0.4) wound[k]++;
      });
    }
    // 1.65 turns at this radius hold about 128 base pairs; a few more are still close by as the DNA comes on and leaves.
    for (const count of wound) {
      expect(count).toBeGreaterThan(118);
      expect(count).toBeLessThan(152);
    }
  });

  it('has room for at least five spools', () => {
    expect(fibre.spools.length).toBeGreaterThanOrEqual(5);
    for (const spool of fibre.spools) expect(spool.tails).toHaveLength(8);
  });
});

describe('the chromatin as a whole', () => {
  const spools = [...fibres.flatMap((fibre) => fibre.spools.map((spool) => spool.centre)), ...tangle.map((spool) => spool.centre)];

  it('is always the same', () => {
    expect(chromatin()).toBe(chromatin());
    expect(hero.spools.length).toBeGreaterThanOrEqual(8);
    expect(fibres).toHaveLength(3);
  });

  it('keeps every spool clear of the others', () => {
    let nearest = Infinity;
    for (let i = 0; i < spools.length; i++) {
      for (let k = i + 1; k < spools.length; k++) nearest = Math.min(nearest, distance(spools[i], spools[k]));
    }
    // A spool with its DNA is 10.4 nm across.
    expect(nearest).toBeGreaterThan(12);
  });

  it('fills the waist of the chromosome with a tangle, but leaves the view to the three fibres drawn in full', () => {
    expect(tangle.length).toBeGreaterThan(900);
    expect(tangle.length).toBeLessThan(3200);
    for (const spool of tangle) {
      const [x, y, z] = spool.centre;
      // Inside one of the two chromatids…
      const inside = CHROMOSOME.chromatids.some((direction) => {
        const along = dot(spool.centre, direction);
        return Math.hypot(x - direction[0] * along, y - direction[1] * along, z - direction[2] * along) < CHROMOSOME.arm;
      });
      expect(inside).toBe(true);
      // …and not in the camera's view at the stop, in front of the backdrop: there it is 63 nm from the origin,
      // and sees half as far up and down as a thing is distant, and 16:9 of that to the sides.
      const depth = 63.1 - z;
      if (z > -30) expect(Math.abs(x) > depth * 0.89 || Math.abs(y) > depth * 0.5).toBe(true);
      // Nor straight in front of the fibres drawn in full, where it would hide them on the way in.
      if (z > -30) expect(Math.abs(x) > 105 || Math.abs(y) > 62).toBe(true);
    }
  });
});

describe('the model of a base pair', () => {
  const pair = pairNumber(5);

  it('puts the backbones on the outside and the bases between them', () => {
    for (const strand of [0, 1] as const) {
      expect(distance(phosphate(pair, strand), pair.at)).toBeCloseTo(DNA.phosphate, 9);
      expect(distance(sugar(pair, strand), pair.at)).toBeLessThan(DNA.phosphate);
    }
    const across = bases(pair);
    expect(across).toHaveLength(6);
    for (const p of across) expect(distance(p, pair.at)).toBeLessThan(DNA.sugar);
    // The two sugars are about a nanometre apart, as in the real thing.
    expect(distance(sugar(pair, 0), sugar(pair, 1))).toBeGreaterThan(0.9);
    expect(distance(sugar(pair, 0), sugar(pair, 1))).toBeLessThan(1.15);
  });

  it('has a wide groove and a narrow one', () => {
    const narrow = distance(groove(pair, false), phosphate(pair, 0));
    const wide = distance(groove(pair, true), phosphate(pair, 0));
    expect(wide).toBeGreaterThan(narrow * 1.2);
  });

  it('pairs A with T and G with C', () => {
    expect(PARTNER.A).toBe('T');
    expect(PARTNER.G).toBe('C');
    const seen = new Set<string>();
    for (let n = -200; n <= 200; n++) seen.add(letterAt(0, n));
    expect([...seen].sort()).toEqual(['A', 'C', 'G', 'T']);
  });
});
