import * as THREE from 'three';
import { CAM_DIST, FRAME } from '../layers/constants';
import { createLayer, type Layer } from '../layers';
import { attachRenderer } from '../layers/earthMaps';
import type { FrameState } from '../layers/layer';
import { QUALITY } from './quality';
import { journeyAt, layerWeights, progressToS, S_START, STOPS } from './timeline';

const BACKGROUND = 0x02030a;

/**
 * The scenes are composed for a wide window. A window narrower than this (width over height)
 * still sees this much to the sides, and more above and below instead.
 */
export const NARROWEST = 4 / 3;

/** Frames slower than this (ms) cost resolution; frames faster than `FAST` may win it back. */
const SLOW = 24;
const FAST = 17.5;

/**
 * Renders the journey. The whole picture is a pure function of (progress, time):
 * `render(p, t)` always draws the same frame, which is what the video export relies on.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  /** One per stop, largest scale first. */
  readonly layers: Layer[] = [];
  /** Current scale: log10(frame height in metres). */
  s = S_START;
  /** Position along the journey, counted in stops (see `journeyAt`). */
  at = 0;
  readonly weights: number[] = [];
  width = 1;
  height = 1;
  /**
   * How many times taller than the frame the window is: 1 on a wide window, more on a narrow
   * one, which sees beyond the frame above and below.
   */
  fit = 1;

  /** Smoothed time between frames, ms, and how many frames ago the resolution last changed. */
  private pace = 16;
  private settled = 0;
  /** The resolution may not climb back above this: it was too much the last time it was tried. */
  private ceiling = QUALITY.maxDpr;
  /** The last time the resolution was lowered: what it was before, and how slowly frames came then. */
  private lowered: { from: number; pace: number } | null = null;
  /** Set once lowering the resolution has turned out not to help: something else sets the pace. */
  private fixed = false;

  /** Whether this browser can draw the scene at all. */
  static supported(): boolean {
    try {
      return document.createElement('canvas').getContext('webgl2') !== null;
    } catch {
      return false;
    }
  }

  private constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY.antialias, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(BACKGROUND, 1);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 8000);
    this.camera.position.z = CAM_DIST;

    this.resize();
  }

  /**
   * Builds the scene one layer at a time, yielding to the browser in between so the page
   * stays alive and can show progress.
   */
  static async create(canvas: HTMLCanvasElement, onProgress?: (fraction: number) => void): Promise<Engine> {
    const engine = new Engine(canvas);
    // The Earth's maps arrive in the background and are uploaded as they do.
    attachRenderer(engine.renderer);
    const gl = engine.renderer.getContext();
    const maxPoint = Math.min((gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1], 1024);
    const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

    // Shaders compile in the background (where the browser supports it) while the geometry is generated.
    const compiling: Promise<unknown>[] = [];
    for (const [i, stop] of STOPS.entries()) {
      const layer = createLayer(stop);
      layer.setMaxPointSize(maxPoint);
      layer.update(engine.state(layer.stop.s, i, 0), 1);
      engine.layers.push(layer);
      compiling.push(engine.renderer.compileAsync(layer.scene, engine.camera));
      // Marks for scripts/perf.mjs: where the start-up time goes.
      performance.mark(`motion:built:${stop.id}`);
      onProgress?.(((i + 1) / STOPS.length) * 0.7);
      await breathe();
    }
    await Promise.all(compiling);
    performance.mark('motion:compiled');

    // Draw every layer once, so geometry is uploaded now rather than mid-journey.
    for (const [i, layer] of engine.layers.entries()) {
      engine.renderer.render(layer.scene, engine.camera);
      onProgress?.(0.7 + ((i + 1) / STOPS.length) * 0.3);
      if (i % 4 === 3) await breathe();
    }
    engine.renderer.clear();
    performance.mark('motion:ready');
    return engine;
  }

  /** The height of the frame on screen, CSS px: all of the window's height, unless the window is narrow. */
  get framePx(): number {
    return this.height / this.fit;
  }

  resize(
    width = this.renderer.domElement.clientWidth,
    height = this.renderer.domElement.clientHeight,
    dpr = Math.min(window.devicePixelRatio, this.ceiling),
  ): void {
    this.width = width;
    this.height = height;
    this.fit = Math.max(1, NARROWEST / (width / height));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((FRAME / 2 / CAM_DIST) * this.fit));
    this.camera.updateProjectionMatrix();
  }

  /**
   * Keeps the journey smooth on a machine that cannot draw it at full resolution. Call once for
   * every frame of the live page with the time since the frame before, in ms: when frames come
   * slowly the canvas is drawn with fewer pixels, and with more again once there is time to spare.
   */
  adapt(frameMs: number): void {
    // A long gap is the tab having been hidden, not a slow frame.
    if (frameMs > 250 || this.fixed) return;
    this.pace += (frameMs - this.pace) * 0.08;
    if (++this.settled < 50) return;
    const dpr = this.renderer.getPixelRatio();
    const wanted = Math.min(window.devicePixelRatio, QUALITY.maxDpr);
    if (this.lowered) {
      // Did the last cut help? If frames come no faster, it is not the pixels that are slow (a
      // browser saving power draws thirty frames a second whatever it is given): put them back.
      const { from, pace } = this.lowered;
      this.lowered = null;
      if (this.pace > pace * 0.93) {
        this.fixed = true;
        this.ceiling = from;
        this.setDpr(from);
        return;
      }
    }
    if (this.pace > SLOW && dpr > QUALITY.minDpr) {
      this.lowered = { from: dpr, pace: this.pace };
      this.ceiling = Math.max(QUALITY.minDpr, dpr * 0.85);
      this.setDpr(this.ceiling);
    } else if (this.pace < FAST && this.settled > 600) {
      // After ten seconds or so without trouble, try a little more, in case the heavy part is behind us.
      this.ceiling = Math.min(wanted, this.ceiling * 1.1);
      if (this.ceiling > dpr + 0.01) this.setDpr(this.ceiling);
      else this.settled = 50;
    }
  }

  private setDpr(dpr: number): void {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height, false);
    // The pace is measured afresh at the new setting before anything else is decided.
    this.settled = 0;
  }

  private state(s: number, at: number, t: number): FrameState {
    return { s, at, t, viewportH: this.framePx, aspect: this.width / this.height, dpr: this.renderer.getPixelRatio() };
  }

  render(progress: number, t: number): void {
    this.s = progressToS(progress);
    this.at = journeyAt(progress);
    layerWeights(this.at, this.weights);
    const state = this.state(this.s, this.at, t);

    this.renderer.clear();
    // Largest scale first, so the world being zoomed into is drawn over the one being left.
    this.layers.forEach((layer, i) => {
      const weight = this.weights[i];
      if (weight < 0.002) {
        layer.weight = 0;
        return;
      }
      layer.update(state, weight);
      this.renderer.clearDepth();
      this.renderer.render(layer.scene, this.camera);
    });
  }
}
