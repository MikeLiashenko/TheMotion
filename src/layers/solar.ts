import * as THREE from 'three';
import { itemsFor } from '../app/catalog';
import {
  EARTH_ON_SUN,
  EARTH_RADIUS,
  ECCENTRIC_ORBITS,
  ECLIPTIC_TILT,
  HELIOPAUSE,
  heliocentric,
  heliopauseRadius,
  MOON_DISTANCE,
  MOON_LONGITUDE,
  onDisc,
  PLACES,
  solarOrigin,
  solarView,
  SUN_RADIUS,
  sunMinRadius,
  terminationShockRadius,
  type SolarView,
  type Vec3,
} from '../app/solarSystem';
import { stopIndex, STOPS } from '../app/timeline';
import { AU } from '../util/format';
import { BodyBuf, type BodyLook } from './bodies';
import { createGlobe } from './globe';
import { galacticView } from './galaxy';
import { Layer, type FrameState, type LabelAnchor } from './layer';
import { PointBuf, pointsMaterial, rgb, scaleRgb, starsMaterial, type RGB } from './points';
import { starfield } from './starfield';
import { glint } from './stars';
import { SunMesh } from './sun';

const ICE: RGB = [0.72, 0.86, 1.0];
const ROCK: RGB = [0.8, 0.74, 0.66];
const ORBIT = 0x8fa6d6;
const SPEED_OF_LIGHT = 2.99792458e8;

/** Semi-major axes in AU. */
const ORBITS = {
  mercury: 0.387,
  venus: 0.723,
  earth: 1,
  mars: 1.524,
  jupiter: 5.203,
  saturn: 9.58,
  uranus: 19.19,
  neptune: 30.07,
};

/**
 * Beyond these scales (log10 of the frame height in metres) a group of bodies is drawn ever
 * smaller, so that they don't pile up on one another once their orbits have shrunk to a few pixels.
 */
export const SHRINK_FROM = { inner: 12.05, giants: 12.8, dwarfs: 13.35 };

interface World {
  /** True radius, metres. */
  radius: number;
  /**
   * The smallest it is drawn, as a fraction of half the frame height. To scale, a planet seen
   * from across its own orbit is far less than a pixel wide.
   */
  min: number;
  look: BodyLook;
}

const grey = (a: RGB, b: RGB, contrast = 1): BodyLook => ({ kind: 'rock', color: a, color2: b, contrast });

