import * as THREE from 'three';
import { itemsFor } from '../app/catalog';
import { STOPS } from '../app/timeline';
import { LIGHT_YEAR } from '../util/format';
import { hashString, Rng } from '../util/rng';
import { STOP_VIEWPOINT } from './constants';
import { MAGELLANIC_CLOUDS, milkyWaySystem, MILKY_WAY_VISIBLE_LY } from './galaxy';
import { GalaxyBuf, LOOKS, orient, randomLook, type GalaxyInstance } from './galaxySprites';
import { blob, cosmicWeb, field, puff } from './gen';
import { Layer, type FrameState } from './layer';
import { homeMagnification, LOCAL_GROUP_MAGNIFICATION, NEIGHBOR_MAGNIFICATION } from './magnify';
import { NOISE_GLSL } from './noise';
import { mixRgb, PointBuf, pointsMaterial, rgb, scaleRgb, type RGB } from './points';
import { CARTWHEEL, LOCAL_GROUP, NEIGHBOR_GROUPS, neighborRadius, NEIGHBORS, VISIBLE_FRACTION, type ZooEntry } from './zoo';

type Vec3 = [number, number, number];

const GALAXY_BLUE: RGB = [0.62, 0.74, 1.0];
const GALAXY_WARM: RGB = [1.0, 0.86, 0.68];
const GALAXY_WHITE: RGB = [0.92, 0.94, 1.0];

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * Every cosmos layer sways identically, so consecutive layers stay aligned while they crossfade.
 * The sway dies away towards the Local Group, which has to hand over to the (static) Milky Way.
 */
function sway(content: THREE.Group, t: number, s: number): void {
  const amount = smooth((s - 22.5) / 0.9);
  content.rotation.y = 0.14 * amount * Math.sin(t * 0.045);
  content.rotation.x = 0.07 * amount * Math.sin(t * 0.033 + 1.3);
}

/** An elongated, slightly curved sheet of galaxies. */
function wall(buf: PointBuf, rng: Rng, center: Vec3, length: number, color: RGB, points: number, curve = 0.15): void {
  const angle = rng.range(0, Math.PI);
  const dir = [Math.cos(angle), Math.sin(angle)];
  for (let i = 0; i < points; i++) {
    const t = rng.range(-0.5, 0.5);
    const bend = curve * length * (1 - 4 * t * t);
    const across = rng.gauss() * length * 0.045 + bend;
    buf.add(
      center[0] + dir[0] * t * length - dir[1] * across,
      center[1] + dir[1] * t * length + dir[0] * across,
      center[2] + rng.gauss() * length * 0.1,
      scaleRgb(color, 0.5 + 0.5 * rng.next()),
      0,
      1.2 + 1.6 * rng.next() ** 3,
      rng.next(),
    );
  }
}

/** A stable per-object seed, so a galaxy looks the same in every layer that draws it. */
function seedOf(id: string): number {
  return (hashString(id) % 9973) / 9.973;
}

