import * as THREE from 'three';
import { itemsFor, KIND_COLOR, type CatalogItem, type Kind } from '../app/catalog';
import type { Stop } from '../app/timeline';
import { Rng } from '../util/rng';
import { FRAME } from './constants';
import { createLayerUniforms, PointBuf, pointsMaterial, rgb, type LayerUniforms } from './points';

export interface FrameState {
  /** log10(frame height in metres). */
  s: number;
  /** Position along the journey, counted in stops: unlike `s`, it never repeats. */
  at: number;
  /** Seconds. Always passed in explicitly so frames are reproducible. */
  t: number;
  /** Height of the frame on screen, CSS px: the viewport's height, or less in a narrow window, which sees beyond the frame. */
  viewportH: number;
  /** Width of the viewport over its height. */
  aspect: number;
  dpr: number;
}

export interface LabelAnchor {
  item: CatalogItem;
  /** Position inside `parent`. */
  local: THREE.Vector3;
  /** The group the object lives in: the layer's `content` unless the layer says otherwise. */
  parent: THREE.Object3D;
  /** How far the object's picture reaches, in `parent` units, so the label can stand clear of it. */
  radius: number;
}

/** A catalog object the layer draws itself, so it needs no marker dot. */
interface Drawn {
  radius: number;
  parent?: THREE.Object3D;
}

/** Minimum on-screen marker diameter (CSS px) per kind. */
const MARKER_PX: Partial<Record<Kind, number>> = {
  you: 7,
  craft: 4,
  comet: 4,
  dwarf: 4.5,
  place: 4.5,
};

const SOLID_BODIES = new Set<Kind>(['star', 'planet', 'dwarf', 'moon']);

/**
 * One "world" of the journey, drawn in its own comfortable units: 1 local unit is half the
 * frame height at the layer's stop. Each frame the whole layer is rescaled around the origin
 * (the zoom axis), so nothing ever needs coordinates that float32 can't hold.
 */
export abstract class Layer {
  readonly scene = new THREE.Scene();
  /** Rescaled every frame. */
  readonly root = new THREE.Group();
  /** Holds the geometry; subclasses may tilt or offset it. Catalog positions live in this space. */
  readonly content = new THREE.Group();
  /** Metres per local unit. */
  readonly unitM: number;
  readonly anchors: LabelAnchor[] = [];
  weight = 0;

  protected readonly rng: Rng;
  protected readonly uniforms: LayerUniforms = createLayerUniforms();
  private readonly fadables: { material: THREE.Material; base: number }[] = [];
  private readonly drawn = new Map<string, Drawn>();

  constructor(readonly stop: Stop) {
    this.unitM = 10 ** stop.s / 2;
    this.rng = new Rng(stop.id);
    this.root.add(this.content);
    this.scene.add(this.root);
  }

  /** Called once, after construction. */
  init(): void {
    this.build();
    this.buildMarkers();
  }

  protected abstract build(): void;

  /** Per-frame hook for subclasses. `scale` is world units per local unit. */
  protected animate(_state: FrameState, _scale: number): void {}

  /**
   * A short honest note for the HUD when the layer bends the truth at scale `s`
   * ("galaxies drawn 80× larger than life"), or null when what you see is to scale.
   */
  caveat(_s: number): string | null {
    return null;
  }

  /** Who to credit for what this layer shows, when it shows other people's pictures. */
  credit(): string | null {
    return null;
  }

  /** Metres → layer-local units. */
  protected u(meters: number): number {
    return meters / this.unitM;
  }

  /**
   * Declare that the layer draws catalog object `id` itself: it gets no marker dot, and its
   * label stands `radius` clear of its centre.
   */
  protected drew(id: string, radius: number, parent?: THREE.Object3D): void {
    this.drawn.set(id, { radius, parent });
  }

  /** Register a built-in material so its opacity follows the layer's crossfade. */
  protected fadable<T extends THREE.Material>(material: T): T {
    material.transparent = true;
    this.fadables.push({ material, base: material.opacity });
    return material;
  }

  update(state: FrameState, weight: number): void {
    this.weight = weight;
    const scale = (this.unitM * FRAME) / 10 ** state.s;
    this.root.scale.setScalar(scale);
    this.uniforms.uFade.value = weight;
    this.uniforms.uDpr.value = state.dpr;
    this.uniforms.uTime.value = state.t;
    for (const f of this.fadables) f.material.opacity = f.base * weight;
    this.animate(state, scale);
    // After `animate`, which may have magnified `content`.
    this.uniforms.uPxWorld.value = state.viewportH / FRAME;
    this.uniforms.uPxScale.value = scale * this.content.scale.x * this.uniforms.uPxWorld.value;
  }

  setMaxPointSize(px: number): void {
    this.uniforms.uMaxPx.value = px;
  }

  /** Glowing dots for catalog objects, plus label anchors for all of them. */
  private buildMarkers(): void {
    const buf = new PointBuf();
    for (const item of itemsFor(this.stop.id)) {
      const [x, y, z] = item.pos;
      const own = this.drawn.get(item.id);
      this.anchors.push({
        item,
        local: new THREE.Vector3(x, y, z),
        parent: own?.parent ?? this.content,
        radius: own?.radius ?? 0,
      });
      if (item.noMarker || own) continue;
      const color = rgb(item.color ?? KIND_COLOR[item.kind]);
      // Solid bodies grow to their true size as the camera closes in; everything else stays a dot.
      const size = SOLID_BODIES.has(item.kind) ? this.u(item.size) : 0;
      buf.add(x, y, z, color, size, MARKER_PX[item.kind] ?? 5.5, this.rng.next());
    }
    if (buf.count === 0) return;
    const markers = buf.toPoints(pointsMaterial(this.uniforms, { soft: 1.6 }));
    markers.renderOrder = 10;
    this.content.add(markers);
  }
}
