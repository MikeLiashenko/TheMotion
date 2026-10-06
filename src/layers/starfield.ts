import * as THREE from 'three';
import { Rng } from '../util/rng';
import { CAM_DIST } from './constants';
import { PointBuf, pointsMaterial, scaleRgb, type LayerUniforms, type RGB } from './points';

const STAR_COLORS: RGB[] = [
  [1.0, 0.7, 0.5],
  [1.0, 0.84, 0.66],
  [1.0, 0.95, 0.86],
  [1.0, 1.0, 1.0],
  [0.82, 0.9, 1.0],
  [0.68, 0.8, 1.0],
];

/** How far behind the focus plane the sky is hung, world units. Anything large will do. */
const DISTANCE = 600;

/**
 * The sky behind the Solar System: stars and the band of the Milky Way. At these scales the
 * stars are so far away that zooming does not move them, so the sky is fixed to the screen:
 * add it to a layer's scene, not to its rescaled root. Every layer that uses it gets the very
 * same sky, so it holds still while the layers crossfade.
 *
 * A generated sky, not a star map.
 */
export function starfield(u: LayerUniforms): THREE.Group {
  const rng = new Rng('solar-sky');
  const stars = new PointBuf();
  const haze = new PointBuf();
  // Points are placed by where they appear: (x, y) in units of the frame height, wide enough for any screen.
  const place = (buf: PointBuf, x: number, y: number, color: RGB, px: number) => {
    buf.add(x * DISTANCE, y * DISTANCE, CAM_DIST - DISTANCE, color, 0, px, rng.next());
  };

  // (Over three frame-heights from top to bottom: a narrow window sees that much, see app/engine.ts.)
  for (let i = 0; i < 7000; i++) {
    // Most stars are faint; a few stand out.
    const bright = rng.next() ** 7;
    place(stars, rng.range(-1.35, 1.35), rng.range(-1.7, 1.7), scaleRgb(rng.pick(STAR_COLORS), 0.14 + 0.2 * rng.next() + 0.7 * bright), 1 + 1.9 * bright);
  }

  // The Milky Way: a band of countless faint stars crossing the upper part of the frame.
  const band = (x: number) => 0.33 - 0.2 * x + 0.03 * Math.sin(x * 2.3);
  for (let i = 0; i < 7000; i++) {
    const x = rng.range(-1.35, 1.35);
    const spread = 0.045 + 0.025 * Math.sin(x * 3.1 + 1) ** 2;
    const y = band(x) + rng.gauss() * spread;
    place(stars, x, y, scaleRgb(rng.pick(STAR_COLORS), 0.07 + 0.16 * rng.next()), 1 + 0.5 * rng.next());
  }
  for (let i = 0; i < 46; i++) {
    const x = rng.range(-1.35, 1.35);
    const warm = rng.next();
    place(haze, x, band(x) + rng.gauss() * 0.02, scaleRgb([0.55 + 0.3 * warm, 0.6 + 0.1 * warm, 0.95 - 0.25 * warm], 0.022 + 0.02 * rng.next()), rng.range(110, 230));
  }

  const sky = new THREE.Group();
  sky.add(haze.toPoints(pointsMaterial(u, { soft: 1.3 })));
  sky.add(stars.toPoints(pointsMaterial(u, { soft: 2.6, twinkle: 0.25 })));
  sky.renderOrder = -1;
  return sky;
}
