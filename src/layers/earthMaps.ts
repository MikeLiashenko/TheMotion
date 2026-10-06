import * as THREE from 'three';
import { SITE } from '../app/earthSite';
import { EARTH_TINY } from './earthTiny';

/** A uniform that holds a texture. Shared by every material that shows the map, so swapping the texture updates them all. */
type Holder = { value: THREE.Texture };

/**
 * The pictures of the Earth: whole-planet maps and the pyramid of ever closer views of the
 * landing site. They are large, so they load in the background after the scene has started;
 * until one arrives its place is held by a stand-in, and the holder is updated when it does.
 */
export interface EarthMaps {
  /** Whole Earth by day, equirectangular: longitude -180° at the left edge, north at the top. */
  day: Holder;
  /** City lights, same layout, one channel. */
  night: Holder;
  /** Clouds, same layout, one channel. */
  clouds: Holder;
  /** Views from above the landing site, widest first (see app/site.json). */
  levels: Holder[];
  /** For each level: 0 until its picture has arrived, then 1. */
  levelOn: { value: number }[];
}

const FOLDER = `${import.meta.env.BASE_URL}textures/`;

let maps: EarthMaps | undefined;
let renderer: THREE.WebGLRenderer | undefined;
let pending = 0;
let total = 0;
let settle: (() => void) | undefined;
const done = new Promise<void>((resolve) => (settle = resolve));

/** A single flat colour, standing in for a map that has not loaded yet. */
function standIn(r: number, g: number, b: number): THREE.Texture {
  const texture = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

function configure(texture: THREE.Texture, wrap: boolean, grey: boolean): THREE.Texture {
  // These pictures are sampled by shaders that work in display colours: no conversion on the way in.
  texture.colorSpace = THREE.NoColorSpace;
  // Row 0 is the top of the picture; the shaders count from there.
  texture.flipY = false;
  texture.wrapS = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  if (grey) texture.format = THREE.RedFormat;
  texture.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
  texture.needsUpdate = true;
  return texture;
}

function swap(holder: Holder, texture: THREE.Texture): void {
  const previous = holder.value;
  holder.value = texture;
  // Upload now, while nothing much is happening, rather than on the frame that first shows it.
  renderer?.initTexture(texture);
  previous.dispose();
}

function finished(): void {
  pending--;
  if (pending === 0) settle?.();
}

function load(loader: THREE.ImageBitmapLoader, file: string, holder: Holder, wrap: boolean, grey: boolean, then?: () => void): void {
  pending++;
  total++;
  loader.load(
    FOLDER + file,
    (bitmap) => {
      swap(holder, configure(new THREE.Texture(bitmap), wrap, grey));
      then?.();
      finished();
    },
    undefined,
    () => {
      console.warn(`Could not load ${file}: the Earth is drawn without it.`);
      finished();
    },
  );
}

/**
 * The Earth's maps. The first call starts loading them.
 */
export function earthMaps(): EarthMaps {
  if (maps) return maps;
  const created: EarthMaps = {
    day: { value: standIn(18, 42, 78) },
    night: { value: standIn(0, 0, 0) },
    clouds: { value: standIn(0, 0, 0) },
    levels: SITE.levels.map(() => ({ value: standIn(40, 60, 30) })),
    levelOn: SITE.levels.map(() => ({ value: 0 })),
  };
  maps = created;

  // Outside a browser (the unit tests) there is nothing to load with.
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') {
    settle?.();
    return created;
  }

  // A postage-stamp Earth travels inside the script itself, so the globe never shows up blank.
  const tiny = new Image();
  tiny.onload = () => {
    // Unless a real map got there first.
    if (!(created.day.value instanceof THREE.DataTexture)) return;
    const texture = configure(new THREE.Texture(tiny), true, false);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    swap(created.day, texture);
  };
  tiny.src = EARTH_TINY;

  const loader = new THREE.ImageBitmapLoader();
  loader.setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });

  // Large screens get the day map at twice the resolution, once the smaller one is in.
  const large = Math.max(screen.width, screen.height) * devicePixelRatio >= 1800 && (renderer?.capabilities.maxTextureSize ?? 0) >= 8192;
  load(loader, 'earth-day-4k.webp', created.day, true, false, () => {
    if (large) load(loader, 'earth-day-8k.webp', created.day, true, false);
  });
  load(loader, 'earth-clouds-4k.webp', created.clouds, true, true);
  load(loader, 'earth-night-4k.webp', created.night, true, true);
  SITE.levels.forEach((level, i) => {
    load(loader, level.file, created.levels[i], false, false, () => (created.levelOn[i].value = 1));
  });
  return created;
}

/** Lets the maps be uploaded to the graphics card as they arrive. Call before the first layer is built. */
export function attachRenderer(webgl: THREE.WebGLRenderer): void {
  renderer = webgl;
}

/** Resolves once every map has arrived (or failed to). */
export function earthMapsReady(): Promise<void> {
  earthMaps();
  return done;
}

/** How much of the Earth's imagery has arrived, 0..1. */
export function earthMapsProgress(): number {
  return total === 0 ? 1 : 1 - pending / total;
}
