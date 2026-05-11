import * as THREE from "three";

/**
 * three-globe renders the globe at radius 100; an "altitude" of N places a
 * point N*100 world units above the surface. We mirror that here so the
 * pushpin group, built in local space, lines up with globe.gl's coordinates.
 */
const GLOBE_RADIUS = 100;

/** Tunable geometry for the map markers. A flattened "button" with a bright
 *  contrasting ring around it (so it reads clearly against the city lights and
 *  the dark ocean alike), on a short stub. The clickable hit-volume is a
 *  separate, much larger transparent sphere set by `pointRadius` in GlobeApp. */
export const PUSHPIN = {
  needleRadius: 0.06,
  beadRadius: 1.1,
  beadRadiusRegional: 1.35,
  beadFlatten: 0.5, // bead y-scale — a low button, not a ball
  haloRadiusMul: 1.55, // ring radius, as a multiple of the bead radius
  haloTubeMul: 0.11,
  altitude: 0.022, // marker sits this high above the surface (fraction of globe radius)
  altitudeRegional: 0.026,
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
 * A map marker as a THREE.Group: a tiny chrome stub along the group's local +Y
 * axis (y=0 at the globe surface), topped by a flattened glossy, media-type-
 * coloured "button", ringed by a bright halo torus. The caller positions the
 * group at the surface point and rotates it so local +Y points radially outward
 * — so the button + ring lie (roughly) parallel to the surface, like a target
 * marker on a map.
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
  const defaultEmissive = color.clone().multiplyScalar(0.45); // glow so it's legible against the lights / night side
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
  bead.position.y = len + beadR * PUSHPIN.beadFlatten * 0.6;

  // bright contrasting ring around the button — a light tint of the bead colour,
  // lying flat against the surface. Child of the bead so it tracks its flatten.
  const haloColor = color.clone().lerp(new THREE.Color(0xffffff), 0.55);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(beadR * PUSHPIN.haloRadiusMul, beadR * PUSHPIN.haloTubeMul, 6, 22),
    new THREE.MeshBasicMaterial({ color: haloColor, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  halo.rotation.x = Math.PI / 2; // hole-axis along the bead's local +Y (radial) → ring lies flat
  bead.add(halo);
  g.add(bead);

  // Stash the bead + its default look so callers (the PinRail "you're being
  // flown here" highlight) can recolour it and put it back.
  g.userData.bead = bead;
  g.userData.halo = halo;
  g.userData.defaultColor = color.clone();
  g.userData.defaultEmissive = defaultEmissive.clone();
  g.userData.defaultHaloColor = haloColor.clone();

  return g;
}
