import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import type { GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
import RecordModal from "./RecordModal";
import QueuePanel from "./QueuePanel";
import PinRail from "./PinRail";
import LunarMoon from "./LunarMoon";
import { makePushpin, pushpinAltitude, PUSHPIN } from "@/lib/pushpin";
import { applyCityLightShimmer } from "@/lib/globeShimmer";
import FloatingUfos from "./FloatingUfos";
import type { Record, MediaType } from "@/types/record";

const COLORS: Record<MediaType, string> = {
  vid: "#ff3b3b",
  img: "#5ad7ff",
  pdf: "#ffc870",
};

type QueueType = MediaType | "noloc";

interface Props {
  records: Record[];
}

export default function GlobeApp({ records }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [isTouch, setIsTouch] = useState(false);
  const [modalRecords, setModalRecords] = useState<Record[] | null>(null);
  const [queueType, setQueueType] = useState<QueueType | null>(null);
  // which media type's pin-rail (slim left list) is open, if any
  const [pinRailType, setPinRailType] = useState<MediaType | null>(null);
  const [touchPreview, setTouchPreview] = useState<{
    rec: Record;
    x: number;
    y: number;
  } | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Saved camera position so we can restore the user's view after they close
  // a modal opened by clicking a pin.
  const savedPovRef = useRef<{ lat: number; lng: number; altitude: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setIsTouch(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // listen for the dock chips' "open-queue" event from index.astro
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<QueueType>).detail;
      if (detail) setQueueType(detail);
    }
    window.addEventListener("open-queue", onOpen);
    return () => window.removeEventListener("open-queue", onOpen);
  }, []);

  // listen for "open-record" CustomEvents dispatched by HallOfFameOverlay card
  // clicks. detail = record id. Look up the record, fly the globe to its pin
  // (if it has a location), and open the existing RecordModal. Mirrors the
  // pin-click flow so closing the modal restores the prior camera POV.
  useEffect(() => {
    function onOpenRecord(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      if (!id) return;
      const rec = records.find((r) => r.id === id);
      if (!rec) return;
      if (rec.hasLocation && rec.location && globeRef.current) {
        savedPovRef.current = (globeRef.current as any).pointOfView() ?? null;
        globeRef.current.pointOfView(
          { lat: rec.location.lat, lng: rec.location.lng, altitude: 1.7 },
          1000,
        );
      }
      setModalRecords([rec]);
    }
    window.addEventListener("open-record", onOpenRecord);
    return () => window.removeEventListener("open-record", onOpenRecord);
  }, [records]);

  // when the queue's active record changes, fly the globe to its pin (if any)
  const onQueueActiveChange = useCallback((rec: Record) => {
    if (!rec.location || !globeRef.current) return;
    if (rec.location.name === "Moon") {
      // lunar record — pull the camera back so the orbiting Moon is in frame
      globeRef.current.pointOfView({ altitude: 3.2 }, 900);
      return;
    }
    globeRef.current.pointOfView(
      { lat: rec.location.lat, lng: rec.location.lng, altitude: 1.7 },
      900,
    );
  }, []);

  // resize globe to container
  useEffect(() => {
    if (!containerRef.current) return;
    const fit = () => {
      const r = containerRef.current!.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(containerRef.current);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  // start orbit + initial pose + add 3D star background
  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls() as any;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onStart = () => {
      controls.autoRotate = false;
      if (timer) clearTimeout(timer);
    };
    const onEnd = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => (controls.autoRotate = true), 4000);
    };
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    globeRef.current.pointOfView({ lat: 28, lng: 50, altitude: 2.4 }, 0);

    // 3D starfield: two layers of points at different distances for depth.
    // Stars are placed on a sphere far enough out that they always sit
    // behind the globe, regardless of zoom.
    const scene = globeRef.current.scene();
    const stars: THREE.Points[] = [];

    const makeStarLayer = (count: number, radius: number, size: number, opacity: number) => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        // uniformly distributed points on a sphere (Marsaglia method)
        let x: number, y: number, z: number, len: number;
        do {
          x = Math.random() * 2 - 1;
          y = Math.random() * 2 - 1;
          z = Math.random() * 2 - 1;
          len = x * x + y * y + z * z;
        } while (len > 1 || len === 0);
        const norm = radius / Math.sqrt(len);
        positions[i * 3] = x * norm;
        positions[i * 3 + 1] = y * norm;
        positions[i * 3 + 2] = z * norm;
        // subtle color variation: most white, a few warm/cool
        const tint = Math.random();
        if (tint > 0.95) {
          // warm star (red-ish)
          colors[i * 3] = 1.0;
          colors[i * 3 + 1] = 0.78;
          colors[i * 3 + 2] = 0.65;
        } else if (tint > 0.88) {
          // cool blue
          colors[i * 3] = 0.78;
          colors[i * 3 + 1] = 0.85;
          colors[i * 3 + 2] = 1.0;
        } else {
          // white with slight brightness variation
          const b = 0.85 + Math.random() * 0.15;
          colors[i * 3] = b;
          colors[i * 3 + 1] = b;
          colors[i * 3 + 2] = b;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.PointsMaterial({
        size,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      const points = new THREE.Points(geo, mat);
      scene.add(points);
      stars.push(points);
      return { geo, mat };
    };

    // Globe is rendered at radius ~100 in scene units. Stars sit on a sphere
    // outside the camera-far-clip-but-close-enough-to-be-visible distance.
    const layers = [
      makeStarLayer(700, 380, 1.6, 0.95),  // bright near layer
      makeStarLayer(1400, 480, 0.9, 0.65), // faint far layer (depth)
      makeStarLayer(800, 560, 0.55, 0.4),  // distant haze
    ];

    // Crisp up the earth texture: max anisotropic filtering keeps it sharp at
    // glancing angles and when zoomed in, instead of going blurry.
    const globeMat = (globeRef.current as any).globeMaterial?.();
    const renderer = (globeRef.current as any).renderer?.();
    if (globeMat && renderer?.capabilities?.getMaxAnisotropy) {
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      for (const m of [globeMat.map, globeMat.bumpMap, globeMat.specularMap, globeMat.emissiveMap]) {
        if (m) {
          m.anisotropy = maxAniso;
          m.needsUpdate = true;
        }
      }
    }

    // Subtly twinkle the night-earth city lights via a fragment-shader patch.
    // Respect prefers-reduced-motion: skip if the user has it enabled.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stopShimmer: (() => void) | null = null;
    if (!reduceMotion && globeMat) {
      stopShimmer = applyCityLightShimmer(globeMat, { intensity: 0.30, rate: 1.1 });
    }

    return () => {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      if (timer) clearTimeout(timer);
      for (const s of stars) scene.remove(s);
      for (const l of layers) {
        l.geo.dispose();
        l.mat.dispose();
      }
      if (stopShimmer) stopShimmer();
    };
  }, []);

  // lunar records (Apollo 12 / 17) — these get a marker ON the orbiting Moon
  // instead of a misleading pin on the Earth globe.
  const moonRecords = useMemo(
    () =>
      records
        .filter((r) => r.location?.name === "Moon")
        .slice()
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.id.localeCompare(b.id)),
    [records],
  );

  // dataset of Earth pins — every record with a location, EXCEPT the lunar ones
  // (which live on the Moon). No per-type filtering — the BROWSE PINS chips open
  // the PinRail browser instead of toggling visibility.
  const points = useMemo(
    () => records.filter((r) => r.hasLocation && r.location && r.location.name !== "Moon"),
    [records],
  );

  // ring data for videos (pulses)
  const rings = useMemo(
    () => records.filter((r) => r.hasLocation && r.location && r.mediaType === "vid" && r.location.name !== "Moon"),
    [records],
  );

  function openLocationModal(p: Record) {
    if (!p.location) return;
    const same = records.filter(
      (r) =>
        r.hasLocation &&
        r.location?.name === p.location?.name,
    );
    if (same.length === 0) return;
    // Snapshot the user's current view so we can return them here on close.
    if (globeRef.current) {
      savedPovRef.current = (globeRef.current as any).pointOfView() ?? null;
    }
    setModalRecords(same);
  }

  function closeModalPreservingView() {
    setModalRecords(null);
    // Restore the camera position the user was at before they clicked.
    if (globeRef.current && savedPovRef.current) {
      (globeRef.current as any).pointOfView(savedPovRef.current, 700);
      savedPovRef.current = null;
    }
  }

  function onPointClick(point: object, event?: MouseEvent) {
    const p = point as Record;
    if (!p.location) return;

    // Touch devices: first tap previews (like desktop hover), second tap opens.
    if (isTouch) {
      if (touchPreview && touchPreview.rec.id === p.id) {
        // confirmed tap → open
        setTouchPreview(null);
        if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
        openLocationModal(p);
        return;
      }
      // first tap → show preview overlay near tap location
      const x = event?.clientX ?? window.innerWidth / 2;
      const y = event?.clientY ?? window.innerHeight / 2;
      setTouchPreview({ rec: p, x, y });
      // Don't fly the globe on preview tap — Kate said it's confusing to lose
      // your spot on the globe just for a peek. Camera stays put.
      // auto-dismiss after 6 seconds if no second tap
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(() => setTouchPreview(null), 6000);
      return;
    }

    // Desktop: open modal directly
    openLocationModal(p);
  }

  // dismiss touch preview when user taps anywhere outside a pin
  useEffect(() => {
    if (!touchPreview) return;
    function dismiss(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(".touch-preview")) return; // click was on preview itself — let onClick handle
      setTouchPreview(null);
    }
    // delay one tick so the originating tap doesn't immediately dismiss
    const t = setTimeout(() => {
      window.addEventListener("pointerdown", dismiss);
    }, 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", dismiss);
    };
  }, [touchPreview]);

  return (
    <>
      {/* type chips — open the slim PinRail browser for that media type */}
      <div className="filterbar">
        <span className="filterbar-label">⏵ BROWSE PINS</span>
        {(["vid", "img", "pdf"] as MediaType[]).map((t) => {
          const labels = { vid: "VIDEO", img: "PHOTO", pdf: "DOCUMENT" } as const;
          const counts = {
            vid: records.filter((r) => r.mediaType === "vid" && r.hasLocation).length,
            img: records.filter((r) => r.mediaType === "img" && r.hasLocation).length,
            pdf: records.filter((r) => r.mediaType === "pdf" && r.hasLocation).length,
          };
          return (
            <span
              key={t}
              role="button"
              tabIndex={0}
              className={`chip ${t} active ${pinRailType === t ? "open" : ""}`}
              onClick={() => setPinRailType((cur) => (cur === t ? null : t))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPinRailType((cur) => (cur === t ? null : t));
                }
              }}
              title={`Browse ${labels[t].toLowerCase()} pins`}
            >
              <span className="swatch"></span>
              {labels[t]} · {counts[t]}
            </span>
          );
        })}
      </div>

      {/* slim left-docked pin browser */}
      <PinRail
        type={pinRailType}
        allRecords={records}
        onClose={() => setPinRailType(null)}
        onActiveChange={onQueueActiveChange}
        onSelect={(rec) => {
          // snapshot the rail's current view so closing the modal returns here
          if (globeRef.current) {
            savedPovRef.current = (globeRef.current as any).pointOfView() ?? null;
          }
          setModalRecords([rec]);
        }}
      />

      {/* globe stage */}
      <div ref={containerRef} className="globe-stage">
        <Globe
          ref={globeRef}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="https://unpkg.com/three-globe@2.27.2/example/img/earth-night.jpg"
          bumpImageUrl="https://unpkg.com/three-globe@2.27.2/example/img/earth-topology.png"
          showAtmosphere={true}
          atmosphereColor="#5ab4ff"
          atmosphereAltitude={0.28}
          /* The pushpin's clickable hit-target. We keep pointsData (it owns
             native hover/click) but render it transparent — the visible pin is
             the customLayer group below. The hit volume sits roughly where the
             bead is, so clicking the bead always registers. */
          pointsData={points}
          pointLat={(d: any) => d.location.lat}
          pointLng={(d: any) => d.location.lng}
          pointAltitude={(d: any) =>
            pushpinAltitude({ regional: d.location.regional, touch: isTouch })
          }
          pointRadius={(d: any) => {
            // Generous invisible hit-volume — ~2x the bead — so hovering/tapping
            // near a pin registers without pixel-perfect aim. It's transparent,
            // so the bigger target doesn't change anything visually. Kept
            // moderate so dense clusters (e.g. Hormuz ×5) don't mis-target.
            const base =
              (d.location.regional ? PUSHPIN.beadRadiusRegional : PUSHPIN.beadRadius) * 2.0;
            return isTouch ? base * PUSHPIN.touchScale : base;
          }}
          pointResolution={12}
          pointColor={() => "rgba(0,0,0,0)"}
          /* Hover tooltip — desktop only. On touch we show our own
             touch-preview overlay instead, to avoid the doubled-tooltip bug. */
          pointLabel={(d: any) =>
            isTouch
              ? ""
              : `<div class="pin-tooltip">
                  <div class="loc">${escapeHtml(d.location.name)}</div>
                  <div class="ttl">${escapeHtml(truncate(d.title, 60))}</div>
                  <div class="meta">${escapeHtml(d.agency)}${d.year ? " · " + d.year : ""}</div>
                </div>`
          }
          onPointClick={onPointClick}
          /* The visible pushpin — a customLayer group (chrome needle + glossy
             colored bead). Built once with the right dimensions; the update
             function only positions and orients it so local +Y points radially
             outward from the surface. */
          customLayerData={points}
          customThreeObject={(d: any) =>
            makePushpin({
              color: COLORS[d.mediaType as MediaType],
              regional: d.location.regional,
              touch: isTouch,
            })
          }
          customThreeObjectUpdate={(obj: any, d: any) => {
            if (!globeRef.current) return;
            const surf = (globeRef.current as any).getCoords(
              d.location.lat,
              d.location.lng,
              0,
            );
            obj.position.set(surf.x, surf.y, surf.z);
            // After lookAt + rotateX(-90°), local +Y points radially outward —
            // matching the pushpin geometry built from y=0 (surface) upward.
            obj.lookAt(0, 0, 0);
            obj.rotateX(-Math.PI / 2);
          }}
          ringsData={rings}
          ringLat={(d: any) => d.location.lat}
          ringLng={(d: any) => d.location.lng}
          ringColor={() => (t: number) => `rgba(255, 59, 59, ${1 - t})`}
          ringMaxRadius={3.5}
          ringPropagationSpeed={2.4}
          ringRepeatPeriod={1400}
        />
        {/* Floating UFOs easter egg — Three.js meshes injected into the same scene */}
        <FloatingUfos globeRef={globeRef} isTouch={isTouch} />
        {/* Orbiting Moon — hosts the lunar (Apollo) records instead of Earth pins */}
        {moonRecords.length > 0 && (
          <LunarMoon
            globeRef={globeRef}
            records={moonRecords}
            onSelect={(recs) => {
              savedPovRef.current = (globeRef.current as any)?.pointOfView() ?? null;
              setModalRecords(recs);
            }}
          />
        )}
      </div>

      {/* mobile single-tap preview (tap again to open) */}
      {touchPreview && (
        <TouchPreview
          record={touchPreview.rec}
          x={touchPreview.x}
          y={touchPreview.y}
          onConfirm={() => {
            const r = touchPreview.rec;
            setTouchPreview(null);
            if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
            openLocationModal(r);
          }}
          onDismiss={() => {
            setTouchPreview(null);
            if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
          }}
        />
      )}

      {/* modal */}
      {modalRecords && (
        <RecordModal records={modalRecords} onClose={closeModalPreservingView} closeLabel="BACK TO GLOBE" />
      )}

      {/* queue / coverflow browser */}
      {queueType && (
        <QueuePanel
          type={queueType}
          allRecords={records}
          onClose={() => setQueueType(null)}
          onActiveChange={onQueueActiveChange}
        />
      )}
    </>
  );
}

