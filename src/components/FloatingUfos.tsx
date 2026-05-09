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
  /** Sprite textures to dispose */
  textures: THREE.Texture[];
}

/**
 * Classic flying saucer: thin disc + prominent half-sphere dome on top +
 * a ring of bright emissive lights around the rim. Sized small (~6 units
 * across) so it reads as a craft, not a smear.
 *
 * Globe scene units: globe is ~100-unit radius; UFO altitude ~0.22 puts
 * the saucer at ~122 units from camera-near-side.
 */
function buildSaucerMesh(spec: UfoSpec): UfoMeshData {
  const color = new THREE.Color(spec.color);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const group = new THREE.Group();

  // Thin disc body — wider top edge tapering down (classic saucer profile)
  const bodyGeo = new THREE.CylinderGeometry(3.0, 2.2, 0.5, 24, 1, false);
  geos.push(bodyGeo);
  const bodyMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
  });
  mats.push(bodyMat);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  // Prominent half-sphere dome — proportionally taller than before so the
  // saucer silhouette is unmistakable
  const domeGeo = new THREE.SphereGeometry(1.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  geos.push(domeGeo);
  const domeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(spec.color).offsetHSL(0, -0.1, 0.18),
    transparent: true,
    opacity: 0.8,
  });
  mats.push(domeMat);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.y = 0.25;
  group.add(dome);

  // Bright emissive rim lights — 8 dots, brighter than before so they read
  // as windows / running lights at small scale
  const dotGeo = new THREE.SphereGeometry(0.32, 8, 8);
  geos.push(dotGeo);
  const dotMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(spec.color).offsetHSL(0, 0.2, 0.4),
    transparent: true,
    opacity: Math.min(1, spec.glowIntensity + 0.3),
  });
  mats.push(dotMat);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(Math.cos(angle) * 2.7, -0.05, Math.sin(angle) * 2.7);
    group.add(dot);
  }

  // Tiny down-light underneath — sells the "craft hovering" read
  const underGeo = new THREE.SphereGeometry(0.45, 8, 8);
  geos.push(underGeo);
  const underMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(spec.color).offsetHSL(0, 0.3, 0.5),
    transparent: true,
    opacity: spec.glowIntensity,
  });
  mats.push(underMat);
  const underLight = new THREE.Mesh(underGeo, underMat);
  underLight.position.y = -0.3;
  group.add(underLight);

  return { mesh: group, geos, mats, textures };
}

/**
 * Tic-tac shape (Navy UAP style): smooth elongated capsule, no wings,
 * no markings. Scaled small (~4.5 units long) and matte-white.
 */
function buildTicTacMesh(spec: UfoSpec): UfoMeshData {
  const color = new THREE.Color(spec.color);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const group = new THREE.Group();

  // Capsule = cylinder + two hemispheres. Three.js has CapsuleGeometry,
  // but build it manually so disposal is uniform.
  const len = 3.0; // cylinder length
  const r = 0.9;   // capsule radius

  const cylGeo = new THREE.CylinderGeometry(r, r, len, 18, 1, false);
  geos.push(cylGeo);
  const bodyMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
  });
  mats.push(bodyMat);
  const cyl = new THREE.Mesh(cylGeo, bodyMat);
  // Lay it on its side — long axis along X
  cyl.rotation.z = Math.PI / 2;
  group.add(cyl);

  const capGeo = new THREE.SphereGeometry(r, 14, 10);
  geos.push(capGeo);
  const capA = new THREE.Mesh(capGeo, bodyMat);
  capA.position.x = len / 2;
  group.add(capA);
  const capB = new THREE.Mesh(capGeo, bodyMat);
  capB.position.x = -len / 2;
  group.add(capB);

  // Faint additive halo so it pops against dark ocean — sized to the body
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
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
  sprite.scale.set(7, 3.5, 1);
  group.add(sprite);

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

      // Rare-sighting cadence: at most ONE craft on screen at any moment,
      // and a long cool-down between spawn attempts. Each saucer/tic-tac
      // lives ~12-16s, so most of the time you'll see 0 or 1.
      const spawnManager = makeSpawnManager({
        cap: 1,
        now: performance.now(),
        spawnIntervalMs: 12000,
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
            ufo.spec.kind === "tictac"
              ? buildTicTacMesh(ufo.spec)
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
            // Saucers spin around their local up axis; tic-tacs gently wobble
            // (subtle pitch + roll) so they don't read as static pills.
            if (entry.data.spec.kind === "saucer") {
              entry.meshData.mesh.rotateY(entry.data.spec.spinSpeed * dtSec);
            } else {
              const age = (now - entry.spawnedAt) / 1000;
              const wobble = Math.sin(age * entry.data.spec.spinSpeed * Math.PI * 2) * 0.08;
              entry.meshData.mesh.rotateZ(wobble * dtSec);
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
