import type { Rng } from '../util/rng';
import { mixRgb, scaleRgb, type PointBuf, type RGB } from './points';

type Vec3 = [number, number, number];

export interface WebOptions {
  /** Number of density peaks (clusters) the filaments connect. */
  nodes: number;
  points: number;
  /** Radius of the ball the web fills, layer-local units. */
  radius: number;
  /** Filament thickness as a fraction of `radius`. */
  thickness: number;
  colorA: RGB;
  colorB: RGB;
  px: [number, number];
  /** Keep a clear bubble around these points (voids). */
  voids?: { center: Vec3; radius: number }[];
  /** Squash the volume along z into a slab (1 = ball). Keeps the points where the camera looks. */
  flatten?: number;
  /** Fade the points out towards `radius`. */
  softEdge?: boolean;
  /** If given, receives large soft glows (draw it with a low `soft` material). */
  haze?: PointBuf;
}

/**
 * Cosmic web: random density peaks joined to their nearest neighbours by noisy, slightly
 * bowed filaments, with a faint diffuse background. Cheap, and reads as large-scale structure.
 */
export function cosmicWeb(buf: PointBuf, rng: Rng, o: WebOptions): void {
  const flatten = o.flatten ?? 1;
  const nodes: { p: Vec3; mass: number }[] = [];
  for (let i = 0; i < o.nodes; i++) {
    const [x, y, z] = rng.inSphere();
    nodes.push({ p: [x * o.radius, y * o.radius, z * o.radius * flatten], mass: rng.next() ** 2 });
  }

  // Bucket the nodes into a grid so each one only looks at its surroundings for neighbours.
  const volume = (4 / 3) * Math.PI * o.radius ** 3 * flatten;
  const cell = 1.6 * Math.cbrt(volume / o.nodes);
  const keyOf = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map<string, number[]>();
  nodes.forEach((node, i) => {
    const key = keyOf(node.p[0], node.p[1], node.p[2]);
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  });

  const edges: { a: Vec3; b: Vec3; bow: Vec3 }[] = [];
  const seen = new Set<number>();
  nodes.forEach((node, i) => {
    const near: { j: number; d: number }[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(keyOf(node.p[0] + dx * cell, node.p[1] + dy * cell, node.p[2] + dz * cell));
          if (!bucket) continue;
          for (const j of bucket) if (j !== i) near.push({ j, d: dist(node.p, nodes[j].p) });
        }
      }
    }
    near.sort((p, q) => p.d - q.d);
    for (const { j, d } of near.slice(0, 3)) {
      const key = i < j ? i * nodes.length + j : j * nodes.length + i;
      if (seen.has(key)) continue;
      seen.add(key);
      const [bx, by, bz] = rng.onSphere();
      const bow = d * 0.12;
      edges.push({ a: node.p, b: nodes[j].p, bow: [bx * bow, by * bow, bz * bow] });
    }
  });

  const inVoid = (p: Vec3) => o.voids?.some((v) => dist(p, v.center) < v.radius) ?? false;
  const sigma = o.thickness * o.radius;

  // A faint glow around the densest knots and along the filaments gives the web some volume.
  if (o.haze) {
    const glow: RGB = [0.3, 0.36, 0.85];
    for (const node of nodes) {
      if (node.mass < 0.25 || inVoid(node.p)) continue;
      const r = Math.hypot(node.p[0], node.p[1], node.p[2] / flatten) / o.radius;
      const edge = o.softEdge ? 1 - Math.max(0, (r - 0.7) / 0.3) ** 2 : 1;
      o.haze.add(node.p[0], node.p[1], node.p[2], scaleRgb(glow, 0.1 * node.mass * edge), cell * (0.5 + 0.5 * node.mass), 3, rng.next());
    }
    for (const e of edges) {
      const mid: Vec3 = [(e.a[0] + e.b[0]) / 2 + e.bow[0], (e.a[1] + e.b[1]) / 2 + e.bow[1], (e.a[2] + e.b[2]) / 2 + e.bow[2]];
      if (inVoid(mid)) continue;
      const r = Math.hypot(mid[0], mid[1], mid[2] / flatten) / o.radius;
      const edge = o.softEdge ? 1 - Math.max(0, (r - 0.7) / 0.3) ** 2 : 1;
      o.haze.add(mid[0], mid[1], mid[2], scaleRgb(glow, 0.035 * Math.max(0, edge)), dist(e.a, e.b) * 0.6, 3, rng.next());
    }
  }

  let placed = 0;
  let guard = 0;
  while (placed < o.points && guard++ < o.points * 20) {
    const roll = rng.next();
    let p: Vec3;
    let bright: number;
    if (roll < 0.6 && edges.length > 0) {
      const e = rng.pick(edges);
      const t = rng.next();
      const bend = Math.sin(Math.PI * t);
      const j = sigma * (0.4 + rng.next());
      p = [
        e.a[0] + (e.b[0] - e.a[0]) * t + e.bow[0] * bend + rng.gauss() * j,
        e.a[1] + (e.b[1] - e.a[1]) * t + e.bow[1] * bend + rng.gauss() * j,
        e.a[2] + (e.b[2] - e.a[2]) * t + e.bow[2] * bend + rng.gauss() * j,
      ];
      bright = 0.45 + 0.4 * rng.next();
    } else if (roll < 0.9) {
      const n = rng.pick(nodes);
      const j = sigma * (1.2 + 2.6 * n.mass);
      p = [n.p[0] + rng.gauss() * j, n.p[1] + rng.gauss() * j, n.p[2] + rng.gauss() * j];
      bright = 0.6 + 0.4 * rng.next();
    } else {
      const [x, y, z] = rng.inSphere();
      p = [x * o.radius, y * o.radius, z * o.radius * flatten];
      bright = 0.18 + 0.2 * rng.next();
    }
    const r = Math.hypot(p[0], p[1], p[2] / flatten) / o.radius;
    if (r > 1 || inVoid(p)) continue;
    // Soft outer edge, so the web never ends in a visible boundary.
    if (o.softEdge) bright *= 1 - Math.max(0, (r - 0.7) / 0.3) ** 2;
    const color = scaleRgb(mixRgb(o.colorA, o.colorB, rng.next()), bright);
    const px = o.px[0] + (o.px[1] - o.px[0]) * rng.next() ** 3;
    buf.add(p[0], p[1], p[2], color, 0, px, rng.next());
    placed++;
  }
}

