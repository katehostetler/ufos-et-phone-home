import { describe, it, expect } from "vitest";
import { makePushpin, pushpinAltitude, PUSHPIN } from "@/lib/pushpin";
import * as THREE from "three";

describe("makePushpin", () => {
  it("returns a Group containing a needle (cylinder) and a bead (sphere)", () => {
    const g = makePushpin({ color: "#ff3b3b" });
    expect(g).toBeInstanceOf(THREE.Group);
    expect(g.children).toHaveLength(2);
    const [needle, bead] = g.children as [THREE.Mesh, THREE.Mesh];
    expect((needle.geometry as any).type).toBe("CylinderGeometry");
    expect((bead.geometry as any).type).toBe("SphereGeometry");
  });

  it("uses a thin straight chrome needle (radii equal, at/below configured radius)", () => {
    const g = makePushpin({ color: "#5ad7ff" });
    const needleGeo = (g.children[0] as THREE.Mesh).geometry as THREE.CylinderGeometry;
    expect(needleGeo.parameters.radiusTop).toBeLessThanOrEqual(PUSHPIN.needleRadius * 1.5);
    expect(needleGeo.parameters.radiusTop).toBeCloseTo(needleGeo.parameters.radiusBottom, 6);
  });

  it("places the bead above the needle (positive y, higher than needle midpoint)", () => {
    const g = makePushpin({ color: "#ffc870" });
    const needle = g.children[0] as THREE.Mesh;
    const bead = g.children[1] as THREE.Mesh;
    expect(bead.position.y).toBeGreaterThan(needle.position.y);
  });

  it("uses glossy phong materials on both parts", () => {
    const g = makePushpin({ color: "#ff3b3b" });
    for (const m of g.children as THREE.Mesh[]) {
      const mat = m.material as THREE.MeshPhongMaterial;
      expect(mat.type).toBe("MeshPhongMaterial");
      expect(mat.shininess).toBeGreaterThan(50);
    }
  });

  it("regional records get a larger bead and longer needle", () => {
    const normal = makePushpin({ color: "#ff3b3b", regional: false });
    const regional = makePushpin({ color: "#ff3b3b", regional: true });
    const beadNormal = (normal.children[1] as THREE.Mesh).geometry as THREE.SphereGeometry;
    const beadRegional = (regional.children[1] as THREE.Mesh).geometry as THREE.SphereGeometry;
    expect(beadRegional.parameters.radius).toBeGreaterThan(beadNormal.parameters.radius);

    const lenNormal = ((normal.children[0] as THREE.Mesh).geometry as THREE.CylinderGeometry).parameters.height;
    const lenRegional = ((regional.children[0] as THREE.Mesh).geometry as THREE.CylinderGeometry).parameters.height;
    expect(lenRegional).toBeGreaterThan(lenNormal);
  });

  it("touch mode pumps everything up", () => {
    const desktop = makePushpin({ color: "#ff3b3b" });
    const touch = makePushpin({ color: "#ff3b3b", touch: true });
    const dBead = ((desktop.children[1] as THREE.Mesh).geometry as THREE.SphereGeometry).parameters.radius;
    const tBead = ((touch.children[1] as THREE.Mesh).geometry as THREE.SphereGeometry).parameters.radius;
    expect(tBead).toBeGreaterThan(dBead);
  });

  // GlobeApp's "this is the pin you selected" highlight reaches into userData to
  // recolour the bead/halo white and put them back on close — guard that handle.
  it("exposes the bead, halo and their default look on userData (the highlight contract)", () => {
    const g = makePushpin({ color: "#5ad7ff" });
    expect(g.userData.bead).toBeInstanceOf(THREE.Mesh);
    expect(g.userData.halo).toBeInstanceOf(THREE.Mesh);
    expect(g.userData.defaultColor).toBeInstanceOf(THREE.Color);
    expect(g.userData.defaultEmissive).toBeInstanceOf(THREE.Color);
    expect(g.userData.defaultHaloColor).toBeInstanceOf(THREE.Color);
    // the stashed defaults match the materials the pin actually ships with
    const beadMat = (g.userData.bead as THREE.Mesh).material as THREE.MeshPhongMaterial;
    expect(beadMat.color.getHex()).toBe(g.userData.defaultColor.getHex());
    expect(beadMat.emissive.getHex()).toBe(g.userData.defaultEmissive.getHex());
    const haloMat = (g.userData.halo as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(haloMat.color.getHex()).toBe(g.userData.defaultHaloColor.getHex());
  });
});

describe("pushpinAltitude", () => {
  it("returns regional > normal", () => {
    expect(pushpinAltitude({ regional: true })).toBeGreaterThan(pushpinAltitude({ regional: false }));
  });
  it("touch mode returns higher altitude than desktop", () => {
    expect(pushpinAltitude({ touch: true })).toBeGreaterThan(pushpinAltitude({}));
  });
});
