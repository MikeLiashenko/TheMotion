import { describe, expect, it } from 'vitest';
import { LAYER_STOP_IDS } from '../layers';
import { CATALOG } from './catalog';
import { journeyAt, layerWeights, progressToS, S_END, S_START, stopProgress, STOPS, TOTAL_VH } from './timeline';

describe('progressToS', () => {
  it('starts at the observable universe, comes to the atom, and ends inside its nucleus', () => {
    expect(progressToS(0)).toBeCloseTo(S_START, 6);
    expect(progressToS(1)).toBeCloseTo(S_END, 6);
    // 1.6 × 10²⁷ m down to 2 × 10⁻¹⁰ m at the atom, and on to a few femtometres.
    expect(10 ** S_START).toBeGreaterThan(8.8e26);
    expect(10 ** STOPS.find((stop) => stop.id === 'atom')!.s).toBeLessThan(3e-10);
    expect(10 ** S_END).toBeLessThan(3e-15);
    expect(STOPS.slice(-2).map((stop) => stop.part)).toEqual(['atom', 'atom']);
  });

  it('clamps out-of-range progress', () => {
    expect(progressToS(-1)).toBeCloseTo(S_START, 6);
    expect(progressToS(2)).toBeCloseTo(S_END, 6);
  });

  it('never jumps', () => {
    const steps = 20_000;
    let previous = progressToS(0);
    for (let i = 1; i <= steps; i++) {
      const s = progressToS(i / steps);
      // One step is 1/20000 of the journey; the zoom must stay gentle everywhere.
      expect(Math.abs(s - previous)).toBeLessThan(0.02);
      previous = s;
    }
  });

  it('heads straight for the next stop on every leg, without turning back on the way', () => {
    for (let i = 0; i < STOPS.length - 1; i++) {
      const direction = Math.sign(STOPS[i + 1].s - STOPS[i].s);
      const from = stopProgress(i);
      const to = stopProgress(i + 1);
      let previous = progressToS(from);
      for (let k = 1; k <= 400; k++) {
        const s = progressToS(from + ((to - from) * k) / 400);
        expect((s - previous) * direction, `${STOPS[i].id} → ${STOPS[i + 1].id}`).toBeGreaterThanOrEqual(-1e-9);
        previous = s;
      }
    }
  });

  it('passes exactly through each stop', () => {
    STOPS.forEach((stop, i) => {
      expect(Math.abs(progressToS(stopProgress(i)) - stop.s), stop.id).toBeLessThan(1e-9);
    });
  });
});

describe('the pace of the zoom', () => {
  it('is even: the wheel never meets a stretch where the picture stands still, nor one where it lurches', () => {
    // Decades of scale per screen-height of scrolling, sampled all along the journey.
    const step = 4 / TOTAL_VH;
    const rates: number[] = [];
    // (As far as the atom: beyond it lies a stretch with nothing in it, which is hurried through.)
    const end = stopProgress(STOPS.findIndex((stop) => stop.id === 'atom'));
    for (let p = 0.03; p < end; p += step) rates.push(Math.abs(progressToS(p + step) - progressToS(p)) / 0.04);
    const typical = [...rates].sort((a, b) => a - b)[Math.floor(rates.length / 2)];
    // A notch of a mouse wheel is about a tenth of a screen: a step of the zoom of well under a factor of two.
    expect(typical).toBeGreaterThan(1.2);
    expect(typical).toBeLessThan(2.2);
    for (const rate of rates) expect(rate).toBeLessThan(typical * 1.45);
    // It slows down only where the trip matters more than the scale (and where the zoom turns round, by the Sun).
    const slow = rates.filter((rate) => rate < typical * 0.5).length / rates.length;
    expect(slow).toBeLessThan(0.14);
  });

  it('rests at the very start, while the title card clears, and at the very end', () => {
    expect(progressToS(0.003)).toBeCloseTo(S_START, 2);
    // The first notch of the wheel already moves the picture.
    expect(S_START - progressToS(20 / TOTAL_VH)).toBeGreaterThan(0.02);
    expect(progressToS(0.995)).toBeCloseTo(S_END, 2);
  });
});

describe('journeyAt', () => {
  it('counts the stops: a whole number at each', () => {
    STOPS.forEach((stop, i) => {
      expect(Math.abs(journeyAt(stopProgress(i)) - i), stop.id).toBeLessThan(1e-6);
    });
    expect(journeyAt(0)).toBe(0);
    expect(journeyAt(1)).toBe(STOPS.length - 1);
  });

  it('only ever moves forward, without jumps, even where the zoom turns round', () => {
    const steps = 20_000;
    let previous = journeyAt(0);
    for (let i = 1; i <= steps; i++) {
      const at = journeyAt(i / steps);
      expect(at).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(at - previous).toBeLessThan(0.02);
      previous = at;
    }
  });
});

describe('STOPS', () => {
  it('run from the largest scale to the smallest, but for one step back from the Sun', () => {
    const steppingBack = STOPS.filter((stop, i) => i > 0 && stop.s >= STOPS[i - 1].s).map((stop) => stop.id);
    expect(steppingBack).toEqual(['au']);
  });

  it('have unique ids', () => {
    expect(new Set(STOPS.map((s) => s.id)).size).toBe(STOPS.length);
  });

  it('each have a layer to draw them', () => {
    expect([...LAYER_STOP_IDS].sort()).toEqual(STOPS.map((s) => s.id).sort());
  });

  it('give a journey of a sensible length', () => {
    expect(TOTAL_VH).toBeGreaterThan(1500);
    expect(TOTAL_VH).toBeLessThan(3500);
  });
});

describe('layerWeights', () => {
  it('shows exactly one layer at full strength on every stop', () => {
    STOPS.forEach((_, i) => {
      const weights = layerWeights(i);
      weights.forEach((w, j) => expect(w).toBeCloseTo(i === j ? 1 : 0, 6));
    });
  });

  it('crossfades neighbours so that total opacity stays at 1', () => {
    for (let at = 0; at <= STOPS.length - 1; at += 0.0137) {
      const weights = layerWeights(at);
      expect(weights.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 6);
      expect(weights.filter((w) => w > 0).length).toBeLessThanOrEqual(2);
    }
  });

  it('shows a stop alone for a while around it', () => {
    // Close to a stop, a tenth of the way to either neighbour, nothing else has started to fade in.
    STOPS.forEach((stop, i) => {
      for (const side of [-1, 1]) {
        if (STOPS[i + side]) expect(layerWeights(i + side * 0.1)[i], stop.id).toBeCloseTo(1, 6);
      }
    });
  });
});

describe('CATALOG', () => {
  it('has unique ids', () => {
    expect(new Set(CATALOG.map((item) => item.id)).size).toBe(CATALOG.length);
  });

  it('only refers to layers that exist', () => {
    const ids = new Set(STOPS.map((stop) => stop.id));
    for (const item of CATALOG) expect(ids.has(item.layer), `${item.id} → ${item.layer}`).toBe(true);
  });

  it('keeps every object positive in size and close enough to be seen on the way in', () => {
    for (const item of CATALOG) {
      expect(item.size, item.id).toBeGreaterThan(0);
      // Within 4 half-frames of the layer's centre: visible at some point while its layer is on screen.
      expect(Math.hypot(...item.pos), item.id).toBeLessThan(4);
    }
  });
});
