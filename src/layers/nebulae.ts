import { itemsFor } from '../app/catalog';
import { GalacticLayer } from './galaxy';
import { armFactor } from './galaxyModel';
import { puff } from './gen';
import { addNebula, HYDROGEN, NEBULAE, REFLECTION } from './nebulaLooks';
import { NebulaBuf } from './nebulaSprites';
import { PointBuf, pointsMaterial, scaleRgb, starsMaterial } from './points';

type Vec3 = [number, number, number];

/** Among the nebulae of our corner of the galaxy: nurseries, dying stars and the wreckage of supernovae. */
export class NebulaeLayer extends GalacticLayer {
  protected build(): void {
    const rng = this.rng;
    const unitLy = this.unitLy;
    this.galaxyStars(60_000, 6, [1.0, 2.6], false, false);
    this.localStars(14_000, 6, 0.3);

    const nebulae = new NebulaBuf();
    const young = new PointBuf();
    const stars = new PointBuf();

    // The unresolved gas and starlight of the arms, as a faint glow behind everything.
    const haze = new PointBuf();
    for (let tries = 0, glows = 0; glows < 80 && tries < 8000; tries++) {
      const [x, y] = rng.inSphere();
      if (armFactor(x * 6 * unitLy, y * 6 * unitLy) < 0.55) continue;
      glows++;
      puff(haze, rng, [x * 6, y * 6, rng.gauss() * 0.03], rng.range(0.5, 1.1), [0.22, 0.28, 0.6], 1, 0.035);
    }
    this.content.add(haze.toPoints(pointsMaterial(this.uniforms, { soft: 1.1 })));

    // The unnamed nurseries strung along the spiral arms.
    let placed = 0;
    for (let tries = 0; placed < 150 && tries < 20_000; tries++) {
      const [x, y, z] = rng.inSphere();
      const center: Vec3 = [x * 6, y * 6, z * 0.12];
      if (armFactor(center[0] * unitLy, center[1] * unitLy) < 0.8) continue;
      // Mostly keep clear of the middle of the frame, where the named ones are.
      if (Math.hypot(center[0], center[1]) < 0.5 && rng.next() < 0.8) continue;
      placed++;
      nebulae.add({
        center,
        radius: rng.range(0.018, 0.05),
        kind: 'emission',
        color: HYDROGEN,
        color2: rng.next() < 0.5 ? REFLECTION : [0.85, 0.3, 0.5],
        a: rng.range(0.3, 0.9),
        seed: rng.range(0, 90),
        angle: rng.range(0, 6.28),
        brightness: rng.range(0.45, 0.8),
      });
    }

    for (const item of itemsFor(this.stop.id)) {
      const look = NEBULAE[item.id];
      if (!look) continue;
      this.drew(item.id, addNebula(nebulae, item.id, item.pos));
      // The hot young stars that light a nursery from within.
      for (let i = 0; i < (look.stars ?? 0); i++) {
        const spread = look.radius * (look.b ? look.b * 0.5 : 0.22);
        const p: Vec3 = [item.pos[0] + rng.gauss() * spread, item.pos[1] + rng.gauss() * spread, item.pos[2] + rng.gauss() * spread];
        if (i < 2) stars.add(p[0], p[1], p[2], [0.8, 0.88, 1.0], 0, 15 + 7 * rng.next(), rng.next());
        else young.add(p[0], p[1], p[2], scaleRgb([0.75, 0.85, 1.0], 0.9), 0, 2.2 + 1.6 * rng.next(), rng.next());
      }
    }

    this.content.add(nebulae.toMesh(this.uniforms));
    this.content.add(young.toPoints(pointsMaterial(this.uniforms, { soft: 2.6, twinkle: 0.3 })));
    this.content.add(stars.toPoints(starsMaterial(this.uniforms)));
  }

  caveat(): string {
    return 'Nebulae drawn far larger than life';
  }
}
