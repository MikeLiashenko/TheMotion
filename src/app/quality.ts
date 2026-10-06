/**
 * How much the scene asks of the graphics card. A level is chosen once, before the scene is
 * built: from the address (`?quality=low`), or else from what the machine says about itself.
 * While the journey runs, the engine also trims the resolution of the canvas if frames come slowly
 * (see `Engine.adapt`), so a wrong guess here costs sharpness, not smoothness.
 */
export type QualityLevel = 'high' | 'medium' | 'low';

export interface Quality {
  level: QualityLevel;
  /** The most device pixels per CSS pixel the canvas is drawn at. */
  maxDpr: number;
  /** The fewest, when frames come slowly. */
  minDpr: number;
  /** Multiplies how finely round things are made: 1 is the full count of segments. */
  detail: number;
  /** Whether edges are smoothed by the graphics card. */
  antialias: boolean;
}

const LEVELS: Record<QualityLevel, Quality> = {
  high: { level: 'high', maxDpr: 2, minDpr: 0.75, detail: 1, antialias: true },
  medium: { level: 'medium', maxDpr: 1.5, minDpr: 0.6, detail: 0.75, antialias: true },
  low: { level: 'low', maxDpr: 1, minDpr: 0.5, detail: 0.5, antialias: false },
};

/** What a graphics card's own name says about it. Phones and built-in graphics get the lighter scene. */
export function levelForGraphics(renderer: string): QualityLevel {
  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) return 'low';
  if (/mali|adreno|powervr|apple a\d|videocore/i.test(renderer)) return 'low';
  if (/intel|iris|uhd|hd graphics|radeon\(tm\) graphics|vega \d|apple gpu/i.test(renderer)) return 'medium';
  return 'high';
}

function graphicsName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return '';
  }
}

function choose(): QualityLevel {
  // Outside a browser (the tests) there is nothing to ask: the scene is built in full.
  if (typeof window === 'undefined' || typeof document === 'undefined') return 'high';
  const asked = new URLSearchParams(window.location.search).get('quality');
  if (asked === 'high' || asked === 'medium' || asked === 'low') return asked;
  let level = levelForGraphics(graphicsName());
  // A phone, or a machine with little memory, is not asked for the full scene whatever its card is called.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const small = window.matchMedia('(pointer: coarse)').matches && Math.min(window.screen.width, window.screen.height) < 820;
  if (level === 'high' && (small || (memory !== undefined && memory <= 4))) level = 'medium';
  return level;
}

export const QUALITY: Quality = LEVELS[choose()];

/** How many segments to make something round from, given the count the full scene uses. */
export function segments(full: number, fewest = 6): number {
  return Math.max(fewest, Math.round(full * QUALITY.detail));
}
