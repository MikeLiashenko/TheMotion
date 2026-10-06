import type { Stop } from '../app/timeline';
import { ClustersLayer, LocalGroupLayer, NeighborsLayer, UniverseLayer, WebLayer } from './cosmos';
import { DescentLayer, EarthLayer, TreeLayer } from './earth';
import { LeafLayer, LeafSurfaceLayer } from './foliage';
import { LeafInteriorLayer } from './leafInterior';
import { HaloLayer, MilkyWayLayer } from './galaxy';
import type { Layer } from './layer';
import { AtomLayer, BallLayer } from './micro';
import { NebulaeLayer } from './nebulae';
import { SolarLayer } from './solar';
import { NucleusLayer } from './subatomic';
import { BrightStarsLayer, GiantsLayer, NeighborhoodLayer } from './stars';

type LayerClass = new (stop: Stop) => Layer;

const LAYER_FOR_STOP: Record<string, LayerClass> = {
  universe: UniverseLayer,
  walls: WebLayer,
  superclusters: WebLayer,
  clusters: ClustersLayer,
  galaxies: NeighborsLayer,
  localGroup: LocalGroupLayer,
  milkyWay: MilkyWayLayer,
  globulars: HaloLayer,
  nebulae: NebulaeLayer,
  giants: GiantsLayer,
  brightStars: BrightStarsLayer,
  neighborhood: NeighborhoodLayer,
  oort: SolarLayer,
  farSolar: SolarLayer,
  heliosphere: SolarLayer,
  kuiper: SolarLayer,
  outer: SolarLayer,
  inner: SolarLayer,
  sun: SolarLayer,
  au: SolarLayer,
  earthMoon: SolarLayer,
  earth: EarthLayer,
  orbit: EarthLayer,
  edge: EarthLayer,
  clouds: DescentLayer,
  landscape: DescentLayer,
  tree: TreeLayer,
  leaf: LeafLayer,
  veins: LeafSurfaceLayer,
  tissue: LeafSurfaceLayer,
  stoma: LeafInteriorLayer,
  cell: LeafInteriorLayer,
  nucleus: LeafInteriorLayer,
  chromosomes: BallLayer,
  chromatin: BallLayer,
  dna: BallLayer,
  molecule: BallLayer,
  atom: AtomLayer,
  atomNucleus: NucleusLayer,
  proton: NucleusLayer,
};

/** Ids of the stops that have a layer; must match `STOPS` exactly. */
export const LAYER_STOP_IDS = Object.keys(LAYER_FOR_STOP);

/** Builds the layer that belongs to a stop. */
export function createLayer(stop: Stop): Layer {
  const LayerType = LAYER_FOR_STOP[stop.id];
  if (!LayerType) throw new Error(`No layer registered for stop "${stop.id}"`);
  const layer = new LayerType(stop);
  layer.init();
  return layer;
}

export type { Layer };
