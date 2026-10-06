/**
 * What turns the colours of the aerial photographs of the landing site into those of the satellite
 * pictures around them: `colour * gain + offset`, per channel, colours in 0..1.
 * Built by scripts/site-imagery.mjs.
 */
export const AERIAL_TO_SATELLITE = {
  gain: [0.5551,0.55,0.55],
  offset: [-0.0311,0.0067,-0.0955],
};
