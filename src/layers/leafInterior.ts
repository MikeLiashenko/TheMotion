import * as THREE from 'three';
import { itemsFor } from '../app/catalog';
import { LEAF } from '../app/leaf';
import { INSIDE_LEAF, INSIDE_PLACES, leafDive } from '../app/leafInside';
import { Rng } from '../util/rng';
import { BallBuf, ballMaterial, BANDED, GRAINY, shellMaterial, type Depths } from './balls';
import { leafSheet, PORES_CAVEAT } from './foliage';
import { Layer, type FrameState } from './layer';
import { nucleus } from './micro';
import { scaleRgb, type RGB } from './points';

type Vec3 = [number, number, number];

const WALL: RGB = [0.58, 0.86, 0.42];
const VACUOLE: RGB = [0.5, 0.76, 0.95];
const CHLOROPLAST: RGB = [0.2, 0.62, 0.17];
const MITOCHONDRION: RGB = [0.96, 0.54, 0.24];
const GUARD: RGB = [0.5, 0.7, 0.3];
const ENVELOPE: RGB = [0.55, 0.45, 0.9];
const RETICULUM: RGB = [0.62, 0.56, 0.9];
const GOLGI: RGB = [0.95, 0.82, 0.4];
const CHROMOSOMES: RGB[] = [[0.95, 0.4, 0.75], [0.4, 0.8, 0.95], [1.0, 0.8, 0.35], [0.6, 0.9, 0.5], [1.0, 0.55, 0.35], [0.7, 0.6, 1.0]];
const UP = new THREE.Vector3(0, 0, 1);

/** Half the size of a chloroplast and of a mitochondrion, micrometres: both are longer than they are thick. */
const CHLOROPLAST_SIZE: Vec3 = [2.5, 2.5, 1.05];
const MITOCHONDRION_SIZE: Vec3 = [0.42, 0.42, 1.0];

/** Whether point `p` is inside an ellipsoid, or one `scale` times its size. */
function within(p: Vec3, centre: Vec3, half: Vec3, scale = 1): boolean {
  return ((p[0] - centre[0]) / (half[0] * scale)) ** 2 + ((p[1] - centre[1]) / (half[1] * scale)) ** 2 + ((p[2] - centre[2]) / (half[2] * scale)) ** 2 < 1;
}

/**
 * What lies under the skin of the leaf, around the spot the camera comes down on: the two guard
 * cells of the pore, the air space below it, and the tightly packed cells underneath, one of
 * which the journey goes to. Lengths are in micrometres, measured from the middle of that
 * cell's nucleus, z towards the camera; `um` turns them into layer units.
 *
 * Always built from the same random numbers: the three layers that show it show the same thing.
 */
