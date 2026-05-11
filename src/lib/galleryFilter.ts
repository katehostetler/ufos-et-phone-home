// Pure logic for the gallery "filter by file type" chip row (see
// src/components/GalleryFilter.astro). Kept here so it's unit-testable.

import type { MediaType } from "@/types/record";

export type FilterKey = "all" | MediaType;
export type FilterMode = "inline" | "nav";

export interface TypeCounts {
  vid: number;
  img: number;
  pdf: number;
}

export interface FilterChip {
  key: FilterKey;
  label: string;
  count: number;
  /** the page this chip links to (only used in mode="nav") */
  href: string;
  /** whether this chip is the active one as rendered server-side */
  active: boolean;
}

const LABEL: Record<FilterKey, string> = { all: "ALL", vid: "VIDEO", img: "PHOTO", pdf: "DOCUMENT" };
const HREF: Record<FilterKey, string> = { all: "/gallery", vid: "/videos", img: "/photos", pdf: "/files" };
const TYPE_KEYS: MediaType[] = ["vid", "img", "pdf"];

/**
 * Build the ordered list of chips for the filter row.
 * - mode "inline": chips for ALL + every type that has ≥1 record on this page
 *   (so a page with no videos doesn't show a dead "VIDEO · 0" chip). "ALL" is
 *   always the server-rendered active chip (the client script changes it).
 * - mode "nav": chips for ALL + all three types, always. `activeType` marks
 *   which one is the current page.
 */
export function galleryFilterChips(
  mode: FilterMode,
  counts: TypeCounts,
  activeType: FilterKey = "all",
): FilterChip[] {
  const total = counts.vid + counts.img + counts.pdf;
  const keys: FilterKey[] = ["all", ...TYPE_KEYS.filter((t) => mode === "nav" || counts[t] > 0)];
  const activeKey: FilterKey = mode === "nav" ? activeType : "all";
  return keys.map((key) => ({
    key,
    label: LABEL[key],
    count: key === "all" ? total : counts[key],
    href: HREF[key],
    active: key === activeKey,
  }));
}

/** URL-hash slug ⇆ media type, for the in-place filter's shareable/back-nav state. */
export const HASH_FOR_TYPE: Record<MediaType, string> = { vid: "video", img: "photo", pdf: "document" };
export const TYPE_FOR_HASH: Record<string, MediaType> = { video: "vid", photo: "img", document: "pdf" };
