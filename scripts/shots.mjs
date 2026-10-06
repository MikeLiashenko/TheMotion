// Renders still frames of the journey in a headless browser. The dev server must be running.
//
//   node scripts/shots.mjs <outDir> <spec> [<spec> ...]
//
// A spec is a stop id ("earth"), a raw progress ("p=0.5"), or a point part-way between two
// stops ("earth>orbit@0.5"). With no specs, every stop is rendered.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const URL = process.env.MOTION_URL ?? 'http://localhost:5173/';
const [outDir = 'shots', ...specs] = process.argv.slice(2);
const width = Number(process.env.SHOT_WIDTH ?? 1280);
const height = Number(process.env.SHOT_HEIGHT ?? 720);

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: process.env.SHOT_BROWSER ?? 'msedge',
  headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') console.log(`[${msg.type()}]`, msg.text());
});
page.on('pageerror', (err) => console.log('[pageerror]', err.message));

await page.goto(URL);
await page.waitForFunction(() => window.__motion !== undefined);
// The Earth's maps load in the background: wait for them, or the Earth would be photographed half-dressed.
await page.evaluate(() => window.__motion.assets);
// The scene fades in once it has been built.
await page.waitForTimeout(1600);

const info = await page.evaluate(() => {
  const gl = window.__motion.engine.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
    stops: window.__motion.engine.layers.map((layer) => layer.stop.id),
  };
});
console.log('GPU:', info.gpu);

const list = specs.length > 0 ? specs : info.stops;
for (const [index, spec] of list.entries()) {
  const progress = await page.evaluate((s) => {
    const m = window.__motion;
    if (s.startsWith('p=')) return Number(s.slice(2));
    const between = s.match(/^(\w+)>(\w+)@([\d.]+)$/);
    if (between) {
      const a = m.stopProgress(between[1]);
      const b = m.stopProgress(between[2]);
      return a + (b - a) * Number(between[3]);
    }
    return m.stopProgress(s);
  }, spec);
  const time = Number(process.env.SHOT_TIME ?? 3);
  await page.evaluate(([p, t]) => window.__motion.renderAt(p, t), [progress, time]);
  // Let CSS transitions (labels, stage title) settle, then redraw the same frame.
  await page.waitForTimeout(900);
  await page.evaluate(([p, t]) => window.__motion.renderAt(p, t), [progress, time]);
  const name = `${String(index).padStart(2, '0')}-${spec.replace(/[^\w.]+/g, '_')}.png`;
  await page.screenshot({ path: path.join(outDir, name) });
  console.log(name, `progress=${progress.toFixed(4)}`);
}

await browser.close();
