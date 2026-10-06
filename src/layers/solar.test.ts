import { describe, expect, it } from 'vitest';
import { itemsFor } from '../app/catalog';
import {
  EARTH_ON_SUN,
  EARTH_RADIUS,
  HELIOPAUSE,
  heliopauseRadius,
  inLayer,
  MOON_DISTANCE,
  MOON_LONGITUDE,
  beside,
  onDisc,
  PLACES,
  solarOrigin,
  solarView,
  SUN_AT_ITS_STOP,
  SUN_RADIUS,
  sunMinRadius,
  SUNSPOTS,
  terminationShockRadius,
  toScreen,
  fromScreen,
  type Vec3,
} from '../app/solarSystem';
import { journeyAt, progressToS, stopIndex, stopProgress, STOPS } from '../app/timeline';
import { AU } from '../util/format';
import { createLayer } from './index';
import { SHRINK_FROM, WORLDS } from './solar';

const stop = (id: string) => STOPS[stopIndex(id)];
const halfFrame = (id: string) => 10 ** stop(id).s / 2;

/** Half the frame is 1 unit high and, at 16:9, this wide. */
const HALF_WIDTH = 16 / 9;

const SOLAR_STOPS = STOPS.filter((s) => s.part === 'solar').map((s) => s.id);

/**
 * Where a point of the Solar System (AU) lands on screen while the camera rests at a stop, in
 * half-frames, and how much perspective enlarges things there.
 */
function onScreen(stopId: string, place: Vec3): { x: number; y: number; zoom: number } {
  const view = solarView(stopIndex(stopId), stop(stopId).s);
  const h = halfFrame(stopId);
  const [x, y, z] = toScreen([(place[0] * AU - view.focus[0]) / h, (place[1] * AU - view.focus[1]) / h, (place[2] * AU - view.focus[2]) / h]);
  // The camera is two half-frames in front of the focus plane.
  const zoom = 2 / (2 - (z - view.lift / h));
  return { x: x * zoom, y: y * zoom, zoom };
}

/** Radius a body is drawn at while the camera rests at a stop, in half-frames at the focus plane. */
function drawnRadius(name: keyof typeof WORLDS, stopId: string, group: keyof typeof SHRINK_FROM): number {
  const s = stop(stopId).s;
  const shrink = 10 ** (-0.9 * Math.max(0, s - SHRINK_FROM[group]));
  return Math.max(WORLDS[name].radius / halfFrame(stopId), WORLDS[name].min * shrink);
}

describe('the plane of the planets', () => {
  it('turns to the screen and back without loss', () => {
    const v: Vec3 = [0.3, -1.2, 0.7];
    fromScreen(toScreen(v)).forEach((c, i) => expect(c).toBeCloseTo(v[i], 12));
  });

  it('is seen from above: its north side faces the camera', () => {
    expect(toScreen([0, 0, 1])[2]).toBeGreaterThan(0);
    // The middle of a disc is the point that faces the camera.
    const [x, y, z] = toScreen(onDisc(0, 0));
    expect([x, y, z].map((c) => Math.round(c * 1e9) / 1e9)).toEqual([0, 0, 1]);
  });
});

