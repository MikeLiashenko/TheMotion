import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { itemsFor, type CatalogItem } from '../app/catalog';
import { galactic } from '../app/sky';
import { STOPS } from '../app/timeline';
import { STOP_VIEWPOINT } from './constants';
import { GALACTIC_VIEW, galacticView, globularRadius } from './galaxy';
import { NEBULAE } from './nebulaLooks';

const stop = (id: string) => STOPS.find((s) => s.id === id)!;

/** Half the frame is 1 unit high and, at 16:9, this wide. */
const HALF_WIDTH = 16 / 9;

/**
 * Where a point of a layer inside the galaxy lands on screen while the camera rests at that
 * layer's stop (half the frame height = 1), and how much perspective enlarges things there.
 */
function onScreen(layer: string, pos: [number, number, number]): { x: number; y: number; zoom: number } {
  const v = new THREE.Vector3(...pos).applyEuler(galacticView(stop(layer).s));
  const zoom = STOP_VIEWPOINT[2] / (STOP_VIEWPOINT[2] - v.z);
  return { x: v.x * zoom, y: v.y * zoom, zoom };
}

/** Checks that pictures of the given radii neither overlap nor leave the frame at the layer's stop. */
function expectTidy(layer: string, drawn: { item: CatalogItem; radius: number }[]): void {
  const placed = drawn.map(({ item, radius }) => {
    const p = onScreen(layer, item.pos);
    return { id: item.id, x: p.x, y: p.y, r: radius * p.zoom };
  });
  for (const a of placed) {
    expect(Math.abs(a.x) + a.r, `${a.id} runs off the side`).toBeLessThan(HALF_WIDTH);
    expect(Math.abs(a.y) + a.r, `${a.id} runs off the top or bottom`).toBeLessThan(1);
    for (const b of placed) {
      if (a.id >= b.id) continue;
      // Touching by a tenth is still clear: the pictures fade out towards their edges.
      expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id} / ${b.id}`).toBeGreaterThan(0.9 * (a.r + b.r));
    }
  }
}

describe('galactic coordinates', () => {
  it('put the galactic centre along +x, the direction of rotation along +y and the north pole along +z', () => {
    const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));
    close(galactic(0, 0, 1), [1, 0, 0]);
    close(galactic(90, 0, 1), [0, 1, 0]);
    close(galactic(0, 90, 1), [0, 0, 1]);
    close(galactic(180, 0, 2), [-2, 0, 0]);
  });

  it('keep the distance', () => {
    expect(Math.hypot(...galactic(209, -19.4, 1344))).toBeCloseTo(1344, 6);
  });
});

describe('galacticView', () => {
  it('is the outside view at the Milky Way stop and everywhere beyond it', () => {
    for (const s of [stop('milkyWay').s, stop('localGroup').s, 25]) {
      const view = galacticView(s);
      expect(view.x).toBeCloseTo(GALACTIC_VIEW.x, 9);
      expect(view.z).toBeCloseTo(GALACTIC_VIEW.z, 9);
    }
  });

  it('turns smoothly: no jump anywhere on the way in', () => {
    let previous = galacticView(22);
    for (let s = 22; s >= 17; s -= 0.001) {
      const view = galacticView(s);
      expect(Math.abs(view.x - previous.x)).toBeLessThan(0.01);
      expect(Math.abs(view.z - previous.z)).toBeLessThan(0.01);
      previous = view;
    }
  });

  it('dives through the plane of the galaxy between the halo and the nebulae', () => {
    // Tilt past a right angle means looking at the underside of the disc.
    expect(-galacticView(stop('globulars').s).x).toBeLessThan(Math.PI / 2);
    expect(-galacticView(stop('nebulae').s).x).toBeGreaterThan(Math.PI / 2);
    expect(galacticView(stop('neighborhood').s).x).toBe(galacticView(stop('nebulae').s).x);
  });
});

describe('the nebulae', () => {
  const nebulae = itemsFor('nebulae').filter((item) => item.kind === 'nebula');

  it('each have a picture', () => {
    for (const layer of ['globulars', 'nebulae', 'giants']) {
      for (const item of itemsFor(layer)) {
        if (item.kind === 'nebula') expect(item.id in NEBULAE, `${layer}: ${item.id}`).toBe(true);
      }
    }
  });

  it('neither overlap nor leave the frame at their stop', () => {
    expectTidy('nebulae', nebulae.map((item) => ({ item, radius: NEBULAE[item.id].radius * 0.8 })));
  });
});

describe('the globular clusters', () => {
  it('neither overlap nor leave the frame at their stop', () => {
    const unit = 10 ** stop('globulars').s / 2;
    const clusters = itemsFor('globulars').filter((item) => item.kind === 'globular');
    expect(clusters.length).toBeGreaterThanOrEqual(6);
    expectTidy('globulars', clusters.map((item) => ({ item, radius: globularRadius(item.size / unit) * 0.75 })));
  });
});

describe('the stars', () => {
  it('are all within sight at their stop, or on the way to it', () => {
    for (const layer of ['giants', 'brightStars', 'neighborhood']) {
      for (const item of itemsFor(layer)) {
        const p = onScreen(layer, item.pos);
        // Twice the frame: on screen at some point while the layer is fading in.
        expect(Math.abs(p.x), `${layer}: ${item.id}`).toBeLessThan(HALF_WIDTH * 2);
        expect(Math.abs(p.y), `${layer}: ${item.id}`).toBeLessThan(2);
      }
    }
  });
});
