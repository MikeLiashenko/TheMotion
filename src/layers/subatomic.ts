import * as THREE from 'three';
import { NUCLEON_RADIUS, NUCLEONS, NUCLEUS_CENTRE, NUCLEUS_RADIUS, QUARKS, type Quark } from '../app/atomicNucleus';
import { itemsFor } from '../app/catalog';
import { Rng } from '../util/rng';
import { BallBuf, ballMaterial, shellMaterial, type Depths } from './balls';
import { CAM_DIST } from './constants';
import { Layer, type FrameState } from './layer';
import { PointBuf, pointsMaterial, scaleRgb, type LayerUniforms, type RGB } from './points';

type Vec3 = [number, number, number];

const PROTON: RGB = [0.98, 0.44, 0.3];
const NEUTRON: RGB = [0.56, 0.64, 0.82];
const GLUON: RGB = [1.0, 0.9, 0.58];
/** The three "colours" of the strong force's charge, as they are always drawn; their opposites belong to antiquarks. */
const COLOURS: Record<Quark['colour'], RGB> = { red: [1.0, 0.3, 0.26], green: [0.3, 0.95, 0.4], blue: [0.34, 0.52, 1.0] };
const ANTICOLOURS: RGB[] = [[0.3, 0.95, 0.95], [0.95, 0.4, 0.95], [1.0, 0.92, 0.35]];

/** Said on the long way from the electrons down to the nucleus, where there is nothing to show. */
export const EMPTINESS = 'Empty space: were the nucleus a pea, the atom would fill a stadium';

/** How far behind the focus plane the haze is hung, world units. Anything large will do. */
const DISTANCE = 600;

/**
 * Between its electrons and its nucleus an atom is empty; but the electrons can turn up anywhere
 * in it, which this shows as specks that come and go all over the screen. It is fixed to the
 * screen: add it to a layer's scene, not to its rescaled root. Every layer that uses it gets
 * the same specks, so they hold still while the layers crossfade.
 */
export function electronHaze(u: LayerUniforms): THREE.Points {
  const rng = new Rng('electron-haze');
  const specks = new PointBuf();
  for (let i = 0; i < 4000; i++) {
    const blue = rng.next();
    specks.add(rng.range(-1.35, 1.35) * DISTANCE, rng.range(-1.7, 1.7) * DISTANCE, CAM_DIST - DISTANCE, scaleRgb([0.5 + 0.3 * blue, 0.75, 1.0], 0.1 + 0.3 * rng.next() ** 2), 0, 1 + 1.2 * rng.next(), rng.next());
  }
  const haze = specks.toPoints(pointsMaterial(u, { soft: 2.4, twinkle: 1 }));
  haze.renderOrder = -1;
  return haze;
}

/** The nucleus is seen close up: what is behind the proton in front is dimmer. */
const DEPTHS: Depths = { from: 1.0, to: 1.9, floor: 0.32 };

const CAVEATS: Record<string, string> = {
  atomNucleus: 'A model: protons and neutrons are not hard balls, and they never sit still',
  proton: 'A cartoon: quarks have no size anyone has measured, and their colours are only names',
};

/**
 * The nucleus of the carbon atom, and the inside of one of its protons. Two stops share the
 * model: the second sees through the proton in front of it, to its quarks.
 */
export class NucleusLayer extends Layer {
  /** Its own fade for the glow that stands in for the nucleus while it is too small to see. */
  private readonly glow = { ...this.uniforms, uFade: { value: 0 } };
  private readonly haze = { ...this.uniforms, uFade: { value: 0 } };

