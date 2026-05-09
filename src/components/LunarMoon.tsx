/**
 * LunarMoon.tsx
 *
 * Adds a small Moon orbiting Earth in the react-globe.gl scene, so the lunar
 * records (the Apollo 12 / 17 photos + transcripts) have somewhere sensible to
 * "happen" — instead of misleading pins on the Earth globe. Clicking the Moon
 * opens those records in the RecordModal (multi-record, PREV/NEXT cycling).
 *
 * - Moon orbits Earth in a slightly-tilted plane, slowly, and spins on its axis.
 * - A faint pulsing accent ring + cursor:pointer + hover tooltip signal that
 *   it's clickable.
 * - Dispose geometry/materials/textures on unmount. Reuse Raycaster/Vector2.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { GlobeMethods } from "react-globe.gl";
import type { Record } from "@/types/record";

interface Props {
  globeRef: React.MutableRefObject<GlobeMethods | undefined>;
  /** the lunar records, in display order */
  records: Record[];
  /** called when the Moon is clicked — open these records in the modal */
  onSelect: (records: Record[]) => void;
}

// Scene units: Earth globe is ~100-unit radius.
const ORBIT_RADIUS = 255;
const MOON_RADIUS = 16;
const ORBIT_TILT = THREE.MathUtils.degToRad(16); // tilt the orbit plane off the equator
const ORBIT_PERIOD_S = 90; // one lap every ~90s — slow and ambient
const SPIN_PERIOD_S = 60;

export default function LunarMoon({ globeRef, records, onSelect }: Props) {
  const groupRef = useRef<THREE.Group | null>(null);
  const moonRef = useRef<THREE.Mesh | null>(null);
  const ringRef = useRef<THREE.Mesh | null>(null);
  const rafRef = useRef<number | null>(null);
  const disposables = useRef<{ geo: THREE.BufferGeometry[]; mat: THREE.Material[]; tex: THREE.Texture[] }>({
    geo: [],
    mat: [],
    tex: [],
  });
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const hoveredRef = useRef(false);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
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

      // Moon body — textured sphere lit by the scene's directional light.
      const loader = new THREE.TextureLoader();
      const moonTex = loader.load("/textures/moon.jpg");
      moonTex.colorSpace = THREE.SRGBColorSpace;
      disposables.current.tex.push(moonTex);
      const moonGeo = new THREE.SphereGeometry(MOON_RADIUS, 40, 32);
      disposables.current.geo.push(moonGeo);
      const moonMat = new THREE.MeshPhongMaterial({
        map: moonTex,
        shininess: 2,
        color: 0xbfc4cc,
      });
      disposables.current.mat.push(moonMat);
      const moon = new THREE.Mesh(moonGeo, moonMat);
      moonRef.current = moon;
      group.add(moon);

      // Faint accent ring around the Moon — "this is interactive". Pulses.
      const ringGeo = new THREE.RingGeometry(MOON_RADIUS * 1.35, MOON_RADIUS * 1.55, 48);
      disposables.current.geo.push(ringGeo);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xc794ff,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      disposables.current.mat.push(ringMat);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ringRef.current = ring;
      group.add(ring);

      const t0 = performance.now();
      function frame(now: number) {
        rafRef.current = requestAnimationFrame(frame);
        if (!globeRef.current) return;
        const t = (now - t0) / 1000;

        // Orbit position (tilted circle around the origin / Earth)
        const orbitAngle = reducedMotion.current ? 0.6 : (t / ORBIT_PERIOD_S) * Math.PI * 2;
        const x = Math.cos(orbitAngle) * ORBIT_RADIUS;
        const z = Math.sin(orbitAngle) * ORBIT_RADIUS;
        const y = Math.sin(orbitAngle) * Math.sin(ORBIT_TILT) * ORBIT_RADIUS * 0.4;
        group.position.set(x, y, z);

        // Moon spins on its axis
        if (!reducedMotion.current) moon.rotation.y = (t / SPIN_PERIOD_S) * Math.PI * 2;

        // Ring always faces the camera, pulses gently
        const cam = globeRef.current.camera();
        ring.lookAt(cam.position);
        const pulse = reducedMotion.current ? 1 : 1 + Math.sin(t * 1.6) * 0.06;
        ring.scale.setScalar(pulse);
        (ring.material as THREE.MeshBasicMaterial).opacity =
          (hoveredRef.current ? 0.6 : 0.32) * (reducedMotion.current ? 1 : 0.85 + Math.sin(t * 1.6) * 0.15);
      }
      rafRef.current = requestAnimationFrame(frame);
    }

    initTimer = setTimeout(build, 350);

    return () => {
      if (initTimer) clearTimeout(initTimer);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (groupRef.current && globeRef.current) {
        try {
          globeRef.current.scene().remove(groupRef.current);
        } catch {
          /* globe gone */
        }
      }
      for (const g of disposables.current.geo) g.dispose();
      for (const m of disposables.current.mat) m.dispose();
      for (const tx of disposables.current.tex) tx.dispose();
      disposables.current = { geo: [], mat: [], tex: [] };
      groupRef.current = null;
      moonRef.current = null;
      ringRef.current = null;
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, [globeRef]);

  // ── raycasting (hover + click on the Moon) ─────────────────────────────────
  useEffect(() => {
    let container: HTMLDivElement | null = null;
    function getContainer(): HTMLDivElement | null {
      if (container) return container;
      container = document.querySelector<HTMLDivElement>(".globe-stage");
      return container;
    }
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
    function hitsMoon(): boolean {
      if (!globeRef.current || !moonRef.current) return false;
      raycaster.current.setFromCamera(pointer.current, globeRef.current.camera());
      return raycaster.current.intersectObject(moonRef.current, false).length > 0;
    }

    function onMove(e: PointerEvent) {
      const el = getContainer();
      if (!el) return;
      ndc(e, el);
      const hit = hitsMoon();
      if (hit !== hoveredRef.current) {
        hoveredRef.current = hit;
        el.style.cursor = hit ? "pointer" : "";
      }
      const tip = getTooltip();
      if (hit) {
        const n = recordsRef.current.length;
        tip.textContent = `THE MOON · ${n} LUNAR RECORDS — APOLLO 12 / 17`;
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
      if (!hitsMoon()) return;
      e.stopPropagation();
      if (recordsRef.current.length > 0) onSelectRef.current(recordsRef.current);
    }
    function onLeave() {
      hoveredRef.current = false;
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
