import { describe, it, expect } from "vitest";
import { proxiedPdfUrl } from "@/lib/pdfProxy";

describe("proxiedPdfUrl", () => {
  it("maps a valid war.gov medialink PDF to the same-origin proxy", () => {
    const src = "https://www.war.gov/medialink/12345/file/sighting-report.pdf";
    expect(proxiedPdfUrl(src)).toBe(`/api/pdf?url=${encodeURIComponent(src)}`);
  });

  it("preserves a query string on the war.gov PDF url", () => {
    const src = "https://www.war.gov/medialink/9/file/a.pdf?ver=2";
    expect(proxiedPdfUrl(src)).toBe(`/api/pdf?url=${encodeURIComponent(src)}`);
  });

  it("returns null for a non-war.gov url", () => {
    expect(proxiedPdfUrl("https://example.com/medialink/1/file/a.pdf")).toBeNull();
  });

  it("returns null for an http (non-https) war.gov url", () => {
    expect(proxiedPdfUrl("http://www.war.gov/medialink/1/file/a.pdf")).toBeNull();
  });

  it("returns null for a war.gov url that isn't under /medialink/", () => {
    expect(proxiedPdfUrl("https://www.war.gov/files/a.pdf")).toBeNull();
  });

  it("returns null for a war.gov medialink url that isn't a .pdf", () => {
    expect(proxiedPdfUrl("https://www.war.gov/medialink/1/file/a.jpg")).toBeNull();
  });

  it("returns null for null / undefined / empty / non-url", () => {
    expect(proxiedPdfUrl(null)).toBeNull();
    expect(proxiedPdfUrl(undefined)).toBeNull();
    expect(proxiedPdfUrl("")).toBeNull();
    expect(proxiedPdfUrl("N/A")).toBeNull();
    expect(proxiedPdfUrl("not a url")).toBeNull();
  });
});
