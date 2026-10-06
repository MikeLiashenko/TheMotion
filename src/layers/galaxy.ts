import * as THREE from 'three';
import { itemsFor } from '../app/catalog';
import { galactic } from '../app/sky';
import { STOPS } from '../app/timeline';
import { LIGHT_YEAR } from '../util/format';
import {
  ARM_COUNT,
  ARM_R0,
  armFactor,
  BAR_ANGLE,
  DISC_RADIUS,
  DISC_SCALE,
  R0,
  sampleGalaxyStar,
  TAN_PITCH,
  THIN_DISC_HEIGHT,
  type GalaxyStar,
} from './galaxyModel';
import { GalaxyBuf, LOOKS, type GalaxyLook } from './galaxySprites';
import { blob, bubble, globular, puff } from './gen';
import { Layer, type FrameState } from './layer';
import { homeMagnification } from './magnify';
import { addNebula, NEBULAE } from './nebulaLooks';
import { NebulaBuf } from './nebulaSprites';
import { mixRgb, PointBuf, pointsMaterial, scaleRgb, type LayerUniforms, type RGB } from './points';

type Vec3 = [number, number, number];

const BULGE: RGB = [1.0, 0.8, 0.52];
const OLD: RGB = [1.0, 0.9, 0.74];
const YOUNG: RGB = [0.68, 0.8, 1.0];
const HII: RGB = [1.0, 0.32, 0.5];

/** Rough stellar colours, weighted towards the dim red and orange stars that dominate by number. */
const STAR_COLORS: RGB[] = [
  [1.0, 0.62, 0.42],
  [1.0, 0.62, 0.42],
  [1.0, 0.76, 0.56],
  [1.0, 0.76, 0.56],
  [1.0, 0.92, 0.78],
  [1.0, 0.98, 0.94],
  [0.8, 0.88, 1.0],
  [0.62, 0.76, 1.0],
];

/**
 * The camera's path around the galaxy, as poses to rest in at three stops. `tilt` is how far
 * the disc is tipped away from face-on (π/2 = edge-on, beyond that we are looking at its
 * underside); `spin` turns it about its own axis.
 */
const VIEW_POSES = [
  // From outside: an oblique disc, its centre up and to the right.
  { stop: 'milkyWay', tilt: 0.95, spin: 0.5 },
  // Among the halo: nearly edge-on, so that what lies above and below the disc can be seen.
  { stop: 'globulars', tilt: 1.32, spin: 0.1 },
  // Inside the disc, having dived through its plane: almost a map, seen from the south, the
  // galactic centre to the right.
  { stop: 'nebulae', tilt: Math.PI - 0.42, spin: 0 },
].map((pose) => ({ ...pose, s: STOPS.find((stop) => stop.id === pose.stop)!.s }));

/**
 * How every layer inside the Milky Way is turned at scale `s`. They all use this one function,
 * so they stay aligned while they crossfade. Anything in a group with this rotation is in
 * galactic coordinates (see app/sky.ts).
 */
export function galacticView(s: number, target = new THREE.Euler()): THREE.Euler {
  let from = VIEW_POSES[0];
  let to = VIEW_POSES[0];
  for (let i = 0; i < VIEW_POSES.length - 1; i++) {
    if (s <= VIEW_POSES[i].s) {
      from = VIEW_POSES[i];
      to = VIEW_POSES[i + 1];
    }
  }
  // Ease in and out of every pose, so the camera is at rest whenever the journey is.
  const c = from === to ? 0 : Math.min(1, Math.max(0, (from.s - s) / (from.s - to.s)));
  const t = c * c * (3 - 2 * c);
  return target.set(-(from.tilt + (to.tilt - from.tilt) * t), 0, from.spin + (to.spin - from.spin) * t);
}

/** The view from outside, for the layers that show the Milky Way as one galaxy among others. */
export const GALACTIC_VIEW = galacticView(VIEW_POSES[0].s);

