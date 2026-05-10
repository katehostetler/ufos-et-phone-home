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
  // Saved camera position so we can restore the user's view after they close
  // a modal opened by clicking a pin.
  const savedPovRef = useRef<{ lat: number; lng: number; altitude: number } | null>(null);
  // pushpin meshes keyed by record id, so onPointHover can "jump" the hovered one
  const pinMeshesRef = useRef<Map<string, any>>(new Map());
  const hoveredPinIdRef = useRef<string | null>(null);

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
      stopShimmer = applyCityLightShimmer(globeMat, { intensity: 0.5, rate: 1.2 });
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

  const openLocationModal = useCallback(
    (p: Record) => {
      if (!p.location) return;
      const same = records.filter(
        (r) => r.hasLocation && r.location?.name === p.location?.name,
      );
      if (same.length === 0) return;
      // Snapshot the user's current view so we can return them here on close.
      if (globeRef.current) {
        savedPovRef.current = (globeRef.current as any).pointOfView() ?? null;
      }
      setModalRecords(same);
    },
    [records],
  );

  const closeModalPreservingView = useCallback(() => {
    setModalRecords(null);
    // Restore the camera position the user was at before they clicked.
    if (globeRef.current && savedPovRef.current) {
      (globeRef.current as any).pointOfView(savedPovRef.current, 700);
      savedPovRef.current = null;
    }
  }, []);

  // A single tap/click on a pin opens the record (a bottom sheet on mobile, the
  // left-docked panel on desktop). Camera stays put — tapping a pin shouldn't
  // make you lose your place on the globe.
  const onPointClick = useCallback(
    (point: object) => {
      openLocationModal(point as Record);
    },
    [openLocationModal],
  );

  // ── memoized Globe accessor props ──────────────────────────────────────────
  // react-globe.gl re-applies a prop (and re-runs the underlying layer setup)
  // whenever its identity changes — so an inline arrow here would rebuild every
  // pushpin mesh on every GlobeApp re-render (e.g. opening a modal). Keep them
  // stable; only `isTouch` actually affects them.
  const pointLat = useCallback((d: any) => d.location.lat, []);
  const pointLng = useCallback((d: any) => d.location.lng, []);
  const pointAltitude = useCallback(
    (d: any) => pushpinAltitude({ regional: d.location.regional, touch: isTouch }),
    [isTouch],
  );
  const pointRadius = useCallback(
    (d: any) => {
      // Generous invisible hit-volume — ~2x the bead — so hovering/tapping near
      // a pin registers without pixel-perfect aim. Transparent, so the bigger
      // target is invisible. Kept moderate so dense clusters don't mis-target.
      const base = (d.location.regional ? PUSHPIN.beadRadiusRegional : PUSHPIN.beadRadius) * 2.0;
      return isTouch ? base * PUSHPIN.touchScale : base;
    },
    [isTouch],
  );
  const pointLabel = useCallback(
    (d: any) =>
      // Hover tooltip — desktop (fine-pointer) only. Touch devices get the
      // bottom-sheet preview instead, so suppress the floating label there.
      isTouch
        ? ""
        : `<div class="pin-tooltip">
            <div class="loc">${escapeHtml(d.location.name)}</div>
            <div class="ttl">${escapeHtml(truncate(d.title, 60))}</div>
            <div class="meta">${escapeHtml(d.agency)}${d.year ? " · " + d.year : ""}</div>
          </div>`,
    [isTouch],
  );
  const onPointHover = useCallback(
    (point: any) => {
      // No "jump" on touch — there's no hover there, and toggling the scale on
      // the synthetic mouse events a tap fires made the pin bounce instead of
      // opening. Desktop: grow the hovered pin a touch.
      if (isTouch) return;
      const newId: string | null = point?.id ?? null;
      const oldId = hoveredPinIdRef.current;
      if (newId === oldId) return;
      if (oldId) {
        const om = pinMeshesRef.current.get(oldId);
        if (om) om.scale.setScalar(1);
      }
      if (newId) {
        const nm = pinMeshesRef.current.get(newId);
        if (nm) nm.scale.setScalar(1.3);
      }
      hoveredPinIdRef.current = newId;
    },
    [isTouch],
  );
  const customThreeObject = useCallback(
    (d: any) => {
      const m = makePushpin({
        color: COLORS[d.mediaType as MediaType],
        regional: d.location.regional,
        touch: isTouch,
      });
      pinMeshesRef.current.set(d.id, m);
      return m;
    },
    [isTouch],
  );
  const customThreeObjectUpdate = useCallback((obj: any, d: any) => {
    if (!globeRef.current) return;
    const surf = (globeRef.current as any).getCoords(d.location.lat, d.location.lng, 0);
    obj.position.set(surf.x, surf.y, surf.z);
    // After lookAt + rotateX(-90°), local +Y points radially outward — matching
    // the pushpin geometry built from y=0 (surface) upward.
    obj.lookAt(0, 0, 0);
    obj.rotateX(-Math.PI / 2);
  }, []);
  const ringColor = useCallback(() => (t: number) => `rgba(255, 59, 59, ${1 - t})`, []);

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
          globeImageUrl="/textures/earth-night.jpg"
          bumpImageUrl="https://unpkg.com/three-globe@2.27.2/example/img/earth-topology.png"
          showAtmosphere={true}
          atmosphereColor="#5ab4ff"
          atmosphereAltitude={0.28}
          /* The pushpin's clickable hit-target. We keep pointsData (it owns
             native hover/click) but render it transparent — the visible pin is
             the customLayer group below. The hit volume sits roughly where the
             bead is, so clicking the bead always registers. */
          pointsData={points}
          pointLat={pointLat}
          pointLng={pointLng}
          pointAltitude={pointAltitude}
          pointRadius={pointRadius}
          pointResolution={12}
          pointColor={() => "rgba(0,0,0,0)"}
          pointLabel={pointLabel}
          onPointClick={onPointClick}
          onPointHover={onPointHover}
          /* The visible pushpin — a customLayer group (chrome needle + glossy
             colored bead). Built once with the right dimensions; the update
             function only positions and orients it so local +Y points radially
             outward from the surface. */
          customLayerData={points}
          customThreeObject={customThreeObject}
          customThreeObjectUpdate={customThreeObjectUpdate}
          ringsData={rings}
          ringLat={pointLat}
          ringLng={pointLng}
          ringColor={ringColor}
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

      {/* modal — bottom sheet on mobile, left-docked panel on desktop */}
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