export interface BlobOptions {
  center: Vec3;
  /** Gaussian sigma, layer-local units. */
  sigma: number;
  points: number;
  color: RGB;
  colorB?: RGB;
  px: [number, number];
  /** Squash along z (1 = round). */
  flatten?: number;
  /** Real diameter of each point, layer-local units. */
  size?: number;
}

/** A Gaussian clump: a galaxy cluster, a globular cluster, a dwarf galaxy. */
export function blob(buf: PointBuf, rng: Rng, o: BlobOptions): void {
  for (let i = 0; i < o.points; i++) {
    // Heavier core than a plain Gaussian.
    const r = o.sigma * (rng.next() < 0.5 ? 0.45 : 1);
    const color = scaleRgb(
      o.colorB ? mixRgb(o.color, o.colorB, rng.next()) : o.color,
      0.5 + 0.5 * rng.next(),
    );
    buf.add(
      o.center[0] + rng.gauss() * r,
      o.center[1] + rng.gauss() * r,
      o.center[2] + rng.gauss() * r * (o.flatten ?? 1),
      color,
      o.size ?? 0,
      o.px[0] + (o.px[1] - o.px[0]) * rng.next() ** 3,
      rng.next(),
    );
  }
}

export interface FieldOptions {
  points: number;
  radius: number;
  colors: RGB[];
  px: [number, number];
  /** Squash along z (1 = round). */
  flatten?: number;
  brightness?: [number, number];
}

