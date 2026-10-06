import * as THREE from 'three';
import type { CatalogItem } from '../app/catalog';
import type { Engine } from '../app/engine';
import { LEAD_IN, STOPS, stopProgress, TOTAL_VH, type Part } from '../app/timeline';
import { FRAME } from '../layers/constants';
import { friendly, scaleBar, scientific } from '../util/format';

const PART_NAMES: Record<Part, string> = {
  cosmos: 'The Cosmos',
  galaxy: 'Our Galaxy',
  solar: 'The Solar System',
  earth: 'Earth',
  micro: 'The Microscopic World',
  atom: 'Inside the Atom',
};

/** Longest the scale bar may get, in CSS px. */
const SCALE_BAR_MAX = 170;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

interface LabelView {
  node: HTMLElement;
  visible: boolean;
  /** Index into CORNERS: where the label sat last time it was shown. */
  corner: number;
}

/** What the page can be asked to do from the HUD. */
export interface HudActions {
  /** Travel to the stop with this index. */
  goTo(index: number): void;
  /** Travel back to the very start. */
  restart(): void;
}

/** Everything drawn in the DOM on top of the canvas: readouts, stage title, rail, object labels, the closing card and the About sheet. */
export class Hud {
  private readonly sci = el('scale-sci');
  private readonly friendlyEl = el('scale-friendly');
  private readonly part = el('stage-part');
  private readonly title = el('stage-title');
  private readonly tag = el('stage-tag');
  private readonly stage = el('stage');
  private readonly barLine = el('scalebar-line');
  private readonly barLabel = el('scalebar-label');
  private readonly note = el('scale-note');
  private readonly credit = el('credit');
  private readonly railFill = el('rail-fill');
  private readonly labelRoot = el('labels');
  private readonly intro = el('intro');
  private readonly outro = el('outro');
  private readonly about = el('about');
  private readonly root = el('hud');
  /** What had the keyboard's attention before the About sheet opened: it gets it back afterwards. */
  private returnFocus: HTMLElement | null = null;
  private readonly ticks: HTMLElement[] = [];
  private readonly labels = new Map<string, LabelView>();
  private readonly scratch = new THREE.Vector3();
  private stopIndex = -1;
  private stageRects: Rect[] = [];
  /** Where the fixed parts of the HUD are on screen: labels keep out of them. */
  private chromeRects: Rect[] = [];
  private chromeStale = true;
  private lastSci = '';
  private lastBar = '';
  private lastNote = '';
  private lastCredit = '';

  constructor(actions: HudActions) {
    el('about-open').addEventListener('click', () => this.openAbout());
    el('outro-about').addEventListener('click', () => this.openAbout());
    el('about-close').addEventListener('click', () => this.closeAbout());
    // A click beside the sheet closes it too.
    this.about.addEventListener('click', (event) => {
      if (event.target === this.about) this.closeAbout();
    });
    el('outro-restart').addEventListener('click', () => actions.restart());

    const rail = el('rail-ticks');
    STOPS.forEach((stop, i) => {
      const tick = document.createElement('button');
      tick.className = 'rail-tick';
      tick.type = 'button';
      tick.style.top = `${stopProgress(i) * 100}%`;
      tick.setAttribute('aria-label', stop.title);
      tick.innerHTML = `<span class="rail-name">${stop.title}</span>`;
      tick.addEventListener('click', () => actions.goTo(i));
      rail.appendChild(tick);
      this.ticks.push(tick);
    });
    // The title reflows when the window changes shape.
    window.addEventListener('resize', () => {
      this.stage.classList.remove('is-entering');
      this.measureStage();
      this.chromeStale = true;
    });
  }

  get aboutOpen(): boolean {
    return !this.about.hidden;
  }

  openAbout(): void {
    if (this.aboutOpen) return;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.about.hidden = false;
    // The page behind must not scroll while the sheet is read.
    document.documentElement.classList.add('is-reading');
    el('about-close').focus();
  }

  closeAbout(): void {
    this.about.hidden = true;
    document.documentElement.classList.remove('is-reading');
    this.returnFocus?.focus();
  }

