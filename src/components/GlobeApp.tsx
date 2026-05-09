import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import type { GlobeMethods } from "react-globe.gl";
import RecordModal from "./RecordModal";
import type { Record, MediaType } from "@/types/record";

const COLORS: Record<MediaType, string> = {
  vid: "#ff3b3b",
  img: "#5ad7ff",
  pdf: "#ffc870",
};

interface Props {
  records: Record[];
}

export default function GlobeApp({ records }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [active, setActive] = useState<{ vid: boolean; img: boolean; pdf: boolean }>({
    vid: true,
    img: true,
    pdf: true,
  });
  const [modalRecords, setModalRecords] = useState<Record[] | null>(null);

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

  // start orbit + initial pose
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
    return () => {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      if (timer) clearTimeout(timer);
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

  function onPointClick(point: object) {
    const p = point as Record;
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
          atmosphereColor="#3da7ff"
          atmosphereAltitude={0.16}
          pointsData={points}
          pointLat={(d: any) => d.location.lat}
          pointLng={(d: any) => d.location.lng}
          pointAltitude={0.012}
          pointRadius={(d: any) => (d.location.regional ? 0.55 : 0.42)}
          pointColor={(d: any) => COLORS[d.mediaType as MediaType]}
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

      {/* modal */}
      {modalRecords && (
        <RecordModal records={modalRecords} onClose={() => setModalRecords(null)} />
      )}
    </>
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
