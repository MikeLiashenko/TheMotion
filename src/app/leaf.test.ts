import { describe, expect, it } from 'vitest';
import { bladeHalfWidth, LEAF, onLeaf, sideVeinAt } from './leaf';
import { INSIDE_LEAF, INSIDE_PLACES, insideLeaf, leafDive, onCellWall, onSkin } from './leafInside';
import { journeyAt, progressToS, stopIndex, stopProgress, STOPS } from './timeline';

type Vec3 = [number, number, number];
const unitOf = (id: string) => 10 ** STOPS[stopIndex(id)].s / 2;

describe('the leaf', () => {
  it('tapers to nothing at the stalk and at the tip, and is widest in between', () => {
    expect(bladeHalfWidth(0)).toBeCloseTo(0, 9);
    expect(bladeHalfWidth(LEAF.length)).toBeLessThan(1e-4);
    let widest = 0;
    for (let x = 0; x <= LEAF.length; x += LEAF.length / 200) widest = Math.max(widest, bladeHalfWidth(x));
    expect(widest).toBeCloseTo(LEAF.width / 2, 5);
  });

  it('has the spot under the camera on its blade, clear of the midrib', () => {
    const [along, across] = LEAF.origin;
    expect(across).toBeGreaterThan(0.003);
    expect(across).toBeLessThan(bladeHalfWidth(along) * 0.7);
    expect(onLeaf('leaf', along, across).map(Math.abs)).toEqual([0, 0, 0]);
  });

  it('is turned on the screen: the tip up and to the right of the stalk', () => {
    const unit = unitOf('veins');
    const [x, y] = onLeaf('veins', LEAF.origin[0] + 0.01, LEAF.origin[1]);
    expect(Math.hypot(x, y) * unit).toBeCloseTo(0.01, 9);
    expect(Math.atan2(y, x)).toBeCloseTo(LEAF.angle, 9);
    // Raised above the blade is towards the camera.
    expect(onLeaf('veins', ...LEAF.origin, 0.002)[2] * unit).toBeCloseTo(0.002, 9);
  });

  it('sends its side veins out from the midrib, sweeping towards the tip', () => {
    expect(sideVeinAt(0, 0)).toBeCloseTo(LEAF.sideVeins / 2, 9);
    expect(sideVeinAt(3, 0) - sideVeinAt(2, 0)).toBeCloseTo(LEAF.sideVeins, 9);
    expect(sideVeinAt(2, 0.01)).toBeGreaterThan(sideVeinAt(2, 0) + 0.008);
    // The spot under the camera lies between two of them, a few millimetres from each.
    const [along, across] = LEAF.origin;
    const behind = along - sideVeinAt(4, across);
    const ahead = sideVeinAt(5, across) - along;
    expect(behind).toBeGreaterThan(0.002);
    expect(ahead).toBeGreaterThan(0.002);
  });
});

describe('the dive into the leaf', () => {
  const stoma = stopIndex('stoma');
  /** How high the camera is above the middle of the nucleus, micrometres, at scroll position `progress`. */
  const height = (progress: number) => INSIDE_LEAF.skin * (1 - leafDive(journeyAt(progress))) + 10 ** progressToS(progress) * 1e6;

  it('starts at the skin and ends at the nucleus', () => {
    expect(leafDive(stoma - 1)).toBe(0);
    expect(leafDive(stoma)).toBe(0);
    expect(leafDive(stoma + 0.5)).toBeGreaterThan(0.3);
    expect(leafDive(stoma + 0.5)).toBeLessThan(0.7);
    expect(leafDive(stoma + 1)).toBe(1);
    expect(leafDive(stoma + 3)).toBe(1);
  });

  it('takes the camera steadily downwards, never back up', () => {
    const from = stopProgress(stoma);
    const to = stopProgress(stopIndex('chromosomes'));
    let last = height(from);
    for (let i = 1; i <= 2000; i++) {
      const now = height(from + ((to - from) * i) / 2000);
      expect(now).toBeLessThanOrEqual(last + 1e-9);
      // No lurches either: at most a micrometre and a half between two samples.
      expect(last - now).toBeLessThan(1.5);
      last = now;
    }
  });

  it('rests above the skin, then in the air under it, then just over the cell, then inside it', () => {
    const { skin, roof, cell, nucleus } = INSIDE_LEAF;
    expect(height(stopProgress(stoma))).toBeGreaterThan(skin + 50);
    const overCell = height(stopProgress(stopIndex('cell')));
    expect(overCell).toBeLessThan(roof);
    expect(overCell).toBeGreaterThan(cell.top + 15);
    expect(height(stopProgress(stopIndex('nucleus')))).toBeGreaterThan(cell.top);
    const inCell = height(stopProgress(stopIndex('chromosomes')));
    expect(inCell).toBeLessThan(cell.top);
    expect(inCell).toBeGreaterThan(nucleus);
  });
});

