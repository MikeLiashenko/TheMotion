// Builds the pictures of the landing site: a pyramid of square images centred on one point, each
// a quarter the width of the one before, from 2,400 km down to 146 m across. The site and the
// levels are listed in src/app/site.json; sources and licences are in docs/SOURCES.md.
//
// Every level is an orthographic view from straight above the site, north up: a point x metres
// east and y metres north of the site (measured on the plane touching the globe there) is at
// the same place in all of them, which is what lets the Earth layers swap one for the next.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decode, download, encode, OUT, ROOT } from './lib/images.mjs';

const SITE = JSON.parse(await readFile(path.join(ROOT, 'src', 'app', 'site.json'), 'utf8'));

/** Radius of the globe the journey draws. Latitude and longitude are taken as angles on this sphere. */
const EARTH_RADIUS = 6.371e6;
const RAD = Math.PI / 180;

const BLUE_MARBLE = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x21600x10800.jpg';
/** Sentinel-2 cloudless 2016 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0. */
const SENTINEL = 'https://tiles.maps.eox.at/wms?service=WMS&version=1.1.1&request=GetMap&layers=s2cloudless&styles=&srs=EPSG:4326&format=image/jpeg';
/** Digital orthophotos of North Rhine-Westphalia, 10 cm. Geobasis NRW, Datenlizenz Deutschland Zero 2.0. */
const AERIAL = 'https://www.wms.nrw.de/geobasis/wms_nw_dop?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=nw_dop_rgb&STYLES=&SRS=EPSG:4326&FORMAT=image/jpeg';

/** Latitude and longitude (degrees) of the point x metres east and y metres north of the site. */
export function fromSite(x, y, site = SITE) {
  const rho = Math.hypot(x, y);
  if (rho === 0) return [site.lat, site.lon];
  const c = Math.asin(Math.min(1, rho / EARTH_RADIUS));
  const lat0 = site.lat * RAD;
  const lat = Math.asin(Math.cos(c) * Math.sin(lat0) + (y * Math.sin(c) * Math.cos(lat0)) / rho);
  const lon = site.lon * RAD + Math.atan2(x * Math.sin(c), rho * Math.cos(lat0) * Math.cos(c) - y * Math.sin(lat0) * Math.sin(c));
  return [lat / RAD, lon / RAD];
}

/** The box of latitude and longitude that holds a square `extent` metres wide around the site, with a margin. */
function boxAround(extent) {
  let south = 90;
  let north = -90;
  let west = 180;
  let east = -180;
  for (let i = 0; i <= 16; i++) {
    for (let j = 0; j <= 16; j++) {
      const [lat, lon] = fromSite((i / 16 - 0.5) * extent, (j / 16 - 0.5) * extent);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      west = Math.min(west, lon);
      east = Math.max(east, lon);
    }
  }
  const padLat = (north - south) * 0.02;
  const padLon = (east - west) * 0.02;
  return { south: south - padLat, north: north + padLat, west: west - padLon, east: east + padLon };
}

/** A picture laid out in plain latitude and longitude, from whichever source the level calls for. */
async function fetchSource(level, index, size) {
  const box = boxAround(level.extent);
  // About 1.3 source pixels for every pixel of the result, in both directions.
  const metresPerDegree = EARTH_RADIUS * RAD;
  const tall = (box.north - box.south) * metresPerDegree;
  const wide = (box.east - box.west) * metresPerDegree * Math.cos(SITE.lat * RAD);
  const density = (1.3 * size) / level.extent;

  if (level.source === 'bluemarble') {
    // Cut from the whole-Earth map: 60 pixels to the degree, longitude -180 at the left edge.
    const file = await download(BLUE_MARBLE);
    const perDegree = 21600 / 360;
    const x = Math.floor((box.west + 180) * perDegree);
    const y = Math.floor((90 - box.north) * perDegree);
    const width = Math.ceil((box.east - box.west) * perDegree);
    const height = Math.ceil((box.north - box.south) * perDegree);
    const image = await decode(file, { filter: `crop=${width}:${height}:${x}:${y}`, width, height });
    return { ...image, west: x / perDegree - 180, east: (x + width) / perDegree - 180, north: 90 - y / perDegree, south: 90 - (y + height) / perDegree };
  }

  const limit = level.source === 'aerial' ? 5000 : 4096;
  const scale = Math.min(1, limit / (wide * density), limit / (tall * density));
  const width = Math.round(wide * density * scale);
  const height = Math.round(tall * density * scale);
  const base = level.source === 'aerial' ? AERIAL : SENTINEL;
  const bbox = [box.west, box.south, box.east, box.north].map((v) => v.toFixed(7)).join(',');
  const url = `${base}&${level.source === 'aerial' ? 'BBOX' : 'bbox'}=${bbox}&${level.source === 'aerial' ? 'WIDTH' : 'width'}=${width}&${level.source === 'aerial' ? 'HEIGHT' : 'height'}=${height}`;
  // Named after the request, so that moving the site fetches new pictures instead of reusing old ones.
  const key = createHash('sha1').update(url).digest('hex').slice(0, 8);
  const file = await download(url, `site/source-${index + 1}-${level.source}-${key}.jpg`);
  const image = await decode(file, { width, height });
  return { ...image, ...box };
}

