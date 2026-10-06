import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { itemsFor } from '../app/catalog';
import { chromatin, inLayerUnits } from '../app/chromatin';
import { INSIDE_LEAF, leafDive } from '../app/leafInside';
import { journeyAt, progressToS, stopIndex, stopProgress, STOPS } from '../app/timeline';
import { BallBuf, ballMaterial, COILED, GRAINY, shellMaterial } from './balls';
import { createLayer, type Layer } from './index';
import { createLayerUniforms } from './points';

/** The stops from the tree down: from there on, more and more of what is shown is a model. */
const SMALL_STOPS = STOPS.slice(stopIndex('tree')).map((stop) => stop.id);
const MODELS = ['stoma', 'cell', 'nucleus', 'chromosomes', 'chromatin', 'dna', 'molecule', 'atom', 'atomNucleus', 'proton'];

const frame = (layer: Layer, at = stopIndex(layer.stop.id), s = layer.stop.s) => ({ s, at, t: 2, viewportH: 1080, aspect: 16 / 9, dpr: 1 });

/** Every sphere-like thing a layer draws, however deep in its scene. */
function instances(layer: Layer): number {
  let count = 0;
  layer.scene.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) count += object.count;
  });
  return count;
}

describe('the layers from the tree to the atom', () => {
  const layers = SMALL_STOPS.map((id) => createLayer(STOPS[stopIndex(id)]));
  const layer = (id: string) => layers[SMALL_STOPS.indexOf(id)];

  it('are built for every stop on the way', () => {
    expect(SMALL_STOPS.slice(0, 12)).toEqual(['tree', 'leaf', 'veins', 'tissue', 'stoma', 'cell', 'nucleus', 'chromosomes', 'chromatin', 'dna', 'molecule', 'atom']);
    for (const built of layers) {
      built.update(frame(built), 1);
      expect(built.scene.children.length, built.stop.id).toBeGreaterThan(0);
    }
  });

  it('have a label for everything named in the catalog, and something named at every stop', () => {
    for (const built of layers) {
      expect(built.anchors.length, built.stop.id).toBe(itemsFor(built.stop.id).length);
      expect(built.anchors.length, built.stop.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('say so wherever what they show is a model rather than a picture', () => {
    for (const id of MODELS) expect(layer(id).caveat(layer(id).stop.s), id).toMatch(/model|Dots|underside|compact|cartoon/);
    expect(layer('tree').caveat(1.3)).toMatch(/drawn in/);
    expect(layer('leaf').caveat(-0.6)).toMatch(/modelled/);
    expect(layer('tree').credit()).toMatch(/Geobasis NRW/);
  });

  it('keep their labels in frame at their stops', () => {
    const camera = new THREE.PerspectiveCamera(2 * THREE.MathUtils.radToDeg(Math.atan(0.5)), 16 / 9, 0.01, 1000);
    camera.position.z = 10;
    camera.updateMatrixWorld();
    const point = new THREE.Vector3();
    for (const built of layers) {
      built.update(frame(built), 1);
      built.scene.updateMatrixWorld(true);
      for (const anchor of built.anchors) {
        point.copy(anchor.local).applyMatrix4(anchor.parent.matrixWorld).project(camera);
        expect(Math.abs(point.x), `${built.stop.id}: ${anchor.item.id}`).toBeLessThan(0.97);
        expect(Math.abs(point.y), `${built.stop.id}: ${anchor.item.id}`).toBeLessThan(0.95);
      }
    }
  });

  it('share one model of the inside of the leaf across three stops', () => {
    const counts = ['stoma', 'cell', 'nucleus'].map((id) => instances(layer(id)));
    expect(counts[0]).toBeGreaterThan(3000);
    expect(new Set(counts).size).toBe(1);
  });

  it('carry the inside of the leaf up to the camera as it dives', () => {
    const stoma = layer('stoma');
    const cell = layer('cell');
    const inside = (built: Layer) => built.content.children.find((child) => child instanceof THREE.Group && child.children.length > 3)!;
    for (const fraction of [0, 0.3, 0.6, 1]) {
      const progress = stopProgress(stopIndex('stoma')) + (stopProgress(stopIndex('cell')) - stopProgress(stopIndex('stoma'))) * fraction;
      const at = journeyAt(progress);
      const s = progressToS(progress);
      stoma.update(frame(stoma, at, s), 1);
      cell.update(frame(cell, at, s), 1);
      // Both layers put the nucleus at the same depth below the spot the camera looks at, in metres.
      const sunk = INSIDE_LEAF.skin * 1e-6 * (1 - leafDive(at));
      expect(-inside(stoma).position.z * stoma.unitM).toBeCloseTo(sunk, 12);
      expect(-inside(cell).position.z * cell.unitM).toBeCloseTo(sunk, 12);
    }
  });

  it('draw the chromatin in full only near the camera, and in outline beyond', () => {
    const { fibres, tangle } = chromatin();
    const pairs = fibres.reduce((sum, fibre) => sum + fibre.pairs.length, 0);
    // Three beads to a base pair, and two shapes to each far-off spool, with the thread to the next.
    expect(instances(layer('chromatin'))).toBeGreaterThan(pairs * 3 + tangle.length * 2);
    // The DNA layer shows the one stretch, atom group by atom group.
    expect(instances(layer('dna'))).toBeGreaterThan(300 * 10);
    expect(instances(layer('dna'))).toBeLessThan(400 * 10);
  });

  it('show the same stretch of DNA in the chromatin and DNA layers', () => {
    const hero = chromatin().fibres[0];
    const pair = hero.pairs[14 - hero.first];
    const inChromatin = inLayerUnits('chromatin', pair.at).map((v) => v * layer('chromatin').unitM);
    const inDna = inLayerUnits('dna', pair.at).map((v) => v * layer('dna').unitM);
    inChromatin.forEach((v, i) => expect(v).toBeCloseTo(inDna[i], 15));
    // Neither layer turns or shifts its contents: both are drawn straight from the shared model.
    for (const id of ['chromatin', 'dna']) {
      expect(layer(id).content.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
      expect(layer(id).content.position.length()).toBe(0);
    }
  });
});

describe('BallBuf', () => {
  const uniforms = createLayerUniforms();

  it('makes one instanced mesh of all its balls, each with its own paint', () => {
    const balls = new BallBuf();
    balls.add([0, 0, 0], 1, [1, 0, 0]);
    balls.add([2, 0, 0], [1, 2, 3], [0, 1, 0], [0, 0, 0.5], GRAINY);
    balls.chain([0, 0, 0], [0, 0, 1], 0.1, [0, 0, 1], 0.25);
    expect(balls.count).toBe(2 + 5);
    const mesh = balls.toMesh(ballMaterial(uniforms), 8);
    expect(mesh.count).toBe(7);
    const styles = mesh.geometry.getAttribute('aStyle');
    expect(styles.count).toBe(7);
    expect(styles.getX(0)).toBe(0);
    expect(styles.getX(1)).toBe(GRAINY);
  });

  it('can make them of some other shape than a sphere', () => {
    const rings = new BallBuf();
    rings.add([0, 0, 0], [1, 1, 2], [0.3, 0.6, 1], [0, 0, 0], COILED);
    const mesh = rings.toMesh(shellMaterial(uniforms), 0, new THREE.TorusGeometry(4, 1, 6, 12));
    expect(mesh.geometry.getAttribute('position').count).toBe(7 * 13);
    expect(mesh.geometry.getAttribute('aStyle').getX(0)).toBe(COILED);
  });

  it('lets a material set how near the camera its balls dissolve, and how they darken with depth', () => {
    const plain = ballMaterial(uniforms);
    expect(plain.uniforms.uNear.value.x).toBeLessThan(plain.uniforms.uNear.value.y);
    expect(plain.uniforms.uDepths.value.z).toBe(1);
    const late = ballMaterial(uniforms, { from: 1, to: 3, floor: 0.3 }, [0.01, 0.1]);
    expect(late.uniforms.uNear.value.y).toBeLessThan(plain.uniforms.uNear.value.x);
    expect(late.uniforms.uDepths.value.z).toBe(0.3);
    // The crossfade of the layer drives every material made for it.
    expect(late.uniforms.uFade).toBe(uniforms.uFade);
  });
});