describe('inside the leaf', () => {
  const { cell, vacuole, nucleus, guard, skin, roof } = INSIDE_LEAF;
  const home: Vec3 = [cell.x, cell.y, cell.top - cell.tall];
  /** How far out a point is in an ellipsoid: 0 at its middle, 1 on its surface. */
  const reach = (p: readonly number[], centre: Vec3, half: Vec3) => Math.hypot((p[0] - centre[0]) / half[0], (p[1] - centre[1]) / half[1], (p[2] - centre[2]) / half[2]);
  const inCell = (p: readonly number[]) => reach(p, home, [cell.wide, cell.wide, cell.tall]);
  const inVacuole = (p: readonly number[]) => reach(p, [vacuole.x, vacuole.y, vacuole.z], [vacuole.wide, vacuole.wide, vacuole.tall]);
  const fromNucleus = (p: readonly number[]) => Math.hypot(p[0], p[1], p[2]);

  it('keeps the nucleus and the vacuole inside the cell, and apart', () => {
    // Sampled over the surface of each.
    for (let i = 0; i < 400; i++) {
      const turn = i * 2.39996;
      const up = 1 - (2 * (i + 0.5)) / 400;
      const out = Math.sqrt(1 - up * up);
      const onNucleus = [nucleus * out * Math.cos(turn), nucleus * out * Math.sin(turn), nucleus * up];
      expect(inCell(onNucleus)).toBeLessThan(0.97);
      expect(inVacuole(onNucleus)).toBeGreaterThan(1.02);
      const onVacuole = [vacuole.x + vacuole.wide * out * Math.cos(turn), vacuole.y + vacuole.wide * out * Math.sin(turn), vacuole.z + vacuole.tall * up];
      expect(inCell(onVacuole)).toBeLessThan(0.98);
    }
    // The cell stands under the air space, well short of the skin.
    expect(cell.top).toBeLessThan(roof - 15);
    expect(roof).toBeLessThan(skin);
  });

  it('puts everything that gets a label where it belongs', () => {
    const places = INSIDE_PLACES;
    expect(fromNucleus(places.nucleus)).toBe(0);
    expect(fromNucleus(places.nucleolus)).toBeLessThan(nucleus - 0.75);
    expect(fromNucleus(places.envelope)).toBeCloseTo(nucleus, 1);
    expect(fromNucleus(places.pore)).toBeCloseTo(nucleus, 1);
    // The pore that is pointed out is on the side of the nucleus that faces the camera.
    expect(places.pore[2]).toBeGreaterThan(1);
    for (const name of ['chloroplast', 'mitochondrion', 'reticulum', 'golgi', 'ribosomes'] as const) {
      expect(inCell(places[name]), name).toBeLessThan(0.95);
      expect(inVacuole(places[name]), name).toBeGreaterThan(1.05);
      expect(fromNucleus(places[name]), name).toBeGreaterThan(nucleus + 0.4);
    }
    expect(inCell(places.wall)).toBeCloseTo(1, 9);
    expect(inVacuole(places.vacuole)).toBeCloseTo(1, 9);
    expect(inCell(places.air)).toBeGreaterThan(1.1);
  });

  it('finds points on the wall of the cell', () => {
    for (const [turn, up] of [[0, 0], [1.3, 0.4], [-2, -0.7], [4, 0.99]]) {
      expect(inCell(onCellWall(turn, up))).toBeCloseTo(1, 9);
      expect(inCell(onCellWall(turn, up, 0.86))).toBeCloseTo(0.86, 9);
    }
  });

  it('shapes the guard cells to the stoma drawn on the skin', () => {
    // On the skin a stoma is 0.46 cells wide and its pore, at its widest, 0.09.
    const drawnWidth = 2 * 0.23 * LEAF.cell * 1e6;
    const drawnPore = 2 * 0.045 * LEAF.cell * 1e6;
    expect(2 * (guard.off + guard.wide)).toBeCloseTo(drawnWidth, 0);
    expect(2 * (guard.off - guard.wide)).toBeCloseTo(drawnPore, 0);
    expect(2 * guard.long).toBeCloseTo(LEAF.stoma * 1e6, 6);
    // They hang just under the skin.
    expect(guard.depth).toBeGreaterThan(guard.tall);
    expect(guard.depth - guard.tall).toBeLessThan(1);
  });

  it('measures in micrometres from the nucleus, and puts the skin above it', () => {
    const unit = unitOf('cell');
    expect(insideLeaf('cell', 3, -4, 12).map((v) => v * unit * 1e6)).toEqual([3, -4, 12].map((v) => expect.closeTo(v, 9)));
    expect(onSkin('stoma', 5, 6)[2] * unitOf('stoma') * 1e6).toBeCloseTo(skin, 9);
  });
});