  protected build(): void {
    const fm = 1e-15 / this.unitM;
    const inside = this.stop.id === 'proton';
    const scaled = (p: Vec3): Vec3 => [p[0] * fm, p[1] * fm, p[2] * fm];
    const balls = new BallBuf();
    const shells = new BallBuf();
    NUCLEONS.forEach((nucleon, i) => {
      const colour = nucleon.proton ? PROTON : NEUTRON;
      // Neither kind has a surface: a solid heart, and a paler skin round it that fades out.
      if (i > 0 || !inside) balls.add(scaled(nucleon.at), NUCLEON_RADIUS * 0.9 * fm, scaleRgb(colour, 0.9 + 0.15 * this.rng.next()));
      shells.add(scaled(nucleon.at), NUCLEON_RADIUS * fm, colour);
    });
    this.content.add(balls.toMesh(ballMaterial(this.uniforms, DEPTHS), 40));
    const skins = shells.toMesh(shellMaterial(this.uniforms, DEPTHS), 40);
    skins.renderOrder = 2;
    this.content.add(skins);
    if (inside) {
      // The proton in front is see-through, but not to what lies behind it: its far side is a dark wall.
      const wall = new THREE.Mesh(
        new THREE.SphereGeometry(NUCLEON_RADIUS * 0.97 * fm, 40, 28),
        this.fadable(new THREE.MeshBasicMaterial({ color: 0x240b08, side: THREE.BackSide })),
      );
      wall.renderOrder = -1;
      this.content.add(wall);
      this.quarks(fm);
    }

    // From far off the whole nucleus is a point of light.
    const glow = new PointBuf();
    glow.add(...scaled(NUCLEUS_CENTRE), [1.0, 0.86, 0.62], 0, 9, 0);
    this.content.add(glow.toPoints(pointsMaterial(this.glow, { soft: 5.0 })));
    this.scene.add(electronHaze(this.haze));
    for (const item of itemsFor(this.stop.id)) this.drew(item.id, 0);
  }

  /** What the proton in front is made of: three quarks, the gluons that hold them, and a seething of pairs that come and go. */
  private quarks(fm: number): void {
    const rng = this.rng;
    const points = new PointBuf();
    const sea = new PointBuf();
    const coils = new BallBuf();
    for (const quark of QUARKS) {
      const [x, y, z] = quark.at;
      const colour = COLOURS[quark.colour];
      points.add(x * fm, y * fm, z * fm, scaleRgb(colour, 0.55), 0.34 * fm, 0, 0);
      points.add(x * fm, y * fm, z * fm, [1, 1, 1], 0.09 * fm, 4, 0);
    }
    // Gluons, drawn the way physicists draw them: as coiled springs from quark to quark.
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const along = new THREE.Vector3();
    const side = new THREE.Vector3();
    const up = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < QUARKS.length; i++) {
      a.set(...QUARKS[i].at);
      b.set(...QUARKS[(i + 1) % QUARKS.length].at);
      along.subVectors(b, a);
      const length = along.length();
      along.normalize();
      side.set(0, 0, 1).cross(along).normalize();
      up.crossVectors(along, side);
      const turns = 9;
      const beads = 150;
      for (let k = 0; k <= beads; k++) {
        const t = 0.1 + (0.8 * k) / beads;
        const angle = (k / beads) * turns * Math.PI * 2;
        // Leaning coils, each loop overlapping the last: the look of a drawn spring.
        p.copy(a)
          .addScaledVector(along, t * length + 0.02 * Math.sin(angle))
          .addScaledVector(side, 0.045 * Math.cos(angle))
          .addScaledVector(up, 0.045 * Math.sin(angle));
        coils.add([p.x * fm, p.y * fm, p.z * fm], 0.011 * fm, GLUON);
      }
    }
    for (let i = 0; i < 700; i++) {
      const [x, y, z] = rng.inSphere();
      const reach = NUCLEON_RADIUS * 0.86;
      const colour = i % 2 ? rng.pick(Object.values(COLOURS)) : rng.pick(ANTICOLOURS);
      sea.add(x * reach * fm, y * reach * fm, z * reach * fm, scaleRgb(colour, 0.25 + 0.4 * rng.next()), 0, 1.6 + 2.4 * rng.next(), rng.next());
    }
    const springs = coils.toMesh(ballMaterial(this.uniforms), 8);
    springs.renderOrder = 1;
    this.content.add(springs);
    this.content.add(sea.toPoints(pointsMaterial(this.uniforms, { soft: 2.2, twinkle: 1 })));
    this.content.add(points.toPoints(pointsMaterial(this.uniforms, { soft: 2.6, twinkle: 0.15 })));
  }

  protected animate(state: FrameState): void {
    // The glow gives way to the nucleus itself once that is more than a few pixels across.
    const across = ((2 * NUCLEUS_RADIUS * 1e-15) / 10 ** state.s) * state.viewportH;
    const far = 1 - smoothstep(6, 26, across);
    this.glow.uFade.value = this.uniforms.uFade.value * far;
    this.haze.uFade.value = this.uniforms.uFade.value * far;
  }

  caveat(s: number): string {
    return s > this.stop.s + 1.3 ? EMPTINESS : CAVEATS[this.stop.id];
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