/** Radius of the sprite that draws the Milky Way, in light-years; its disc ends at 95% of this. */
const MILKY_WAY_BOUND = DISC_RADIUS / 0.95;
/** How far out the Milky Way is bright enough to read as "the galaxy", in light-years. */
export const MILKY_WAY_VISIBLE_LY = MILKY_WAY_BOUND * 0.62;

/** The Milky Way as a galaxy sprite, with the same bar and the same four arms as the star model. */
const MILKY_WAY_LOOK: GalaxyLook = {
  ...LOOKS.multiArm,
  arms: ARM_COUNT,
  pitch: TAN_PITCH,
  armContrast: 0.85,
  bar: ARM_R0 / MILKY_WAY_BOUND,
  bulge: 3000 / MILKY_WAY_BOUND,
  bulgeFlatten: 0.7,
  bulgeLight: 1.3,
  discScale: DISC_SCALE / MILKY_WAY_BOUND,
  thickness: (THIN_DISC_HEIGHT * 1.3) / MILKY_WAY_BOUND,
  dust: 1.3,
  starFormation: 0.85,
  flocculence: 0.3,
};

/** The Magellanic Clouds: place on the sky, distance and the bounding radius of the sprite, in light-years. */
export const MAGELLANIC_CLOUDS = [
  { id: 'lmc', l: 280.5, b: -32.9, distance: 163_000, radius: 23_000, look: { ...LOOKS.irregular, bar: 0.3 }, incl: 35, pa: 40 },
  { id: 'smc', l: 302.8, b: -44.3, distance: 200_000, radius: 13_500, look: LOOKS.irregular, incl: 60, pa: 110 },
] as const;

/**
 * The Milky Way and its two largest satellites as galaxy sprites, in galactic coordinates.
 * @param unitLy light-years per unit of the space the mesh is added to
 */
export function milkyWaySprites(u: LayerUniforms, unitLy: number, brightness = 1): THREE.InstancedMesh {
  const buf = new GalaxyBuf();
  buf.add({
    center: [R0 / unitLy, 0, 0],
    radius: MILKY_WAY_BOUND / unitLy,
    look: MILKY_WAY_LOOK,
    spin: BAR_ANGLE,
    seed: 11.3,
    brightness,
  });
  MAGELLANIC_CLOUDS.forEach((cloud, i) => {
    const [x, y, z] = galactic(cloud.l, cloud.b, cloud.distance);
    buf.add({
      center: [x / unitLy, y / unitLy, z / unitLy],
      radius: cloud.radius / unitLy,
      look: cloud.look,
      incl: cloud.incl,
      pa: cloud.pa,
      seed: 40.5 + i * 9.1,
    });
  });
  return buf.toMesh(u);
}

/**
 * The Milky Way system for the layers that see it from outside: a group in galactic
 * coordinates, already turned to the outside view. Scale it to magnify the system about the Sun.
 */
export function milkyWaySystem(u: LayerUniforms, unitLy: number): THREE.Group {
  const group = new THREE.Group();
  group.rotation.copy(GALACTIC_VIEW);
  group.add(milkyWaySprites(u, unitLy));
  return group;
}

/**
 * Base of every layer inside the Milky Way. Stars come from one shared model of the galaxy,
 * so the spiral arms seen from outside are the same arms the camera then dives into.
 */
export abstract class GalacticLayer extends Layer {
  /** Light-years per layer unit. */
  protected get unitLy(): number {
    return this.unitM / LIGHT_YEAR;
  }

  protected animate(state: FrameState): void {
    galacticView(state.s, this.content.rotation);
  }

