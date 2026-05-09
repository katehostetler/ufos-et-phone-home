import * as THREE from "three";

/**
 * three-globe renders the globe at radius 100; an "altitude" of N places a
 * point N*100 world units above the surface. We mirror that here so the
 * pushpin group, built in local space, lines up with globe.gl's coordinates.
 */
const GLOBE_RADIUS = 100;

/** Tunable geometry for the map-style pushpin markers. */
export const PUSHPIN = {
  needleRadius: 0.14, // chrome shaft radius (world units)
  beadRadius: 1.25,
  beadRadiusRegional: 1.6,
  altitude: 0.06, // bead floats this high (fraction of globe radius)
  altitudeRegional: 0.075,
  needleColor: 0xb8c0c8,
  touchScale: 1.5, // pins get pumped up on touch devices for fat tap targets
} as const;

export interface PushpinOpts {
  color: string;
  regional?: boolean;
  touch?: boolean;
}

/** The bead altitude (fraction of globe radius) for a given record, incl. touch pump. */
export function pushpinAltitude(opts: { regional?: boolean; touch?: boolean }): number {
  const k = opts.touch ? PUSHPIN.touchScale : 1;
  return (opts.regional ? PUSHPIN.altitudeRegional : PUSHPIN.altitude) * k;
}

/**
 * A map-style pushpin as a THREE.Group: a thin glossy chrome needle along the
 * group's local +Y axis (y=0 at the globe surface, rising to the bead) topped
 * by a glossy, media-type-colored bead sphere. The caller positions the group
 * at the surface point and rotates it so local +Y points radially outward.
 */
export function makePushpin(opts: PushpinOpts): THREE.Group {
  const g = new THREE.Group();
  const k = opts.touch ? PUSHPIN.touchScale : 1;
  const len = pushpinAltitude(opts) * GLOBE_RADIUS;
  const beadR = (opts.regional ? PUSHPIN.beadRadiusRegional : PUSHPIN.beadRadius) * k;
  const needleR = PUSHPIN.needleRadius * (opts.touch ? 1.3 : 1);

  const needle = new THREE.Mesh(
    new THREE.CylinderGeometry(needleR, needleR, len, 10, 1, false),
    new THREE.MeshPhongMaterial({
      color: PUSHPIN.needleColor,
      shininess: 100,
      specular: new THREE.Color(0xffffff),
    }),
  );
  needle.position.y = len / 2; // CylinderGeometry is centered on its origin; shift to span 0..len
  g.add(needle);

  const color = new THREE.Color(opts.color);
  const bead = new THREE.Mesh(
    new THREE.SphereGeometry(beadR, 22, 22),
    new THREE.MeshPhongMaterial({
      color,
      shininess: 80,
      specular: new THREE.Color(0xffffff),
      emissive: color.clone().multiplyScalar(0.14), // keep pins legible on the night side
    }),
  );
  bead.position.y = len + beadR * 0.1; // perch the bead just above the needle's tip
  g.add(bead);

  return g;
}
