/**
 * FloatingUfos.tsx
 *
 * Renders 3D UFO meshes (orbs + saucers) directly into the react-globe.gl
 * Three.js scene. Handles raycasting for hover/click, and shows the
 * TransmissionModal on click.
 *
 * Design constraints:
 * - Cap of 3 concurrent UFOs (enforced by makeSpawnManager)
 * - Dispose geometry + materials on despawn / unmount
 * - Reuse Raycaster + Vector2 — never allocate per frame
 * - No audio
 * - Respect prefers-reduced-motion (skip animation, keep UFOs static + clickable)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import type { GlobeMethods } from "react-globe.gl";
import TransmissionModal from "./TransmissionModal";
import {
  makeSpawnManager,
  TRANSMISSIONS,
  type ActiveUfo,
  type UfoSpec,
} from "@/lib/ufos";

interface FloatingUfosProps {
  globeRef: React.MutableRefObject<GlobeMethods | undefined>;
  isTouch: boolean;
}

// ── UFO mesh builders ─────────────────────────────────────────────────────────

interface UfoMeshData {
  mesh: THREE.Object3D;
  /** Geometries to dispose */
  geos: THREE.BufferGeometry[];
  /** Materials to dispose */
  mats: THREE.Material[];
  /** Sprite textures to dispose (for orb halo) */
  textures: THREE.Texture[];
}

function buildOrbMesh(spec: UfoSpec): UfoMeshData {
  const color = new THREE.Color(spec.color);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const group = new THREE.Group();

  // Globe scene units: the globe is rendered at ~100 unit radius.
  // UFOs sit at altitude ~0.15-0.28 = ~115-128 units from center.
  // Visible orb needs to be ~4-6 units to show up clearly.

  // Core sphere
  const coreGeo = new THREE.SphereGeometry(4.0, 12, 12);
  geos.push(coreGeo);
  const coreMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
  });
  mats.push(coreMat);
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  // Additive halo Sprite — gives soft glow
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(255,255,255,0.9)`);
  grad.addColorStop(0.3, `rgba(255,255,255,0.4)`);
  grad.addColorStop(1, `rgba(255,255,255,0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  textures.push(tex);
  const spriteMat = new THREE.SpriteMaterial({
    map: tex,
    color,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: spec.glowIntensity,
  });
  mats.push(spriteMat);
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.setScalar(16.0);
  group.add(sprite);

  return { mesh: group, geos, mats, textures };
}

function buildSaucerMesh(spec: UfoSpec): UfoMeshData {
  const color = new THREE.Color(spec.color);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const group = new THREE.Group();

  // Globe scene units: globe ~100 unit radius. Saucer at ~115 units from center.
  // Body needs to be 4-7 units wide to be visible.

  // Flat body disc
  const bodyGeo = new THREE.CylinderGeometry(5.5, 4.5, 1.5, 20, 1, false);
  geos.push(bodyGeo);
  const bodyMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85,
  });
  mats.push(bodyMat);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  // Small dome on top
  const domeGeo = new THREE.SphereGeometry(2.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  geos.push(domeGeo);
  const domeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(spec.color).offsetHSL(0, 0, 0.15),
    transparent: true,
    opacity: 0.7,
  });
  mats.push(domeMat);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.y = 1.2;
  group.add(dome);

  // Rim emissive dots (tiny spheres around the edge)
  const dotGeo = new THREE.SphereGeometry(0.5, 6, 6);
  geos.push(dotGeo);
  const dotMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(spec.color).offsetHSL(0, 0.1, 0.3),
    transparent: true,
    opacity: 0.9,
  });
  mats.push(dotMat);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(Math.cos(angle) * 4.8, 0, Math.sin(angle) * 4.8);
    group.add(dot);
  }

  return { mesh: group, geos, mats, textures };
}

// ── Active UFO state (Three.js side) ─────────────────────────────────────────

