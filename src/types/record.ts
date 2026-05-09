export type MediaType = "vid" | "img" | "pdf";

export interface RecordLocation {
  name: string;
  lat: number;
  lng: number;
  regional: boolean;
  space: boolean;
}

export interface Record {
  id: string;
  title: string;
  mediaType: MediaType;
  agency: string;
  date: string | null;
  year: number | null;
  isoDate: string | null;
  location: RecordLocation | null;
  hasLocation: boolean;
  blurb: string;
  assetUrl: string | null;
  thumbnailUrl: string | null;
  dvidsVideoId: string | null;
  videoTitle: string | null;
  videoMp4Url: string | null;
  redaction: string | null;
  sourcePage: string;
}