export const WORLDS = {
  mercury: { radius: 2.4397e6, min: 0.0105, look: grey([0.62, 0.58, 0.54], [0.4, 0.37, 0.35], 0.8) },
  venus: { radius: 6.0518e6, min: 0.015, look: { kind: 'clouds', color: [0.9, 0.78, 0.55], color2: [1.0, 0.96, 0.84], contrast: 0.9 } },
  earth: { radius: EARTH_RADIUS, min: 0.0155, look: { kind: 'earth', color: [0.1, 0.3, 0.6], color2: [1, 1, 1] } },
  moon: { radius: 1.7374e6, min: 0.0036, look: grey([0.82, 0.81, 0.78], [0.5, 0.5, 0.52]) },
  mars: { radius: 3.3895e6, min: 0.012, look: { kind: 'mars', color: [0.84, 0.44, 0.25], color2: [0.42, 0.22, 0.15] } },
  ceres: { radius: 4.697e5, min: 0.0075, look: grey([0.52, 0.5, 0.48], [0.36, 0.35, 0.34]) },
  vesta: { radius: 2.627e5, min: 0.0062, look: grey([0.64, 0.6, 0.54], [0.42, 0.4, 0.38]) },
  jupiter: {
    radius: 6.9911e7,
    min: 0.046,
    look: { kind: 'bands', color: [0.92, 0.86, 0.74], color2: [0.6, 0.4, 0.27], shape: [1, 1, 0.935], axis: [0.05, 0, 0], spin: 0.06 },
  },
  saturn: {
    radius: 5.8232e7,
    min: 0.038,
    look: { kind: 'bands', color: [0.94, 0.86, 0.66], color2: [0.76, 0.64, 0.44], contrast: 0.4, rings: 'saturn', shape: [1, 1, 0.902], axis: [0.4, -0.3, 0], spin: 0.06 },
  },
  // Tipped right over: its pole, and the plane of its rings and moons, lie almost in the plane of its orbit.
  uranus: {
    radius: 2.5362e7,
    min: 0.027,
    look: { kind: 'ice', color: [0.64, 0.88, 0.9], color2: [0.56, 0.8, 0.86], contrast: 0.15, rings: 'thin', axis: [1.45, 0.75, 0] },
  },
  neptune: { radius: 2.4622e7, min: 0.026, look: { kind: 'ice', color: [0.24, 0.42, 0.96], color2: [0.17, 0.3, 0.8], contrast: 0.9, axis: [0.45, -0.2, 0], spin: 0.04 } },
  io: { radius: 1.8216e6, min: 0.0055, look: grey([0.95, 0.85, 0.42], [0.82, 0.5, 0.18]) },
  europa: { radius: 1.5608e6, min: 0.005, look: grey([0.92, 0.88, 0.78], [0.7, 0.55, 0.4], 0.5) },
  ganymede: { radius: 2.6341e6, min: 0.0065, look: grey([0.64, 0.59, 0.52], [0.4, 0.36, 0.32]) },
  callisto: { radius: 2.4103e6, min: 0.006, look: grey([0.44, 0.39, 0.34], [0.3, 0.26, 0.22]) },
  titan: { radius: 2.5747e6, min: 0.0062, look: { kind: 'clouds', color: [0.86, 0.58, 0.22], color2: [0.96, 0.74, 0.36], contrast: 0.4 } },
  triton: { radius: 1.3534e6, min: 0.005, look: grey([0.86, 0.79, 0.75], [0.7, 0.6, 0.58]) },
  pluto: { radius: 1.1883e6, min: 0.014, look: { kind: 'pluto', color: [0.82, 0.7, 0.56], color2: [0.4, 0.27, 0.2] } },
  charon: { radius: 6.06e5, min: 0.007, look: grey([0.62, 0.6, 0.6], [0.5, 0.4, 0.38]) },
  eris: { radius: 1.163e6, min: 0.013, look: grey([0.94, 0.94, 0.92], [0.8, 0.8, 0.84], 0.4) },
  // Spinning so fast that it has stretched into an egg.
  haumea: { radius: 1.05e6, min: 0.014, look: { ...grey([0.92, 0.9, 0.88], [0.7, 0.56, 0.5], 0.5), rings: 'thin', shape: [1, 0.8, 0.52], axis: [0.5, 0.3, 0], spin: 0.9 } },
  makemake: { radius: 7.15e5, min: 0.012, look: grey([0.8, 0.6, 0.48], [0.62, 0.42, 0.34]) },
  sedna: { radius: 5e5, min: 0.0105, look: grey([0.82, 0.36, 0.24], [0.6, 0.25, 0.18]) },
  quaoar: { radius: 5.45e5, min: 0.011, look: { ...grey([0.7, 0.55, 0.45], [0.5, 0.38, 0.32]), rings: 'thin', axis: [0.6, -0.3, 0] } },
  gonggong: { radius: 6.15e5, min: 0.011, look: grey([0.76, 0.33, 0.23], [0.55, 0.24, 0.18]) },
  orcus: { radius: 4.55e5, min: 0.0105, look: grey([0.62, 0.62, 0.64], [0.46, 0.46, 0.5]) },
  // Two lobes that touch, like a snowman.
  arrokoth: { radius: 1.0e4, min: 0.007, look: grey([0.72, 0.43, 0.3], [0.55, 0.32, 0.24], 0.5) },
  arrokothHead: { radius: 7.5e3, min: 0.0052, look: grey([0.72, 0.43, 0.3], [0.55, 0.32, 0.24], 0.5) },
  chiron: { radius: 1.05e5, min: 0.006, look: grey([0.52, 0.5, 0.48], [0.38, 0.36, 0.35]) },
} satisfies Record<string, World>;

type WorldName = keyof typeof WORLDS;

/**
 * Moons: true distance from their planet (m), and the closest they are drawn to it, in
 * radii of the planet as drawn. While a planet is shown larger than life its moons would be
 * hidden inside its disc, so they keep this much clear of it. `rate` is radians per second
 * of our time: their order and relative pace are real, the pace itself is not.
 */
const MOONS = {
  moon: { distance: MOON_DISTANCE, gap: 2.4, rate: 0 },
  io: { distance: 4.217e8, gap: 1.7, rate: 0.16 },
  europa: { distance: 6.711e8, gap: 2.2, rate: 0.08 },
  ganymede: { distance: 1.0704e9, gap: 2.8, rate: 0.04 },
  callisto: { distance: 1.8827e9, gap: 3.6, rate: 0.017 },
  titan: { distance: 1.2219e9, gap: 3.0, rate: 0.025 },
  // Backwards, the only large moon to orbit that way.
  triton: { distance: 3.548e8, gap: 2.2, rate: -0.035 },
  charon: { distance: 1.9596e7, gap: 2.1, rate: 0.05 },
  arrokothHead: { distance: 1.6e4, gap: 1.45, rate: 0 },
} satisfies Partial<Record<WorldName, { distance: number; gap: number; rate: number }>>;

/** A body the layer draws: where it is and how large, both updated every frame. */
interface Body {
  world: World;
  /** Index in the instanced mesh, or -1 for Earth drawn as a full globe. */
  index: number;
  /** Position in the layer's content space. */
  pos: THREE.Vector3;
  /** Radius it is drawn at this frame, layer units. */
  drawn: number;
  /** Scale beyond which it starts to shrink (see SHRINK_FROM). */
  shrinkFrom: number;
  /** Catalog id of its label, if it has one. */
  label?: string;
  anchor?: LabelAnchor;
  /** How far its picture reaches, in its own radii: more than 1 for a planet with rings. */
  reach: number;
  orbit?: { around: Body; distance: number; gap: number; rate: number; phase: number; x: THREE.Vector3; y: THREE.Vector3 };
}

