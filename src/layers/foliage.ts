import * as THREE from 'three';
import { siteToView, SUN_AT_SITE } from '../app/earthSite';
import { bladeHalfWidth, LEAF } from '../app/leaf';
import { CAM_DIST } from './constants';
import { Layer, type FrameState } from './layer';
import { LEAF_GLSL } from './leafShaders';

/** Direction to the Sun as the screen sees it, the same as in the layers above. */
const SUN = new THREE.Vector3(...siteToView(SUN_AT_SITE)).normalize();
/** How brightly a leaf lying flat is lit: everything is scaled so that this comes out as 1. */
const FLAT_LIGHT = 0.35 + 0.75 * SUN.z;

/**
 * The outline of a leaf as a mesh, in leaf coordinates (metres): x along the midrib, y across.
 * @param centre the point of the leaf that is put at the mesh's origin
 * @param shaped whether the blade is folded a little along the midrib and droops towards the tip
 */
function leafGeometry(centre: [number, number], shaped: boolean, along = 20, across = 6): THREE.BufferGeometry {
  const positions: number[] = [];
  const leaf: number[] = [];
  for (let i = 0; i <= along; i++) {
    // Closer together near the two ends, where the outline turns fastest.
    const t = 0.5 - 0.5 * Math.cos((i / along) * Math.PI);
    const x = t * LEAF.length;
    const half = bladeHalfWidth(x);
    for (let j = 0; j <= across; j++) {
      const y = (j / across - 0.5) * 2 * half;
      const z = shaped ? 0.18 * Math.abs(y) - 0.9 * (t - 0.4) ** 2 * LEAF.length * 0.35 : 0;
      positions.push(x - centre[0], y - centre[1], z);
      leaf.push(x, y);
    }
  }
  const index: number[] = [];
  const row = across + 1;
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < across; j++) {
      const a = i * row + j;
      index.push(a, a + row, a + row + 1, a, a + row + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aLeaf', new THREE.Float32BufferAttribute(leaf, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

const CROWD_VERT = /* glsl */ `
attribute vec2 aLeaf;
attribute vec4 aTint;      // colour, and a number that tells the leaves apart
uniform float uTime;
uniform float uUnit;       // metres per layer unit
varying vec2 vLeaf;
varying vec3 vNormal;
varying vec3 vTint;
varying float vDepth;
varying float vNear;
void main() {
  // Every leaf stirs a little in the wind, each to its own rhythm, hinged at its stalk.
  float sway = 0.07 * sin(uTime * (0.7 + aTint.w * 0.9) + aTint.w * 40.0);
  vec3 p = position;
  float c = cos(sway);
  float s = sin(sway);
  p = vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
  vec3 n = vec3(normal.x, c * normal.y - s * normal.z, s * normal.y + c * normal.z);
  vec4 world = instanceMatrix * vec4(p, 1.0);
  vec4 mv = modelViewMatrix * world;
  gl_Position = projectionMatrix * mv;
  vLeaf = aLeaf;
  vNormal = normalMatrix * mat3(instanceMatrix) * n;
  vTint = aTint.rgb;
  // How far below the top of the crown this leaf hangs, metres: the deeper, the less light reaches it.
  vDepth = -world.z * uUnit;
  vNear = -mv.z;
}
`;

const CROWD_FRAG = /* glsl */ `
uniform float uFade;
uniform vec3 uSun;
varying vec2 vLeaf;
varying vec3 vNormal;
varying vec3 vTint;
varying float vDepth;
varying float vNear;
${LEAF_GLSL}

void main() {
  float soft = max(uPixel * 1.5, 1e-6);
  float inside = blade(vLeaf, soft);
  float veins = mainVeins(vLeaf, soft) * smoothstep(0.6, 2.0, 0.0005 / soft);
  vec3 col = mix(vTint, vec3(0.56, 0.69, 0.33), veins * 0.8);

  vec3 n = normalize(vNormal);
  float towards = dot(n, uSun);
  // Lit from the front a leaf reflects; lit from behind it glows, yellower, with the light that passes through.
  float light = (0.35 + 0.75 * max(towards, 0.0)) / ${FLAT_LIGHT.toFixed(4)};
  col = col * light + col * vec3(1.25, 1.1, 0.5) * 0.5 * max(-towards, 0.0);
  col *= mix(1.0, 0.16, smoothstep(0.0, 0.9, vDepth));

  // A leaf the camera brushes past melts away instead of being sliced.
  float near = smoothstep(${(CAM_DIST * 0.04).toFixed(2)}, ${(CAM_DIST * 0.25).toFixed(2)}, vNear);
  gl_FragColor = vec4(col, inside * near * (1.0 - pow(1.0 - uFade, 3.0)));
}
`;

/** How near the camera the skin of the leaf starts to melt away in front of it, and where it is gone. */
const SKIN_WHOLE = (CAM_DIST * 0.42).toFixed(2);
const SKIN_GONE = (CAM_DIST * 0.03).toFixed(2);

const SURFACE_VERT = /* glsl */ `
uniform float uUnit;
varying vec2 vMetres;
varying float vNear;
void main() {
  vMetres = position.xy * uUnit;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNear = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const SURFACE_FRAG = /* glsl */ `
uniform float uFade;
uniform float uOpen;       // 1 where the pore under the camera is a hole to look through
varying vec2 vMetres;
varying float vNear;
${LEAF_GLSL}

void main() {
  float pore;
  vec3 col = leafSurface(vMetres, pore);
  float inside = blade(vMetres + LEAF_ORIGIN, max(uPixel * 1.5, 1e-9));
  // The skin melts away as the camera goes through it, rather than being sliced.
  float near = mix(1.0, smoothstep(${SKIN_GONE}, ${SKIN_WHOLE}, vNear), uOpen);
  gl_FragColor = vec4(col, inside * near * (1.0 - pore * uOpen) * (1.0 - pow(1.0 - uFade, 3.0)));
}
`;

// What the skin hides: drawn into the depth buffer only, before anything that lies under it.
const COVER_FRAG = /* glsl */ `
varying vec2 vMetres;
varying float vNear;
${LEAF_GLSL}

void main() {
  float near = smoothstep(${SKIN_GONE}, ${SKIN_WHOLE}, vNear);
  // Where the skin is a hole, or melting away in front of the camera, it hides nothing.
  if (near * (1.0 - ownPore(vMetres)) < 0.995) discard;
  gl_FragColor = vec4(0.0);
}
`;

const BACKDROP_FRAG = /* glsl */ `
uniform float uFade;
varying vec2 vMetres;
${LEAF_GLSL}

void main() {
  // The rest of the crown, out of reach and out of focus: soft patches of light and dark.
  float sprays = fbm(vec3(vMetres / 0.6, 3.0));
  float leaves = fbm(vec3(vMetres / 0.11, 8.0));
  vec3 col = vec3(0.16, 0.3, 0.09) * (0.25 + 1.1 * sprays) * (0.5 + 0.9 * leaves);
  gl_FragColor = vec4(col * 0.6, 1.0 - pow(1.0 - uFade, 3.0));
}
`;

/**
 * A flat sheet with the leaf's surface on it, the spot under the camera at its middle.
 * @param open whether the pore under the camera is a hole that can be looked, and flown, through.
 *   Such a sheet is drawn over whatever else its layer holds, and hides what lies under its solid parts.
 */
export function leafSheet(size: number, unit: number, uniforms: Record<string, { value: unknown }>, open = false): THREE.Object3D {
  const geometry = new THREE.PlaneGeometry(size / unit, size / unit);
  const shared = { uUnit: { value: unit }, uOpen: { value: open ? 1 : 0 }, ...uniforms };
  const sheet = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERT,
      fragmentShader: SURFACE_FRAG,
      uniforms: shared,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  sheet.frustumCulled = false;
  const group = new THREE.Group();
  group.rotation.z = LEAF.angle;
  group.add(sheet);
  if (!open) return group;
  sheet.renderOrder = 3;
  // Not see-through, so it is drawn first: what comes after fails the depth test behind it.
  const cover = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({ vertexShader: SURFACE_VERT, fragmentShader: COVER_FRAG, uniforms: shared, colorWrite: false }),
  );
  cover.frustumCulled = false;
  group.add(cover);
  return group;
}

/**
 * A twig at the top of the crown: the leaf the journey lands on, lying flat under the camera,
 * among a few thousand others at every angle and depth.
 */
export class LeafLayer extends Layer {
  private readonly pixel = { value: 1 };

  protected build(): void {
    const unit = this.unitM;
    const rng = this.rng;
    const shared = { uFade: this.uniforms.uFade, uTime: this.uniforms.uTime, uPixel: this.pixel, uUnit: { value: unit }, uSun: { value: SUN } };

    // Far below, the rest of the crown.
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(14 / unit, 14 / unit),
      new THREE.ShaderMaterial({ vertexShader: SURFACE_VERT, fragmentShader: BACKDROP_FRAG, uniforms: shared, transparent: true, depthWrite: false }),
    );
    backdrop.position.z = -1.3 / unit;
    backdrop.renderOrder = -1;
    this.content.add(backdrop);

    // The crowd.
    const count = 3200;
    const crowd = new THREE.InstancedMesh(
      leafGeometry([LEAF.length / 2, 0], true, 10, 4),
      new THREE.ShaderMaterial({ vertexShader: CROWD_VERT, fragmentShader: CROWD_FRAG, uniforms: shared, transparent: true, side: THREE.DoubleSide }),
      count,
    );
    const tints = new Float32Array(count * 4);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    const tilt = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < count; i++) {
      let r = 0;
      let depth = 0;
      // Most leaves are near the top, where the light is; and none may hang between the camera and its leaf.
      do {
        r = 1.8 * Math.sqrt(rng.next());
        depth = -0.12 + 1.15 * rng.next() ** 1.7;
      } while (r < 0.45 && depth < 0.06);
      const angle = rng.range(0, Math.PI * 2);
      position.set((Math.cos(angle) * r) / unit, (Math.sin(angle) * r) / unit, -depth / unit);
      const lean = new THREE.Vector3(rng.gauss() * 0.45, rng.gauss() * 0.45, 1).normalize();
      tilt.setFromUnitVectors(up, lean);
      turn.setFromAxisAngle(up, rng.range(0, Math.PI * 2));
      const size = rng.range(0.75, 1.2) / unit;
      crowd.setMatrixAt(i, matrix.compose(position, tilt.multiply(turn), scale.setScalar(size)));
      // Young leaves are yellower, old ones darker.
      const shade = rng.next();
      tints.set([0.14 + 0.16 * shade, 0.32 + 0.2 * shade, 0.08 + 0.07 * shade, rng.next()], i * 4);
    }
    crowd.geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 4));
    crowd.instanceMatrix.needsUpdate = true;
    crowd.frustumCulled = false;
    this.content.add(crowd);

    // The stalk of our leaf and the twig it grows from.
    const wood = new THREE.MeshBasicMaterial({ color: 0x4a3a22 });
    const stalk = this.fadable(wood);
    const twig = (from: [number, number, number], to: [number, number, number], width: number) => {
      const a = new THREE.Vector3(...from).divideScalar(unit);
      const b = new THREE.Vector3(...to).divideScalar(unit);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(width / unit / 2, (width * 1.4) / unit / 2, a.distanceTo(b), 6), stalk);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      this.content.add(mesh);
    };
    // In leaf coordinates the stalk leaves the base of the blade, at x = 0.
    const along = new THREE.Vector2(Math.cos(LEAF.angle), Math.sin(LEAF.angle));
    const across = new THREE.Vector2(-along.y, along.x);
    const base = along.clone().multiplyScalar(-LEAF.origin[0]).addScaledVector(across, -LEAF.origin[1]);
    const joint = base.clone().addScaledVector(along, -0.03).addScaledVector(across, -0.004);
    twig([joint.x, joint.y, -0.012], [base.x, base.y, -0.001], 0.0016);
    twig([joint.x - across.x * 0.3 - along.x * 0.1, joint.y - across.y * 0.3 - along.y * 0.1, -0.09], [joint.x, joint.y, -0.012], 0.005);
    twig([joint.x, joint.y, -0.012], [joint.x + across.x * 0.35 + along.x * 0.05, joint.y + across.y * 0.35 + along.y * 0.05, -0.05], 0.0045);

    // Our leaf: flat under the camera, drawn in full.
    const hero = new THREE.Mesh(
      leafGeometry(LEAF.origin, false, 40, 12),
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec2 aLeaf;
          varying vec2 vMetres;
          varying float vNear;
          void main() {
            vMetres = aLeaf - vec2(${LEAF.origin[0].toFixed(5)}, ${LEAF.origin[1].toFixed(5)});
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNear = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: SURFACE_FRAG,
        uniforms: { ...shared, uOpen: { value: 0 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    hero.scale.setScalar(1 / unit);
    hero.rotation.z = LEAF.angle;
    hero.renderOrder = 3;
    hero.frustumCulled = false;
    this.content.add(hero);
  }

  protected animate(state: FrameState): void {
    this.pixel.value = 10 ** state.s / state.viewportH;
  }

  caveat(): string {
    return 'The tree’s leaves are modelled, not photographed';
  }
}

/** Said wherever the pores of the leaf are in view. */
export const PORES_CAVEAT = 'Most trees keep nearly all their pores on the underside of the leaf';

/** How wide a sheet of leaf surface each of these stops needs, metres. */
const SHEET: Record<string, number> = { veins: 0.24, tissue: 0.03 };

/**
 * The surface of the leaf, closer and closer: the veins, the cells of its skin, one pore.
 * A single sheet facing the camera; what is on it is worked out by the same function at every scale.
 */
export class LeafSurfaceLayer extends Layer {
  private readonly pixel = { value: 1 };

  protected build(): void {
    this.content.add(leafSheet(SHEET[this.stop.id], this.unitM, { uFade: this.uniforms.uFade, uPixel: this.pixel }));
  }

  protected animate(state: FrameState): void {
    this.pixel.value = 10 ** state.s / state.viewportH;
  }

  caveat(): string | null {
    return this.stop.id === 'tissue' ? PORES_CAVEAT : null;
  }
}