describe('PLACES', () => {
  it('keep the planets in order, Earth at 1 AU', () => {
    const order = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const;
    const distances = order.map((name) => Math.hypot(...PLACES[name]));
    expect(distances[2]).toBeCloseTo(1, 9);
    for (let i = 1; i < distances.length; i++) expect(distances[i]).toBeGreaterThan(distances[i - 1]);
  });

  it('put both Voyagers outside the heliopause, and the dwarf planets inside it', () => {
    const nose = (HELIOPAUSE.longitude * Math.PI) / 180;
    const angleFromNose = (p: Vec3) => Math.acos((p[0] * Math.cos(nose) + p[1] * Math.sin(nose)) / Math.hypot(...p));
    for (const craft of ['voyager1', 'voyager2'] as const) {
      const p = PLACES[craft];
      expect(Math.hypot(...p), craft).toBeGreaterThan(heliopauseRadius(angleFromNose(p)) + 10);
    }
    for (const world of ['pluto', 'eris', 'haumea', 'makemake', 'sedna', 'gonggong', 'quaoar', 'orcus'] as const) {
      const p = PLACES[world];
      expect(Math.hypot(...p), world).toBeLessThan(heliopauseRadius(angleFromNose(p)));
    }
    // Voyager 1 is nearly a light-day out; Voyager 2 a good deal closer.
    expect(Math.hypot(...PLACES.voyager1)).toBeCloseTo(172, 0);
    expect(Math.hypot(...PLACES.voyager2)).toBeCloseTo(144, 0);
  });

  it('keep the termination shock inside the heliopause all the way round', () => {
    for (let angle = 0; angle <= 2.7; angle += 0.05) expect(terminationShockRadius(angle)).toBeLessThan(heliopauseRadius(angle));
  });

  it('light Earth from the side the camera is on', () => {
    // Earth is on the far side of the Sun: what we see of it is mostly day.
    expect(toScreen(PLACES.earth)[2]).toBeLessThan(-0.5);
  });
});

describe('layer origins', () => {
  it('are the Sun, and Earth for the last of them', () => {
    expect(solarOrigin('inner')).toEqual([0, 0, 0]);
    expect(solarOrigin('sun')).toEqual([0, 0, 0]);
    expect(inLayer('earthMoon', PLACES.earth).map((c) => Math.abs(c))).toEqual([0, 0, 0]);
    const moon = inLayer('earthMoon', beside(PLACES.earth, MOON_DISTANCE, MOON_LONGITUDE));
    expect(Math.hypot(...moon) * halfFrame('earthMoon')).toBeCloseTo(MOON_DISTANCE, -3);
  });
});

describe('solarView', () => {
  it('centres on the Sun all the way down to the inner planets', () => {
    for (const id of ['oort', 'farSolar', 'heliosphere', 'kuiper', 'outer', 'inner']) {
      const view = solarView(stopIndex(id), stop(id).s);
      expect(Math.hypot(...view.focus), id).toBe(0);
      expect(view.lift, id).toBe(0);
    }
  });

  it('passes the Sun instead of heading into it', () => {
    // At its own stop the Sun stands to the left of the middle, whole and large.
    const sun = onScreen('sun', PLACES.sun);
    const disc = SUN_RADIUS / halfFrame('sun');
    expect(sun.x).toBeCloseTo(SUN_AT_ITS_STOP[0], 6);
    expect(sun.y).toBeCloseTo(SUN_AT_ITS_STOP[1], 6);
    expect(disc).toBeGreaterThan(0.4);
    expect(Math.abs(sun.x) + disc).toBeLessThan(HALF_WIDTH);
    expect(Math.abs(sun.y) + disc).toBeLessThan(1);
    // The middle of the frame is never on the Sun's face from then on: the camera does not dive in.
    const from = stopProgress(stopIndex('sun'));
    const to = stopProgress(stopIndex('au'));
    let crossed = 0;
    let last = sun.x;
    for (let i = 0; i <= 400; i++) {
      const p = from + ((to - from) * i) / 400;
      const s = progressToS(p);
      const view = solarView(journeyAt(p), s);
      const [x, y] = toScreen(view.focus.map((c) => -c / (10 ** s / 2)) as Vec3);
      // It slides across the frame from left to right, and never back.
      expect(x).toBeGreaterThanOrEqual(last - 1e-9);
      if (last < 0 && x >= 0) crossed++;
      last = x;
      expect(Math.hypot(x, y)).toBeLessThan(1);
    }
    expect(crossed).toBe(1);
  });

  it('shows the Sun and Earth together half-way, then centres on Earth', () => {
    const half = solarView(stopIndex('au'), stop('au').s);
    half.focus.forEach((c, i) => expect(c).toBeCloseTo((PLACES.earth[i] * AU) / 2, 0));
    expect(half.lift).toBe(0);
    for (const id of ['earthMoon', 'earth']) {
      const view = solarView(stopIndex(id), stop(id).s);
      view.focus.forEach((c, i) => expect(c).toBeCloseTo(PLACES.earth[i] * AU, 0));
      expect(view.lift).toBe(EARTH_RADIUS);
    }
  });

  it('glides: the view never jumps while scrolling from the planets to Earth', () => {
    const from = stopProgress(stopIndex('inner'));
    const to = stopProgress(stopIndex('earth'));
    const steps = 6000;
    let previous: { focus: Vec3; lift: number; s: number } | null = null;
    for (let i = 0; i <= steps; i++) {
      const p = from + ((to - from) * i) / steps;
      const s = progressToS(p);
      const view = solarView(journeyAt(p), s);
      if (previous) {
        // Sideways and in depth, as a fraction of the frame: a step must stay a small nudge.
        const frame = 10 ** Math.min(s, previous.s);
        const moved = Math.hypot(view.focus[0] - previous.focus[0], view.focus[1] - previous.focus[1], view.focus[2] - previous.focus[2]);
        expect(moved / frame, `p=${p}`).toBeLessThan(0.02);
        expect(Math.abs(view.lift - previous.lift) / frame, `p=${p}`).toBeLessThan(0.02);
      }
      previous = { focus: [...view.focus] as Vec3, lift: view.lift, s };
    }
  });
});