/**
 * The Solar System, from the Oort Cloud down to the Earth and Moon. One class draws all of
 * its stops: they share the same bodies in the same places, so that each hands over to the
 * next without a seam. Where the camera looks comes from `solarView`: at the Sun, past it.
 */
export class SolarLayer extends Layer {
  /** Layer units per AU. */
  private au = 1;
  /** The Sun's centre in content space. */
  private readonly sunPos = new THREE.Vector3();
  private readonly bodies = new BodyBuf();
  private readonly worlds: Body[] = [];
  private sun?: SunMesh;
  private sunLabel?: string;
  private sunAnchor?: LabelAnchor;
  private globe?: { body: Body; mesh: THREE.Group };
  private pulses?: { attribute: THREE.BufferAttribute; from: THREE.Vector3; to: THREE.Vector3 };
  private readonly view: SolarView = { focus: [0, 0, 0], lift: 0 };
  private readonly scratch = new THREE.Vector3();
  private linked = false;

  protected build(): void {
    this.content.rotation.set(ECLIPTIC_TILT, 0, 0);
    this.au = AU / this.unitM;
    this.sunPos.copy(this.at(PLACES.sun));
    const au = this.au;

    switch (this.stop.id) {
      case 'oort':
        this.oortCloud();
        this.cometPath();
        this.nearestStars();
        this.addSun('sun-oort');
        break;
      case 'farSolar':
        for (const [name, orbit] of Object.entries(ECCENTRIC_ORBITS)) {
          const farthest = this.at(heliocentric(orbit.a * (1 + orbit.e), orbit.aphelion));
          if (name === 'planetNine') this.eccentricOrbit(farthest, orbit.e, 0xff9d7a, 0.5, true);
          else this.eccentricOrbit(farthest, orbit.e, 0xc8c2b8, 0.55);
        }
        this.ring(550 * au, 0xffd58a, 0.22);
        this.heliosphere(false);
        this.belt(30, 50, 0.002, 2500, ICE);
        this.belt(50, 1000, 0.12, 2600, ICE);
        this.belt(2000, 9000, 1.2, 9000, ICE);
        this.addSun('sun-far');
        break;
      case 'heliosphere':
        this.orbits(['neptune']);
        this.belt(30, 50, 0.006, 5000, ICE);
        this.belt(50, 110, 0.03, 1800, ICE);
        this.heliosphere();
        // Both Voyagers are heading straight out.
        for (const craft of [PLACES.voyager1, PLACES.voyager2]) {
          const p = this.at(craft);
          this.line([this.sunPos.x, this.sunPos.y, this.sunPos.z, p.x, p.y, p.z], 0xffffff, 0.16, false);
        }
        this.addSun('sun-helio');
        this.giants({}, false);
        this.dwarfs({ eris: 'eris-helio', sedna: 'sedna', gonggong: 'gonggong' });
        break;
      case 'kuiper':
        this.orbits(['jupiter', 'saturn', 'uranus', 'neptune']);
        this.belt(30, 50, 0.02, 14_000, ICE);
        this.belt(50, 110, 0.07, 2600, ICE);
        this.addSun('sun-kuiper');
        this.giants({ neptune: 'neptune-kuiper' }, false);
        this.dwarfs({ pluto: 'pluto', charon: 'charon', eris: 'eris', haumea: 'haumea', makemake: 'makemake', arrokoth: 'arrokoth', quaoar: 'quaoar', orcus: 'orcus' });
        break;
      case 'outer':
        this.orbits(['earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
        this.belt(2.2, 3.2, 0.004, 2600, ROCK);
        this.belt(30, 50, 0.1, 9000, ICE);
        this.trojans(1400);
        // Halley's Comet is at the far end of its orbit.
        this.eccentricOrbit(this.at(PLACES.halley), 0.967, 0xbfefff, 0.28);
        this.addSun('sun-outer');
        for (const name of ['mercury', 'venus', 'earth', 'mars'] as const) this.world(name, PLACES[name], SHRINK_FROM.inner);
        this.giants({ jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus', neptune: 'neptune' }, true);
        this.world('chiron', PLACES.chiron, SHRINK_FROM.giants, 'chiron');
        this.drew('halley', 0);
        this.comet(this.at(PLACES.halley), 0, 0.5);
        break;
      case 'inner': {
        this.orbits(['mercury', 'venus', 'earth', 'mars', 'jupiter']);
        this.belt(2.2, 3.2, 0.03, 9000, ROCK);
        this.trojans(2600);
        this.parkerOrbit();
        this.addSun('sun-inner');
        this.world('mercury', PLACES.mercury, SHRINK_FROM.inner, 'mercury');
        this.world('venus', PLACES.venus, SHRINK_FROM.inner, 'venus');
        const earth = this.world('earth', PLACES.earth, SHRINK_FROM.inner, 'earth-inner');
        this.moon('moon', earth, MOON_LONGITUDE);
        this.world('mars', PLACES.mars, SHRINK_FROM.inner, 'mars');
        this.world('ceres', PLACES.ceres, SHRINK_FROM.inner, 'ceres');
        this.world('vesta', PLACES.vesta, SHRINK_FROM.inner, 'vesta');
        const jupiter = this.world('jupiter', PLACES.jupiter, SHRINK_FROM.giants, 'jupiter-inner');
        for (const name of ['io', 'europa', 'ganymede', 'callisto'] as const) this.moon(name, jupiter, undefined, name);
        this.drew('comet', 0.03);
        this.comet(this.at(PLACES.comet), 0.3, 1);
        break;
      }
      case 'sun':
        this.addSun();
        this.drew('earth-scale', this.earthOnSun());
        break;
      case 'au': {
        this.orbits(['mercury', 'venus', 'earth', 'mars']);
        this.parkerOrbit();
        this.sunbeam();
        this.addSun('sun-au');
        this.world('mercury', PLACES.mercury, SHRINK_FROM.inner, 'mercury-au');
        this.world('venus', PLACES.venus, SHRINK_FROM.inner, 'venus-au');
        this.world('mars', PLACES.mars, SHRINK_FROM.inner);
        const earth = this.addGlobe('earth-au');
        this.moon('moon', earth, MOON_LONGITUDE, 'moon-au');
        break;
      }
      case 'earthMoon': {
        const earth = this.addGlobe('earth-em');
        this.moon('moon', earth, MOON_LONGITUDE, 'moon');
        this.ring(this.u(MOON_DISTANCE), 0x9fb4d8, 0.4, earth.pos);
        // Geostationary satellites, and the navigation satellites half as far out.
        this.ring(this.u(4.2164e7), 0x7df9ff, 0.35, earth.pos);
        this.ring(this.u(2.656e7), 0x7df9ff, 0.2, earth.pos);
        break;
      }
    }

    // The same stars behind every stop: they are far too distant to move as the camera closes in.
    this.scene.add(starfield(this.uniforms));

    if (this.bodies.count > 0) {
      const mesh = this.bodies.toMesh(this.uniforms, this.sunPos);
      mesh.renderOrder = 3;
      this.content.add(mesh);
    }
  }

  caveat(s: number): string | null {
    switch (this.stop.id) {
      case 'oort':
      case 'farSolar':
        return 'Sun drawn far larger than life';
      case 'heliosphere':
      case 'kuiper':
        return 'Sun, planets and dwarf planets drawn far larger than life';
      case 'outer':
      case 'inner':
        return 'Sun, planets and moons drawn far larger than life';
      case 'sun':
        // Once the disc has grown past its minimum size, it is the real thing.
        return this.u(SUN_RADIUS) < sunMinRadius(s) * 10 ** (s - this.stop.s) ? 'Sun drawn larger than life' : 'Corona and prominences brightened so they can be seen';
      case 'au':
        return 'Sun, planets and Moon drawn far larger than life';
      default:
        // Earth and the Moon reach their true sizes just before the camera comes to rest.
        return s <= this.stop.s + 0.07 ? 'Earth, the Moon and the gap between them are to scale' : 'Earth and Moon drawn larger than life';
    }
  }

  protected animate(state: FrameState): void {
    if (!this.linked) this.link();

    // Put the point the camera looks at in the middle of the frame.
    const view = solarView(state.at, state.s, this.view);
    const origin = solarOrigin(this.stop.id);
    const offset = this.scratch
      .set((origin[0] - view.focus[0]) / this.unitM, (origin[1] - view.focus[1]) / this.unitM, (origin[2] - view.focus[2]) / this.unitM)
      .applyEuler(this.content.rotation);
    offset.z -= view.lift / this.unitM;
    this.content.position.copy(offset);

    // Layer units per half-frame at this moment: minimum sizes are fractions of the frame.
    const frame = 10 ** (state.s - this.stop.s);

    if (this.sun) {
      const radius = Math.max(this.u(SUN_RADIUS), sunMinRadius(state.s) * frame);
      this.sun.set(radius, Math.max(0.045 * frame, radius * 4));
      if (this.sunAnchor) this.sunAnchor.radius = radius;
    }

    for (const body of this.worlds) {
      const shrink = 10 ** (-0.9 * Math.max(0, state.s - body.shrinkFrom));
      body.drawn = Math.max(this.u(body.world.radius), body.world.min * shrink * frame);
      const orbit = body.orbit;
      if (orbit) {
        const reach = Math.max(orbit.distance, orbit.gap * orbit.around.drawn);
        const a = orbit.phase + state.t * orbit.rate;
        body.pos.copy(orbit.around.pos).addScaledVector(orbit.x, Math.cos(a) * reach).addScaledVector(orbit.y, Math.sin(a) * reach);
      }
      if (body.index >= 0) this.bodies.place(body.index, body.pos.x, body.pos.y, body.pos.z, body.drawn);
      if (body.anchor) {
        body.anchor.local.copy(body.pos);
        body.anchor.radius = body.drawn * body.reach;
      }
    }
    if (this.bodies.count > 0) this.bodies.commit();

    if (this.globe) {
      // The globe lives outside the tilted content, so that it faces the screen as it does in the Earth layer.
      const { body, mesh } = this.globe;
      mesh.position.copy(body.pos).applyEuler(this.content.rotation).add(this.content.position);
      mesh.scale.setScalar(body.drawn / this.u(body.world.radius));
    }

    if (this.pulses) {
      // Five flashes of light, each crossing from the Sun to Earth in the 499 seconds it really takes.
      const { attribute, from, to } = this.pulses;
      const crossing = (from.distanceTo(to) * this.unitM) / SPEED_OF_LIGHT;
      for (let i = 0; i < attribute.count; i++) {
        const t = (state.t / crossing + i / attribute.count) % 1;
        this.scratch.lerpVectors(from, to, t);
        attribute.setXYZ(i, this.scratch.x, this.scratch.y, this.scratch.z);
      }
      attribute.needsUpdate = true;
    }
  }

  /** Once the catalog's label anchors exist, tie them to the bodies that move or change size. */
  private link(): void {
    this.linked = true;
    const find = (id?: string) => (id ? this.anchors.find((anchor) => anchor.item.id === id) : undefined);
    for (const body of this.worlds) body.anchor = find(body.label);
    this.sunAnchor = find(this.sunLabel);
  }

  /** A heliocentric point (AU) in this layer's content space. */
  private at(point: Vec3): THREE.Vector3 {
    const origin = solarOrigin(this.stop.id);
    return new THREE.Vector3((point[0] * AU - origin[0]) / this.unitM, (point[1] * AU - origin[1]) / this.unitM, (point[2] * AU - origin[2]) / this.unitM);
  }

  private addSun(label?: string): void {
    this.sun = new SunMesh(this.uniforms, this.sunPos);
    this.sun.mesh.renderOrder = 1;
    this.content.add(this.sun.mesh);
    this.sunLabel = label;
    if (label) this.drew(label, 0);
  }

  /** A planet, dwarf planet or asteroid at `place` (AU). */
  private world(name: WorldName, place: Vec3, shrinkFrom: number, label?: string): Body {
    const world: World = WORLDS[name];
    const body: Body = {
      world,
      index: this.bodies.add(world.look),
      pos: this.at(place),
      drawn: 0,
      shrinkFrom,
      label,
      reach: world.look.rings === 'saturn' ? 1.7 : 1,
    };
    if (label) this.drew(label, 0);
    this.worlds.push(body);
    return body;
  }

  /**
   * A moon of `around`, in the plane of its equator.
   * @param longitude where on its orbit it starts, degrees; by default each moon gets its own place
   */
  private moon(name: keyof typeof MOONS, around: Body, longitude?: number, label?: string): Body {
    const tilt = around.world.look.axis ?? [0, 0, 0];
    const equator = new THREE.Euler(tilt[0], tilt[1], tilt[2]);
    const { distance, gap, rate } = MOONS[name];
    const body = this.world(name, PLACES.sun, around.shrinkFrom, label);
    body.orbit = {
      around,
      distance: this.u(distance),
      gap,
      rate,
      phase: longitude === undefined ? this.rng.range(0, Math.PI * 2) : THREE.MathUtils.degToRad(longitude),
      x: new THREE.Vector3(1, 0, 0).applyEuler(equator),
      y: new THREE.Vector3(0, 1, 0).applyEuler(equator),
    };
    return body;
  }

  /** Earth as the full globe of the Earth layer, for the stops where it is about to fill the frame. */
  private addGlobe(label: string): Body {
    const world: World = WORLDS.earth;
    const body: Body = { world, index: -1, pos: this.at(PLACES.earth), drawn: 0, shrinkFrom: SHRINK_FROM.inner, label, reach: 1 };
    const mesh = createGlobe(this.u(world.radius), this.uniforms).object;
    mesh.renderOrder = 2;
    this.root.add(mesh);
    this.globe = { body, mesh };
    this.drew(label, 0);
    this.worlds.push(body);
    return body;
  }

  /**
   * The four giant planets.
   * @param labels catalog ids of the labels of those that get one at this stop
   */
  private giants(labels: Partial<Record<'jupiter' | 'saturn' | 'uranus' | 'neptune', string>>, withMoons: boolean): void {
    const jupiter = this.world('jupiter', PLACES.jupiter, SHRINK_FROM.giants, labels.jupiter);
    const saturn = this.world('saturn', PLACES.saturn, SHRINK_FROM.giants, labels.saturn);
    this.world('uranus', PLACES.uranus, SHRINK_FROM.giants, labels.uranus);
    const neptune = this.world('neptune', PLACES.neptune, SHRINK_FROM.giants, labels.neptune);
    if (!withMoons) return;
    for (const name of ['io', 'europa', 'ganymede', 'callisto'] as const) {
      this.moon(name, jupiter, undefined, name === 'ganymede' ? 'galilean-moons' : undefined);
    }
    this.moon('titan', saturn, undefined, 'titan');
    this.moon('triton', neptune, undefined, 'triton');
  }

  /**
   * The dwarf planets and other small worlds beyond Neptune.
   * @param labels catalog ids of the labels of those that get one at this stop
   */
  private dwarfs(labels: Partial<Record<WorldName, string>>): void {
    const far = SHRINK_FROM.dwarfs;
    const pluto = this.world('pluto', PLACES.pluto, far, labels.pluto);
    this.moon('charon', pluto, undefined, labels.charon);
    for (const name of ['eris', 'haumea', 'makemake', 'sedna', 'gonggong', 'quaoar', 'orcus'] as const) {
      this.world(name, PLACES[name], far, labels[name]);
    }
    const arrokoth = this.world('arrokoth', PLACES.arrokoth, far, labels.arrokoth);
    this.moon('arrokothHead', arrokoth, 40);
  }

  private orbits(names: (keyof typeof ORBITS)[]): void {
    for (const name of names) this.ring(ORBITS[name] * this.au, ORBIT, name === 'earth' ? 0.5 : 0.28);
  }

  /** A circle in the plane of the planets, centred on the Sun unless told otherwise. */
  private ring(radius: number, color: number, opacity: number, center = this.sunPos): void {
    const points: number[] = [];
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      points.push(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius, center.z);
    }
    this.line(points, color, opacity, true);
  }

  /**
   * A stretched orbit with the Sun at one focus, lying as flat in the plane of the planets as
   * its farthest point allows.
   * @param farthest the orbit's farthest point from the Sun, content space
   * @param dashed draw it broken, for an orbit that is only a hypothesis
   */
  private eccentricOrbit(farthest: THREE.Vector3, eccentricity: number, color: number, opacity: number, dashed = false): void {
    const out = farthest.clone().sub(this.sunPos);
    const semiMajor = out.length() / (1 + eccentricity);
    const towardsSun = out.clone().normalize().negate();
    const side = new THREE.Vector3(0, 0, 1).cross(towardsSun).normalize();
    const points: number[] = [];
    const segments = 720;
    for (let i = 0; i < segments; i++) {
      if (dashed && i % 8 >= 5) continue;
      for (const step of dashed ? [i, i + 1] : [i]) {
        // Even steps along the curve rather than in angle, or the far end would be all corners.
        const eccentric = (step / segments) * Math.PI * 2;
        const x = semiMajor * (Math.cos(eccentric) - eccentricity);
        const y = semiMajor * Math.sqrt(1 - eccentricity ** 2) * Math.sin(eccentric);
        points.push(this.sunPos.x + towardsSun.x * x + side.x * y, this.sunPos.y + towardsSun.y * x + side.y * y, this.sunPos.z + towardsSun.z * x + side.z * y);
      }
    }
    this.line(points, color, opacity, !dashed, dashed);
  }

  private line(points: number[], color: number, opacity: number, closed: boolean, segments = false): THREE.Line {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const material = this.fadable(new THREE.LineBasicMaterial({ color, opacity, depthTest: false }));
    const line = segments ? new THREE.LineSegments(geo, material) : closed ? new THREE.LineLoop(geo, material) : new THREE.Line(geo, material);
    line.frustumCulled = false;
    this.content.add(line);
    return line;
  }

  /** A flat ring of small bodies around the Sun, between `inner` and `outer` AU. */
  private belt(inner: number, outer: number, thickness: number, count: number, color: RGB): void {
    const buf = new PointBuf();
    for (let i = 0; i < count; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = (inner + (outer - inner) * this.rng.next()) * this.au;
      buf.add(
        this.sunPos.x + Math.cos(a) * r,
        this.sunPos.y + Math.sin(a) * r,
        this.sunPos.z + this.rng.gauss() * thickness,
        scaleRgb(color, 0.25 + 0.5 * this.rng.next()),
        0,
        1 + 0.9 * this.rng.next() ** 3,
        this.rng.next(),
      );
    }
    this.content.add(buf.toPoints(pointsMaterial(this.uniforms, { soft: 2.6 })));
  }

  /** The Trojans: two swarms of asteroids that share Jupiter's orbit, 60° ahead of it and 60° behind. */
  private trojans(count: number): void {
    const buf = new PointBuf();
    const jupiter = Math.atan2(PLACES.jupiter[1], PLACES.jupiter[0]);
    for (let i = 0; i < count; i++) {
      const a = jupiter + (i % 2 === 0 ? 1 : -1) * (Math.PI / 3) + this.rng.gauss() * 0.16;
      const r = (ORBITS.jupiter + this.rng.gauss() * 0.22) * this.au;
      buf.add(
        this.sunPos.x + Math.cos(a) * r,
        this.sunPos.y + Math.sin(a) * r,
        this.sunPos.z + this.rng.gauss() * 0.45 * this.au,
        scaleRgb(ROCK, 0.22 + 0.4 * this.rng.next()),
        0,
        1 + 0.8 * this.rng.next() ** 3,
        this.rng.next(),
      );
    }
    this.content.add(buf.toPoints(pointsMaterial(this.uniforms, { soft: 2.6 })));
  }

  /**
   * The Sun's bubble: the heliopause, rounded at the nose and open at the tail, and inside it
   * the termination shock. Each is a thin skin of points, with its outline drawn where it
   * crosses the plane of the planets so that the shape can be read.
   * @param skins false to draw the outlines alone, for a stop where the bubble is only a detail
   */
  private heliosphere(skins = true): void {
    const buf = new PointBuf();
    const nose = THREE.MathUtils.degToRad(HELIOPAUSE.longitude);
    const forward = new THREE.Vector3(Math.cos(nose), Math.sin(nose), 0);
    const side = new THREE.Vector3(-Math.sin(nose), Math.cos(nose), 0);
    const up = new THREE.Vector3(0, 0, 1);
    const surfaces: { radius: (angle: number) => number; color: RGB; hex: number; points: number; light: number }[] = [
      { radius: heliopauseRadius, color: [0.42, 0.7, 1.0], hex: 0x6fb8ff, points: 26_000, light: 1 },
      { radius: terminationShockRadius, color: [1.0, 0.72, 0.42], hex: 0xffb070, points: 9000, light: 0.6 },
    ];
    for (const surface of surfaces) {
      for (let i = 0; i < (skins ? surface.points : 0); i++) {
        // Angle away from the nose, and around the axis through it.
        const angle = Math.acos(1 - 1.82 * this.rng.next());
        const around = this.rng.range(0, Math.PI * 2);
        const r = surface.radius(angle) * this.au * (1 + 0.025 * this.rng.gauss());
        const across = Math.sin(angle) * r;
        const p = this.scratch
          .copy(this.sunPos)
          .addScaledVector(forward, Math.cos(angle) * r)
          .addScaledVector(side, Math.cos(around) * across)
          .addScaledVector(up, Math.sin(around) * across);
        // The tail thins out into the distance.
        const fade = 1 - Math.min(1, Math.max(0, (angle - 1.6) / 1.1));
        buf.add(p.x, p.y, p.z, scaleRgb(surface.color, (0.14 + 0.3 * this.rng.next()) * fade * surface.light), 0, 1 + 0.9 * this.rng.next() ** 3, this.rng.next());
      }
      const outline: number[] = [];
      for (let i = -150; i <= 150; i += 2) {
        const angle = THREE.MathUtils.degToRad(i);
        const r = surface.radius(angle) * this.au;
        const p = this.scratch.copy(this.sunPos).addScaledVector(forward, Math.cos(angle) * r).addScaledVector(side, Math.sin(angle) * r);
        outline.push(p.x, p.y, p.z);
      }
      this.line(outline, surface.hex, 0.4 * surface.light, false);
    }
    this.content.add(buf.toPoints(pointsMaterial(this.uniforms, { soft: 2.2 })));
  }

  /**
   * A comet: a glowing head, a straight blue tail of gas blown back by the solar wind, and a
   * curved pale tail of dust. Both point away from the Sun.
   * @param tail length of the gas tail, AU (0 = too far from the Sun to have one)
   */
  private comet(head: THREE.Vector3, tail: number, brightness: number): void {
    const buf = new PointBuf();
    const away = head.clone().sub(this.sunPos).normalize();
    const behind = new THREE.Vector3(0, 0, 1).cross(away).normalize();
    buf.add(head.x, head.y, head.z, scaleRgb([0.75, 1.0, 0.95], 0.9 * brightness), 0, 7, 0);
    buf.add(head.x, head.y, head.z, scaleRgb([0.6, 0.95, 0.9], 0.25 * brightness), 0, 18, 0);
    const length = tail * this.au;
    for (let i = 0; i < (tail > 0 ? 900 : 0); i++) {
      const gas = i % 3 === 0;
      const t = this.rng.next() ** 1.6;
      const spread = length * (gas ? 0.012 : 0.05) * (0.3 + t);
      const p = this.scratch
        .copy(head)
        .addScaledVector(away, t * length * (gas ? 1 : 0.7))
        .addScaledVector(behind, gas ? 0 : t * t * length * 0.35);
      const color: RGB = gas ? [0.45, 0.7, 1.0] : [1.0, 0.92, 0.75];
      buf.add(
        p.x + this.rng.gauss() * spread,
        p.y + this.rng.gauss() * spread,
        p.z + this.rng.gauss() * spread,
        scaleRgb(color, (gas ? 0.4 : 0.3) * (1 - t) ** 1.5 * brightness),
        0,
        1.2 + 1.6 * this.rng.next() ** 2,
        this.rng.next(),
      );
    }
    this.content.add(buf.toPoints(pointsMaterial(this.uniforms, { soft: 2.0 })));
  }

  /** The Parker Solar Probe's orbit: out as far as Venus, in to nine solar radii. */
  private parkerOrbit(): void {
    const [x, y] = PLACES.parker;
    const direction = THREE.MathUtils.radToDeg(Math.atan2(y, x)) + 35;
    this.eccentricOrbit(this.at(heliocentric(0.73, direction)), 0.88, 0xffffff, 0.3);
  }

  /** The line from the Sun to Earth, with light travelling along it at its true speed. */
  private sunbeam(): void {
    const from = this.sunPos.clone();
    const to = this.at(PLACES.earth);
    this.line([from.x, from.y, from.z, to.x, to.y, to.z], 0xffe6a8, 0.5, false);
    const buf = new PointBuf();
    for (let i = 0; i < 5; i++) buf.add(0, 0, 0, [1.0, 0.95, 0.75], 0, 6, 0);
    const points = buf.toPoints(pointsMaterial(this.uniforms, { soft: 2.0 }));
    points.renderOrder = 4;
    this.content.add(points);
    const attribute = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    attribute.setUsage(THREE.DynamicDrawUsage);
    this.pulses = { attribute, from, to };
  }

  /**
   * A circle the size of Earth on the Sun's face, for comparison.
   * @returns its radius in layer units
   */
  private earthOnSun(): number {
    const radius = this.u(EARTH_RADIUS);
    const [cx, cy, cz] = onDisc(EARTH_ON_SUN.x, EARTH_ON_SUN.y);
    const center = this.sunPos.clone().add(new THREE.Vector3(cx, cy, cz).multiplyScalar(this.u(SUN_RADIUS)));
    // Flat to the screen.
    const untilt = new THREE.Euler(-ECLIPTIC_TILT, 0, 0);
    const points: number[] = [];
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const p = this.scratch.set(Math.cos(a) * radius, Math.sin(a) * radius, 0).applyEuler(untilt).add(center);
      points.push(p.x, p.y, p.z);
    }
    this.line(points, 0xd8f4ff, 0.9, true).renderOrder = 4;
    return radius;
  }

  /** A huge, thin, roughly spherical cloud of comets with a denser, flatter inner part. */
  private oortCloud(): void {
    const au = this.au;
    const buf = new PointBuf();
    for (let i = 0; i < 46_000; i++) {
      const [x, y, z] = this.rng.onSphere();
      const innerCloud = this.rng.next() < 0.35;
      const r = innerCloud ? (2000 + 18_000 * this.rng.next() ** 1.4) * au : (20_000 + 80_000 * this.rng.next() ** 0.8) * au;
      buf.add(
        x * r,
        y * r,
        z * r * (innerCloud ? 0.35 : 1),
        scaleRgb(ICE, (innerCloud ? 0.14 : 0.2) + (innerCloud ? 0.22 : 0.45) * this.rng.next()),
        0,
        (innerCloud ? 1.3 : 1) + 0.8 * this.rng.next() ** 4,
        this.rng.next(),
      );
    }
    this.content.add(buf.toPoints(pointsMaterial(this.uniforms, { soft: 2.6, twinkle: 0.2 })));
  }

  /** The path of a long-period comet: a sliver of an ellipse reaching from the cloud down to the Sun. */
  private cometPath(): void {
    const comet = itemsFor(this.stop.id).find((item) => item.id === 'long-comet');
    if (!comet) return;
    const farthest = new THREE.Vector3(...comet.pos).multiplyScalar(1.9);
    this.eccentricOrbit(farthest, 0.9999, 0xbfefff, 0.3);
  }

  /**
   * The nearest stars, where the layer before this one left them. That layer is drawn in
   * galactic coordinates, so these get a group of their own, turned the same way.
   */
  private nearestStars(): void {
    const sky = new THREE.Group();
    sky.rotation.copy(galacticView(this.stop.s));
    this.root.add(sky);
    const glints = new PointBuf();
    // Catalog positions are in the units of their own layer.
    const shrink = 10 ** (STOPS[stopIndex('neighborhood')].s - this.stop.s);
    for (const item of itemsFor('neighborhood')) {
      if (item.kind !== 'star') continue;
      const { px, light } = glint(item.size, item.color ?? 0xfff2c0);
      glints.add(item.pos[0] * shrink, item.pos[1] * shrink, item.pos[2] * shrink, scaleRgb(rgb(item.color ?? 0xfff2c0), light), 0, px, this.rng.next());
    }
    sky.add(glints.toPoints(starsMaterial(this.uniforms)));
    this.drew('alpha-cen-oort', 0, sky);
  }
}
