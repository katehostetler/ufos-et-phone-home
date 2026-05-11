# Learnings

Running log of bugs, mistakes, and gotchas — and the reusable rule to take away from each.

---

## 2026-05-10 — react-globe.gl: a visible `customLayerData` marker silently eats clicks meant for its `pointsData` hit-target

**What went wrong:** Pin clicks "sometimes" did nothing. The globe uses a transparent `pointsData` cylinder as each pin's clickable hit-volume (`onPointClick`), with the *visible* pin drawn separately as a `customLayerData` `THREE.Group` (needle + bead). Two bugs:
1. The custom-layer mesh is raycastable by default, and the bead sits **closer to the camera** than the top of the hit-cylinder — so the raycaster's nearest hit was the bead. globe.gl classified that as a "custom layer" hit (which we don't handle) and never fired `onPointClick`.
2. The hit-cylinder was only as tall as the needle, so the bead poked out its top. Near the globe's limb, a ray aimed dead-centre at the bead passes *over* the cylinder entirely → no hit.

**Fix:** (a) disable raycasting on the visible marker — `group.traverse(o => { o.raycast = () => {}; })` in `customThreeObject`; (b) size the `pointAltitude` hit-cylinder tall enough to fully enclose the visible marker, with headroom (`pushpinHitAltitude()` in `src/lib/pushpin.ts`).

**Rule to always follow:** When a globe.gl (or any three.js) layer uses an *invisible* proxy for hit-testing and a *separate* visible mesh for looks, the visible mesh MUST be made non-raycastable (`obj.raycast = () => {}`), AND the invisible proxy must fully contain the visible mesh's bounds. Otherwise the visible mesh — being nearer the camera — wins the raycast and the proxy never gets hit.
