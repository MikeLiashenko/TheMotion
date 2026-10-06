/**
 * Where on Earth the journey comes down, and how the globe is turned to the screen.
 *
 * The site has its own frame: east, north and up, in metres from the landing point, with the
 * Earth's centre one radius below it. Every Earth layer is drawn in that frame, so the place
 * under the camera never moves while the layers hand over to one another.
 */
import site from './site.json';
import { EARTH_RADIUS, SUNLIGHT_ON_EARTH, type Vec3 } from './solarSystem';
import { stopIndex, STOPS } from './timeline';

/** The landing site and the pictures of it, built by scripts/site-imagery.mjs. */
export const SITE = site;

const RAD = Math.PI / 180;

/**
 * How far north is turned anticlockwise from straight up on screen, in radians. Not a free
 * choice: the aerial photographs of the site were taken with the Sun in the south-east (their
 * shadows show it), and the scene's own Sun has to stand in that same direction.
 */
export const NORTH_ROLL = Math.atan2(SUNLIGHT_ON_EARTH[1], SUNLIGHT_ON_EARTH[0]) + SITE.sunAzimuth * RAD - Math.PI / 2;

/** How high the scene's Sun stands above the horizon at the site, radians. */
export const SUN_ELEVATION = Math.asin(SUNLIGHT_ON_EARTH[2]);

/** The direction to the Sun in the site's frame: east, north, up. */
export const SUN_AT_SITE: Vec3 = [
  Math.sin(SITE.sunAzimuth * RAD) * Math.cos(SUN_ELEVATION),
  Math.cos(SITE.sunAzimuth * RAD) * Math.cos(SUN_ELEVATION),
  Math.sin(SUN_ELEVATION),
];

/** A vector in the site's frame (east, north, up) as the screen sees it: right, up, towards the camera. */
export function siteToView([east, north, up]: Vec3): Vec3 {
  const c = Math.cos(NORTH_ROLL);
  const s = Math.sin(NORTH_ROLL);
  return [east * c - north * s, east * s + north * c, up];
}

/** The unit vector from the Earth's centre towards a latitude and longitude (degrees), in the site's frame. */
export function geoToSite(lat: number, lon: number): Vec3 {
  const phi = lat * RAD;
  const phi0 = SITE.lat * RAD;
  const dLon = (lon - SITE.lon) * RAD;
  return [
    Math.cos(phi) * Math.sin(dLon),
    Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(dLon),
    Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(dLon),
  ];
}

/**
 * Turns a direction in the site's frame into geographic axes (x through 0°N 0°E, y through
 * 0°N 90°E, z through the North Pole): a 3×3 matrix, column by column. Its columns are the
 * site's east, north and up.
 */
export const SITE_TO_GEO: number[] = (() => {
  const phi = SITE.lat * RAD;
  const lambda = SITE.lon * RAD;
  return [
    -Math.sin(lambda), Math.cos(lambda), 0,
    -Math.sin(phi) * Math.cos(lambda), -Math.sin(phi) * Math.sin(lambda), Math.cos(phi),
    Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi),
  ];
})();

const unitOf = (layer: string) => 10 ** STOPS[stopIndex(layer)].s / 2;

/**
 * Where a place on Earth is in one of the Earth layers, as the screen sees it. The landing site
 * is the origin; anything beyond the horizon ends up behind the globe.
 * @param altitude metres above the ground
 */
export function onEarth(layer: string, lat: number, lon: number, altitude = 0): Vec3 {
  const [east, north, up] = geoToSite(lat, lon);
  const r = EARTH_RADIUS + altitude;
  const unit = unitOf(layer);
  return siteToView([(east * r) / unit, (north * r) / unit, (up * r - EARTH_RADIUS) / unit]);
}

/** Where a point a few metres from the landing site is in one of the Earth layers: metres east, north and up. */
export function nearSite(layer: string, east: number, north: number, up = 0): Vec3 {
  const unit = unitOf(layer);
  // The ground curves away below the plane that touches it at the site.
  const drop = (east * east + north * north) / (2 * EARTH_RADIUS);
  return siteToView([east / unit, north / unit, (up - drop) / unit]);
}

/**
 * Where a point is that lies `distance` degrees of arc from the landing site along compass bearing
 * `bearing` (degrees clockwise from north), in one of the Earth layers. Handy for things placed by
 * where they appear on the globe rather than by their coordinates: the terminator, the limb.
 * @param altitude metres above the ground
 */
export function awayFromSite(layer: string, distance: number, bearing: number, altitude = 0): Vec3 {
  const d = distance * RAD;
  const b = bearing * RAD;
  const r = EARTH_RADIUS + altitude;
  const unit = unitOf(layer);
  return siteToView([(Math.sin(d) * Math.sin(b) * r) / unit, (Math.sin(d) * Math.cos(b) * r) / unit, (Math.cos(d) * r - EARTH_RADIUS) / unit]);
}
