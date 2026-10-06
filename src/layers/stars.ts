import * as THREE from 'three';
import { itemsFor, type CatalogItem } from '../app/catalog';
import { galactic } from '../app/sky';
import { GalacticLayer } from './galaxy';
import { bubble, puff } from './gen';
import { addNebula, NEBULAE } from './nebulaLooks';
import { NebulaBuf } from './nebulaSprites';
import { PointBuf, pointsMaterial, rgb, scaleRgb, starsMaterial, type RGB } from './points';

type Vec3 = [number, number, number];

const SUN_DIAMETER = 1.39e9;
const SUN_COLOR = 0xfff2c0;

/** Surface temperature (K) for each of the catalog's star colours, coolest first. */
const TEMPERATURE = new Map<number, number>([
  [0xff6a3d, 3200],
  [0xffb070, 4500],
  [0xfff2c0, 5800],
  [0xffffff, 8000],
  [0xa8c8ff, 12_000],
]);

/**
 * How a star should glint: size on screen and brightness, from a rough luminosity
 * (L ∝ R²T⁴, with the temperature read off the star's colour). On a log scale, or a
 * supergiant would be a million times larger than a red dwarf.
 */
export function glint(diameter: number, color: number): { px: number; light: number } {
  const radius = diameter / SUN_DIAMETER;
  const temperature = TEMPERATURE.get(color) ?? 2000;
  const magnitude = Math.log10(1 + radius * radius * (temperature / 5800) ** 4);
  return { px: 1.9 * (13 + 4.6 * magnitude), light: Math.min(1.2, 0.55 + 0.13 * magnitude) };
}

/** Layers where individual stars are the subject: each named one gets a proper glint. */
abstract class StarsLayer extends GalacticLayer {
  protected readonly glints = new PointBuf();

  /** A bright star at `pos`. */
  protected star(pos: Vec3, diameter: number, color: number): void {
    const { px, light } = glint(diameter, color);
    this.glints.add(pos[0], pos[1], pos[2], scaleRgb(rgb(color), light), 0, px, this.rng.next());
  }

  /** Every catalog star of this layer, and the Sun at the origin. */
  protected namedStars(): CatalogItem[] {
    const items = itemsFor(this.stop.id);
    for (const item of items) {
      if (item.kind === 'star') this.star(item.pos, item.size, item.color ?? SUN_COLOR);
      else if (item.kind === 'you') this.star(item.pos, SUN_DIAMETER, SUN_COLOR);
      else continue;
      this.drew(item.id, 0);
    }
    return items;
  }

  /** A loose cluster: a handful of bright stars among fainter ones. */
  protected openCluster(dim: PointBuf, center: Vec3, radius: number, members: number, bright: number, color: number): void {
    const tint = rgb(color);
    for (let i = 0; i < members; i++) {
      const spread = radius * (i < bright ? 0.32 : 0.45);
      const p: Vec3 = [center[0] + this.rng.gauss() * spread, center[1] + this.rng.gauss() * spread, center[2] + this.rng.gauss() * spread];
      if (i < bright) this.glints.add(p[0], p[1], p[2], tint, 0, 15 + 9 * this.rng.next(), this.rng.next());
      else dim.add(p[0], p[1], p[2], scaleRgb(tint, 0.55 + 0.4 * this.rng.next()), 0, 1.6 + 1.8 * this.rng.next() ** 2, this.rng.next());
    }
  }

  protected addGlints(): void {
    this.content.add(this.glints.toPoints(starsMaterial(this.uniforms)));
  }
}

/** Visible radius, in layer units, of the star clusters of the `giants` stop: several times life size. */
const CLUSTER_RADIUS = 0.055;

/** Within a thousand light-years: young clusters, giant stars and the Local Bubble. */
export class GiantsLayer extends StarsLayer {
  protected build(): void {
    const rng = this.rng;
    this.localStars(26_000, 6, 0.6);

    const shell = new PointBuf();
    const dim = new PointBuf();
    const haze = new PointBuf();
    const nebulae = new NebulaBuf();

    // The Local Bubble: a lumpy cavity about a thousand light-years across, taller than it is wide.
    const ly = 1 / this.unitLy;
    const wall = (a: number) => 450 * ly * (1 + 0.2 * Math.sin(2 * a + 1) + 0.13 * Math.sin(3 * a + 0.5) + 0.07 * Math.sin(5 * a + 2));
    const bubbleColor: RGB = [0.45, 0.62, 1.0];
    for (let i = 0; i < 15_000; i++) {
      const [x, y, z] = rng.onSphere();
      const r = wall(Math.atan2(y, x)) * (1 + 0.04 * rng.gauss());
      shell.add(40 * ly + x * r, y * r, z * r * 1.4, scaleRgb(bubbleColor, 0.1 + 0.22 * rng.next()), 0, 1 + 0.9 * rng.next() ** 3, rng.next());
    }
    // Its outline where the wall crosses the plane of the galaxy, to make the shape readable.
    for (let i = 0; i < 2600; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = wall(a);
      shell.add(40 * ly + Math.cos(a) * r + rng.gauss() * 0.002, Math.sin(a) * r + rng.gauss() * 0.002, rng.gauss() * 0.004, scaleRgb(bubbleColor, 0.5 + 0.4 * rng.next()), 0, 1.4, rng.next());
    }

    for (const item of this.namedStars()) {
      if (item.id in NEBULAE) {
        this.drew(item.id, addNebula(nebulae, item.id, item.pos));
      } else if (item.id === 'sco-cen') {
        // An association rather than a cluster: hot stars spread over hundreds of light-years, still in their gas.
        this.openCluster(dim, item.pos, this.u(item.size) / 2, 70, 6, 0xa8c8ff);
        nebulae.add({ center: item.pos, radius: 0.085, kind: 'emission', color: [0.95, 0.5, 0.3], color2: [0.35, 0.5, 1.0], a: 0.7, seed: 4.2, brightness: 0.8 });
        this.drew(item.id, 0.07);
      } else if (item.kind === 'starcluster') {
        const blue = item.id === 'pleiades' || item.id === 'southern-pleiades' || item.id === 'alpha-persei';
        this.openCluster(dim, item.pos, CLUSTER_RADIUS, 46, item.id === 'pleiades' ? 7 : 4, blue ? 0xa8c8ff : 0xfff2c0);
        // The Pleiades are drifting through a cloud of dust that scatters their blue light.
        if (item.id === 'pleiades') puff(haze, rng, item.pos, CLUSTER_RADIUS * 1.3, [0.3, 0.45, 1.0], 6, 0.11);
        this.drew(item.id, CLUSTER_RADIUS);
      }
    }

    this.content.add(shell.toPoints(pointsMaterial(this.uniforms, { soft: 2.2 })));
    this.content.add(haze.toPoints(pointsMaterial(this.uniforms, { soft: 1.2 })));
    this.content.add(nebulae.toMesh(this.uniforms));
    this.content.add(dim.toPoints(pointsMaterial(this.uniforms, { soft: 2.6, twinkle: 0.3 })));
    this.addGlints();
  }