  update(engine: Engine, progress: number): void {
    const frameMeters = 10 ** engine.s;

    const sci = scientific(frameMeters);
    if (sci !== this.lastSci) {
      this.lastSci = sci;
      this.sci.textContent = sci;
      this.friendlyEl.textContent = friendly(frameMeters);
    }

    const metersPerPx = frameMeters / engine.framePx;
    const bar = scaleBar(SCALE_BAR_MAX * metersPerPx);
    this.barLine.style.width = `${bar.meters / metersPerPx}px`;
    if (bar.label !== this.lastBar) {
      this.lastBar = bar.label;
      this.barLabel.textContent = bar.label;
    }

    this.updateStage(engine);
    const note = engine.layers[this.stopIndex]?.caveat(engine.s) ?? '';
    if (note !== this.lastNote) {
      this.lastNote = note;
      this.note.textContent = note;
      this.note.hidden = note === '';
      this.chromeStale = true;
    }
    const credit = engine.layers[this.stopIndex]?.credit() ?? '';
    if (credit !== this.lastCredit) {
      this.lastCredit = credit;
      this.credit.textContent = credit;
      this.credit.hidden = credit === '';
      // On a narrow screen the credit takes a line of its own, and the caption moves up to make room.
      this.root.classList.toggle('has-credit', credit !== '');
      this.chromeStale = true;
      this.measureStage();
    }
    this.railFill.style.height = `${progress * 100}%`;
    // The title card owns the first moments; captions and labels arrive as the journey starts.
    const reveal = smoothstep(1, LEAD_IN + 6, progress * TOTAL_VH);
    this.intro.style.opacity = String(1 - reveal);
    this.root.style.setProperty('--reveal', reveal.toFixed(3));
    // At the very end the last stop's caption makes way for the closing card.
    const ending = smoothstep(stopProgress(STOPS.length - 1) + 0.002, 0.9995, progress);
    this.root.style.setProperty('--ending', ending.toFixed(3));
    this.outro.classList.toggle('is-shown', ending > 0.5);
    this.outro.setAttribute('aria-hidden', ending > 0.5 ? 'false' : 'true');
    this.updateLabels(engine);
  }

  private updateStage(engine: Engine): void {
    let index = 0;
    for (let i = 1; i < engine.weights.length; i++) {
      if (engine.weights[i] > engine.weights[index]) index = i;
    }
    if (index === this.stopIndex) return;
    this.ticks[this.stopIndex]?.classList.remove('is-active');
    this.ticks[index].classList.add('is-active');
    this.stopIndex = index;
    const stop = STOPS[index];
    this.part.textContent = PART_NAMES[stop.part];
    this.title.textContent = stop.title;
    this.tag.textContent = stop.tag;
    // Restart the entrance animation; in between, while nothing is moving, see where the text sits.
    this.stage.classList.remove('is-entering');
    this.measureStage();
    this.stage.classList.add('is-entering');
  }

