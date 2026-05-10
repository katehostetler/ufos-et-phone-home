import * as THREE from "three";

/**
 * three-globe renders the globe at radius 100; an "altitude" of N places a
 * point N*100 world units above the surface. We mirror that here so the
 * pushpin group, built in local space, lines up with globe.gl's coordinates.
 */
const GLOBE_RADIUS = 100;

/** Tunable geometry for the flat map-style markers. (Small + low — the bead is
 *  just a marker; the clickable hit-volume is a separate, much larger
 *  transparent sphere set by `pointRadius` in GlobeApp. `customThreeObject`
 *  scales the whole pin up for locations with many records.) */
export const PUSHPIN = {
  needleRadius: 0.05, // tiny chrome stub (world units)
  beadRadius: 0.72,
  beadRadiusRegional: 0.92,
  beadFlatten: 0.45, // bead y-scale — a low dome / button, not a ball
  altitude: 0.013, // marker sits this high above the surface (fraction of globe radius)
  altitudeRegional: 0.016,
  needleColor: 0xb8c0c8,
  touchScale: 1.3, // pins pumped up a little on touch devices
} as const;

export interface PushpinOpts {
  color: string;
  regional?: boolean;
  touch?: boolean;
}

/** The marker altitude (fraction of globe radius) for a record, incl. touch pump. */
export function pushpinAltitude(opts: { regional?: boolean; touch?: boolean }): number {
  const k = opts.touch ? PUSHPIN.touchScale : 1;
  return (opts.regional ? PUSHPIN.altitudeRegional : PUSHPIN.altitude) * k;
}

/**
 * A flat map-style marker as a THREE.Group: a tiny chrome stub along the
 * group's local +Y axis (y=0 at the globe surface) topped by a flattened,
 * glossy, media-type-coloured "button". The caller positions the group at the
 * surface point and rotates it so local +Y points radially outward — so the
 * flattened button lies (roughly) parallel to the surface, like a dot on a map.
 */
export function makePushpin(opts: PushpinOpts): THREE.Group {
  const g = new THREE.Group();
  const k = opts.touch ? PUSHPIN.touchScale : 1;
  const len = pushpinAltitude(opts) * GLOBE_RADIUS;
  const beadR = (opts.regional ? PUSHPIN.beadRadiusRegional : PUSHPIN.beadRadius) * k;
  const needleR = PUSHPIN.needleRadius * (opts.touch ? 1.3 : 1);

  if (len > 0.01) {
    const needle = new THREE.Mesh(
      new THREE.CylinderGeometry(needleR, needleR, len, 8, 1, false),
      new THREE.MeshPhongMaterial({
        color: PUSHPIN.needleColor,
        shininess: 100,
        specular: new THREE.Color(0xffffff),
      }),
    );
    needle.position.y = len / 2; // CylinderGeometry is centred on its origin; span 0..len
    g.add(needle);
  }

  const color = new THREE.Color(opts.color);
  const defaultEmissive = color.clone().multiplyScalar(0.16); // keep markers legible on the night side
  const bead = new THREE.Mesh(
    new THREE.SphereGeometry(beadR, 20, 14),
    new THREE.MeshPhongMaterial({
      color: color.clone(),
      shininess: 70,
      specular: new THREE.Color(0xffffff),
      emissive: defaultEmissive.clone(),
    }),
  );
  bead.scale.set(1, PUSHPIN.beadFlatten, 1); // flatten into a low button
  bead.position.y = len + beadR * PUSHPIN.beadFlatten * 0.5;
  g.add(bead);

  // Stash the bead + its default look so callers (the PinRail "you're being
  // flown here" highlight) can recolour it and put it back.
  g.userData.bead = bead;
  g.userData.defaultColor = color.clone();
  g.userData.defaultEmissive = defaultEmissive.clone();

  return g;
}
