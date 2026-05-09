import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import type { GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
import RecordModal from "./RecordModal";
import QueuePanel from "./QueuePanel";
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
  const [active, setActive] = useState<{ vid: boolean; img: boolean; pdf: boolean }>({
    vid: true,
    img: true,
    pdf: true,
  });
  const [modalRecords, setModalRecords] = useState<Record[] | null>(null);
  const [queueType, setQueueType] = useState<QueueType | null>(null);
  const [touchPreview, setTouchPreview] = useState<{
    rec: Record;
    x: number;
    y: number;
  } | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // when the queue's active record changes, fly the globe to its pin (if any)
  const onQueueActiveChange = useCallback((rec: Record) => {
    if (!rec.location || !globeRef.current) return;
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

    return () => {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      if (timer) clearTimeout(timer);
      for (const s of stars) scene.remove(s);
      for (const l of layers) {
        l.geo.dispose();
        l.mat.dispose();
      }
    };
  }, []);

  // dataset of pins (filtered + only those with location)
  const points = useMemo(
    () =>
      records.filter(
        (r) => r.hasLocation && r.location && active[r.mediaType as MediaType],
      ),
    [records, active],
  );

  // ring data for videos (pulses)
  const rings = useMemo(
    () => records.filter((r) => r.hasLocation && r.location && r.mediaType === "vid" && active.vid),
    [records, active.vid],
  );

  function openLocationModal(p: Record) {
    if (!p.location) return;
    const same = records.filter(
      (r) =>
        r.hasLocation &&
        r.location?.name === p.location?.name &&
        active[r.mediaType as MediaType],
    );
    if (same.length === 0) return;
    setModalRecords(same);
    if (globeRef.current && p.location) {
      globeRef.current.pointOfView(
        { lat: p.location.lat, lng: p.location.lng, altitude: 1.7 },
        900,
      );
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
      // gently fly the globe to the previewed pin
      if (globeRef.current && p.location) {
        globeRef.current.pointOfView(
          { lat: p.location.lat, lng: p.location.lng, altitude: 2.1 },
          700,
        );
      }
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
      {/* filter chips */}
      <div className="filterbar">
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
              className={`chip ${t} ${active[t] ? "active" : "off"}`}
              onClick={() => setActive((s) => ({ ...s, [t]: !s[t] }))}
            >
              <span className="swatch"></span>
              {labels[t]} · {counts[t]}
            </span>
          );
        })}
      </div>

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
          pointsData={points}
          pointLat={(d: any) => d.location.lat}
          pointLng={(d: any) => d.location.lng}
          /* float pins visibly above the surface — gives parallax / 3D feel */
          pointAltitude={(d: any) => (d.location.regional ? 0.045 : 0.035)}
          pointRadius={(d: any) => {
            const base = d.location.regional ? 0.85 : 0.7;
            // Touch devices need a much larger hit area to register reliably.
            return isTouch ? base * 1.8 : base;
          }}
          pointResolution={14}
          pointColor={(d: any) => COLORS[d.mediaType as MediaType]}
          /* glowing beam under each pin connecting to the surface */
          customLayerData={points}
          customThreeObject={(d: any) => {
            const color = new THREE.Color(COLORS[d.mediaType as MediaType]);
            const geo = new THREE.CylinderGeometry(0.18, 0.32, 1, 6, 1, true);
            const mat = new THREE.MeshBasicMaterial({
              color,
              transparent: true,
              opacity: 0.55,
              depthWrite: false,
            });
            const beam = new THREE.Mesh(geo, mat);
            // also a small base disc on the surface for grounding
            const baseGeo = new THREE.CircleGeometry(0.55, 16);
            const baseMat = new THREE.MeshBasicMaterial({
              color,
              transparent: true,
              opacity: 0.4,
              depthWrite: false,
            });
            const base = new THREE.Mesh(baseGeo, baseMat);
            base.rotateX(-Math.PI / 2); // lay flat
            base.position.y = -0.5; // sit at surface end of cylinder
            beam.add(base);
            beam.userData = { mediaType: d.mediaType };
            return beam;
          }}
          customThreeObjectUpdate={(obj: any, d: any) => {
            if (!globeRef.current) return;
            const altitude = d.location.regional ? 0.045 : 0.035;
            const tip = (globeRef.current as any).getCoords(d.location.lat, d.location.lng, altitude);
            const surf = (globeRef.current as any).getCoords(d.location.lat, d.location.lng, 0);
            // place at midpoint between surface and pin tip
            obj.position.set(
              (tip.x + surf.x) / 2,
              (tip.y + surf.y) / 2,
              (tip.z + surf.z) / 2,
            );
            // scale length to match altitude (globe radius ~100 in scene units)
            const length = Math.sqrt(
              (tip.x - surf.x) ** 2 + (tip.y - surf.y) ** 2 + (tip.z - surf.z) ** 2,
            );
            obj.scale.set(1, length, 1);
            // align cylinder Y axis along the surface normal (radially outward)
            obj.lookAt(0, 0, 0);
            obj.rotateX(Math.PI / 2);
          }}
          pointLabel={(d: any) => `
            <div class="pin-tooltip">
              <div class="loc">${escapeHtml(d.location.name)}</div>
              <div class="ttl">${escapeHtml(truncate(d.title, 60))}</div>
              <div class="meta">${escapeHtml(d.agency)}${d.year ? " · " + d.year : ""}</div>
            </div>
          `}
          onPointClick={onPointClick}
          ringsData={rings}
          ringLat={(d: any) => d.location.lat}
          ringLng={(d: any) => d.location.lng}
          ringColor={() => (t: number) => `rgba(255, 59, 59, ${1 - t})`}
          ringMaxRadius={3.5}
          ringPropagationSpeed={2.4}
          ringRepeatPeriod={1400}
        />
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
        <RecordModal records={modalRecords} onClose={() => setModalRecords(null)} />
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