function buildInterior(balls: BallBuf, dots: BallBuf, shells: BallBuf, guards: BallBuf, um: number): void {
  const rng = new Rng('leaf-interior');
  const { cell, vacuole, spacing, roof, skin, guard } = INSIDE_LEAF;
  const at = (x: number, y: number, z: number): Vec3 => [x * um, y * um, z * um];
  const sized = (half: Vec3): Vec3 => [half[0] * um, half[1] * um, half[2] * um];
  const quat = new THREE.Quaternion();
  const normal = new THREE.Vector3();

  const home: Vec3 = [cell.x, cell.y, cell.top - cell.tall];
  const vacuoleAt: Vec3 = [vacuole.x, vacuole.y, vacuole.z];
  const vacuoleSize: Vec3 = [vacuole.wide, vacuole.wide, vacuole.tall];
  /** Whether a point is in the living part of our cell: inside the wall, outside the vacuole and the nucleus. */
  const inCytoplasm = (p: Vec3, clearance: number) =>
    within(p, home, [cell.wide - clearance, cell.wide - clearance, cell.tall - clearance]) &&
    !within(p, vacuoleAt, [vacuole.wide + clearance, vacuole.wide + clearance, vacuole.tall + clearance]) &&
    Math.hypot(p[0], p[1], p[2]) > INSIDE_LEAF.nucleus + clearance;

  const chloroplast = (p: Vec3, facing: Vec3, shade: number) => {
    quat.setFromUnitVectors(UP, normal.set(...facing).normalize());
    balls.add(at(...p), sized(CHLOROPLAST_SIZE), scaleRgb(CHLOROPLAST, shade), quat, GRAINY);
  };
  const mitochondrion = (p: Vec3, shade: number) =>
    balls.add(at(...p), sized(MITOCHONDRION_SIZE), scaleRgb(MITOCHONDRION, shade), [rng.range(0, 3), rng.range(0, 3), 0], BANDED);
  // A nucleus seen from too far off to need more than its envelope and a hint of what is inside.
  const plainNucleus = (x: number, y: number, z: number) => {
    shells.add(at(x, y, z), 2.8 * um, ENVELOPE);
    balls.add(at(x + 0.9, y + 0.5, z - 0.2), 0.7 * um, [0.42, 0.3, 0.62]);
    for (let i = 0; i < 6; i++) {
      const [dx, dy, dz] = rng.inSphere();
      const spin = rng.range(0, Math.PI);
      for (const side of [-1, 1]) {
        balls.add(at(x + dx * 1.8, y + dy * 1.8, z + dz * 1.5), [0.8 * um, 0.15 * um, 0.15 * um], CHROMOSOMES[i], [0, rng.range(-0.4, 0.4), spin + side * 0.3]);
      }
    }
  };

  // The cells stand in a honeycomb. Under the pore they stop well short of the skin, which leaves a
  // chamber of air there; ours is the tallest of those, its top standing clear of its neighbours'.
  for (let r = -3; r <= 3; r++) {
    for (let q = -3; q <= 3; q++) {
      const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      if (ring > 3) continue;
      const ours = ring === 0;
      const short = ring <= 1;
      const x = cell.x + spacing * (q + r / 2) + (ours ? 0 : rng.range(-1.2, 1.2));
      const y = cell.y + spacing * r * 0.866 + (ours ? 0 : rng.range(-1.2, 1.2));
      const wide = ours ? cell.wide : rng.range(10.6, 11.7);
      const tall = ours ? cell.tall : short ? rng.range(15, 18) : rng.range(30, 34);
      const top = ours ? cell.top : short ? rng.range(0, 4) : rng.range(roof - 2.5, roof - 0.5);
      const cz = top - tall;
      shells.add(at(x, y, cz), [wide * um, wide * um, tall * um], WALL);

      // Most of a plant cell is one large bag of water, which presses everything else against the wall.
      const water: Vec3 = ours ? vacuoleAt : [x + rng.range(-2, 2), y + rng.range(-2, 2), cz - 1.5];
      const waterSize: Vec3 = ours ? vacuoleSize : [wide * 0.6, wide * 0.6, tall - 5.5];
      shells.add(at(...water), sized(waterSize), VACUOLE);

      // Chloroplasts: flat green discs lying against the wall, where the light is.
      const chloroplasts = ours ? 60 : ring === 1 ? 34 : ring === 2 ? 20 : 12;
      for (let i = 0; i < chloroplasts; i++) {
        const u = rng.range(-0.55, 0.95);
        const turn = rng.range(0, Math.PI * 2);
        const out = Math.sqrt(1 - u * u);
        const p: Vec3 = [x + 0.86 * wide * out * Math.cos(turn), y + 0.86 * wide * out * Math.sin(turn), cz + 0.86 * tall * u];
        if (ours) {
          // Not on top of the nucleus, nor over it, where the camera comes in; nor crowding the one that gets a label.
          const [lx, ly, lz] = INSIDE_PLACES.chloroplast;
          if (Math.hypot(p[0], p[1], p[2]) < 6.4 || (Math.hypot(p[0], p[1]) < 5.6 && p[2] > 0)) continue;
          if (Math.hypot(p[0] - lx, p[1] - ly, p[2] - lz) < 5.2) continue;
        }
        chloroplast(p, [(out * Math.cos(turn)) / wide, (out * Math.sin(turn)) / wide, u / tall], 0.8 + 0.35 * rng.next());
      }

      // Mitochondria, the cell's power stations, and a nucleus: every cell has one.
      if (ours) continue;
      for (let i = 0; i < (short ? 8 : 0); i++) {
        const [dx, dy, dz] = rng.inSphere();
        mitochondrion([x + dx * wide * 0.7, y + dy * wide * 0.7, top - 3 - Math.abs(dz) * 16], 0.85 + 0.3 * rng.next());
      }
      const turn = rng.range(0, Math.PI * 2);
      plainNucleus(x + Math.cos(turn) * wide * 0.42, y + Math.sin(turn) * wide * 0.42, top - rng.range(6, 9));
    }
  }

  // Our cell, in detail. Its nucleus first: that is where the journey goes on.
  nucleus(balls, dots, shells, um);
  {
    const [x, y, z] = INSIDE_PLACES.chloroplast;
    chloroplast([x, y, z], [(x - cell.x) / cell.wide ** 2, (y - cell.y) / cell.wide ** 2, (z - home[2]) / cell.tall ** 2], 1.05);
    mitochondrion(INSIDE_PLACES.mitochondrion, 1.05);
  }
  for (let placed = 0, tries = 0; placed < 34 && tries < 4000; tries++) {
    const p: Vec3 = [cell.x + rng.range(-1, 1) * cell.wide, cell.y + rng.range(-1, 1) * cell.wide, rng.range(-16, cell.top)];
    if (!inCytoplasm(p, 1.1) || Math.hypot(p[0], p[1], p[2]) < 5.2 || (Math.hypot(p[0], p[1]) < 4.4 && p[2] > 0)) continue;
    mitochondrion(p, 0.85 + 0.3 * rng.next());
    placed++;
  }
  // The endoplasmic reticulum: folded sheets wrapped around the nucleus, where proteins are made.
  const [ex, ey, ez] = INSIDE_PLACES.reticulum;
  const reticulum = (x: number, y: number, z: number) => {
    if (inCytoplasm([x, y, z], 0.5)) balls.add(at(x, y, z), [0.26 * um, 0.26 * um, 0.5 * um], RETICULUM);
  };
  reticulum(ex, ey, ez);
  for (let sheet = 0; sheet < 7; sheet++) {
    const radius = 3.5 + sheet * 0.2;
    const start = rng.range(0, Math.PI * 2);
    const tilt = rng.range(-0.5, 0.5);
    const sweep = rng.range(2.4, 3.6);
    for (let i = 0; i < 46; i++) {
      const a = start + (i / 46) * sweep;
      // Kept below the top of the nucleus, which faces the camera.
      reticulum(Math.cos(a) * radius, Math.sin(a) * radius, -1.2 - sheet * 0.35 + Math.sin(a * 2 + sheet) * 0.5 + tilt * Math.cos(a) * 1.4);
    }
  }
  // Golgi stacks: piles of flat sacs that sort and ship what the cell makes.
  for (const [gx, gy, gz] of [INSIDE_PLACES.golgi, [-2.0, 5.6, -3.0]]) {
    const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0.6, 1.2), rng.range(0, 3), 0));
    for (let i = 0; i < 5; i++) {
      const offset = new THREE.Vector3(0, 0, (i - 2) * 0.24).applyQuaternion(lean);
      const wide = (1.15 - 0.08 * Math.abs(i - 2)) * um;
      balls.add(at(gx + offset.x, gy + offset.y, gz + offset.z), [wide, wide, 0.09 * um], GOLGI, lean);
    }
  }
  // Ribosomes: there are millions, each a machine that builds proteins. A few hundred are shown.
  const [rx, ry, rz] = INSIDE_PLACES.ribosomes;
  for (let i = 0; i < 12; i++) {
    const [dx, dy, dz] = rng.inSphere();
    dots.add(at(rx + dx * 0.5, ry + dy * 0.5, rz + dz * 0.5), 0.05 * um, [0.9, 0.86, 0.7]);
  }
  for (let placed = 0, tries = 0; placed < 520 && tries < 20000; tries++) {
    const [dx, dy, dz] = rng.inSphere();
    const p: Vec3 = [dx * 10, dy * 10, dz * 10];
    if (!inCytoplasm(p, 0.25)) continue;
    dots.add(at(...p), 0.05 * um, [0.9, 0.86, 0.7]);
    placed++;
  }

  // The guard cells: two sausages side by side just under the skin, with the pore between them.
  const axis = LEAF.angle + LEAF.stomaAngle;
  for (const side of [-1, 1]) {
    const cx = -Math.sin(axis) * guard.off * side;
    const cy = Math.cos(axis) * guard.off * side;
    guards.add(at(cx, cy, skin - guard.depth), [guard.long * um, guard.wide * um, guard.tall * um], GUARD, [0, 0, axis], GRAINY);
  }

  // Deeper in, rounder cells with more air between them: glimpsed through the gaps.
  for (let i = 0; i < 46; i++) {
    const x = rng.range(-75, 75);
    const y = rng.range(-75, 75);
    const z = rng.range(-66, -52);
    const size = rng.range(10, 14);
    shells.add(at(x, y, z), size * um, WALL);
    for (let k = 0; k < 9; k++) {
      const [dx, dy, dz] = rng.onSphere();
      chloroplast([x + dx * size * 0.82, y + dy * size * 0.82, z + dz * size * 0.82], [dx, dy, dz], 0.55 + 0.25 * rng.next());
    }
  }
}

