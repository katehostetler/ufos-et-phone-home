import * as THREE from "three";

/**
 * Tunable geometry for the map-style pushpin markers on the globe.
 * Units are react-globe.gl globe units (the globe radius is ~100).
 * `headAltitude` is the altitude (fraction of globe radius) the bead floats at;
 * the needle spans from the surface up to that altitude.
 */
export const PUSHPIN = {
  needleRadius: 0.06,
  needleLengthUnit: 1, // geometry height; scaled to the actual altitude at update time
  headRadius: 1.15,
  headRadiusRegional: 1.4,
  headAltitude: 0.07,
  headAltitudeRegional: 0.09,
  needleColor: 0x9aa3ad, // chrome shaft
} as const;

/**
 * The pushpin shaft: a thin, straight, glossy metallic needle.
 * The caller (GlobeApp's customThreeObjectUpdate) positions, orients, and
 * Y-scales it so the tip touches the globe surface and the top meets the bead.
 * The `color` option is accepted for a possible future colored-collar variant;
 * the shaft itself is intentionally neutral chrome so it reads as a real pin.
 */
export function makePushpinNeedle(_opts: { color: string }): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(
    PUSHPIN.needleRadius,
    PUSHPIN.needleRadius,
    PUSHPIN.needleLengthUnit,
    10,
    1,
    false,
  );
  const mat = new THREE.MeshPhongMaterial({
    color: PUSHPIN.needleColor,
    shininess: 90,
    specular: new THREE.Color(0xffffff),
  });
  return new THREE.Mesh(geo, mat);
}

/** A glossy bead head — used as the clickable point object on the globe. */
export function makePushpinHead(opts: { color: string; radius: number }): THREE.Mesh {
  const color = new THREE.Color(opts.color);
  const geo = new THREE.SphereGeometry(opts.radius, 22, 22);
  const mat = new THREE.MeshPhongMaterial({
    color,
    shininess: 80,
    specular: new THREE.Color(0xffffff),
    emissive: color.clone().multiplyScalar(0.12),
  });
  return new THREE.Mesh(geo, mat);
}
