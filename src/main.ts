import 'lenis/dist/lenis.css';
import { Engine } from './app/engine';
import { ScrollDriver } from './app/scroll';
import { stopIndex, stopProgress, STOPS } from './app/timeline';
import { Hud } from './hud/hud';
import { earthMapsReady } from './layers/earthMaps';

declare global {
  interface Window {
    /** Hooks for the video renderer and for debugging from the console. Set once the scene is built. */
    __motion: {
      engine: Engine;
      /** Draw exactly one frame for the given progress (0..1) and time (s). Stops the live loop. */
      renderAt(progress: number, t: number): void;
      goTo(stopId: string, immediate?: boolean): void;
      stopProgress(stopId: string): number;
      /** Resolves once the pictures that load in the background (the Earth's maps) have all arrived. */
      assets: Promise<void>;
    };
  }
}

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const loaderBar = document.getElementById('loader-bar')!;

/** Says on the title card that the journey cannot be shown, and why. */
function trouble(message: string): void {
  const note = document.getElementById('trouble')!;
  note.textContent = message;
  note.hidden = false;
  document.body.classList.add('is-stuck');
}

async function start(): Promise<void> {
  if (!Engine.supported()) {
    trouble('This journey is drawn with WebGL 2, which this browser does not offer. A current version of Chrome, Edge, Firefox or Safari will show it.');
    return;
  }

  // The title card is plain HTML and is already on screen; the scene is built behind it.
  const engine = await Engine.create(canvas, (fraction) => {
    loaderBar.style.transform = `scaleX(${fraction})`;
  });
  const scroll = new ScrollDriver(document.getElementById('scroll-space')!);
  const hud = new Hud({
    goTo: (index) => scroll.goTo(index),
    restart: () => scroll.goTo(0),
  });

  let live = true;
  const fps = document.getElementById('fps')!;
  let frames = 0;
  let fpsSince = performance.now();
  let last = performance.now();

  function frame(timeMs: number): void {
    if (!live) return;
    engine.adapt(timeMs - last);
    last = timeMs;
    scroll.update(timeMs);
    const progress = scroll.progress;
    engine.render(progress, timeMs / 1000);
    hud.update(engine, progress);

    if (import.meta.env.DEV) {
      frames++;
      if (timeMs - fpsSince > 500) {
        fps.hidden = false;
        fps.textContent = `${Math.round((frames * 1000) / (timeMs - fpsSince))} fps`;
        frames = 0;
        fpsSince = timeMs;
      }
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => engine.resize());

  // If the graphics card drops the page (a driver reset, too many tabs), say so rather than show a black screen.
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    live = false;
    trouble('The graphics card stopped drawing this page. Reload it to carry on.');
    document.body.classList.add('is-loading');
  });

  // The keyboard: up and down scroll as on any page; left and right travel from stop to stop.
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (hud.aboutOpen) {
      if (event.key === 'Escape') hud.closeAbout();
      return;
    }
    const here = engine.at;
    switch (event.key) {
      case 'ArrowRight':
      case 'n':
        scroll.goTo(Math.min(STOPS.length - 1, Math.floor(here + 0.02) + 1));
        break;
      case 'ArrowLeft':
      case 'p':
        scroll.goTo(Math.max(0, Math.ceil(here - 0.02) - 1));
        break;
      case 'Home':
        scroll.goTo(0);
        break;
      case 'End':
        scroll.goTo(STOPS.length - 1);
        break;
      case '?':
        hud.openAbout();
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  window.__motion = {
    engine,
    renderAt(progress, t) {
      live = false;
      engine.render(progress, t);
      hud.update(engine, progress);
    },
    goTo: (id, immediate = false) => scroll.goTo(stopIndex(id), immediate),
    stopProgress: (id) => stopProgress(stopIndex(id)),
    assets: earthMapsReady(),
  };

  // Deep links: /#earth opens straight at that stop, and changing the hash later travels there.
  const followHash = (immediate: boolean): void => {
    const id = location.hash.slice(1);
    if (STOPS.some((stop) => stop.id === id)) scroll.goTo(stopIndex(id), immediate);
  };
  followHash(true);
  window.addEventListener('hashchange', () => followHash(false));

  document.body.classList.remove('is-loading');
  requestAnimationFrame(frame);
}

start().catch((error: unknown) => {
  console.error(error);
  trouble('Something went wrong while building the scene. Reloading the page may help.');
});