const CMB_VERT = /* glsl */ `
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vPos = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const CMB_FRAG = /* glsl */ `
uniform float uFade;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
${NOISE_GLSL}
void main() {
  vec3 p = normalize(vPos);
  float n = fbm(p * 9.0) * 0.65 + fbm(p * 34.0) * 0.35;
  n = smoothstep(0.28, 0.72, n);
  // Planck-style palette: cold blue → teal → yellow → hot red.
  vec3 cold = vec3(0.05, 0.16, 0.55);
  vec3 mid = vec3(0.10, 0.62, 0.70);
  vec3 warm = vec3(1.0, 0.82, 0.30);
  vec3 hot = vec3(0.95, 0.30, 0.12);
  vec3 col = mix(cold, mid, smoothstep(0.0, 0.4, n));
  col = mix(col, warm, smoothstep(0.35, 0.7, n));
  col = mix(col, hot, smoothstep(0.7, 1.0, n));
  // Strong at the limb, nearly clear in the middle so the web inside shows through.
  float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.4);
  float alpha = (0.07 + 0.93 * rim) * uFade;
  gl_FragColor = vec4(col * (0.5 + 0.8 * rim), alpha);
}
`;

/** The observable universe: a bubble of ancient light with the cosmic web inside. */
export class UniverseLayer extends Layer {
  protected build(): void {
    const radius = this.u(8.8e26 / 2);

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 128, 96),
      new THREE.ShaderMaterial({
        vertexShader: CMB_VERT,
        fragmentShader: CMB_FRAG,
        uniforms: { uFade: this.uniforms.uFade },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.content.add(shell);

    const glow = new PointBuf();
    puff(glow, this.rng, [0, 0, 0], radius * 2.3, [0.16, 0.26, 0.6], 5, 0.12);
    this.content.add(glow.toPoints(pointsMaterial(this.uniforms, { soft: 1.1 })));

    const web = new PointBuf();
    cosmicWeb(web, this.rng, {
      nodes: 280,
      points: 70_000,
      radius: radius * 0.97,
      thickness: 0.014,
      colorA: GALAXY_BLUE,
      colorB: GALAXY_WARM,
      px: [1.0, 2.4],
    });
    this.content.add(web.toPoints(pointsMaterial(this.uniforms, { soft: 2.4, twinkle: 0.25 })));
  }

  protected animate(state: FrameState): void {
    sway(this.content, state.t, state.s);
  }
}

/** Large-scale structure: the cosmic web, plus the walls, superclusters and voids the catalog places in it. */
export class WebLayer extends Layer {
  protected build(): void {
    const items = itemsFor(this.stop.id);
    const web = new PointBuf();

    // Cells are drawn larger than life: at true scale the web would be too fine to read as a web.
    const fine = this.stop.id === 'walls';
    const haze = new PointBuf();
    cosmicWeb(web, this.rng, {
      nodes: fine ? 1000 : 520,
      points: fine ? 300_000 : 220_000,
      radius: fine ? 3.8 : 4.2,
      flatten: 0.3,
      softEdge: true,
      thickness: fine ? 0.0045 : 0.007,
      colorA: GALAXY_BLUE,
      colorB: GALAXY_WARM,
      px: [1.0, 2.4],
      haze,
      voids: items.filter((i) => i.kind === 'void').map((i) => ({ center: i.pos, radius: this.u(i.size) / 2 })),
    });

    const sprites = new GalaxyBuf(STOP_VIEWPOINT);
    for (const item of items) {
      const size = this.u(item.size);
      if (item.id === 'laniakea') {
        this.laniakea(web, haze, size / 2);
      } else if (item.id === 'cartwheel') {
        // One galaxy among the superclusters, enlarged beyond all proportion so it can be seen at all.
        const visible = 0.024;
        sprites.add(instance(item.pos, visible, CARTWHEEL, seedOf(item.id)));
        this.drew(item.id, visible);
      } else if (item.kind === 'structure' && size > 0.08) {
        const color = scaleRgb(rgb(item.color ?? 0xdfe6ff), 0.6);
        wall(web, this.rng, item.pos, size, color, Math.round(700 + 3200 * size), item.id === 'giant-arc' ? 0.45 : 0.15);
        puff(haze, this.rng, item.pos, size * 0.7, [0.5, 0.42, 1.0], 3, 0.05);
      } else if (item.kind === 'supercluster') {
        const sigma = Math.max(size / 3.2, 0.025);
        blob(web, this.rng, {
          center: item.pos,
          sigma,
          points: Math.round(400 + 2600 * size),
          color: scaleRgb(GALAXY_WARM, 0.85),
          colorB: scaleRgb(GALAXY_WHITE, 0.85),
          px: [1.2, 2.8],
          flatten: 0.6,
        });
        puff(haze, this.rng, item.pos, sigma * 4, [1.0, 0.7, 0.4], 3, 0.06);
      }
    }
    this.content.add(haze.toPoints(pointsMaterial(this.uniforms, { soft: 1.2 })));
    this.content.add(web.toPoints(pointsMaterial(this.uniforms, { soft: 2.4, twinkle: 0.2 })));
    if (sprites.count > 0) this.content.add(sprites.toMesh(this.uniforms));
  }

  /**
   * Our home supercluster as its discoverers drew it: the basin within which every galaxy is
   * falling towards one point, the Great Attractor, with the outline of the basin around it.
   */
  private laniakea(web: PointBuf, haze: PointBuf, radius: number): void {
    const rng = this.rng;
    const attractor = itemsFor(this.stop.id).find((i) => i.id === 'great-attractor')!.pos;
    // We sit near the edge of the basin, not at its middle.
    const center: Vec3 = [attractor[0] * 0.75, attractor[1] * 0.75, 0];
    const reach = (a: number) => radius * (1 + 0.2 * Math.sin(2 * a + 0.7) + 0.12 * Math.sin(3 * a + 2.1) + 0.07 * Math.sin(5 * a));
    const edge = (a: number): Vec3 => [center[0] + reach(a) * Math.cos(a), center[1] + reach(a) * Math.sin(a), 0];

    const outline: RGB = [1.0, 0.56, 0.2];
    for (let i = 0; i < 1400; i++) {
      const p = edge(rng.range(0, Math.PI * 2));
      web.add(p[0] + rng.gauss() * 0.0016, p[1] + rng.gauss() * 0.0016, rng.gauss() * 0.004, scaleRgb(outline, 0.45 + 0.3 * rng.next()), 0, 1.3, rng.next());
    }

    const far: RGB = [0.7, 0.8, 1.0];
    const near: RGB = [1.0, 0.82, 0.55];
    const stream = (from: Vec3, bright: number, tint?: RGB) => {
      // Flows bend as they gather into a few great rivers.
      const dx = attractor[0] - from[0];
      const dy = attractor[1] - from[1];
      const bow = rng.range(-0.32, 0.32);
      const mid: Vec3 = [from[0] + dx * 0.5 - dy * bow, from[1] + dy * 0.5 + dx * bow, rng.gauss() * 0.01];
      for (let j = 0; j < 150; j++) {
        // Thinned out towards the end: a hundred streams meet there, and would burn out the picture.
        const t = 0.94 * rng.next() ** 1.25;
        const a = (1 - t) * (1 - t);
        const b = 2 * t * (1 - t);
        const c = t * t;
        const color = scaleRgb(tint ?? mixRgb(far, near, t), bright * (0.3 + 0.5 * t));
        web.add(
          a * from[0] + b * mid[0] + c * attractor[0] + rng.gauss() * 0.0018,
          a * from[1] + b * mid[1] + c * attractor[1] + rng.gauss() * 0.0018,
          a * from[2] + b * mid[2] + c * attractor[2] + rng.gauss() * 0.004,
          color,
          0,
          1 + 0.9 * t,
          rng.next(),
        );
      }
    };
    for (let k = 0; k < 110; k++) {
      const a = rng.range(0, Math.PI * 2);
      const [ex, ey] = edge(a);
      const depth = rng.range(0.35, 1);
      stream([center[0] + (ex - center[0]) * depth, center[1] + (ey - center[1]) * depth, rng.gauss() * 0.015], 0.5);
    }
    // Our own path.
    for (let k = 0; k < 3; k++) stream([0, 0, 0], 1, [0.5, 0.95, 1.0]);

    puff(haze, rng, attractor, radius * 0.3, [1.0, 0.7, 0.35], 3, 0.07);
    this.drew('laniakea', 0);
  }

  protected animate(state: FrameState): void {
    sway(this.content, state.t, state.s);
  }

  caveat(): string {
    return 'Cosmic web drawn coarser than life';
  }
}

/** Galaxy clusters: dense swarms of galaxies along the filaments of the web, and the void beside us. */
export class ClustersLayer extends Layer {
  protected build(): void {
    const rng = this.rng;
    const items = itemsFor(this.stop.id);
    const points = new PointBuf();
    const haze = new PointBuf();
    const sprites = new GalaxyBuf(STOP_VIEWPOINT);

    cosmicWeb(points, rng, {
      nodes: 260,
      points: 80_000,
      radius: 5.2,
      flatten: 0.35,
      softEdge: true,
      thickness: 0.013,
      colorA: GALAXY_BLUE,
      colorB: GALAXY_WARM,
      px: [1.0, 2.4],
      haze,
      voids: items.filter((i) => i.kind === 'void').map((i) => ({ center: i.pos, radius: this.u(i.size) / 2 })),
    });

    // Galaxies large enough to show a shape, scattered along the same filaments.
    const webPoints = points.count;
    for (let i = 0; i < 800; i++) {
      sprites.add(this.smallGalaxy(points.positionOf(rng.int(webPoints)), rng.range(0.006, 0.016), randomLook(rng)));
    }

    for (const item of items) {
      if (item.kind === 'cluster') {
        const sigma = Math.max(this.u(item.size) / 3.2, 0.014);
        blob(points, rng, {
          center: item.pos,
          sigma,
          points: Math.round(220 + 6000 * sigma),
          color: scaleRgb(GALAXY_WARM, 0.6),
          colorB: scaleRgb(GALAXY_WHITE, 0.6),
          px: [1.0, 2.2],
        });
        // Giant ellipticals at the heart, spirals further out.
        const members = Math.round(8 + 260 * sigma);
        for (let i = 0; i < members; i++) {
          const spread = sigma * (i < 3 ? 0.35 : 1.5);
          const center: Vec3 = [item.pos[0] + rng.gauss() * spread, item.pos[1] + rng.gauss() * spread, item.pos[2] + rng.gauss() * spread];
          const look = i < 3 ? LOOKS.giantElliptical : rng.next() < 0.6 ? LOOKS.elliptical : randomLook(rng);
          sprites.add(this.smallGalaxy(center, i < 3 ? rng.range(0.016, 0.024) : rng.range(0.007, 0.014), look));
        }
        // Hot gas between the galaxies.
        puff(haze, rng, item.pos, sigma * 5, [1.0, 0.5, 0.28], 5, 0.09);
      } else if (item.kind === 'supercluster') {
        // The Local Supercluster: a flattened cloud of galaxies stretching from us towards Virgo.
        blob(points, rng, {
          center: item.pos,
          sigma: this.u(item.size) / 4,
          points: 3200,
          color: GALAXY_BLUE,
          colorB: GALAXY_WARM,
          px: [1.0, 2.4],
          flatten: 0.3,
        });
        for (let i = 0; i < 90; i++) {
          const spread = this.u(item.size) / 4;
          const center: Vec3 = [item.pos[0] + rng.gauss() * spread, item.pos[1] + rng.gauss() * spread, rng.gauss() * spread * 0.3];
          sprites.add(this.smallGalaxy(center, rng.range(0.006, 0.014), randomLook(rng)));
        }
      }
    }

    // The Local Group, at the origin.
    blob(points, rng, { center: [0, 0, 0], sigma: 0.008, points: 24, color: GALAXY_WHITE, px: [1.2, 2.4] });

    this.content.add(haze.toPoints(pointsMaterial(this.uniforms, { soft: 1.2 })));
    this.content.add(points.toPoints(pointsMaterial(this.uniforms, { soft: 2.4, twinkle: 0.2 })));
    this.content.add(sprites.toMesh(this.uniforms));
  }

  private smallGalaxy(center: Vec3, radius: number, look: GalaxyInstance['look']): GalaxyInstance {
    const rng = this.rng;
    return {
      center,
      radius,
      look,
      incl: rng.range(0, 88),
      pa: rng.range(0, 180),
      spin: rng.range(0, 6.28),
      seed: rng.range(0, 900),
      brightness: rng.range(0.7, 1.15),
      fadeNear: true,
    };
  }

  protected animate(state: FrameState): void {
    sway(this.content, state.t, state.s);
  }

  caveat(): string {
    return 'Galaxies drawn larger than life';
  }
}

const LOCAL_GROUP_UNIT_M = 10 ** STOPS.find((stop) => stop.id === 'localGroup')!.s / 2;

interface Member {
  /** Catalog id, for the members that carry a label. */
  id?: string;
  /** Radius of the part that reads as the galaxy, for placing its label. */
  visible: number;
  galaxy: GalaxyInstance;
}

function instance(center: Vec3, visible: number, entry: ZooEntry, seed: number): GalaxyInstance {
  return {
    center,
    radius: visible / VISIBLE_FRACTION,
    look: entry.look,
    incl: entry.incl,
    pa: entry.pa,
    spin: entry.spin,
    seed,
    brightness: entry.brightness,
  };
}

/**
 * Every galaxy of the Local Group except the Milky Way system, in the units of the Local Group
 * layer. Two layers draw them (scaled), so they come from one place and from their own seed.
 */
function localGroupMembers(): Member[] {
  const rng = new Rng('local-group-members');
  const members: Member[] = [];
  const dwarf = (center: Vec3, visible: number, spheroidal: boolean) =>
    members.push({
      visible,
      galaxy: {
        center,
        radius: visible / VISIBLE_FRACTION,
        look: spheroidal ? LOOKS.dwarfElliptical : LOOKS.irregular,
        incl: rng.range(0, 70),
        pa: rng.range(0, 180),
        seed: rng.range(0, 900),
        brightness: rng.range(0.6, 1),
        // Faint and shapeless: fine as specks, but not something to fly through.
        fadeNear: true,
      },
    });

  for (const item of itemsFor('localGroup')) {
    const entry = LOCAL_GROUP[item.id];
    if (!entry) continue;
    // A galaxy's quoted size is roughly where its disc ends, which is the sprite's full radius.
    const full = (item.size / 2 / LOCAL_GROUP_UNIT_M) * LOCAL_GROUP_MAGNIFICATION;
    const visible = entry.radius ?? Math.max(full * VISIBLE_FRACTION, 0.018);
    members.push({ id: item.id, visible, galaxy: instance(item.pos, visible, entry, seedOf(item.id)) });

    const [x, y, z] = item.pos;
    if (item.id === 'andromeda') {
      // Its two bright companions, M32 and M110.
      members.push({ visible: 0.012, galaxy: instance([x + 0.012, y - 0.028, z + 0.02], 0.012, { look: { ...LOOKS.elliptical, bulge: 0.2, bulgeLight: 2.2 }, incl: 0, pa: 0 }, 3.1) });
      members.push({ visible: 0.02, galaxy: instance([x - 0.035, y + 0.04, z + 0.02], 0.02, { look: { ...LOOKS.dwarfElliptical, bulgeFlatten: 0.55 }, incl: 60, pa: 170 }, 5.2) });
      // And a swarm of fainter ones.
      for (let i = 0; i < 16; i++) dwarf([x + rng.gauss() * 0.11, y + rng.gauss() * 0.11, z + rng.gauss() * 0.08], rng.range(0.005, 0.009), rng.next() < 0.7);
    } else if (item.id === 'ngc147-185') {
      members.push({ visible: 0.014, galaxy: instance([x - 0.028, y + 0.012, z], 0.014, entry, 8.4) });
    }
  }
  // The Milky Way's own faint companions.
  for (let i = 0; i < 14; i++) {
    const [x, y, z] = rng.onSphere();
    const r = rng.range(0.07, 0.2);
    dwarf([x * r, y * r, z * r * 0.6], rng.range(0.005, 0.009), true);
  }
  // Pin the orientations down here, so both layers that draw these galaxies show them the same way round.
  for (const { galaxy } of members) {
    galaxy.orientation = orient(galaxy.center, galaxy.incl ?? 0, galaxy.pa ?? 0, STOP_VIEWPOINT);
  }
  return members;
}

/**
 * Our galactic neighbourhood: the famous galaxies within about 60 million light-years, each
 * drawn far larger than life so that its shape can be seen, with the Local Group at the centre.
 */
export class NeighborsLayer extends Layer {
  private home = new THREE.Group();

  protected build(): void {
    const rng = this.rng;
    const points = new PointBuf();
    const glow = new PointBuf();
    const sprites = new GalaxyBuf(STOP_VIEWPOINT);

    // The unnamed thousands, near and far.
    field(points, rng, { points: 3600, radius: 7, colors: [GALAXY_BLUE, GALAXY_WARM, GALAXY_WHITE], px: [1.0, 2.2], flatten: 0.6, brightness: [0.12, 0.5] });
    for (let i = 0; i < 1500; i++) {
      const [x, y, z] = rng.inSphere();
      const center: Vec3 = [x * 6.5, y * 6.5, z * 1.3];
      if (Math.hypot(center[0], center[1]) < 0.14) continue;
      sprites.add(this.background(center, 0.006 + 0.03 * rng.next() ** 3));
    }

    for (const item of itemsFor(this.stop.id)) {
      const [x, y, z] = item.pos;
      const entry = NEIGHBORS[item.id];
      if (entry) {
        const visible = neighborRadius(entry, this.u(item.size));
        sprites.add(instance(item.pos, visible, entry, seedOf(item.id)));
        this.drew(item.id, visible);
      } else if (item.id in NEIGHBOR_GROUPS) {
        this.drew(item.id, NEIGHBOR_GROUPS[item.id]);
      }
      switch (item.id) {
        case 'm81':
          // M82, the Cigar: an edge-on starburst blowing a red wind out of its disc.
          this.cigar(sprites, glow, [x + 0.115, y + 0.075, z]);
          break;
        case 'whirlpool':
          // NGC 5195, the small companion at the end of one arm.
          sprites.add(instance([x + 0.058, y + 0.07, z], 0.03, { look: { ...LOOKS.lenticular, disc: 0.4 }, incl: 40, pa: 100 }, 6.6));
          break;
        case 'm87':
          this.swarm(sprites, item.pos, 0.11, 0.075, 46);
          break;
        case 'ngc1365':
          this.swarm(sprites, item.pos, 0.1, 0.085, 22);
          break;
        case 'antennae':
          this.antennae(sprites, points, item.pos);
          break;
        case 'leo-triplet':
          sprites.add(instance([x + 0.045, y - 0.035, z], 0.045, { look: { ...LOOKS.grandDesign, flocculence: 0.5 }, incl: 62, pa: 80 }, 12.1));
          sprites.add(instance([x - 0.05, y - 0.03, z], 0.042, { look: { ...LOOKS.multiArm, starFormation: 0.5 }, incl: 72, pa: 95 }, 13.7));
          sprites.add(instance([x, y + 0.055, z], 0.055, { look: { ...LOOKS.grandDesign, dust: 3.2, thickness: 0.03, disc: 1 }, incl: 88, pa: 8 }, 14.9));
          break;
      }
    }

    // The Local Group, exactly as the next layer draws it, so the handover cannot be seen.
    const shrink = LOCAL_GROUP_UNIT_M / this.unitM;
    for (const { galaxy } of localGroupMembers()) {
      const [x, y, z] = galaxy.center;
      sprites.add({ ...galaxy, center: [x * shrink, y * shrink, z * shrink], radius: galaxy.radius * shrink });
    }
    this.home = milkyWaySystem(this.uniforms, this.unitM / LIGHT_YEAR);
    this.drew('local-group', 0.03);

    this.content.add(points.toPoints(pointsMaterial(this.uniforms, { soft: 2.2, twinkle: 0.15 })));
    this.content.add(glow.toPoints(pointsMaterial(this.uniforms, { soft: 1.2 })));
    this.content.add(sprites.toMesh(this.uniforms));
    this.content.add(this.home);
  }

  private background(center: Vec3, radius: number): GalaxyInstance {
    const rng = this.rng;
    return {
      center,
      radius,
      look: randomLook(rng),
      incl: rng.range(0, 88),
      pa: rng.range(0, 180),
      spin: rng.range(0, 6.28),
      seed: rng.range(0, 900),
      brightness: rng.range(0.45, 0.95),
      fadeNear: true,
    };
  }

  /** A loose cluster of small galaxies around a giant: mostly ellipticals, as in real clusters. */
  private swarm(sprites: GalaxyBuf, center: Vec3, sigma: number, keepClear: number, count: number): void {
    const rng = this.rng;
    for (let i = 0; i < count; i++) {
      const dx = rng.gauss() * sigma;
      const dy = rng.gauss() * sigma;
      if (Math.hypot(dx, dy) < keepClear) continue;
      const galaxy = this.background([center[0] + dx, center[1] + dy, center[2] + rng.gauss() * sigma], rng.range(0.012, 0.032));
      sprites.add({ ...galaxy, look: rng.next() < 0.65 ? LOOKS.elliptical : galaxy.look, brightness: 1, fadeNear: false });
    }
  }

  private cigar(sprites: GalaxyBuf, glow: PointBuf, center: Vec3): void {
    const rng = this.rng;
    const pa = THREE.MathUtils.degToRad(65);
    sprites.add(instance(center, 0.042, { look: { ...LOOKS.irregular, thickness: 0.06, disc: 1.2, dust: 2.4 }, incl: 80, pa: 65 }, 21.4));
    // The wind leaves along the disc's axis, on both sides.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const d = side * (0.008 + 0.009 * i);
        glow.add(center[0] - Math.sin(pa) * d + rng.gauss() * 0.003, center[1] + Math.cos(pa) * d + rng.gauss() * 0.003, center[2], [0.22 - 0.035 * i, 0.04, 0.035], 0.018 + 0.004 * i, 3, rng.next());
      }
    }
  }

  /** Two colliding spirals and the long tails of stars the collision has flung out. */
  private antennae(sprites: GalaxyBuf, points: PointBuf, center: Vec3): void {
    const rng = this.rng;
    const [x, y, z] = center;
    const look = { ...LOOKS.flocculent, starFormation: 1, disc: 1.15, dust: 1.6 };
    const bodies: Vec3[] = [[x - 0.022, y + 0.014, z], [x + 0.026, y - 0.016, z]];
    sprites.add(instance(bodies[0], 0.04, { look, incl: 35, pa: 40 }, 31.2));
    sprites.add(instance(bodies[1], 0.038, { look, incl: 52, pa: 150 }, 33.8));
    const tails = [
      { from: bodies[0], heading: 2.2, turn: -1.5, length: 0.2 },
      { from: bodies[1], heading: -0.9, turn: -1.3, length: 0.17 },
    ];
    for (const tail of tails) {
      for (let i = 0; i < 520; i++) {
        const t = rng.next();
        const angle = tail.heading + tail.turn * t;
        // Integrating a steadily turning heading gives an arc.
        const px = tail.from[0] + (Math.sin(angle) - Math.sin(tail.heading)) * (tail.length / tail.turn);
        const py = tail.from[1] - (Math.cos(angle) - Math.cos(tail.heading)) * (tail.length / tail.turn);
        const width = 0.004 + 0.012 * t;
        points.add(px + rng.gauss() * width, py + rng.gauss() * width, z + rng.gauss() * width, scaleRgb(GALAXY_BLUE, (0.75 - 0.5 * t) * (0.6 + 0.4 * rng.next())), 0, 1 + 0.8 * rng.next() ** 2, rng.next());
      }
    }
  }

  protected animate(state: FrameState): void {
    sway(this.content, state.t, state.s);
    this.home.scale.setScalar(homeMagnification(state.s));
  }

  caveat(): string {
    return `Named galaxies drawn about ${NEIGHBOR_MAGNIFICATION}× larger than life`;
  }
}

/** The Local Group: the Milky Way, Andromeda, Triangulum and their dwarf companions. */
export class LocalGroupLayer extends Layer {
  private home = new THREE.Group();

  protected build(): void {
    const rng = this.rng;
    const points = new PointBuf();
    const sprites = new GalaxyBuf(STOP_VIEWPOINT);

    // Far beyond the group: the rest of the universe, faint.
    field(points, rng, { points: 1400, radius: 7, colors: [GALAXY_BLUE, GALAXY_WARM, GALAXY_WHITE], px: [1.0, 1.9], flatten: 0.6, brightness: [0.1, 0.4] });
    for (let i = 0; i < 520; i++) {
      const [x, y, z] = rng.inSphere();
      sprites.add({
        center: [x * 6.5, y * 6.5, -1.2 + z * 1.0],
        radius: 0.005 + 0.014 * rng.next() ** 3,
        look: randomLook(rng),
        incl: rng.range(0, 88),
        pa: rng.range(0, 180),
        seed: rng.range(0, 900),
        brightness: rng.range(0.3, 0.6),
        fadeNear: true,
      });
    }

    for (const member of localGroupMembers()) {
      sprites.add(member.galaxy);
      if (member.id) this.drew(member.id, member.visible);
    }

    const unitLy = this.unitM / LIGHT_YEAR;
    this.home = milkyWaySystem(this.uniforms, unitLy);
    this.drew('milky-way', (MILKY_WAY_VISIBLE_LY / unitLy) * LOCAL_GROUP_MAGNIFICATION);
    // The Magellanic Clouds live inside the magnified Milky Way system, in its galactic coordinates.
    for (const cloud of MAGELLANIC_CLOUDS) this.drew(`${cloud.id}-lg`, (cloud.radius * 0.7) / unitLy, this.home);

    this.content.add(points.toPoints(pointsMaterial(this.uniforms, { soft: 2.2, twinkle: 0.15 })));
    this.content.add(sprites.toMesh(this.uniforms));
    this.content.add(this.home);
  }

  protected animate(state: FrameState): void {
    sway(this.content, state.t, state.s);
    // Our own galaxy relaxes towards its true size as the camera heads for it.
    this.home.scale.setScalar(homeMagnification(state.s));
  }

  caveat(): string {
    return `Galaxies drawn ${LOCAL_GROUP_MAGNIFICATION}× larger than life`;
  }
}