interface TouchPreviewProps {
  record: Record;
  x: number;
  y: number;
  onConfirm: () => void;
  onDismiss: () => void;
}

function TouchPreview({ record: r, x, y, onConfirm, onDismiss }: TouchPreviewProps) {
  // clamp position so the bubble doesn't fall off-screen
  const margin = 12;
  const bubbleW = 240;
  const bubbleH = 120;
  const cx = Math.min(Math.max(x, bubbleW / 2 + margin), window.innerWidth - bubbleW / 2 - margin);
  const cy = Math.max(y - 16, bubbleH + margin);

  return (
    <div
      className={`touch-preview ${r.mediaType}`}
      style={{ left: cx, top: cy }}
      onClick={onConfirm}
    >
      <div className="touch-preview-loc">⊙ {r.location?.name}</div>
      <div className="touch-preview-title">{truncate(r.title, 80)}</div>
      <div className="touch-preview-meta">
        {r.agency}
        {r.year ? ` · ${r.year}` : ""}
      </div>
      <div className="touch-preview-hint">TAP AGAIN TO OPEN ▸</div>
      <button
        className="touch-preview-close"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        aria-label="Dismiss"
      >
        ✕
      </button>

      <style>{`
        .touch-preview {
          position: fixed;
          width: 240px;
          background: rgba(4,6,11,.95);
          border: 1px solid var(--color-hud);
          border-radius: 4px;
          padding: 10px 12px 10px;
          color: #e8edf3;
          font-family: var(--font-mono);
          font-size: 11px;
          z-index: 35;
          backdrop-filter: blur(8px);
          box-shadow:
            0 0 18px rgba(106,255,200,.35),
            0 8px 24px rgba(0,0,0,.6);
          transform: translate(-50%, -100%);
          cursor: pointer;
          animation: touch-preview-in .15s ease-out;
        }
        @keyframes touch-preview-in {
          from { opacity: 0; transform: translate(-50%, calc(-100% + 8px)); }
          to   { opacity: 1; transform: translate(-50%, -100%); }
        }
        .touch-preview.vid { border-color: var(--color-vid); box-shadow: 0 0 18px rgba(255,59,59,.4), 0 8px 24px rgba(0,0,0,.6); }
        .touch-preview.img { border-color: var(--color-img); box-shadow: 0 0 18px rgba(90,215,255,.4), 0 8px 24px rgba(0,0,0,.6); }
        .touch-preview.pdf { border-color: var(--color-pdf); box-shadow: 0 0 18px rgba(255,200,112,.35), 0 8px 24px rgba(0,0,0,.6); }
        /* little arrow pointing at the pin below */
        .touch-preview::after {
          content: '';
          position: absolute;
          left: 50%; bottom: -7px;
          transform: translateX(-50%) rotate(45deg);
          width: 12px; height: 12px;
          background: rgba(4,6,11,.95);
          border-right: 1px solid currentColor;
          border-bottom: 1px solid currentColor;
          color: var(--color-hud);
        }
        .touch-preview.vid::after { color: var(--color-vid); }
        .touch-preview.img::after { color: var(--color-img); }
        .touch-preview.pdf::after { color: var(--color-pdf); }
        .touch-preview-loc {
          font-size: 9px;
          letter-spacing: .2em;
          text-transform: uppercase;
          color: var(--color-hud);
          margin-bottom: 4px;
          padding-right: 18px;
        }
        .touch-preview.vid .touch-preview-loc { color: var(--color-vid); }
        .touch-preview.img .touch-preview-loc { color: var(--color-img); }
        .touch-preview.pdf .touch-preview-loc { color: var(--color-pdf); }
        .touch-preview-title {
          font-size: 12px;
          line-height: 1.35;
          font-weight: 600;
          margin-bottom: 4px;
          padding-right: 18px;
        }
        .touch-preview-meta {
          font-size: 9px;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: rgba(255,255,255,.55);
          margin-bottom: 8px;
        }
        .touch-preview-hint {
          font-size: 9px;
          letter-spacing: .2em;
          color: var(--color-hud);
          padding-top: 6px;
          border-top: 1px dashed rgba(106,255,200,.2);
        }
        .touch-preview.vid .touch-preview-hint { color: var(--color-vid); border-top-color: rgba(255,59,59,.25); }
        .touch-preview.img .touch-preview-hint { color: var(--color-img); border-top-color: rgba(90,215,255,.25); }
        .touch-preview.pdf .touch-preview-hint { color: var(--color-pdf); border-top-color: rgba(255,200,112,.22); }
        .touch-preview-close {
          position: absolute;
          top: 6px; right: 6px;
          width: 22px; height: 22px;
          border: 0;
          background: transparent;
          color: rgba(255,255,255,.5);
          font-family: var(--font-mono);
          font-size: 11px;
          cursor: pointer;
          border-radius: 2px;
        }
        .touch-preview-close:hover { color: #fff; background: rgba(255,255,255,.08); }
      `}</style>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/**
 * Build a single 3D location-pin mesh.
 * - cone body that tapers from a sharp tip (touching surface) up to a wider top
 * - spherical head sitting on top, slightly larger than the cone
 * - small white specular highlight on the head for that "shiny" look
 *
 * Materials are MeshPhongMaterial so they pick up globe.gl's directional
 * lighting and look photorealistic instead of flat.
 *
 * Local frame: tip at y=0, head centered at y≈3. After we lookAt(0,0,0) +
 * rotateX(π/2) in the update fn, +Y becomes radially outward, so the tip
 * lands on the surface and the head floats above.
 */
function makePin3D(colorHex: string): THREE.Group {
  const color = new THREE.Color(colorHex);
  const group = new THREE.Group();

  // Cone body — thin tip at bottom (y=0), wide top (y=2.2)
  const bodyGeo = new THREE.CylinderGeometry(0.7, 0.06, 2.2, 18, 1, false);
  const bodyMat = new THREE.MeshPhongMaterial({
    color,
    shininess: 60,
    specular: new THREE.Color(0x444444),
    emissive: color.clone().multiplyScalar(0.12),
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.1; // tip at y=0
  group.add(body);

  // Sphere head sits just above the wide end of the cone
  const headGeo = new THREE.SphereGeometry(0.85, 22, 22);
  const headMat = new THREE.MeshPhongMaterial({
    color: color.clone().offsetHSL(0, 0, 0.05),
    shininess: 110,
    specular: new THREE.Color(0x666666),
    emissive: color.clone().multiplyScalar(0.22),
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 2.85;
  group.add(head);

  // Specular highlight — small offset white sphere makes the head feel polished
  const dotGeo = new THREE.SphereGeometry(0.22, 10, 10);
  const dotMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.position.set(0.32, 3.2, 0.32);
  group.add(dot);

  return group;
}
