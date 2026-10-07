# Slices of Now

An interactive explainer of time as a 3D cross-section of a 4D world, told through Edwin Abbott's *Flatland*. Everything lives in one file, `index.html`.

- **Plate I · A Sphere visits Flatland.** 3D shapes (ball, cube, cone, cylinder, torus, pyramid) run on real rigid-body physics (cannon-es). A translucent sheet is Flatland. The side panel shows each shape's exact cross-section, and a 1D strip shows what A Square sees through Flatland's fog. Shapes can be grabbed, thrown, dropped, lowered slowly or scanned.
- **Plate II · Flatland's history is a loaf.** A 2D elastic-collision simulation is stacked up the time axis into a 3D block of worldtubes. A "now" sheet slices it, with the past drawn solid and the future as glass. Click to add a ball at the current moment, add a pull toward the South, or tilt the slice to show the relativity of simultaneity.
- **Plate III · A hypersphere visits us.** 4D objects (hypersphere, tesseract, 16-cell, 5-cell, 24-cell and a thrown ball's worldtube) are sliced by our 3D space along w. Each slice is computed as the convex hull of edge/hyperplane intersections and named from its faces. Rotate in the XW, YW and ZW planes, use the preset poses, or show the 4D shadow.

## Running it

It is a static page. Three.js and cannon-es load from cdn.jsdelivr.net, so serve the folder with any static server:

```bash
npx http-server slices-of-now
```
