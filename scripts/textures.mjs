// Builds the textures in public/textures from open imagery. Sources and licences: docs/SOURCES.md.
//
//   node scripts/textures.mjs [global] [site] [preview]
//
// Originals are downloaded once into .cache/textures (not part of the repository) and reused.
// Needs ffmpeg on the PATH; everything else is plain Node.
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE, download, ffmpeg, OUT, ROOT } from './lib/images.mjs';

const NASA = 'https://eoimages.gsfc.nasa.gov/images/imagerecords';
const SOURCES = {
  // Blue Marble Next Generation with topography and bathymetry, July 2004. NASA Earth Observatory, public domain.
  day: `${NASA}/73000/73751/world.topo.bathy.200407.3x21600x10800.jpg`,
  // Black Marble 2016: the Earth at night. NASA Earth Observatory, public domain.
  night: `${NASA}/144000/144898/BlackMarble_2016_3km.jpg`,
  // Blue Marble: Clouds. NASA Visible Earth, public domain.
  clouds: `${NASA}/57000/57747/cloud_combined_8192.tif`,
};

/** Converts straight from file to file through an ffmpeg filter chain. */
async function convert(source, file, filter, { quality = 86 } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  const codec = file.endsWith('.webp') ? ['-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6'] : ['-q:v', '3'];
  await ffmpeg(['-i', source, '-vf', filter, '-frames:v', '1', ...codec, file]);
  console.log(`${path.relative(ROOT, file)}  ${((await stat(file)).size / 1e6).toFixed(2)} MB`);
}

/** The whole-Earth maps: day, city lights, clouds. Equirectangular, north up, longitude -180 at the left edge. */
async function buildGlobal() {
  const day = await download(SOURCES.day);
  const night = await download(SOURCES.night);
  const clouds = await download(SOURCES.clouds);

  await convert(day, path.join(OUT, 'earth-day-8k.webp'), 'scale=8192:4096:flags=lanczos', { quality: 88 });
  await convert(day, path.join(OUT, 'earth-day-4k.webp'), 'scale=4096:2048:flags=lanczos', { quality: 86 });
  // A stand-in small enough to ship inside the script bundle: the Earth is never blank while the maps load.
  const tiny = await ffmpeg(['-i', day, '-vf', 'scale=128:64:flags=area', '-frames:v', '1', '-q:v', '6', '-f', 'mjpeg', 'pipe:1']);
  await writeFile(path.join(ROOT, 'src', 'layers', 'earthTiny.ts'), `/** The Earth in 128x64 pixels (Blue Marble, NASA): shown until the real maps have loaded. Built by scripts/textures.mjs. */\nexport const EARTH_TINY = 'data:image/jpeg;base64,${tiny.toString('base64')}';\n`);
  console.log(`src/layers/earthTiny.ts  ${(tiny.length / 1e3).toFixed(1)} kB`);

  // City lights only: the picture's own dim blue land and sea are taken out, leaving light on black.
  await convert(night, path.join(OUT, 'earth-night-4k.webp'), "scale=4096:2048:flags=area,format=gbrp,lutrgb=r='clip((val-34)*1.45,0,255)':g='clip((val-34)*1.45,0,255)':b='clip((val-52)*1.45,0,255)',format=gray", { quality: 84 });
  await convert(clouds, path.join(OUT, 'earth-clouds-4k.webp'), 'scale=4096:2048:flags=area,format=gray', { quality: 82 });
}

/** Small copies of the global maps to look at while choosing settings: not shipped. */
async function buildPreview() {
  const dir = path.join(CACHE, 'preview');
  await convert(await download(SOURCES.night), path.join(dir, 'night.jpg'), 'scale=2000:1000:flags=area');
  await convert(await download(SOURCES.clouds), path.join(dir, 'clouds.jpg'), 'scale=2000:1000:flags=area');
  await convert(await download(SOURCES.day), path.join(dir, 'day.jpg'), 'scale=2000:1000:flags=area');
  // Europe at the full resolution of each source, for checking detail.
  await convert(await download(SOURCES.night), path.join(dir, 'night-europe.jpg'), 'crop=1500:1000:6300:1000');
  await convert(path.join(OUT, 'earth-night-4k.webp'), path.join(dir, 'night-europe-out.jpg'), 'crop=800:520:1880:300,scale=1600:1040:flags=neighbor');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tasks = process.argv.slice(2);
  const all = tasks.length === 0;
  if (all || tasks.includes('global')) await buildGlobal();
  if (tasks.includes('preview')) await buildPreview();
  if (all || tasks.includes('site')) {
    const { buildSite } = await import('./site-imagery.mjs');
    await buildSite();
  }
}