/** The leaf is brightest where the camera looks, and dim in its depths. */
const DEPTHS: Depths = { from: 1.0, to: 3.0, floor: 0.3 };

/**
 * Under the skin of the leaf: through the pore, across the air space, and up to one cell as far
 * as its nucleus. Three stops share this one model, each in its own units; the camera's aim
 * sinks from the surface to the nucleus on the way from the first to the second.
 */
export class LeafInteriorLayer extends Layer {
  private readonly inside = new THREE.Group();
  private readonly pixel = { value: 1 };

  protected build(): void {
    const um = 1e-6 / this.unitM;
    const balls = new BallBuf();
    const dots = new BallBuf();
    const shells = new BallBuf();
    const guards = new BallBuf();
    buildInterior(balls, dots, shells, guards, um);
    this.inside.add(balls.toMesh(ballMaterial(this.uniforms, DEPTHS)));
    // The camera passes between the guard cells: they stay whole until it is almost upon them.
    this.inside.add(guards.toMesh(ballMaterial(this.uniforms, DEPTHS, [0.012, 0.11]), 32));
    this.inside.add(dots.toMesh(ballMaterial(this.uniforms, DEPTHS), 8));
    const walls = shells.toMesh(shellMaterial(this.uniforms, DEPTHS), 40);
    walls.renderOrder = 2;
    this.inside.add(walls);

    // Far below, the dim green of the rest of the leaf.
    const depths = new THREE.Mesh(new THREE.CircleGeometry(400 * um, 48), this.fadable(new THREE.MeshBasicMaterial({ color: 0x0a1f0e, depthWrite: false })));
    depths.position.z = -90 * um;
    depths.renderOrder = -1;
    this.inside.add(depths);

    // The skin, seen from outside until the camera has gone through the pore.
    if (this.stop.id !== 'nucleus') {
      const skin = leafSheet(0.003, this.unitM, { uFade: this.uniforms.uFade, uPixel: this.pixel }, true);
      skin.position.z = INSIDE_LEAF.skin * um;
      this.inside.add(skin);
    }
    this.content.add(this.inside);
    // Labels ride along with the model as the camera's aim sinks into the leaf.
    for (const item of itemsFor(this.stop.id)) this.drew(item.id, 0, this.inside);
  }

  protected animate(state: FrameState): void {
    const sunk = leafDive(state.at);
    const frame = 10 ** state.s;
    this.inside.position.z = (-INSIDE_LEAF.skin * 1e-6 * (1 - sunk)) / this.unitM;
    // The skin is nearer to the camera than what the camera is aimed at: it is seen in finer detail.
    const toSkin = Math.max(frame - INSIDE_LEAF.skin * 1e-6 * sunk, frame * 0.02);
    this.pixel.value = toSkin / state.viewportH;
  }

  caveat(): string {
    return this.stop.id === 'stoma' ? PORES_CAVEAT : 'A model: colours are for telling the parts apart';
  }
}