  caveat(): string {
    return 'Star clusters and nebulae drawn larger than life';
  }
}

/** The Big Dipper: [name, galactic longitude, latitude, distance in light-years, colour], handle to bowl. */
const BIG_DIPPER: [string, number, number, number, number][] = [
  ['Alkaid', 100.7, 65.3, 103.9, 0xa8c8ff],
  ['Mizar', 113.1, 61.6, 82.9, 0xffffff],
  ['Alioth', 122.2, 61.2, 82.6, 0xffffff],
  ['Megrez', 132.6, 59.4, 80.5, 0xffffff],
  ['Phecda', 140.8, 61.4, 83.2, 0xffffff],
  ['Merak', 149.2, 54.8, 79.7, 0xffffff],
  ['Dubhe', 142.8, 51.0, 123, 0xffb070],
];

/** Within a hundred-odd light-years: the bright stars of the constellations, and the reach of our radio. */
export class BrightStarsLayer extends StarsLayer {
  protected build(): void {
    const rng = this.rng;
    const unitLy = this.unitLy;
    this.localStars(9000, 6, 1);

    // Every broadcast since radio began is still travelling outwards, in a sphere centred on us:
    // drawn as a faint skin with three great circles, like a globe.
    const shell = new PointBuf();
    const radius = 120 / unitLy;
    bubble(shell, rng, {
      center: [0, 0, 0],
      radii: [radius, radius, radius],
      points: 9000,
      color: [0.35, 0.95, 1.0],
      brightness: [0.08, 0.22],
      px: [1.0, 1.6],
      skin: 0.01,
    });
    // The first lies in the plane of the galaxy; the others are tipped so none is seen edge-on.
    for (const normal of [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.75, 0.25, 0.6), new THREE.Vector3(-0.5, 0.7, 0.5)]) {
      this.greatCircle(radius, normal.normalize());
    }

    const dim = new PointBuf();
    for (const item of this.namedStars()) {
      if (item.id === 'hyades') {
        // Close enough to be shown at its true size.
        this.openCluster(dim, item.pos, this.u(item.size) / 2, 110, 4, 0xfff2c0);
        this.drew(item.id, this.u(item.size) / 2);
      } else if (item.id === 'big-dipper') {
        // The seven stars of the Big Dipper: the middle five are neighbours in space, the end two are not.
        for (const [, l, b, d, color] of BIG_DIPPER) {
          const [x, y, z] = galactic(l, b, d);
          this.star([x / unitLy, y / unitLy, z / unitLy], 4.5e9, color);
        }
        this.drew(item.id, 0);
      }
    }

    this.content.add(shell.toPoints(pointsMaterial(this.uniforms, { soft: 2.2 })));
    this.content.add(dim.toPoints(pointsMaterial(this.uniforms, { soft: 2.6, twinkle: 0.3 })));
    this.addGlints();
  }

  private greatCircle(radius: number, normal: THREE.Vector3): void {
    const points: number[] = [];
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      points.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const circle = new THREE.LineLoop(geo, this.fadable(new THREE.LineBasicMaterial({ color: 0x5fe8ff, opacity: 0.4, depthTest: false })));
    circle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    circle.frustumCulled = false;
    this.content.add(circle);
  }
}

/** Within twenty light-years: the Sun's nearest neighbours, most of them dim red dwarfs. */
export class NeighborhoodLayer extends StarsLayer {
  protected build(): void {
    this.localStars(2600, 6, 1);

    // The thin clouds of gas the Sun is passing through: the Local Interstellar Cloud, and the
    // G-Cloud next to it, which holds Alpha Centauri.
    const haze = new PointBuf();
    puff(haze, this.rng, [0.38, 0.32, 0], 0.8, [0.3, 0.5, 0.95], 7, 0.03);
    puff(haze, this.rng, [0.3, -0.34, 0.05], 0.55, [0.55, 0.4, 0.95], 6, 0.03);
    this.content.add(haze.toPoints(pointsMaterial(this.uniforms, { soft: 1.1 })));

    this.namedStars();
    this.addGlints();
  }
}
