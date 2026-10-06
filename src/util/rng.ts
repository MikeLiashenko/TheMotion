/** Seeded PRNG (mulberry32). Every "random" thing in the scene goes through this so frames are reproducible. */
export class Rng {
  private a: number;

  constructor(seed: number | string) {
    this.a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  /** Standard normal (Box-Muller). */
  gauss(): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Uniform point on the unit sphere. */
  onSphere(): [number, number, number] {
    const z = this.range(-1, 1);
    const a = this.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), r * Math.sin(a), z];
  }

  /** Uniform point inside the unit ball. */
  inSphere(): [number, number, number] {
    const [x, y, z] = this.onSphere();
    const r = Math.cbrt(this.next());
    return [x * r, y * r, z * r];
  }
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
