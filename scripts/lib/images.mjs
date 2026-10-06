// Shared by the texture scripts: downloading into the cache, and getting pixels in and out of ffmpeg.
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Originals are kept here, outside the repository, and downloaded only once. */
export const CACHE = path.join(ROOT, '.cache', 'textures');
export const OUT = path.join(ROOT, 'public', 'textures');

const exists = (file) => stat(file).then(() => true, () => false);

/** Fetches `url` into the cache unless it is already there. Returns the local path. */
export async function download(url, name = path.basename(new URL(url).pathname)) {
  const file = path.join(CACHE, name);
  if (await exists(file)) return file;
  await mkdir(path.dirname(file), { recursive: true });
  process.stdout.write(`downloading ${name} ... `);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new Error(`Expected an image from ${url}, got ${type}: ${(await response.text()).slice(0, 300)}`);
  // Written under a temporary name, so that an interrupted download is never mistaken for a finished one.
  await pipeline(Readable.fromWeb(response.body), createWriteStream(`${file}.part`));
  await rename(`${file}.part`, file);
  console.log(`${((await stat(file)).size / 1e6).toFixed(1)} MB`);
  return file;
}

/** Runs ffmpeg; resolves with whatever it wrote to stdout. `input` is piped to its stdin. */
export function ffmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${args.join(' ')}\n${err}`))));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

/**
 * Decodes an image to raw pixels.
 * @param filter an ffmpeg filter chain applied first (crop, scale...)
 * @returns {{ data: Buffer, width: number, height: number, channels: number }}
 */
export async function decode(file, { filter, gray = false, width, height } = {}) {
  if (!width || !height) throw new Error('decode needs the size of what comes out');
  const data = await ffmpeg(['-i', file, ...(filter ? ['-vf', filter] : []), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', gray ? 'gray' : 'rgb24', 'pipe:1']);
  const channels = gray ? 1 : 3;
  if (data.length !== width * height * channels) throw new Error(`${file}: expected ${width}x${height}, got ${data.length} bytes`);
  return { data, width, height, channels };
}

/** Writes raw pixels as WebP (or whatever the extension of `file` says). */
export async function encode(image, file, { quality = 86 } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  const codec = file.endsWith('.webp') ? ['-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6'] : ['-q:v', '3'];
  await ffmpeg(
    ['-f', 'rawvideo', '-pix_fmt', image.channels === 1 ? 'gray' : 'rgb24', '-s', `${image.width}x${image.height}`, '-i', 'pipe:0', '-frames:v', '1', ...codec, file],
    image.data,
  );
  console.log(`${path.relative(ROOT, file)}  ${image.width}x${image.height}  ${((await stat(file)).size / 1e6).toFixed(2)} MB`);
}
