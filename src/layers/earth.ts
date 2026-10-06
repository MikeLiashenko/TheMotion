import { EARTH_RADIUS } from '../app/solarSystem';
import { createClouds, createFog, createGlobe, createGround, earthUniforms, lookDown, type Globe } from './globe';
import { Layer, type FrameState } from './layer';
import { starfield } from './starfield';

/**
 * Which pictures of the landing site each layer lays out, as indices into the site's levels
 * (app/site.json), widest first. Neighbouring layers share levels, so the ground they show
 * is the same while one fades into the other.
 */
const LEVELS: Record<string, number[]> = {
  earth: [0, 1],
  orbit: [0, 1, 2],
  edge: [1, 2, 3],
  clouds: [2, 3, 4, 5],
  landscape: [3, 4, 5, 6, 7],
};

const CREDITS: Record<string, string> = {
  earth: 'Imagery: NASA Earth Observatory',
  orbit: 'Imagery: NASA Earth Observatory · Sentinel-2 cloudless by EOX',
  edge: 'Imagery: Sentinel-2 cloudless by EOX (modified Copernicus Sentinel data 2016)',
  clouds: 'Imagery: Sentinel-2 cloudless by EOX · Geobasis NRW',
  landscape: 'Imagery: Geobasis NRW',
};

/**
 * The Earth as a globe: from the whole planet down to the edge of space. The layer's origin is
 * the landing site, on the surface directly below the camera, so that zooming in lands on the
 * ground instead of diving into the core.
 */
export class EarthLayer extends Layer {
  private globe!: Globe;

  protected build(): void {
    const radius = this.u(EARTH_RADIUS);
    const low = this.stop.id === 'edge';
    this.globe = createGlobe(radius, this.uniforms, { levels: LEVELS[this.stop.id], cumulus: low });
    this.globe.object.position.z = -radius;
    this.content.add(this.globe.object);
    // From here down, the fair-weather clouds over the landing site can be made out.
    if (low) this.content.add(createClouds(this.unitM, this.uniforms));
    // The same sky as behind the Solar System layers.
    this.scene.add(starfield(this.uniforms));
  }

  protected animate(state: FrameState): void {
    lookDown(this.globe.uniforms, state);
  }

  credit(): string {
    return CREDITS[this.stop.id];
  }
}

/**
 * The last ten kilometres: down through the clouds to the meadow. By now the Earth is a patch
 * of ground under the camera rather than a globe, though it still curves as the globe does.
 */
export class DescentLayer extends Layer {
  private readonly earth = earthUniforms();

  protected build(): void {
    const levels = LEVELS[this.stop.id];
    // As wide as the widest picture it shows.
    const size = this.stop.id === 'clouds' ? 1.5e5 : 3.75e4;
    this.content.add(createGround(this.unitM, size, levels, this.uniforms, this.earth));
    this.content.add(createClouds(this.unitM, this.uniforms));
    this.scene.add(createFog(this.uniforms, this.earth));
  }

  protected animate(state: FrameState): void {
    lookDown(this.earth, state);
  }

  credit(): string {
    return CREDITS[this.stop.id];
  }
}

/**
 * The tree, twenty metres across the frame. Still the aerial photograph, which by now is far
 * too coarse: the leaves and the grass are drawn in over it.
 */
export class TreeLayer extends Layer {
  private readonly earth = earthUniforms();

  protected build(): void {
    this.content.add(createGround(this.unitM, 585.9375, [6, 7], this.uniforms, this.earth, true));
  }

  protected animate(state: FrameState): void {
    lookDown(this.earth, state);
  }

  credit(): string {
    return 'Imagery: Geobasis NRW';
  }

  caveat(): string {
    return 'Leaves and grass drawn in over an aerial photograph';
  }
}