/** Resamples a latitude/longitude picture into the level's own view from above the site. */
function project(source, extent, size) {
  const out = Buffer.alloc(size * size * 3);
  const { data, width, height } = source;
  const perLon = width / (source.east - source.west);
  const perLat = height / (source.north - source.south);
  for (let j = 0; j < size; j++) {
    const y = (0.5 - (j + 0.5) / size) * extent;
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) / size - 0.5) * extent;
      const [lat, lon] = fromSite(x, y);
      // Pixel centres sit at half-integers.
      const u = Math.min(width - 1.001, Math.max(0, (lon - source.west) * perLon - 0.5));
      const v = Math.min(height - 1.001, Math.max(0, (source.north - lat) * perLat - 0.5));
      const u0 = Math.floor(u);
      const v0 = Math.floor(v);
      const fu = u - u0;
      const fv = v - v0;
      const a = (v0 * width + u0) * 3;
      const b = a + 3;
      const c = a + width * 3;
      const d = c + 3;
      const o = (j * size + i) * 3;
      for (let k = 0; k < 3; k++) {
        const top = data[a + k] + (data[b + k] - data[a + k]) * fu;
        const bottom = data[c + k] + (data[d + k] - data[c + k]) * fu;
        out[o + k] = Math.round(top + (bottom - top) * fv);
      }
    }
  }
  return { data: out, width: size, height: size, channels: 3 };
}

/** The middle quarter (by width) of a picture, or the whole picture shrunk to a quarter: both `size / 4` wide. */
function quarter(image, { middle }) {
  const n = image.width / 4;
  const out = new Float64Array(n * n * 3);
  if (middle) {
    const start = (image.width - n) / 2;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const s = ((j + start) * image.width + i + start) * 3;
        for (let k = 0; k < 3; k++) out[(j * n + i) * 3 + k] = image.data[s + k];
      }
    }
    return out;
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        let sum = 0;
        for (let dj = 0; dj < 4; dj++) for (let di = 0; di < 4; di++) sum += image.data[((j * 4 + dj) * image.width + i * 4 + di) * 3 + k];
        out[(j * n + i) * 3 + k] = sum / 16;
      }
    }
  }
  return out;
}

/** True where a Blue Marble pixel is sea: its drawn ocean is far bluer than any land. */
const isSea = (r, g, b) => b > g * 1.05 && b > r * 1.3;

/**
 * Gain and offset per colour channel that make `from` look like `to` (both show the same ground,
 * pixel for pixel): the two are given the same mean and spread. Sea is left out of the sums.
 * A straight line per channel, unlike a free-form curve, cannot bend one kind of ground
 * (towns, say) towards a different hue than the rest.
 */
function matchColours(from, to, toIsBlueMarble) {
  const gain = [];
  const offset = [];
  for (let k = 0; k < 3; k++) {
    let n = 0;
    let sumA = 0;
    let sumB = 0;
    let sqA = 0;
    let sqB = 0;
    for (let i = 0; i < from.length; i += 3) {
      if (toIsBlueMarble && isSea(to[i], to[i + 1], to[i + 2])) continue;
      const a = from[i + k];
      const b = to[i + k];
      n++;
      sumA += a;
      sumB += b;
      sqA += a * a;
      sqB += b * b;
    }
    const meanA = sumA / n;
    const meanB = sumB / n;
    const spreadA = Math.sqrt(sqA / n - meanA * meanA);
    const spreadB = Math.sqrt(sqB / n - meanB * meanB);
    gain.push(Math.min(1.8, Math.max(0.55, spreadB / spreadA)));
    offset.push(meanB - gain[k] * meanA);
  }
  return { gain, offset };
}