  /**
   * The screen area each line of the stage title really covers, so that labels can use the
   * free space around a short line instead of avoiding one big box.
   */
  private measureStage(): void {
    const range = document.createRange();
    this.stageRects = [];
    for (const node of [this.part, this.title, this.tag]) {
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        this.stageRects.push({ x0: r.left - 12, y0: r.top - 4, x1: r.right + 12, y1: r.bottom + 4 });
      }
    }
  }

  /** Where the brand, the readout, the scale bar, the credit and the rail are, measured rather than assumed: they move on small screens. */
  private measureChrome(): void {
    this.chromeStale = false;
    this.chromeRects = [];
    for (const selector of ['.brand', '.readout', '.scalebar', '.credit', '.rail']) {
      const node = this.root.querySelector<HTMLElement>(selector);
      if (!node || node.hidden) continue;
      const r = node.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) this.chromeRects.push({ x0: r.left - 10, y0: r.top - 8, x1: r.right + 10, y1: r.bottom + 8 });
    }
  }

  private updateLabels(engine: Engine): void {
    if (this.chromeStale) this.measureChrome();
    const frameMeters = 10 ** engine.s;
    const v = this.scratch;
    const { width, height } = engine;
    const candidates: Candidate[] = [];
    const shown = new Set<string>();

    for (const layer of engine.layers) {
      const layerAlpha = smoothstep(0.35, 0.85, layer.weight);
      if (layerAlpha <= 0) continue;
      layer.anchors.forEach((anchor, order) => {
        const { item } = anchor;
        // Objects that have outgrown the frame no longer need pointing at.
        let alpha = layerAlpha * (1 - smoothstep(0.9, 1.6, item.size / frameMeters));
        if (alpha < 0.02) return;
        anchor.parent.localToWorld(v.copy(anchor.local));
        const depth = engine.camera.position.z - v.z;
        if (depth < 1) return;
        // How far the object's picture reaches on screen, for the objects a layer draws itself.
        let reach = 0;
        if (anchor.radius > 0) {
          const m = anchor.parent.matrixWorld.elements;
          const worldScale = Math.hypot(m[0], m[1], m[2]);
          reach = (anchor.radius * worldScale * (engine.camera.position.z / depth) * engine.framePx) / FRAME;
          alpha *= 1 - smoothstep(0.4 * height, 0.7 * height, reach);
          if (alpha < 0.02) return;
        }
        v.project(engine.camera);
        const x = (v.x * 0.5 + 0.5) * width;
        const y = (-v.y * 0.5 + 0.5) * height;
        if (x < 24 || x > width - 24 || y < 24 || y > height - 24) return;
        // Labels already on screen keep their place; "you are here" always wins.
        const rank = (item.kind === 'you' ? 0 : 1000) + (this.labels.get(item.id)?.visible ? 0 : 500) + order;
        candidates.push({ item, alpha, x, y, reach, rank });
      });
    }

    // Greedy de-cluttering: place labels by rank. Each tries the four corners around its object
    // and takes the first that is free; one with no free corner is dropped.
    candidates.sort((a, b) => a.rank - b.rank);
    const taken: Rect[] = [...this.chromeRects, ...this.stageRects];
    const bounds: Rect = { x0: 8, y0: 8, x1: width - 8, y1: height - 8 };
    for (const c of candidates) {
      const textWidth = 36 + c.item.name.length * 7.4;
      const previous = this.labels.get(c.item.id);
      // Stay in the same corner as last frame if possible, so labels don't hop about.
      const order = previous?.visible ? [previous.corner, ...CORNERS.keys()] : [...CORNERS.keys()];
      for (const corner of order) {
        const [sx, sy] = CORNERS[corner];
        // The label stands just clear of the object's picture.
        const x = c.x + sx * c.reach * 0.72;
        const y = c.y + sy * c.reach * 0.72;
        const rect: Rect = {
          x0: sx > 0 ? x - 6 : x - textWidth,
          x1: sx > 0 ? x + textWidth : x + 6,
          y0: sy < 0 ? y - 30 : y - 6,
          y1: sy < 0 ? y + 6 : y + 30,
        };
        if (rect.x0 < bounds.x0 || rect.x1 > bounds.x1 || rect.y0 < bounds.y0 || rect.y1 > bounds.y1) continue;
        if (taken.some((t) => rect.x0 < t.x1 && rect.x1 > t.x0 && rect.y0 < t.y1 && rect.y1 > t.y0)) continue;
        taken.push(rect);
        shown.add(c.item.id);
        this.showLabel(c.item, c.alpha, x, y, corner);
        break;
      }
    }

    for (const [id, view] of this.labels) {
      if (view.visible && !shown.has(id)) {
        view.visible = false;
        view.node.classList.remove('is-visible');
        view.node.style.opacity = '0';
      }
    }
  }

  private showLabel(item: CatalogItem, alpha: number, x: number, y: number, corner: number): void {
    let view = this.labels.get(item.id);
    if (!view) {
      const node = document.createElement('div');
      node.className = `label kind-${item.kind}`;
      node.innerHTML = `<span class="label-dot"></span><span class="label-text"><b></b><small></small></span>`;
      node.querySelector('b')!.textContent = item.name;
      node.querySelector('small')!.textContent = item.note ?? friendly(item.size);
      this.labelRoot.appendChild(node);
      view = { node, visible: false, corner };
      this.labels.set(item.id, view);
    }
    if (!view.visible) {
      view.visible = true;
      view.node.classList.add('is-visible');
    }
    view.corner = corner;
    const [sx, sy] = CORNERS[corner];
    view.node.style.opacity = alpha.toFixed(3);
    view.node.classList.toggle('is-flipped', sx < 0);
    view.node.classList.toggle('is-below', sy > 0);
    view.node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)${sx < 0 ? ' translateX(-100%)' : ''}`;
  }
}

/** Where a label may sit relative to its object, in order of preference: [x, y] directions on screen. */
const CORNERS: [number, number][] = [
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
];

interface Candidate {
  item: CatalogItem;
  alpha: number;
  /** The object's centre on screen, px. */
  x: number;
  y: number;
  /** How far the object's picture reaches from its centre, px. */
  reach: number;
  rank: number;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
