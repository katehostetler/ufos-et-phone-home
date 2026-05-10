/**
 * LunarMoon.tsx
 *
 * A small textured Moon that drifts slowly around Earth, with one pin per
 * lunar record (the Apollo 12 / 17 photos + transcripts) sitting on its
 * surface. This is where those records "happen" — instead of misleading pins
 * on the Earth globe.
 *
 * - Each pin is the same map-pin shape as on Earth (a chrome needle + glossy
 *   bead) just in purple and scaled down, clustered in one region (we didn't
 *   go all over the Moon). Clicking a pin opens that record; clicking the Moon
 *   body opens all the lunar records. Each pin has an invisible larger
 *   hit-sphere so it's easy to aim at.
 * - The Moon barely moves (≈5-minute orbit, no spin) so it's easy to interact.
 * - Dispose geometry / materials / textures on unmount; reuse Raycaster.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { GlobeMethods } from "react-globe.gl";
import { makePushpin } from "@/lib/pushpin";
import type { Record } from "@/types/record";

interface Props {
  globeRef: React.MutableRefObject<GlobeMethods | undefined>;
  records: Record[];
  /** open these records in the RecordModal */
  onSelect: (records: Record[]) => void;
}

// Scene units: Earth globe is ~100-unit radius.
const ORBIT_RADIUS = 235;
const MOON_RADIUS = 26;
const ORBIT_TILT = THREE.MathUtils.degToRad(20);
const ORBIT_PERIOD_S = 300; // ~5-minute lap — effectively a slow ambient drift
// makePushpin() is sized for the 100-unit Earth; scale it down for the Moon.
const PIN_SCALE = 0.85;
// Bead colour by media type — same palette as the Earth pins.
const TYPE_COLOR: { [k: string]: string } = { vid: "#ff3b3b", img: "#5ad7ff", pdf: "#ffc870" };
// Where on the Moon the landing-site pins cluster (we didn't go all over it).
const CLUSTER_DIR = new THREE.Vector3(0.3, 0.2, 1).normalize();
const CLUSTER_SPREAD = THREE.MathUtils.degToRad(19); // half-angle of the cluster cone

// Fan N points inside a small cone around CLUSTER_DIR on the Moon's surface.
function clusterPoints(n: number, radius: number): THREE.Vector3[] {
  // Build an orthonormal basis around CLUSTER_DIR.
  const up = Math.abs(CLUSTER_DIR.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3().crossVectors(up, CLUSTER_DIR).normalize();
  const bitangent = new THREE.Vector3().crossVectors(CLUSTER_DIR, tangent).normalize();
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    // even radial distribution within the cone (sqrt for uniform area)
    const frac = n === 1 ? 0 : Math.sqrt(i / (n - 1));
    const ang = frac * CLUSTER_SPREAD;
    const az = golden * i;
    const dir = CLUSTER_DIR.clone()
      .multiplyScalar(Math.cos(ang))
      .add(tangent.clone().multiplyScalar(Math.sin(ang) * Math.cos(az)))
      .add(bitangent.clone().multiplyScalar(Math.sin(ang) * Math.sin(az)))
      .normalize();
    out.push(dir.multiplyScalar(radius));
  }
  return out;
}

