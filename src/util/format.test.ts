import { describe, expect, it } from 'vitest';
import { friendly, scaleBar, scientific, superscript } from './format';
import { Rng } from './rng';

describe('scientific', () => {
  it('formats large and small lengths', () => {
    expect(scientific(8.8e26)).toBe('8.8 × 10²⁶ m');
    expect(scientific(1.2742e7)).toBe('1.3 × 10⁷ m');
    expect(scientific(2e-10)).toBe('2.0 × 10⁻¹⁰ m');
  });

  it('never shows a mantissa of 10', () => {
    expect(scientific(9.99e5)).toBe('1.0 × 10⁶ m');
  });

  it('writes exponents as superscripts', () => {
    expect(superscript(-10)).toBe('⁻¹⁰');
    expect(superscript(27)).toBe('²⁷');
  });
});

describe('friendly', () => {
  it('picks a readable unit for every scale', () => {
    expect(friendly(8.8e26)).toBe('93 billion light-years');
    expect(friendly(9.4607e20)).toBe('100,000 light-years');
    expect(friendly(4.5e12)).toBe('30 AU');
    expect(friendly(1.2742e7)).toBe('13,000 km');
    expect(friendly(0.1)).toBe('10 cm');
    expect(friendly(2e-9)).toBe('2 nm');
    expect(friendly(1.4e-10)).toBe('140 pm');
    // Below a picometre, femtometres: the nucleus of an atom is a few of them across.
    expect(friendly(5.7e-14)).toBe('57 fm');
    expect(friendly(2.4e-15)).toBe('2.4 fm');
  });
});

describe('scaleBar', () => {
  it('rounds down to 1, 2 or 5 of a unit', () => {
    expect(scaleBar(8.8e26)).toEqual({ meters: 50 * 1e9 * 9.4607e15, label: '50 billion light-years' });
    expect(scaleBar(3500)).toEqual({ meters: 2000, label: '2 km' });
    expect(scaleBar(0.7e-9).label).toBe('500 pm');
    expect(scaleBar(0.57e-15).label).toBe('0.5 fm');
  });

  it('never exceeds the available length', () => {
    for (let e = -16; e < 27; e += 0.37) {
      const max = 10 ** e;
      expect(scaleBar(max).meters).toBeLessThanOrEqual(max * (1 + 1e-9));
      expect(scaleBar(max).meters).toBeGreaterThan(max / 5.01);
    }
  });
});

describe('Rng', () => {
  it('is reproducible from its seed', () => {
    const a = new Rng('universe');
    const b = new Rng('universe');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('gives different streams for different seeds', () => {
    expect(new Rng('universe').next()).not.toBe(new Rng('atom').next());
  });

  it('stays inside its ranges', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(Math.hypot(...rng.inSphere())).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
