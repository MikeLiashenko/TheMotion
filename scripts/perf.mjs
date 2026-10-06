// Drives the live page the way a visitor would and reports how it behaves. The dev server must be running.
//
//   node scripts/perf.mjs
//
// 1. Turns the mouse wheel and checks that the journey actually advances.
// 2. Flies through the whole journey and records every frame: frame times, and whether the
//    journey ever runs backwards or the zoom jumps.
import { chromium } from 'playwright-core';

const URL = process.env.MOTION_URL ?? 'http://localhost:5173/';

const browser = await chromium.launch({
  channel: process.env.SHOT_BROWSER ?? 'msedge',
  headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(msg.text());
});
page.on('pageerror', (err) => problems.push(err.message));

const started = Date.now();
await page.goto(URL);
const firstPaint = await page.evaluate(
  () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? Number.NaN,
);
await page.waitForFunction(() => window.__motion !== undefined);
console.log(`title card painted at ${Math.round(firstPaint)} ms, scene ready in ${Date.now() - started} ms`);
// Where the start-up went (the engine leaves marks): building geometry, waiting for shaders, first draw.
const marks = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('mark').map((m) => [m.name, m.startTime])));
const built = Math.max(...Object.entries(marks).filter(([name]) => name.startsWith('motion:built:')).map(([, at]) => at));
console.log(`start-up: layers built by ${Math.round(built)} ms, shaders compiled by ${Math.round(marks['motion:compiled'])} ms, first draw done by ${Math.round(marks['motion:ready'])} ms`);

// 1. Mouse wheel.
const before = await page.evaluate(() => window.__motion.engine.s);
await page.mouse.move(960, 540);
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(40);
}
await page.waitForTimeout(1200);
const after = await page.evaluate(() => window.__motion.engine.s);
console.log(`wheel: s ${before.toFixed(3)} -> ${after.toFixed(3)} (12 notches)`);
if (!(after < before)) problems.push('mouse wheel did not advance the journey');

// 2. Full fly-through, sampled every frame.
const run = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const m = window.__motion;
      const frames = [];
      const scales = [];
      const places = [];
      let last = performance.now();
      let still = 0;
      // To the last stop of all, wherever the journey now ends.
      const end = m.engine.layers.at(-1).stop;
      m.goTo(end.id);
      const tick = (now) => {
        frames.push(now - last);
        last = now;
        const s = m.engine.s;
        still = scales.length > 0 && Math.abs(scales[scales.length - 1] - s) < 1e-7 ? still + 1 : 0;
        scales.push(s);
        places.push(m.engine.at);
        // Done once the camera has rested at the end for half a second.
        if (still > 30 && s < end.s + 0.2) resolve({ frames, scales, places });
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }),
);

const times = run.frames.slice(1).sort((a, b) => a - b);
const pct = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))];
// The scale itself is allowed to grow again on one leg (pulling back from the Sun); the position
// along the journey, counted in stops, is not.
let backwards = 0;
let biggestStep = 0;
for (let i = 1; i < run.scales.length; i++) {
  if (run.places[i] < run.places[i - 1] - 1e-6) backwards++;
  biggestStep = Math.max(biggestStep, Math.abs(run.scales[i - 1] - run.scales[i]));
}
console.log(`fly-through: ${run.frames.length} frames, s ${run.scales[0].toFixed(2)} -> ${run.scales.at(-1).toFixed(2)}`);
console.log(`frame time ms: median ${pct(0.5).toFixed(1)}, p95 ${pct(0.95).toFixed(1)}, p99 ${pct(0.99).toFixed(1)}, max ${times.at(-1).toFixed(1)}`);
console.log(`journey: ${backwards} backward steps, largest zoom step ${biggestStep.toFixed(3)} decades/frame`);
const worst = run.frames
  .map((ms, i) => ({ ms, s: run.scales[i] }))
  .slice(1)
  .sort((a, b) => b.ms - a.ms)
  .slice(0, 5)
  .map((f) => `${f.ms.toFixed(0)} ms at s=${f.s.toFixed(1)}`);
console.log(`slowest frames: ${worst.join(', ')}`);
if (backwards > 0) problems.push(`journey ran backwards on ${backwards} frames`);

// 3. Deep link: opening /#earth must start the journey at Earth.
await page.goto(`${URL}#earth`);
await page.reload();
await page.waitForFunction(() => window.__motion !== undefined);
await page.waitForTimeout(600);
const linked = await page.evaluate(() => window.__motion.engine.s);
console.log(`deep link #earth: s = ${linked.toFixed(2)}`);
if (Math.abs(linked - 7.35) > 0.2) problems.push(`deep link #earth opened at s=${linked.toFixed(2)}, expected about 7.35`);

await browser.close();
if (problems.length > 0) {
  console.log('PROBLEMS:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('OK');