  /**
   * Stars drawn from the whole-galaxy model, kept if they fall within `extent` units of the Sun.
   * @param sprite true where a galaxy sprite underneath already supplies the glow of the bulge
   */
  protected galaxyStars(count: number, extent: number, px: [number, number], sprite: boolean, gasClouds = true): void {
    const unitLy = this.unitLy;
    const stars = new PointBuf();
    const gas = new PointBuf();
    const star: GalaxyStar = { x: 0, y: 0, z: 0, arm: 0, bulge: false };
    const limit = extent * unitLy;
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < count * 40) {
      sampleGalaxyStar(this.rng, star);
      if (Math.hypot(star.x, star.y, star.z) > limit) continue;
      placed++;
      const x = star.x / unitLy;
      const y = star.y / unitLy;
      const z = star.z / unitLy;
      const base = star.bulge ? BULGE : mixRgb(OLD, YOUNG, star.arm);
      // Over a sprite, the bulge's stars only add grain to its glow.
      const bulgeLight = sprite ? 0.5 : 1;
      const bright = star.bulge ? (0.34 + 0.4 * this.rng.next()) * bulgeLight : 0.22 + 0.6 * this.rng.next() * (0.4 + 0.6 * star.arm);
      stars.add(x, y, z, scaleRgb(base, bright), 0, px[0] + (px[1] - px[0]) * this.rng.next() ** 5, this.rng.next());
      // Glowing hydrogen clouds trace the arms.
      if (gasClouds && star.arm > 0.75 && this.rng.next() < 0.0016) {
        puff(gas, this.rng, [x, y, z], 300 / unitLy, HII, 3, 0.22);
      }
    }
    if (!sprite) puff(gas, this.rng, [R0 / unitLy, 0, 0], 11_000 / unitLy, BULGE, 6, 0.1);
    this.content.add(gas.toPoints(pointsMaterial(this.uniforms, { soft: 1.3 })));
    this.content.add(stars.toPoints(pointsMaterial(this.uniforms, { soft: 2.6, twinkle: 0.2 })));
  }

  /** A sparse spherical halo of old stars around the galactic centre. */
  protected haloStars(radius: number, count: number): void {
    const buf = new PointBuf();
    const cx = R0 / this.unitLy;
    for (let i = 0; i < count; i++) {
      const [x, y, z] = this.rng.inSphere();
      const r = this.rng.next() ** 1.5 * radius;
      buf.add(cx + x * r, y * r, z * r, scaleRgb(OLD, 0.12 + 0.2 * this.rng.next()), 0, 1 + this.rng.next(), this.rng.next());
    }
    this.content.add(buf.toPoints(pointsMaterial(this.uniforms, { soft: 2.6 })));
  }

  /** A uniform field of nearby stars, denser inside the arms and flattened into the disc. */
  protected localStars(count: number, extent: number, flatten: number): void {
    const unitLy = this.unitLy;
    const buf = new PointBuf();
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < count * 20) {
      const [x, y, z] = this.rng.inSphere();
      const lx = x * extent;
      const ly = y * extent;
      const arm = armFactor(lx * unitLy, ly * unitLy);
      if (this.rng.next() > 0.3 + 0.7 * arm) continue;
      placed++;
      const color = this.rng.pick(STAR_COLORS);
      // A few stars are far brighter than the rest.
      const luminous = this.rng.next() ** 6;
      buf.add(lx, ly, z * extent * flatten, scaleRgb(color, 0.25 + 0.75 * luminous + 0.2 * this.rng.next()), 0, 1 + 2.4 * luminous, this.rng.next());
    }
    this.content.add(buf.toPoints(pointsMaterial(this.uniforms, { soft: 2.8, twinkle: 0.3 })));
  }

  /**
   * The Fermi Bubbles: two lobes of hot gas rising above and below the galactic centre,
   * discovered in gamma rays. Drawn in the false colour of those maps.
   */
  protected fermiBubbles(brightness: number): void {
    const unitLy = this.unitLy;
    const skin = new PointBuf();
    const glow = new PointBuf();
    const color: RGB = [0.78, 0.36, 1.0];
    for (const side of [-1, 1]) {
      const center: Vec3 = [R0 / unitLy, 0, (side * 12_500) / unitLy];
      bubble(skin, this.rng, {
        center,
        radii: [10_500 / unitLy, 10_500 / unitLy, 12_500 / unitLy],
        points: 24_000,
        color,
        brightness: [0.12 * brightness, 0.4 * brightness],
        px: [1.1, 2.1],
        roughness: 0.17,
        skin: 0.03,
      });
      puff(glow, this.rng, center, 15_000 / unitLy, color, 5, 0.035 * brightness);
    }
    this.content.add(glow.toPoints(pointsMaterial(this.uniforms, { soft: 1.2 })));
    this.content.add(skin.toPoints(pointsMaterial(this.uniforms, { soft: 2.2 })));
  }
}