describe('sizes', () => {
  it('are true to life at the Earth & Moon stop', () => {
    expect(WORLDS.earth.radius / halfFrame('earthMoon')).toBeGreaterThan(WORLDS.earth.min);
    // The Moon is nearer to the camera than Earth, and perspective cannot make up for more than that.
    expect(WORLDS.moon.radius / halfFrame('earthMoon')).toBeGreaterThan(WORLDS.moon.min);
  });

  it('are true to life for the Sun at its own stop', () => {
    expect(SUN_RADIUS / halfFrame('sun')).toBeGreaterThan(sunMinRadius(stop('sun').s));
    // ...and far from it among the planets.
    expect(SUN_RADIUS / halfFrame('inner')).toBeLessThan(sunMinRadius(stop('inner').s) / 10);
  });

  it('put no moon inside the disc of its planet', () => {
    // Moons keep at least 1.4 drawn radii from their planet's centre (see MOONS in solar.ts).
    expect(WORLDS.jupiter.min).toBeGreaterThan(WORLDS.io.min * 4);
  });
});

describe('the stops', () => {
  it('draw an Earth-sized circle on the Sun’s face, clear of its spots', () => {
    for (const spot of SUNSPOTS) {
      const gap = Math.hypot(spot.x - EARTH_ON_SUN.x, spot.y - EARTH_ON_SUN.y) * SUN_RADIUS;
      expect(gap).toBeGreaterThan(spot.radius * SUN_RADIUS + EARTH_RADIUS);
    }
    expect(Math.hypot(EARTH_ON_SUN.x, EARTH_ON_SUN.y)).toBeLessThan(0.5);
  });

  it('show the Sun and Earth well apart and both in frame half-way', () => {
    const sun = onScreen('au', PLACES.sun);
    const earth = onScreen('au', PLACES.earth);
    for (const p of [sun, earth]) {
      expect(Math.abs(p.x)).toBeLessThan(1.2);
      expect(Math.abs(p.y)).toBeLessThan(0.8);
    }
    expect(Math.hypot(sun.x - earth.x, sun.y - earth.y)).toBeGreaterThan(0.7);
  });

  it('keep the Moon in frame beside Earth', () => {
    const moon = onScreen('earthMoon', beside(PLACES.earth, MOON_DISTANCE, MOON_LONGITUDE));
    expect(Math.abs(moon.x)).toBeLessThan(HALF_WIDTH * 0.85);
    expect(Math.abs(moon.y)).toBeLessThan(0.85);
  });

  it('draw the planets in frame at their stops, without one covering another', () => {
    const scenes: { stop: string; bodies: [keyof typeof WORLDS, keyof typeof SHRINK_FROM][] }[] = [
      { stop: 'outer', bodies: [['jupiter', 'giants'], ['saturn', 'giants'], ['uranus', 'giants'], ['neptune', 'giants']] },
      { stop: 'inner', bodies: [['mercury', 'inner'], ['venus', 'inner'], ['earth', 'inner'], ['mars', 'inner'], ['ceres', 'inner'], ['vesta', 'inner'], ['jupiter', 'giants']] },
      { stop: 'kuiper', bodies: [['pluto', 'dwarfs'], ['haumea', 'dwarfs'], ['makemake', 'dwarfs'], ['quaoar', 'dwarfs'], ['orcus', 'dwarfs'], ['arrokoth', 'dwarfs'], ['eris', 'dwarfs'], ['neptune', 'giants']] },
      { stop: 'heliosphere', bodies: [['eris', 'dwarfs'], ['sedna', 'dwarfs'], ['gonggong', 'dwarfs']] },
    ];
    for (const scene of scenes) {
      const sun = { id: 'sun', x: 0, y: 0, r: Math.max(SUN_RADIUS / halfFrame(scene.stop), sunMinRadius(stop(scene.stop).s)) };
      const placed = scene.bodies.map(([name, group]) => {
        const p = onScreen(scene.stop, PLACES[name as keyof typeof PLACES]);
        // Saturn's rings reach more than twice as far as its globe.
        const reach = name === 'saturn' ? 2.3 : 1;
        return { id: name as string, x: p.x, y: p.y, r: drawnRadius(name, scene.stop, group) * reach };
      });
      for (const a of placed) {
        expect(Math.abs(a.x) + a.r, `${scene.stop}: ${a.id} runs off the side`).toBeLessThan(HALF_WIDTH);
        expect(Math.abs(a.y) + a.r, `${scene.stop}: ${a.id} runs off the top or bottom`).toBeLessThan(1);
        for (const b of [...placed, sun]) {
          if (a.id >= b.id) continue;
          expect(Math.hypot(a.x - b.x, a.y - b.y), `${scene.stop}: ${a.id} / ${b.id}`).toBeGreaterThan(a.r + b.r);
        }
      }
    }
  });
});

