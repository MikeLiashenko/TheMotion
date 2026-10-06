import { describe, expect, it } from 'vitest';
import { itemsFor } from '../app/catalog';
import { STOPS } from '../app/timeline';
import { homeMagnification, LOCAL_GROUP_MAGNIFICATION } from './magnify';
import { LOCAL_GROUP, NEIGHBOR_GROUPS, neighborRadius, NEIGHBORS } from './zoo';

const stop = (id: string) => STOPS.find((s) => s.id === id)!;

describe('homeMagnification', () => {
  it('is true to scale from the Milky Way stop inwards', () => {
    expect(homeMagnification(stop('milkyWay').s)).toBe(1);
    expect(homeMagnification(stop('globulars').s)).toBe(1);
    expect(homeMagnification(-9)).toBe(1);
  });

  it('matches the rest of the Local Group seen from afar, and nearly so at the Local Group stop', () => {
    expect(homeMagnification(stop('galaxies').s)).toBe(LOCAL_GROUP_MAGNIFICATION);
    const atStop = homeMagnification(stop('localGroup').s);
    expect(atStop).toBeLessThanOrEqual(LOCAL_GROUP_MAGNIFICATION);
    expect(atStop).toBeGreaterThan(LOCAL_GROUP_MAGNIFICATION * 0.8);
  });

  it('keeps the galaxy growing on screen at a healthy pace while zooming in', () => {
    // Size on screen ∝ magnification / frame size. Zooming in means s falls.
    const onScreen = (s: number) => homeMagnification(s) / 10 ** s;
    for (let s = 24; s >= 20; s -= 0.01) {
      // At true scale a decade of zoom is ×10; even mid-relaxation it must stay above ×2.5.
      expect(onScreen(s - 0.1) / onScreen(s)).toBeGreaterThan(2.5 ** 0.1);
    }
  });
});

describe('the galaxy zoo', () => {
  const neighbors = itemsFor('galaxies');
  const unit = 10 ** stop('galaxies').s / 2;

  it('only describes galaxies that are in the catalog', () => {
    const galaxies = new Set(neighbors.map((item) => item.id));
    for (const id of [...Object.keys(NEIGHBORS), ...Object.keys(NEIGHBOR_GROUPS)]) expect(galaxies.has(id), id).toBe(true);
    const local = new Set(itemsFor('localGroup').map((item) => item.id));
    for (const id of Object.keys(LOCAL_GROUP)) expect(local.has(id), id).toBe(true);
  });

  it('draws every neighbouring galaxy as a galaxy, not a dot', () => {
    for (const item of neighbors) {
      if (item.kind !== 'galaxy') continue;
      expect(item.id in NEIGHBORS || item.id in NEIGHBOR_GROUPS, item.id).toBe(true);
    }
  });

  it('keeps the enlarged neighbours from overlapping at the stop', () => {
    const drawn = neighbors
      .map((item) => ({
        item,
        radius: NEIGHBORS[item.id] ? neighborRadius(NEIGHBORS[item.id], item.size / unit) : NEIGHBOR_GROUPS[item.id],
      }))
      .filter((g) => g.radius !== undefined);
    for (const a of drawn) {
      for (const b of drawn) {
        if (a.item.id >= b.item.id) continue;
        const gap = Math.hypot(a.item.pos[0] - b.item.pos[0], a.item.pos[1] - b.item.pos[1]);
        // Radii are those of face-on discs, and most are tilted: touching by a fifth is still clear.
        expect(gap, `${a.item.id} / ${b.item.id}`).toBeGreaterThan(0.8 * (a.radius + b.radius));
      }
    }
  });

  it('keeps them inside the frame at the stop', () => {
    for (const item of neighbors) {
      // Half the frame is 1 unit high and, at 16:9, 1.78 wide.
      expect(Math.abs(item.pos[0]), item.id).toBeLessThan(1.6);
      expect(Math.abs(item.pos[1]), item.id).toBeLessThan(0.9);
    }
  });
});