export default function LunarMoon({ globeRef, records, onSelect }: Props) {
  const groupRef = useRef<THREE.Group | null>(null);
  const moonRef = useRef<THREE.Mesh | null>(null);
  const pinsRef = useRef<{ mesh: THREE.Group; hitGeo: THREE.Mesh; record: Record }[]>([]);
  const rafRef = useRef<number | null>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const hoveredRef = useRef<{ kind: "pin" | "moon"; idx?: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const disp = useRef<{ geo: THREE.BufferGeometry[]; mat: THREE.Material[]; tex: THREE.Texture[] }>({
    geo: [],
    mat: [],
    tex: [],
  });
  const reducedMotion = useRef(
    typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false,
  );
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // ── build + animate ────────────────────────────────────────────────────────
  useEffect(() => {
    let initTimer: ReturnType<typeof setTimeout> | null = null;
    let started = false;

    function build() {
      if (started || !globeRef.current) {
        initTimer = setTimeout(build, 200);
        return;
      }
      started = true;
      const scene = globeRef.current.scene();
      const group = new THREE.Group();
      groupRef.current = group;
      scene.add(group);

      // Moon body
      const moonTex = new THREE.TextureLoader().load("/textures/moon.jpg");
      moonTex.colorSpace = THREE.SRGBColorSpace;
      disp.current.tex.push(moonTex);
      const moonGeo = new THREE.SphereGeometry(MOON_RADIUS, 44, 36);
      disp.current.geo.push(moonGeo);
      const moonMat = new THREE.MeshPhongMaterial({ map: moonTex, shininess: 2, color: 0xc4c9d1 });
      disp.current.mat.push(moonMat);
      const moon = new THREE.Mesh(moonGeo, moonMat);
      moonRef.current = moon;
      group.add(moon);

      // One pushpin per record — the same map-pin shape as on Earth, just a
      // purple bead, scaled down for the Moon, and clustered in one region
      // (we didn't go all over the Moon). Children of the Moon so they travel
      // and stay put with it.
      const recs = recordsRef.current;
      const pts = clusterPoints(recs.length, MOON_RADIUS);
      pinsRef.current = [];
      recs.forEach((rec, i) => {
        const pin = makePushpin({ color: TYPE_COLOR[rec.mediaType] ?? "#d4b3ff" });
        pin.scale.setScalar(PIN_SCALE);
        // sit at the surface point, oriented so the needle points outward
        const p = pts[i];
        pin.position.copy(p);
        pin.lookAt(0, 0, 0);
        pin.rotateX(-Math.PI / 2);
        moon.add(pin);
        // invisible larger hit-sphere for easy raycasting (the pins are tiny)
        const hitGeo = new THREE.SphereGeometry(3.4, 8, 8);
        disp.current.geo.push(hitGeo);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        disp.current.mat.push(hitMat);
        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.position.copy(p).multiplyScalar((MOON_RADIUS + 2.2) / MOON_RADIUS);
        moon.add(hit);
        pinsRef.current.push({ mesh: pin, hitGeo: hit, record: rec });
      });

      const t0 = performance.now();
      function frame(now: number) {
        rafRef.current = requestAnimationFrame(frame);
        if (!globeRef.current) return;
        const t = (now - t0) / 1000;
        const a = reducedMotion.current ? 0.7 : (t / ORBIT_PERIOD_S) * Math.PI * 2;
        group.position.set(
          Math.cos(a) * ORBIT_RADIUS,
          Math.sin(a) * Math.sin(ORBIT_TILT) * ORBIT_RADIUS * 0.45,
          Math.sin(a) * ORBIT_RADIUS,
        );
        // gentle pulse + hover grow
        if (!reducedMotion.current) {
          const pulse = PIN_SCALE * (1 + Math.sin(t * 2.2) * 0.07);
          pinsRef.current.forEach((p, idx) => {
            const hovered = hoveredRef.current?.kind === "pin" && hoveredRef.current.idx === idx;
            p.mesh.scale.setScalar(hovered ? PIN_SCALE * 1.7 : pulse);
          });
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    }

    initTimer = setTimeout(build, 350);
    return () => {
      if (initTimer) clearTimeout(initTimer);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (groupRef.current) {
        // dispose everything under the group (incl. the pushpin internals)
        groupRef.current.traverse((o: any) => {
          if (o.geometry) o.geometry.dispose?.();
          const m = o.material;
          if (m) (Array.isArray(m) ? m : [m]).forEach((mm: any) => mm.dispose?.());
        });
        if (globeRef.current) {
          try {
            globeRef.current.scene().remove(groupRef.current);
          } catch {
            /* globe gone */
          }
        }
      }
      for (const g of disp.current.geo) g.dispose();
      for (const m of disp.current.mat) m.dispose();
      for (const tx of disp.current.tex) tx.dispose();
      disp.current = { geo: [], mat: [], tex: [] };
      groupRef.current = null;
      moonRef.current = null;
      pinsRef.current = [];
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, [globeRef]);

  // ── raycasting (hover + click) ─────────────────────────────────────────────
  useEffect(() => {
    let container: HTMLDivElement | null = null;
    const getContainer = () => (container ??= document.querySelector<HTMLDivElement>(".globe-stage"));
    function getTooltip(): HTMLDivElement {
      if (tooltipRef.current) return tooltipRef.current;
      const el = document.createElement("div");
      el.className = "moon-tooltip";
      el.style.display = "none";
      document.body.appendChild(el);
      tooltipRef.current = el;
      return el;
    }
    function ndc(e: PointerEvent | MouseEvent, el: HTMLDivElement) {
      const r = el.getBoundingClientRect();
      pointer.current.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.current.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    }
    // Returns { kind: "pin", idx } | { kind: "moon" } | null
    function hitTest(): { kind: "pin" | "moon"; idx?: number } | null {
      if (!globeRef.current || !moonRef.current) return null;
      raycaster.current.setFromCamera(pointer.current, globeRef.current.camera());
      const hitMeshes = pinsRef.current.map((p) => p.hitGeo);
      const pinHits = raycaster.current.intersectObjects(hitMeshes, false);
      if (pinHits.length) {
        const idx = hitMeshes.indexOf(pinHits[0].object as THREE.Mesh);
        if (idx >= 0) return { kind: "pin", idx };
      }
      if (raycaster.current.intersectObject(moonRef.current, false).length) return { kind: "moon" };
      return null;
    }
    function onMove(e: PointerEvent) {
      const el = getContainer();
      if (!el) return;
      ndc(e, el);
      const hit = hitTest();
      hoveredRef.current = hit;
      el.style.cursor = hit ? "pointer" : "";
      const tip = getTooltip();
      if (hit) {
        if (hit.kind === "pin" && hit.idx != null) {
          const rec = pinsRef.current[hit.idx]?.record;
          tip.textContent = rec ? `${rec.title}  ·  ${rec.agency}` : "";
        } else {
          tip.textContent = `THE MOON · ${recordsRef.current.length} LUNAR RECORDS — APOLLO 12 / 17`;
        }
        tip.style.display = "block";
        tip.style.left = `${e.clientX + 14}px`;
        tip.style.top = `${e.clientY + 14}px`;
      } else {
        tip.style.display = "none";
      }
    }
    function onClick(e: MouseEvent) {
      const el = getContainer();
      if (!el) return;
      ndc(e, el);
      const hit = hitTest();
      if (!hit) return;
      e.stopPropagation();
      const recs = recordsRef.current;
      if (!recs.length) return;
      if (hit.kind === "pin" && hit.idx != null) {
        // open the whole lunar set, starting at the pin you clicked
        const rec = pinsRef.current[hit.idx]?.record;
        if (rec) onSelectRef.current([rec, ...recs.filter((r) => r.id !== rec.id)]);
        else onSelectRef.current(recs);
      } else {
        onSelectRef.current(recs);
      }
    }
    function onLeave() {
      hoveredRef.current = null;
      if (container) container.style.cursor = "";
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
    }
    let attached: HTMLDivElement | null = null;
    function attach() {
      const el = getContainer();
      if (!el || el === attached) return;
      attached = el;
      el.addEventListener("pointermove", onMove);
      el.addEventListener("click", onClick);
      el.addEventListener("pointerleave", onLeave);
    }
    attach();
    const retry = setInterval(() => {
      attach();
      if (attached) clearInterval(retry);
    }, 300);
    return () => {
      clearInterval(retry);
      if (attached) {
        attached.removeEventListener("pointermove", onMove);
        attached.removeEventListener("click", onClick);
        attached.removeEventListener("pointerleave", onLeave);
        attached.style.cursor = "";
      }
    };
  }, [globeRef]);

  return null;
}