/** The Milky Way seen whole. */
export class MilkyWayLayer extends GalacticLayer {
  protected build(): void {
    const unitLy = this.unitLy;
    // Unresolved starlight and dust lanes under the individual stars.
    this.content.add(milkyWaySprites(this.uniforms, unitLy, 0.45));
    for (const cloud of MAGELLANIC_CLOUDS) this.drew(cloud.id, (cloud.radius * 0.7) / unitLy);
    this.fermiBubbles(0.38);
    this.galaxyStars(260_000, 6, [1.0, 2.0], true);
    this.haloStars(0.95, 2500);
  }

  protected animate(state: FrameState): void {
    super.animate(state);
    // Seen from the Local Group our galaxy is drawn larger than life; it settles to true scale on the way in.
    this.content.scale.setScalar(homeMagnification(state.s));
  }

  caveat(s: number): string | null {
    const m = homeMagnification(s);
    return m > 1.05 ? `Milky Way drawn ${m.toFixed(1)}× larger than life` : null;
  }
}

/** How much larger than life the named globular clusters are drawn. */
const GLOBULAR_MAGNIFICATION = 30;

/**
 * Drawn radius of a named globular cluster, in layer units: its true radius magnified, within
 * limits. At true size each would be a few pixels across.
 * @param size true diameter, in layer units
 */
export function globularRadius(size: number): number {
  return Math.min(0.11, Math.max(0.07, (size / 2) * GLOBULAR_MAGNIFICATION));
}

/** Among the galaxy's halo: globular clusters, the Fermi Bubbles, and one giant nebula in the disc. */
export class HaloLayer extends GalacticLayer {
  protected build(): void {
    const unitLy = this.unitLy;
    this.content.add(milkyWaySprites(this.uniforms, unitLy, 0.45));
    this.fermiBubbles(1);
    this.galaxyStars(200_000, 5, [1.0, 2.3], true);

    const clusters = new PointBuf();
    const glow = new PointBuf();
    const nebulae = new NebulaBuf();
    for (const item of itemsFor(this.stop.id)) {
      if (item.kind === 'globular') {
        const radius = globularRadius(this.u(item.size));
        globular(clusters, this.rng, item.pos, radius * 0.3, 2200);
        puff(glow, this.rng, item.pos, radius * 0.9, OLD, 3, 0.1);
        this.drew(item.id, radius * 0.75);
      } else if (item.id in NEBULAE) {
        this.drew(item.id, addNebula(nebulae, item.id, item.pos));
      }
    }
    // The other ~150 globulars of the halo, unnamed and at their true size.
    const cx = R0 / unitLy;
    for (let i = 0; i < 150; i++) {
      const [x, y, z] = this.rng.onSphere();
      const r = (2500 + 60_000 * this.rng.next() ** 2.2) / unitLy;
      blob(clusters, this.rng, { center: [cx + x * r, y * r, z * r], sigma: 35 / unitLy, points: 40, color: OLD, px: [1.0, 1.8] });
    }
    this.content.add(glow.toPoints(pointsMaterial(this.uniforms, { soft: 1.3 })));
    this.content.add(clusters.toPoints(pointsMaterial(this.uniforms, { soft: 2.6, twinkle: 0.25 })));
    this.content.add(nebulae.toMesh(this.uniforms));
  }

  caveat(): string {
    return `Named clusters drawn about ${GLOBULAR_MAGNIFICATION}× larger than life`;
  }
}
