import { describe, it, expect } from "vitest";
import { makePushpinNeedle, PUSHPIN } from "@/lib/pushpin";
import * as THREE from "three";

describe("makePushpinNeedle", () => {
  it("returns a Mesh with a thin straight cylinder geometry", () => {
    const m = makePushpinNeedle({ color: "#ff3b3b" });
    expect(m).toBeInstanceOf(THREE.Mesh);
    const g = m.geometry as THREE.CylinderGeometry;
    expect(g.type).toBe("CylinderGeometry");
    // thin shaft: both radii at/below the configured needle radius, and equal (not tapered)
    expect(g.parameters.radiusTop).toBeLessThanOrEqual(PUSHPIN.needleRadius);
    expect(g.parameters.radiusBottom).toBeLessThanOrEqual(PUSHPIN.needleRadius);
    expect(g.parameters.radiusTop).toBeCloseTo(g.parameters.radiusBottom, 6);
  });

  it("uses a glossy phong material", () => {
    const m = makePushpinNeedle({ color: "#5ad7ff" });
    const mat = m.material as THREE.MeshPhongMaterial;
    expect(mat.type).toBe("MeshPhongMaterial");
    expect(mat.shininess).toBeGreaterThan(50);
  });
});

describe("PUSHPIN constants", () => {
  it("gives regional locations a larger head and higher altitude", () => {
    expect(PUSHPIN.headRadiusRegional).toBeGreaterThan(PUSHPIN.headRadius);
    expect(PUSHPIN.headAltitudeRegional).toBeGreaterThan(PUSHPIN.headAltitude);
  });
});