describe('the Solar System layers', () => {
  const layers = SOLAR_STOPS.map((id) => createLayer(stop(id)));

  it('are built for every stop from the Oort Cloud to the Moon', () => {
    expect(SOLAR_STOPS).toEqual(['oort', 'farSolar', 'heliosphere', 'kuiper', 'outer', 'inner', 'sun', 'au', 'earthMoon']);
    expect(layers.length).toBe(SOLAR_STOPS.length);
  });

  it('draw every planet, dwarf planet and moon as a globe, not as a marker dot', () => {
    for (const layer of layers) {
      layer.update({ s: layer.stop.s, at: stopIndex(layer.stop.id), t: 0, viewportH: 1080, aspect: 16 / 9, dpr: 1 }, 1);
      for (const anchor of layer.anchors) {
        const { item } = anchor;
        if (item.noMarker || !['planet', 'dwarf', 'moon'].includes(item.kind)) continue;
        // A body the layer draws gets its label pushed clear of its disc.
        expect(anchor.radius, `${layer.stop.id}: ${item.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('stand their moons clear of the planets they belong to', () => {
    const outer = layers[SOLAR_STOPS.indexOf('outer')];
    outer.update({ s: outer.stop.s, at: stopIndex('outer'), t: 12.5, viewportH: 1080, aspect: 16 / 9, dpr: 1 }, 1);
    const find = (id: string) => outer.anchors.find((a) => a.item.id === id)!;
    for (const [moon, planet] of [['galilean-moons', 'jupiter'], ['titan', 'saturn'], ['triton', 'neptune']]) {
      const gap = find(moon).local.distanceTo(find(planet).local);
      expect(gap, moon).toBeGreaterThan(find(planet).radius);
      // ...and close enough to be seen as belonging to it.
      expect(gap, moon).toBeLessThan(0.3);
    }
  });

  it('have a label for everything named in the catalog', () => {
    for (const layer of layers) expect(layer.anchors.length, layer.stop.id).toBe(itemsFor(layer.stop.id).length);
  });
});
