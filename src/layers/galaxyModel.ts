/**
 * A stylised model of the Milky Way, shared by every layer that shows part of it so that
 * the arms line up as the camera zooms in.
 *
 * Coordinates: light-years, Sun at the origin, +x towards the galactic centre, +z north.
 */

/** Distance from the Sun to the galactic centre. */
export const R0 = 26_000;
export const DISC_RADIUS = 52_700;
export const DISC_SCALE = 9_500;
export const THIN_DISC_HEIGHT = 900;

/** Arms are log spirals r = ARM_R0 · exp(TAN_PITCH · (θ − θk)), starting at the ends of the bar. */
export const ARM_R0 = 14_760;
export const TAN_PITCH = 0.2217;
/** Perseus, Sagittarius, Scutum–Centaurus, Norma/Outer: evenly spaced, the first along the bar. */
const ARM_ANGLES = [-0.444, 1.127, 2.698, 4.268];
export const ARM_COUNT = ARM_ANGLES.length;
export const BAR_ANGLE = -0.444;

function wrapPi(a: number): number {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}

/** 0..1: how deep inside a spiral arm the point is. */
export function armFactor(x: number, y: number): number {
  const gx = x - R0;
  const r = Math.hypot(gx, y);
  let best = 0;
  if (r > ARM_R0 * 0.85) {
    const theta = Math.atan2(y, gx);
    const along = Math.log(r / ARM_R0) / TAN_PITCH;
    const width = 1700 + 0.035 * r;
    for (const start of ARM_ANGLES) {
      const dr = (r * TAN_PITCH * wrapPi(theta - start - along)) / width;
      best = Math.max(best, Math.exp(-dr * dr));
    }
    // Arms emerge gradually from the bar.
    best *= Math.min(1, (r - ARM_R0 * 0.85) / (ARM_R0 * 0.3));
  }
  // Orion Spur: the short local arm the Sun sits in.
  const spur = 0.75 * Math.exp(-((y / 7000) ** 2) - (x / 1500) ** 2);
  return Math.max(best, spur);
}

export interface GalaxyStar {
  x: number;
  y: number;
  z: number;
  /** 0..1 arm membership: young blue stars vs. old yellow ones. */
  arm: number;
  bulge: boolean;
}

interface Random {
  next(): number;
  gauss(): number;
}

/** Draw one star from the whole-galaxy distribution. */
export function sampleGalaxyStar(rng: Random, out: GalaxyStar): GalaxyStar {
  if (rng.next() < 0.2) {
    // Bulge and bar: an elongated Gaussian.
    const a = rng.gauss() * 6200;
    const b = rng.gauss() * 2600;
    const c = Math.cos(BAR_ANGLE);
    const s = Math.sin(BAR_ANGLE);
    out.x = R0 + a * c - b * s;
    out.y = a * s + b * c;
    out.z = rng.gauss() * 1900;
    out.arm = 0;
    out.bulge = true;
    return out;
  }
  for (;;) {
    // Exponential disc: r ~ Gamma(2, scale).
    const r = -DISC_SCALE * Math.log(Math.max(rng.next() * rng.next(), 1e-12));
    if (r > DISC_RADIUS) continue;
    const theta = rng.next() * Math.PI * 2;
    const x = R0 + r * Math.cos(theta);
    const y = r * Math.sin(theta);
    const arm = armFactor(x, y);
    if (rng.next() > 0.16 + 0.84 * arm) continue;
    const edge = 1 - Math.max(0, (r - DISC_RADIUS * 0.8) / (DISC_RADIUS * 0.2));
    if (rng.next() > edge) continue;
    // Two-sided exponential in height.
    const h = -THIN_DISC_HEIGHT * Math.log(Math.max(rng.next(), 1e-12));
    out.x = x;
    out.y = y;
    out.z = rng.next() < 0.5 ? h : -h;
    out.arm = arm;
    out.bulge = false;
    return out;
  }
}
