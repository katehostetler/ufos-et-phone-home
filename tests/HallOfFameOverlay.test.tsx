import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import HallOfFameOverlay from "@/components/HallOfFameOverlay";

const featured = [
  {
    id: "a",
    title: "Alpha File",
    year: 2023,
    mediaType: "pdf",
    thumbnailUrl: "/x.jpg",
    blurb: "Alpha blurb text here.",
    hook: "wild thing one",
    agency: "CIA",
    date: "2023-01-01",
    isoDate: "2023-01-01",
    location: null,
    hasLocation: false,
    assetUrl: null,
    dvidsVideoId: null,
    videoTitle: null,
    videoMp4Url: null,
    redaction: null,
    sourcePage: "https://www.war.gov/UFO/",
  } as any,
  {
    id: "b",
    title: "Bravo File",
    year: 1965,
    mediaType: "vid",
    thumbnailUrl: "/y.jpg",
    blurb: "Bravo blurb text here.",
    hook: "wild thing two",
    agency: "NASA",
    date: "1965-12-05",
    isoDate: "1965-12-05",
    location: { name: "Houston", lat: 29.76, lng: -95.36, regional: false, space: false },
    hasLocation: true,
    assetUrl: null,
    dvidsVideoId: null,
    videoTitle: null,
    videoMp4Url: null,
    redaction: null,
    sourcePage: "https://www.war.gov/UFO/",
  } as any,
];

describe("HallOfFameOverlay", () => {
  it("renders nothing initially (closed by default)", () => {
    const { container } = render(<HallOfFameOverlay featured={featured} />);
    expect(screen.queryByText(/HALL OF FAME/i)).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("opens on open-hall-of-fame window event and lists titles + hooks", () => {
    render(<HallOfFameOverlay featured={featured} />);
    fireEvent(window, new Event("open-hall-of-fame"));
    expect(screen.getByText(/HALL OF FAME/i)).toBeInTheDocument();
    expect(screen.getByText("Alpha File")).toBeInTheDocument();
    expect(screen.getByText("Bravo File")).toBeInTheDocument();
    expect(screen.getByText("wild thing one")).toBeInTheDocument();
    expect(screen.getByText("wild thing two")).toBeInTheDocument();
  });

  it("pressing Escape closes the overlay", () => {
    render(<HallOfFameOverlay featured={featured} />);
    fireEvent(window, new Event("open-hall-of-fame"));
    expect(screen.getByText(/HALL OF FAME/i)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText(/HALL OF FAME/i)).toBeNull();
  });

  it("clicking the backdrop closes the overlay", () => {
    render(<HallOfFameOverlay featured={featured} />);
    fireEvent(window, new Event("open-hall-of-fame"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(screen.queryByText(/HALL OF FAME/i)).toBeNull();
  });

  it("clicking the ✕ button closes the overlay", () => {
    render(<HallOfFameOverlay featured={featured} />);
    fireEvent(window, new Event("open-hall-of-fame"));
    const closeBtn = screen.getByLabelText(/close/i);
    fireEvent.click(closeBtn);
    expect(screen.queryByText(/HALL OF FAME/i)).toBeNull();
  });

  it("card click dispatches open-record CustomEvent with the record id then closes overlay", () => {
    render(<HallOfFameOverlay featured={featured} />);
    fireEvent(window, new Event("open-hall-of-fame"));
    const spy = vi.fn();
    window.addEventListener("open-record", spy as any);
    fireEvent.click(screen.getByText("Alpha File"));
    expect(spy).toHaveBeenCalledOnce();
    const evt = spy.mock.calls[0][0] as CustomEvent;
    expect(evt.detail).toBe("a");
    expect(screen.queryByText(/HALL OF FAME/i)).toBeNull();
    window.removeEventListener("open-record", spy as any);
  });

  it("without is-staggered when prefers-reduced-motion is reduce", () => {
    // Override matchMedia to return matches:true for reduced-motion
    const origMatchMedia = window.matchMedia;
    window.matchMedia = (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;

    render(<HallOfFameOverlay featured={featured} />);
    fireEvent(window, new Event("open-hall-of-fame"));
    // The overlay is portalled to <body>, so query the document, not the render container.
    const rail = document.querySelector(".hof-rail");
    expect(rail).not.toBeNull();
    expect(rail?.classList.contains("is-staggered")).toBe(false);

    window.matchMedia = origMatchMedia;
  });

  it("includes is-staggered when motion is allowed", () => {
    // matchMedia returns matches:false (default setup)
    render(<HallOfFameOverlay featured={featured} />);
    fireEvent(window, new Event("open-hall-of-fame"));
    const rail = document.querySelector(".hof-rail");
    expect(rail).not.toBeNull();
    expect(rail?.classList.contains("is-staggered")).toBe(true);
  });
});
