import type { Record } from "@/types/record";

export interface FeaturedEntry { id: string; hook: string; }
export type FeaturedRecord = Record & { hook: string };

export function resolveFeatured(entries: FeaturedEntry[], records: Record[]): FeaturedRecord[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  const out: FeaturedRecord[] = [];
  for (const e of entries) {
    const r = byId.get(e.id);
    if (r) out.push({ ...r, hook: e.hook });
  }
  return out;
}