interface SceneUfo {
  id: number;
  data: ActiveUfo;
  meshData: UfoMeshData;
  lat: number;
  lng: number;
  driftLat: number;
  driftLng: number;
  spawnedAt: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FloatingUfos({ globeRef, isTouch }: FloatingUfosProps) {
  const [transmissionText, setTransmissionText] = useState<string | null>(null);

  // All scene state is kept in refs — we don't want re-renders on every frame
  const groupRef = useRef<THREE.Group | null>(null);
  const sceneUfosRef = useRef<Map<number, SceneUfo>>(new Map());
  const rafRef = useRef<number | null>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const hoveredIdRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useRef(
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  // ── helpers ────────────────────────────────────────────────────────────────

  const disposeMeshData = useCallback((md: UfoMeshData) => {
    for (const g of md.geos) g.dispose();
    for (const m of md.mats) m.dispose();
    for (const t of md.textures) t.dispose();
  }, []);

  const removeMeshFromGroup = useCallback((id: number) => {
    const entry = sceneUfosRef.current.get(id);
    if (!entry || !groupRef.current) return;
    groupRef.current.remove(entry.meshData.mesh);
    disposeMeshData(entry.meshData);
    sceneUfosRef.current.delete(id);
  }, [disposeMeshData]);

  const getGlobeContainer = useCallback((): HTMLDivElement | null => {
    // The globe canvas lives inside .globe-stage; we need that div for event
    // listening and NDC coordinate calculation.
    if (containerRef.current) return containerRef.current;
    const el = document.querySelector<HTMLDivElement>(".globe-stage");
    if (el) containerRef.current = el;
    return containerRef.current;
  }, []);

  // ── spawn + update loop ────────────────────────────────────────────────────

  useEffect(() => {
    // Wait until the globe has initialised
    let initTimer: ReturnType<typeof setTimeout> | null = null;
    let started = false;

    function tryStart() {
      if (started || !globeRef.current) {
        initTimer = setTimeout(tryStart, 200);
        return;
      }
      started = true;

      const scene = globeRef.current.scene();
      const group = new THREE.Group();
      groupRef.current = group;
      scene.add(group);

      const spawnManager = makeSpawnManager({
        cap: 3,
        now: performance.now(),
        spawnIntervalMs: 4000,
      });

      let lastFrameTime = performance.now();

      function frame(now: number) {
        rafRef.current = requestAnimationFrame(frame);

        const dtMs = now - lastFrameTime;
        lastFrameTime = now;
        const dtSec = Math.min(dtMs / 1000, 0.1); // cap to avoid jumps after tab switch

        if (!globeRef.current) return;

        const { spawned, despawned } = spawnManager.tick(now);

        // Remove despawned
        for (const id of despawned) {
          removeMeshFromGroup(id);
          if (hoveredIdRef.current === id) {
            hoveredIdRef.current = null;
            const c = getGlobeContainer();
            if (c) c.style.cursor = "";
          }
        }

        // Add spawned
        for (const ufo of spawned) {
          const meshData =
            ufo.spec.kind === "orb"
              ? buildOrbMesh(ufo.spec)
              : buildSaucerMesh(ufo.spec);
          group.add(meshData.mesh);
          sceneUfosRef.current.set(ufo.id, {
            id: ufo.id,
            data: ufo,
            meshData,
            lat: ufo.lat,
            lng: ufo.lng,
            driftLat: ufo.driftLat,
            driftLng: ufo.driftLng,
            spawnedAt: ufo.spawnedAt,
          });
        }

        // Update positions + animations
        for (const entry of sceneUfosRef.current.values()) {
          if (!globeRef.current) break;

          // Drift (skip when reduced-motion)
          if (!reducedMotion.current) {
            const speed = entry.data.spec.driftSpeed;
            entry.lat += entry.driftLat * speed * dtSec;
            entry.lng += entry.driftLng * speed * dtSec;
            // Wrap lat back in range
            if (entry.lat > entry.data.spec.latRange[1]) {
              entry.lat = entry.data.spec.latRange[1];
              entry.driftLat *= -1;
            }
            if (entry.lat < entry.data.spec.latRange[0]) {
              entry.lat = entry.data.spec.latRange[0];
              entry.driftLat *= -1;
            }
            // Wrap lng
            if (entry.lng > 180) entry.lng -= 360;
            if (entry.lng < -180) entry.lng += 360;
          }

          // World position
          const coords = (globeRef.current as any).getCoords(
            entry.lat,
            entry.lng,
            entry.data.spec.altitude,
          ) as { x: number; y: number; z: number };
          entry.meshData.mesh.position.set(coords.x, coords.y, coords.z);

          // Orient UFO to face outward from globe center
          entry.meshData.mesh.lookAt(0, 0, 0);
          entry.meshData.mesh.rotateX(-Math.PI / 2);

          if (!reducedMotion.current) {
            const age = (now - entry.spawnedAt) / 1000;

            if (entry.data.spec.kind === "orb") {
              // Pulse: vary scale of the core sphere
              const pulseFactor = 0.85 + 0.15 * Math.sin(age * entry.data.spec.pulseSpeed * Math.PI * 2);
              entry.meshData.mesh.scale.setScalar(pulseFactor);
            } else if (entry.data.spec.kind === "saucer") {
              // Slow rotation around local up (Y after the orient transform)
              entry.meshData.mesh.rotateY(entry.data.spec.spinSpeed * dtSec);
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    initTimer = setTimeout(tryStart, 300);

    return () => {
      if (initTimer) clearTimeout(initTimer);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

      // Remove group + dispose all UFOs
      if (groupRef.current) {
        for (const id of [...sceneUfosRef.current.keys()]) {
          removeMeshFromGroup(id);
        }
        if (globeRef.current) {
          try {
            globeRef.current.scene().remove(groupRef.current);
          } catch (_) { /* globe might be gone */ }
        }
        groupRef.current = null;
      }
    };
  }, [globeRef, removeMeshFromGroup, getGlobeContainer]);

  // ── Raycasting (hover + click) ────────────────────────────────────────────

  useEffect(() => {
    function getNdcCoords(e: PointerEvent | MouseEvent, el: HTMLDivElement) {
      const rect = el.getBoundingClientRect();
      pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function getMeshes(): THREE.Object3D[] {
      if (!groupRef.current) return [];
      return groupRef.current.children;
    }

    function findHitId(meshes: THREE.Object3D[]): number | null {
      if (!globeRef.current || meshes.length === 0) return null;
      const camera = globeRef.current.camera();
      raycaster.current.setFromCamera(pointer.current, camera);
      // We need to test against all descendants (group children may be groups)
      const hits = raycaster.current.intersectObjects(meshes, true);
      if (hits.length === 0) return null;
      // Walk up from the hit object to find our tracked SceneUfo entry
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        for (const [id, entry] of sceneUfosRef.current) {
          if (entry.meshData.mesh === obj || entry.meshData.mesh === obj.parent) {
            return id;
          }
        }
        obj = obj.parent;
      }
      return null;
    }

    function onPointerMove(e: PointerEvent) {
      const container = getGlobeContainer();
      if (!container) return;
      getNdcCoords(e, container);
      const hitId = findHitId(getMeshes());

      if (hitId !== hoveredIdRef.current) {
        // Reset previously hovered
        if (hoveredIdRef.current !== null) {
          const prev = sceneUfosRef.current.get(hoveredIdRef.current);
          if (prev) prev.meshData.mesh.scale.setScalar(1.0);
        }
        hoveredIdRef.current = hitId;
        if (hitId !== null) {
          const cur = sceneUfosRef.current.get(hitId);
          if (cur) cur.meshData.mesh.scale.setScalar(1.25);
          container.style.cursor = "crosshair";
        } else {
          container.style.cursor = "";
        }
      }
    }

    function onClick(e: MouseEvent) {
      const container = getGlobeContainer();
      if (!container) return;
      getNdcCoords(e, container);
      const hitId = findHitId(getMeshes());
      if (hitId === null) return;

      e.stopPropagation();
      // Pick a random transmission
      const text = TRANSMISSIONS[Math.floor(Math.random() * TRANSMISSIONS.length)];
      setTransmissionText(text as string);
    }

    // Attach to the globe container when it exists
    let attached: HTMLDivElement | null = null;

    function attach() {
      const container = getGlobeContainer();
      if (!container || container === attached) return;
      attached = container;
      container.addEventListener("pointermove", onPointerMove);
      container.addEventListener("click", onClick);
    }

    // Try attaching now; retry if not ready
    attach();
    const retryTimer = setInterval(() => {
      attach();
      if (attached) clearInterval(retryTimer);
    }, 300);

    return () => {
      clearInterval(retryTimer);
      if (attached) {
        attached.removeEventListener("pointermove", onPointerMove);
        attached.removeEventListener("click", onClick);
        attached.style.cursor = "";
      }
    };
  }, [globeRef, getGlobeContainer]);

  // ── Render ────────────────────────────────────────────────────────────────

  const handleAnother = useCallback(() => {
    const text = TRANSMISSIONS[Math.floor(Math.random() * TRANSMISSIONS.length)];
    setTransmissionText(text as string);
  }, []);

  return (
    <TransmissionModal
      text={transmissionText}
      onClose={() => setTransmissionText(null)}
      onAnother={handleAnother}
    />
  );
}
