import { describe, it, expect } from "vitest";
import { galleryFilterChips, HASH_FOR_TYPE, TYPE_FOR_HASH } from "@/lib/galleryFilter";

describe("galleryFilterChips", () => {
  it("inline mode: ALL + only the types present, ALL active, counts add up", () => {
    // /no-location-style: 8 photos + 39 documents, no videos
    const chips = galleryFilterChips("inline", { vid: 0, img: 8, pdf: 39 });
    expect(chips.map((c) => c.key)).toEqual(["all", "img", "pdf"]); // no "vid" chip
    expect(chips.find((c) => c.key === "all")).toMatchObject({ count: 47, active: true });
    expect(chips.find((c) => c.key === "img")).toMatchObject({ count: 8, active: false });
    expect(chips.find((c) => c.key === "pdf")).toMatchObject({ count: 39, active: false });
  });

  it("inline mode keeps all three type chips when all three are present", () => {
    const chips = galleryFilterChips("inline", { vid: 28, img: 39, pdf: 94 });
    expect(chips.map((c) => c.key)).toEqual(["all", "vid", "img", "pdf"]);
    expect(chips[0]).toMatchObject({ key: "all", count: 161, active: true });
  });

  it("nav mode: always shows all four chips, marks the active page, links to type pages", () => {
    const chips = galleryFilterChips("nav", { vid: 0, img: 0, pdf: 94 }, "img");
    expect(chips.map((c) => c.key)).toEqual(["all", "vid", "img", "pdf"]); // never drops chips
    expect(chips.find((c) => c.key === "img")).toMatchObject({ active: true, href: "/photos" });
    expect(chips.find((c) => c.key === "all")).toMatchObject({ active: false, href: "/gallery" });
    expect(chips.find((c) => c.key === "vid")!.href).toBe("/videos");
    expect(chips.find((c) => c.key === "pdf")!.href).toBe("/files");
  });

  it("nav mode without an activeType marks ALL active (the /gallery case)", () => {
    const chips = galleryFilterChips("nav", { vid: 28, img: 39, pdf: 94 });
    expect(chips.find((c) => c.key === "all")!.active).toBe(true);
    expect(chips.filter((c) => c.active)).toHaveLength(1);
  });

  it("hash ⇆ type maps are inverse of each other", () => {
    for (const t of ["vid", "img", "pdf"] as const) {
      expect(TYPE_FOR_HASH[HASH_FOR_TYPE[t]]).toBe(t);
    }
  });
});