function recolour(image, { gain, offset }) {
  const { data } = image;
  for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, Math.round(data[i] * gain[i % 3] + offset[i % 3])));
}

/**
 * Where the level above shows sea, takes the sea from it. The Blue Marble's ocean is drawn from
 * depth soundings rather than photographed, so the real, dark sea of the satellite picture would
 * otherwise meet it along a visible edge. Only open water is replaced: coasts, rivers and
 * lakes keep the detail of the finer picture.
 */
function borrowSea(image, parent) {
  const size = image.width;
  const start = (size - size / 4) / 2;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      // The same spot in the level above, which is four times coarser.
      const u = Math.min(size - 1.001, start + (i + 0.5) / 4 - 0.5);
      const v = Math.min(size - 1.001, start + (j + 0.5) / 4 - 0.5);
      const u0 = Math.floor(u);
      const v0 = Math.floor(v);
      const fu = u - u0;
      const fv = v - v0;
      const at = (x, y, k) => parent.data[(y * size + x) * 3 + k];
      const sample = [0, 1, 2].map((k) => {
        const top = at(u0, v0, k) + (at(u0 + 1, v0, k) - at(u0, v0, k)) * fu;
        const bottom = at(u0, v0 + 1, k) + (at(u0 + 1, v0 + 1, k) - at(u0, v0 + 1, k)) * fu;
        return top + (bottom - top) * fv;
      });
      if (!isSea(sample[0], sample[1], sample[2])) continue;
      const o = (j * size + i) * 3;
      const [r, g, b] = [image.data[o], image.data[o + 1], image.data[o + 2]];
      // How surely this pixel of the finer picture is water too: dark, and no redder than it is blue.
      const watery = Math.min(1, Math.max(0, (b * 1.15 - r) / 24)) * Math.min(1, Math.max(0, (150 - (r + g + b) / 3) / 40));
      for (let k = 0; k < 3; k++) image.data[o + k] = Math.round(image.data[o + k] + (sample[k] - image.data[o + k]) * watery);
    }
  }
}

export async function buildSite() {
  const size = SITE.levelSize;
  const levels = [];
  for (const [index, level] of SITE.levels.entries()) {
    const source = await fetchSource(level, index, size);
    levels.push(project(source, level.extent, size));
    console.log(`level ${index + 1}: ${level.extent} m across, from ${source.width}x${source.height} ${level.source}`);
  }

  // The satellite pictures are given the colours of the Blue Marble, with which they share the frame.
  const firstSatellite = SITE.levels.findIndex((level) => level.source === 'sentinel');
  const toBlueMarble = matchColours(quarter(levels[firstSatellite], { middle: false }), quarter(levels[firstSatellite - 1], { middle: true }), true);
  SITE.levels.forEach((level, index) => level.source === 'sentinel' && recolour(levels[index], toBlueMarble));
  borrowSea(levels[firstSatellite], levels[firstSatellite - 1]);

  // The aerial photographs keep their own colours, which are right for a view from low down. What
  // would make them match the satellite pictures is written out instead: the Earth layers apply
  // it while both are in the frame and let go of it on the way down.
  const firstAerial = SITE.levels.findIndex((level) => level.source === 'aerial');
  const toSatellite = matchColours(quarter(levels[firstAerial], { middle: false }), quarter(levels[firstAerial - 1], { middle: true }), false);
  const round = (values, scale) => values.map((v) => Number((v / scale).toFixed(4)));
  await writeFile(
    path.join(ROOT, 'src', 'layers', 'siteColours.ts'),
    `/**
 * What turns the colours of the aerial photographs of the landing site into those of the satellite
 * pictures around them: \`colour * gain + offset\`, per channel, colours in 0..1.
 * Built by scripts/site-imagery.mjs.
 */
export const AERIAL_TO_SATELLITE = {
  gain: ${JSON.stringify(round(toSatellite.gain, 1))},
  offset: ${JSON.stringify(round(toSatellite.offset, 255))},
};
`,
  );
  console.log('aerial to satellite:', toSatellite);

  for (const [index, level] of SITE.levels.entries()) {
    await encode(levels[index], path.join(OUT, level.file), { quality: 88 });
  }
}