/** Uniform scatter inside a ball: field galaxies, field stars. */
export function field(buf: PointBuf, rng: Rng, o: FieldOptions): void {
  const [b0, b1] = o.brightness ?? [0.3, 1];
  for (let i = 0; i < o.points; i++) {
    const [x, y, z] = rng.inSphere();
    const color = scaleRgb(rng.pick(o.colors), b0 + (b1 - b0) * rng.next());
    const px = o.px[0] + (o.px[1] - o.px[0]) * rng.next() ** 4;
    buf.add(x * o.radius, y * o.radius, z * o.radius * (o.flatten ?? 1), color, 0, px, rng.next());
  }
}

/** Soft overlapping puffs: nebulae, gas clouds, glows. Use with a low `soft` material. */
export function puff(
  buf: PointBuf,
  rng: Rng,
  center: Vec3,
  radius: number,
  color: RGB,
  count: number,
  brightness = 0.16,
): void {
  for (let i = 0; i < count; i++) {
    const spread = radius * 0.4;
    buf.add(
      center[0] + rng.gauss() * spread,
      center[1] + rng.gauss() * spread,
      center[2] + rng.gauss() * spread,
      scaleRgb(color, brightness * (0.5 + rng.next())),
      radius * (0.7 + 0.9 * rng.next()),
      3,
      rng.next(),
    );
  }
}

const OLD_STAR: RGB = [1.0, 0.88, 0.66];
const RED_GIANT: RGB = [1.0, 0.56, 0.3];
const BLUE_STRAGGLER: RGB = [0.66, 0.8, 1.0];

/**
 * A globular cluster: hundreds of thousands of old stars, packed ever more tightly towards
 * the centre (a Plummer sphere). A few red giants and blue stragglers stand out from the rest.
 * @param halfLight radius containing half of the stars, layer-local units
 */
export function globular(buf: PointBuf, rng: Rng, center: Vec3, halfLight: number, stars: number): void {
  const scale = halfLight * 0.766;
  for (let i = 0; i < stars; i++) {
    const r = scale / Math.sqrt(rng.range(0.03, 0.985) ** (-2 / 3) - 1);
    const [x, y, z] = rng.onSphere();
    const roll = rng.next();
    const standout = roll < 0.12;
    const color = roll < 0.08 ? RED_GIANT : standout ? BLUE_STRAGGLER : OLD_STAR;
    buf.add(
      center[0] + x * r,
      center[1] + y * r,
      center[2] + z * r,
      scaleRgb(color, standout ? 0.95 : 0.3 + 0.45 * rng.next()),
      0,
      standout ? 1.8 + rng.next() : 1 + 0.9 * rng.next() ** 3,
      rng.next(),
    );
  }
}

export interface BubbleOptions {
  center: Vec3;
  /** Semi-axes of the ellipsoid, layer-local units. */
  radii: Vec3;
  points: number;
  color: RGB;
  brightness: [number, number];
  px: [number, number];
  /** How lumpy the surface is: 0 = a perfect ellipsoid. */
  roughness?: number;
  /** Thickness of the skin, as a fraction of the radius. */
  skin?: number;
}

/**
 * A hollow bubble: points scattered over a lumpy ellipsoid. Seen from outside its edge looks
 * brightest, because that is where the line of sight runs along the skin.
 */
export function bubble(buf: PointBuf, rng: Rng, o: BubbleOptions): void {
  const rough = o.roughness ?? 0;
  const phase = [rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)];
  for (let i = 0; i < o.points; i++) {
    const [x, y, z] = rng.onSphere();
    const lumps = 0.5 * Math.sin(3 * x + phase[0]) * Math.cos(2 * y + phase[1]) + 0.5 * Math.sin(4 * z + phase[2]);
    const r = (1 + rough * lumps) * (1 + (o.skin ?? 0.03) * rng.gauss());
    buf.add(
      o.center[0] + x * r * o.radii[0],
      o.center[1] + y * r * o.radii[1],
      o.center[2] + z * r * o.radii[2],
      scaleRgb(o.color, o.brightness[0] + (o.brightness[1] - o.brightness[0]) * rng.next()),
      0,
      o.px[0] + (o.px[1] - o.px[0]) * rng.next() ** 3,
      rng.next(),
    );
  }
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
