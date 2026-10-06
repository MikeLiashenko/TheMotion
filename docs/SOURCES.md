# Sources and licences

**Status: read through, not yet verified.** Every caption was read through for plausibility on
6 October 2026 (one was wrong and was corrected: the water in a fair-weather cloud is about a
thousand tonnes, not a million). That is not the same as checking. The sizes, distances and one-line facts in
[`src/app/catalog.ts`](../src/app/catalog.ts) and [`src/app/timeline.ts`](../src/app/timeline.ts)
were written from general knowledge while building the first version. Every one of them needs to be
checked against a primary source before the site is published, and the source recorded here.

## Facts to check

| Area | Where | Preferred sources |
|------|-------|-------------------|
| Large-scale structure (walls, superclusters, voids) | `walls`, `superclusters` | Discovery papers, NASA/IPAC Extragalactic Database |
| Galaxy clusters and nearby galaxies | `clusters`, `galaxies`, `localGroup` | NED, ESA/Hubble and NASA object pages |
| Milky Way structure, clusters, nebulae, stars | `milkyWay` … `neighborhood` | SIMBAD, ESA Gaia, NASA |
| Solar System bodies and spacecraft | `oort` … `earthMoon` | NASA Solar System Exploration, JPL Small-Body Database, JPL Voyager status |
| Earth, and the places named on it | `earth` … `landscape` | NASA Earth Fact Sheet; for the Lower Rhine, the towns' and the state's own pages |
| The tree and its leaf | `tree` … `stoma` | A plant anatomy textbook (Evert, *Esau's Plant Anatomy*); the leaf count is a rough figure for a large broadleaf tree |
| Cell biology | `cell`, `nucleus`, `chromosomes` | *Molecular Biology of the Cell* (Alberts et al.) |
| Chromatin and DNA | `chromatin`, `dna`, `molecule` | Luger et al. 1997 for the nucleosome (1.65 turns, 4.18 nm, 2.39 nm pitch); Alberts for the helix (0.34 nm, 10.5 pairs a turn) |
| Atoms, nuclei, quarks | `atom`, `atomNucleus`, `proton` | NIST; CODATA for the proton's charge radius (0.84 fm); Particle Data Group |

## Deliberate simplifications

These are choices, not errors. Where a layer bends the scale it says so on screen, in the note
next to the scale bar (`Layer.caveat` in [`src/layers/layer.ts`](../src/layers/layer.ts)); an
"About the scale" page should collect them all.

- Positions in the cosmic layers (walls down to the Local Group) are schematic: distances from us are
  roughly to scale, directions are not.
- Inside the Milky Way, positions are real. Each object is placed from its galactic longitude, latitude
  and distance (`sky()` in the catalog, [`src/app/sky.ts`](../src/app/sky.ts)); the coordinates were
  converted from J2000 right ascension and declination, and the distances are the least certain part.
- The journey is one continuous zoom, at one even pace, with one exception: the camera flies past
  the Sun, close by, and the view then opens up until the Sun and Earth share the frame before it
  closes in on Earth. It does not go down to the Sun's surface: the granulation there is modelled
  (and the spots, and the prominences), but from where the camera passes it is too fine to see.
- The camera does not sit still around the galaxy: it sees the disc obliquely from outside, nearly
  edge-on among the globular clusters, then dives through the plane and looks at the Sun's
  surroundings from the south, like a map. This is a choice of viewpoint, not a claim about anything.
- Named globular clusters are drawn about 30× larger than life, and named nebulae and nearby star
  clusters several times to several hundred times larger: at true size they would be a few pixels or
  less. Stars are glints sized by a rough luminosity, on a log scale.
- Nebulae are generated pictures of five kinds (glowing cloud, ring, filled remnant, shell, two-lobed),
  tuned to resemble the real objects. The Local Bubble's outline and the Fermi Bubbles' shape are schematic.
- The cosmic web is drawn with cells far larger than life so that it reads as a web.
- Galaxies are drawn larger than life, because to scale they would be specks: named neighbours about
  80× (and clamped, so the factor is not the same for all), Local Group members 6×, and our own galaxy
  easing from 6× down to true scale as the camera approaches it. The numbers live in
  [`src/layers/magnify.ts`](../src/layers/magnify.ts).
- Each galaxy is generated from a handful of parameters (arms, bar, bulge, dust, tilt) chosen to
  resemble the real one. They are impressions, not images, and the tilts are approximate.
- Laniakea's outline and the flow lines towards the Great Attractor are schematic.
- In the Solar System, distances from the Sun are real, and so are the sizes of all orbits. Where the
  planets stand on their orbits is chosen for the picture and matches no date: Earth is on the far
  side of the Sun from the camera so that its day side faces us, and the giants are spread out so
  that none hides another. The places are in [`src/app/solarSystem.ts`](../src/app/solarSystem.ts).
- The Sun, planets, moons and dwarf planets are drawn no smaller than a fixed fraction of the frame
  (`WORLDS` in [`src/layers/solar.ts`](../src/layers/solar.ts)), because to scale they would be far
  less than a pixel: hundreds to thousands of times larger than life, and by a different factor for
  each. Each body returns to its true size as soon as that is larger than the minimum: the Sun at
  its own two stops, Earth and the Moon at theirs.
- Moons are drawn closer to their planets than they are (while a planet is magnified they would be
  inside its disc), in the right order. They circle their planets far faster than in life, at the
  right relative pace; the planets themselves do not move along their orbits.
- The Sun is drawn in the orange of filtered telescope pictures; to the eye, in space, it is white.
  The corona and the prominences are brightened enormously: in reality they are lost in the glare
  of the disc. The convection on its surface runs about 30 times faster than in life, and the
  sunspots and prominences are generated, not copied from any day's Sun.
- At the Sun to Earth stop the dots on the line do travel at the true speed of light: 499 seconds
  from end to end.
- The heliosphere's shape is schematic, as is where the Voyagers left it: one above the plane of the
  planets and one below, both near its nose, at their real distances. Its real shape is not settled.
- Planet Nine is a hypothesis. Its orbit is drawn dashed and labelled with a question mark.
- The Oort Cloud has never been observed directly; each dot stands for billions of comets.
- The sky behind the Solar System is generated, not a star map, and is fixed to the screen: at
  these scales the stars are too far away to move as the camera closes in.
- Nebulae are drawn larger than life: at true scale they would be a single pixel.
- The Milky Way is a stylised four-arm model, not a map.
- **Earth.** The day side is NASA's Blue Marble for July; the night side is the Black Marble of 2016;
  the clouds are one real cloud map, turned slowly and not tied to any date. Close to the ground the
  clouds are generated: fair-weather cumulus at 3,800 to 5,000 m, which is high for the Lower Rhine,
  with one of them placed over the landing site so that the camera flies through it.
- The landing site is real: a meadow on the left bank of the Rhine east of Xanten (51.656° N,
  6.523° E), seen in pictures from three sources, each four times finer than the last (see Assets).
  The satellite pictures are matched in colour to the Blue Marble, and the aerial photographs to
  the satellite pictures, relaxing to their own colours near the ground. North is not up: the
  globe is turned about 31° so that the scene's Sun stands where the shadows in the photographs
  say it stood, in the south-east.
- The air is a simple model (one scattering layer, no ozone, no weather); it is the same model on
  the globe and on the ground, which is what lets the two be swapped unseen.
- **The tree.** At 20 m across the frame the aerial photograph is already too coarse, and from
  there down everything is drawn. Leaves and grass are painted in over the photograph and tinted
  green; the crown the camera then enters is a model of a twig with a few thousand leaves, not a
  survey of the real tree, whose species is not known to us. The leaf is a generic toothed leaf
  9 cm long.
- **The leaf.** Its veins, the jigsaw cells of its skin and its stomata are generated, at the right
  sizes (cells about 40 µm, stomata 30 µm long, about 70 to the square millimetre). The camera
  goes in through a stoma on the upper side; most trees have nearly all their stomata on the
  underside, and the page says so.
- **Inside the leaf.** One model serves three stops: the two guard cells, the air space under the
  pore, a honeycomb of cells, and one cell in detail. Cells are drawn as smooth ellipsoids with
  clear walls so that one can see in; real palisade cells are packed columns. The colours are for
  telling the parts apart. Ribosomes are drawn four times too large, and a few hundred stand for
  millions. On its way down the camera's aim sinks from the skin to the nucleus, 47 µm below.
- Chromosomes are shown condensed (X-shaped), as they only are during cell division, when the
  nucleus has no envelope; here the envelope is kept. Eleven are shown; a tree's cell has dozens.
- **Chromatin.** The fibres are an open zigzag of nucleosomes ("beads on a string") at true size,
  with the DNA followed base pair by base pair along its real path round each one; but the
  chromosome is shown far emptier than it is, so that one can see into it, and the fibres far off
  are in outline only. The histone tails and the base sequence are made up. How chromatin is
  really folded inside a condensed chromosome is not settled.
- **DNA.** A coarse model: one ball each for a phosphate group and a sugar, three for a base. The
  dimensions are those of the common B form. The four bases have the colours they have in
  sequencing charts, except that cytosine is violet, the backbone being blue.
- **The nucleotide** is drawn flat, with most of its hydrogen atoms left out.
- **The atom.** Each dot is a place an electron might be found, drawn from simple (Slater-type)
  formulas for the 1s, 2s and 2p orbitals of a carbon atom on its own; the two 2p clouds are
  coloured differently so that their shapes show. In the nucleotide the atom is bonded, and its
  outer clouds would merge with its neighbours'. The nucleus is a dot far larger than life.
- **The epilogue** goes on from the atom to its nucleus and into a proton. Protons and neutrons are
  drawn as balls in a neat cluster; they have no surfaces and never keep still. The picture of the
  proton is the textbook cartoon: three quarks as points of light in the three "colours" of the
  strong force (which are names, not colours), gluons as springs, and specks for the pairs that
  come and go. On the way down, the screen is sprinkled with specks that stand for the chance of
  meeting an electron; otherwise it is as empty as the atom is.

## Assets

Everything on screen is generated in code except the pictures of the Earth, which are built from
open imagery by [`scripts/textures.mjs`](../scripts/textures.mjs) and
[`scripts/site-imagery.mjs`](../scripts/site-imagery.mjs) (`npm run textures`). The originals are
downloaded into `.cache/`, which is not part of the repository; what ships is in
[`public/textures`](../public/textures), about 10 MB in all.

| File | What it shows | Source | Licence |
|------|---------------|--------|---------|
| `earth-day-8k.webp`, `earth-day-4k.webp`, `site-1.webp`, and the placeholder in `src/layers/earthTiny.ts` | The Earth by day | *Blue Marble: Next Generation* with topography and bathymetry, July 2004. NASA Earth Observatory (Reto Stöckli). <https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x21600x10800.jpg> | Public domain (NASA); credit requested |
| `earth-night-4k.webp` | City lights | *Black Marble* 2016. NASA Earth Observatory (Joshua Stevens, with Suomi NPP VIIRS data from Miguel Román, NASA GSFC). <https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg> | Public domain (NASA); credit requested |
| `earth-clouds-4k.webp` | Clouds | *Blue Marble: Clouds*. NASA Visible Earth (Reto Stöckli). <https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_8192.tif> | Public domain (NASA); credit requested |
| `site-2.webp`, `site-3.webp`, `site-4.webp` | The Lower Rhine from 600 km down to 37.5 km across | *Sentinel-2 cloudless* 2016, <https://s2maps.eu>, by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), through its WMS at `tiles.maps.eox.at` | CC BY 4.0: **the credit is required**, and is shown on screen wherever these pictures are |
| `site-5.webp` … `site-8.webp` | The landing site from 9.4 km down to 146 m across | Digital orthophotos (DOP) of North Rhine-Westphalia, 10 cm. Geobasis NRW, through its WMS at `www.wms.nrw.de/geobasis/wms_nw_dop` | Datenlizenz Deutschland Zero 2.0: no conditions; credited on screen all the same |

What was done to them: cut to a square around the landing site and resampled to 2048 pixels
(`site-*`), reduced (`earth-*`), matched in colour as described above, and stored as WebP. The
credits above are from memory of the publishers' pages and need checking against them before
publication, like the facts.

Fonts: Space Grotesk (SIL Open Font License), loaded from Google Fonts.
