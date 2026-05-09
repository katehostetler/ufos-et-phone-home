import { describe, it, expect } from "vitest";
import featured from "@/data/featured.json";
import records from "@/data/records.json";
import { resolveFeatured } from "@/lib/featured";

describe("featured.json", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(featured)).toBe(true);
    expect(featured.length).toBeGreaterThan(0);
  });
  it("every id resolves to a record and every hook is non-empty", () => {
    for (const f of featured as { id: string; hook: string }[]) {
      expect(records.find((r: any) => r.id === f.id), `missing record: ${f.id}`).toBeTruthy();
      expect(typeof f.hook === "string" && f.hook.trim().length > 0, `empty hook: ${f.id}`).toBe(true);
    }
  });
});

describe("resolveFeatured", () => {
  it("preserves order and attaches the hook", () => {
    const out = resolveFeatured(featured as any, records as any);
    expect(out).toHaveLength((featured as any[]).length);
    expect(out[0].id).toBe((featured as any[])[0].id);
    expect(out[0].hook).toBe((featured as any[])[0].hook);
  });
  it("drops entries whose record is missing", () => {
    const out = resolveFeatured([{ id: "does-not-exist", hook: "x" }] as any, records as any);
    expect(out).toHaveLength(0);
  });
});
