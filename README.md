# Motion: From Universe to Atom

One continuous zoom through 42 orders of magnitude: from the observable universe, through
galaxies, the Solar System and the Earth, down into the leaf of a tree, a cell, DNA, a carbon
atom and the inside of a proton.

**Live: <https://mikeliashenko.github.io/TheMotion/>**

Scroll, drag or use the arrow keys to zoom; it works in both directions. `→` and `←` travel to the
next and the previous stop, `Home` and `End` to either end, `?` opens the About sheet. Add
`#earth` (or any other stop's id) to the address to start there, and `?quality=low`, `medium` or
`high` to choose how much the scene asks of the graphics card.

## How it works

The whole picture is a function of one number, the height of the frame in metres, which the
scroll position sets. No single coordinate system could hold 42 orders of magnitude, so each of
the 40 stops owns a layer drawn in units of its own; neighbouring layers show the same things
from the same shared models and crossfade as the zoom passes from one to the next.

- `src/app/timeline.ts`: the stops, and how scrolling turns into scale.
- `src/app/catalog.ts`: everything that gets a label.
- `src/layers/`: one module per kind of scene, all WebGL through [three.js](https://threejs.org).
- `src/hud/`: the captions, scale readout, labels and rail drawn over the canvas.
- `docs/SOURCES.md`: what is to scale and what is not, and where the pictures come from.

## Running it

Needs Node 24.

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # the site, in dist/
```

With the dev server running, `npm run perf` flies through the whole journey in a headless Edge
and reports frame times, and `node scripts/shots.mjs <folder> [stop ...]` renders stills.
`npm run textures` rebuilds the pictures of the Earth from their sources (it downloads about
70 MB into `.cache/`).

Every push to `main` is tested, built and published to GitHub Pages by
`.github/workflows/deploy.yml`.

## Credits

Pictures of the Earth:

- Blue Marble: Next Generation, Black Marble and the cloud map: NASA Earth Observatory and NASA
  Visible Earth.
- [Sentinel-2 cloudless](https://s2maps.eu) by EOX IT Services GmbH (contains modified Copernicus
  Sentinel data 2016), CC BY 4.0.
- Aerial photographs: Geobasis NRW, Datenlizenz Deutschland Zero 2.0.

Everything else on screen is generated in code. Built with three.js, Lenis and the Space Grotesk
typeface.

The figures quoted along the way have been read through but not yet checked one by one against
primary sources: see `docs/SOURCES.md`.
