/**
 * FloatingUfos.tsx
 *
 * Renders dark-silver flying-saucer meshes into the react-globe.gl Three.js
 * scene. Each saucer wanders sporadically (occasional heading impulses) and
 * jets away if the cursor gets near it. Clicking one opens the TransmissionModal.
 *
 * - Up to 4 craft on screen at once (enforced by makeSpawnManager); the spawner
 *   won't reuse a colour that's already up, so no two of them ever look alike.
 *   They flee when the cursor closes in, but only a short dart — catchable.
 * - Dispose geometry + materials + textures on despawn / unmount; reuse the
 *   Raycaster + Vector2.
 * - Respect prefers-reduced-motion (no drift / spin / flee — just static, clickable).
 * - No audio.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import type { GlobeMethods } from "react-globe.gl";
import TransmissionModal from "./TransmissionModal";
import { makeSpawnManager, TRANSMISSIONS, type ActiveUfo, type UfoSpec } from "@/lib/ufos";

interface FloatingUfosProps {
  globeRef: React.MutableRefObject<GlobeMethods | undefined>;
  isTouch: boolean;
}

interface UfoMeshData {
  mesh: THREE.Group;
  geos: THREE.BufferGeometry[];
  mats: THREE.Material[];
  textures: THREE.Texture[];
  baseScale: number;
}

/**
 * A dark flying saucer: tapered metal disc + a dark glassy canopy dome + a ring
 * of bright running-lights + an underbelly down-light. ~6 units across before
 * `spec.scale`. The dark body + dark dome + bright rim dots give it visible
 * structure even when it's only a handful of pixels on a phone.
 */
function buildSaucerMesh(spec: UfoSpec): UfoMeshData {
  const color = new THREE.Color(spec.color);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const group = new THREE.Group();

  // Tapered disc body — matte-ish brushed metal (low specular so it doesn't
  // blow out to white on small renders).
  const bodyGeo = new THREE.CylinderGeometry(3.0, 1.85, 0.55, 30, 1, false);
  geos.push(bodyGeo);
  const bodyMat = new THREE.MeshPhongMaterial({
    color,
    shininess: 24,
    specular: new THREE.Color(0x6b7682),
    emissive: color.clone().multiplyScalar(0.04),
  });
  mats.push(bodyMat);
  group.add(new THREE.Mesh(bodyGeo, bodyMat));

  // A thin darker rim band right at the disc's edge — adds a readable silhouette line.
  const rimGeo = new THREE.TorusGeometry(2.95, 0.16, 8, 36);
  geos.push(rimGeo);
  const rimMat = new THREE.MeshPhongMaterial({
    color: color.clone().multiplyScalar(0.55),
    shininess: 40,
    specular: new THREE.Color(0x9aa6b3),
  });
  mats.push(rimMat);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  // Dark glassy canopy dome — clearly darker than the body so it reads as "the dome".
  const domeGeo = new THREE.SphereGeometry(1.55, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  geos.push(domeGeo);
  const domeMat = new THREE.MeshPhongMaterial({
    color: color.clone().multiplyScalar(0.34),
    shininess: 70,
    specular: new THREE.Color(0xaeb8c4),
    transparent: true,
    opacity: 0.94,
  });
  mats.push(domeMat);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.y = 0.3;
  group.add(dome);

  // Ring of bright running-lights — cool white, the most legible detail at distance.
  const dotGeo = new THREE.SphereGeometry(0.34, 8, 8);
  geos.push(dotGeo);
  const dotMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xc8ecff),
    transparent: true,
    opacity: Math.min(1, spec.glowIntensity + 0.4),
  });
  mats.push(dotMat);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(Math.cos(a) * 2.7, -0.04, Math.sin(a) * 2.7);
    group.add(dot);
  }

  // Underbelly down-light.
  const underGeo = new THREE.SphereGeometry(0.5, 8, 8);
  geos.push(underGeo);
  const underMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xa9ddff),
    transparent: true,
    opacity: spec.glowIntensity * 0.9,
  });
  mats.push(underMat);
  const under = new THREE.Mesh(underGeo, underMat);
  under.position.y = -0.34;
  group.add(under);

  // Invisible, generously-sized hit sphere — so you can actually *catch* a craft
  // without pixel-perfect aim. Opacity 0 (never drawn) but still raycastable.
  // Divide out spec.scale so the hit volume is ~5 world units for EVERY craft —
  // small fast ones aren't punished with a tiny target on top of being quick.
  const hitGeo = new THREE.SphereGeometry(5.0 / spec.scale, 8, 6);
  geos.push(hitGeo);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  mats.push(hitMat);
  group.add(new THREE.Mesh(hitGeo, hitMat));

  group.scale.setScalar(spec.scale);
  return { mesh: group, geos, mats, textures, baseScale: spec.scale };
}

interface SceneUfo {
  id: number;
  data: ActiveUfo;
  meshData: UfoMeshData;
  lat: number;
  lng: number;
  /** velocity in degrees/second */
  velLat: number;
  velLng: number;
  spawnedAt: number;
  /** ms timestamp until which this craft is "fleeing" (boosted speed) */
  fleeUntil: number;
}

// How close (in screen NDC) the cursor must get to spook a craft. Kept fairly
// small so a craft only bolts when you're really closing in — gives you room to
// chase one down rather than it being impossible to approach.
const FLEE_NDC_RADIUS = 0.12;

export default function FloatingUfos({ globeRef }: FloatingUfosProps) {
  const [transmissionText, setTransmissionText] = useState<string | null>(null);

  const groupRef = useRef<THREE.Group | null>(null);
  const sceneUfosRef = useRef<Map<number, SceneUfo>>(new Map());
  const rafRef = useRef<number | null>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());           // current cursor in NDC
  const cursorActiveRef = useRef(false);                  // is the cursor over the globe?
  const hoveredIdRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tmpVec = useRef(new THREE.Vector3());
  const reducedMotion = useRef(
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  const disposeMeshData = useCallback((md: UfoMeshData) => {
    for (const g of md.geos) g.dispose();
    for (const m of md.mats) m.dispose();
    for (const t of md.textures) t.dispose();
  }, []);

  const removeMeshFromGroup = useCallback(
    (id: number) => {
      const entry = sceneUfosRef.current.get(id);
      if (!entry || !groupRef.current) return;
      groupRef.current.remove(entry.meshData.mesh);
      disposeMeshData(entry.meshData);
      sceneUfosRef.current.delete(id);
    },
    [disposeMeshData],
  );

  const getGlobeContainer = useCallback((): HTMLDivElement | null => {
    if (containerRef.current) return containerRef.current;
    const el = document.querySelector<HTMLDivElement>(".globe-stage");
    if (el) containerRef.current = el;
    return containerRef.current;
  }, []);

  // ── spawn + update loop ─────────────────────────────────────────────────────
  useEffect(() => {
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

      const spawnManager = makeSpawnManager({ cap: 4, minActive: 2, now: performance.now(), spawnIntervalMs: 8000 });
      let lastFrameTime = performance.now();

      function clampSpeed(entry: SceneUfo, now: number) {
        const base = entry.data.spec.driftSpeed;
        const fleeing = now < entry.fleeUntil;
        const min = base * 0.25;
        // A flee is a quick *dart* (≈3× cruise for a beat), not a hyperspace
        // jump — you should be able to run one down with some effort.
        const max = base * (fleeing ? 3 : 2.4);
        const sp = Math.hypot(entry.velLat, entry.velLng);
        if (sp < 1e-4) {
          // pointing nowhere — give it a random heading at min speed
          const a = Math.random() * Math.PI * 2;
          entry.velLat = Math.cos(a) * min;
          entry.velLng = Math.sin(a) * min;
          return;
        }
        const clamped = Math.min(max, Math.max(min, sp));
        const k = clamped / sp;
        entry.velLat *= k;
        entry.velLng *= k;
      }

      function frame(now: number) {
        rafRef.current = requestAnimationFrame(frame);
        const dtSec = Math.min((now - lastFrameTime) / 1000, 0.1);
        lastFrameTime = now;
        const globe = globeRef.current;
        if (!globe) return;
        const camera = globe.camera();

        const { spawned, despawned } = spawnManager.tick(now);

        for (const id of despawned) {
          removeMeshFromGroup(id);
          if (hoveredIdRef.current === id) {
            hoveredIdRef.current = null;
            const c = getGlobeContainer();
            if (c) c.style.cursor = "";
          }
        }

        for (const ufo of spawned) {
          const meshData = buildSaucerMesh(ufo.spec);
          group.add(meshData.mesh);
          const base = ufo.spec.driftSpeed;
          sceneUfosRef.current.set(ufo.id, {
            id: ufo.id,
            data: ufo,
            meshData,
            lat: ufo.lat,
            lng: ufo.lng,
            velLat: ufo.driftLat * base,
            velLng: ufo.driftLng * base,
            spawnedAt: ufo.spawnedAt,
            fleeUntil: 0,
          });
        }

        for (const entry of sceneUfosRef.current.values()) {
          if (!reducedMotion.current) {
            // current world position (for the flee check)
            const cur = (globe as any).getCoords(entry.lat, entry.lng, entry.data.spec.altitude) as {
              x: number; y: number; z: number;
            };
            // flee if the cursor is near this craft on screen
            if (cursorActiveRef.current) {
              tmpVec.current.set(cur.x, cur.y, cur.z).project(camera);
              const ndx = tmpVec.current.x - pointer.current.x;
              const ndy = tmpVec.current.y - pointer.current.y;
              if (ndx * ndx + ndy * ndy < FLEE_NDC_RADIUS * FLEE_NDC_RADIUS && tmpVec.current.z < 1) {
                // dart away — a short, moderate impulse roughly away-and-aside,
                // not a teleport. It'll be back to a normal cruise within ~0.65s.
                entry.fleeUntil = now + 650;
                const a = Math.atan2(entry.velLng, entry.velLat) + (Math.random() - 0.5) * 1.2;
                const kick = entry.data.spec.driftSpeed * 2.2;
                entry.velLat += Math.cos(a) * kick;
                entry.velLng += Math.sin(a) * kick;
              }
            }
            // sporadic wander: occasional small heading impulse
            if (Math.random() < 0.035) {
              const a = Math.random() * Math.PI * 2;
              const imp = entry.data.spec.driftSpeed * (0.6 + Math.random() * 1.4);
              entry.velLat += Math.cos(a) * imp;
              entry.velLng += Math.sin(a) * imp;
            }
            clampSpeed(entry, now);

            // integrate
            entry.lat += entry.velLat * dtSec;
            entry.lng += entry.velLng * dtSec;
            // bounce off the latitude band
            if (entry.lat > entry.data.spec.latRange[1]) { entry.lat = entry.data.spec.latRange[1]; entry.velLat = -Math.abs(entry.velLat); }
            if (entry.lat < entry.data.spec.latRange[0]) { entry.lat = entry.data.spec.latRange[0]; entry.velLat = Math.abs(entry.velLat); }
            if (entry.lng > 180) entry.lng -= 360;
            if (entry.lng < -180) entry.lng += 360;
          }

          const coords = (globe as any).getCoords(entry.lat, entry.lng, entry.data.spec.altitude) as {
            x: number; y: number; z: number;
          };
          entry.meshData.mesh.position.set(coords.x, coords.y, coords.z);
          entry.meshData.mesh.lookAt(0, 0, 0);
          entry.meshData.mesh.rotateX(-Math.PI / 2);

          if (!reducedMotion.current) {
            // spin faster while fleeing
            const spin = entry.data.spec.spinSpeed * (now < entry.fleeUntil ? 3.5 : 1);
            entry.meshData.mesh.rotateY(spin * dtSec);
            // bank into a flee turn
            if (now < entry.fleeUntil) entry.meshData.mesh.rotateX(0.5);
          }
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    initTimer = setTimeout(tryStart, 300);

    return () => {
      if (initTimer) clearTimeout(initTimer);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (groupRef.current) {
        for (const id of [...sceneUfosRef.current.keys()]) removeMeshFromGroup(id);
        if (globeRef.current) {
          try {
            globeRef.current.scene().remove(groupRef.current);
          } catch {
            /* globe might be gone */
          }
        }
        groupRef.current = null;
      }
    };
  }, [globeRef, removeMeshFromGroup, getGlobeContainer]);

  // ── Raycasting (hover + click) ──────────────────────────────────────────────
  useEffect(() => {
    function getNdc(e: PointerEvent | MouseEvent, el: HTMLDivElement) {
      const rect = el.getBoundingClientRect();
      pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    function findHitId(): number | null {
      if (!globeRef.current || !groupRef.current || groupRef.current.children.length === 0) return null;
      raycaster.current.setFromCamera(pointer.current, globeRef.current.camera());
      const hits = raycaster.current.intersectObjects(groupRef.current.children, true);
      if (hits.length === 0) return null;
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        for (const [id, entry] of sceneUfosRef.current) {
          if (entry.meshData.mesh === obj || entry.meshData.mesh === obj.parent) return id;
        }
        obj = obj.parent;
      }
      return null;
    }
    function setHoverScale(id: number, hovered: boolean) {
      const entry = sceneUfosRef.current.get(id);
      if (entry) entry.meshData.mesh.scale.setScalar(entry.meshData.baseScale * (hovered ? 1.3 : 1));
    }
    function onPointerMove(e: PointerEvent) {
      const container = getGlobeContainer();
      if (!container) return;
      cursorActiveRef.current = true;
      getNdc(e, container);
      const hitId = findHitId();
      if (hitId === hoveredIdRef.current) return;
      if (hoveredIdRef.current !== null) setHoverScale(hoveredIdRef.current, false);
      hoveredIdRef.current = hitId;
      if (hitId !== null) {
        setHoverScale(hitId, true);
        container.style.cursor = "crosshair";
      } else {
        container.style.cursor = "";
      }
    }
    function onPointerLeave() {
      cursorActiveRef.current = false;
      if (hoveredIdRef.current !== null) setHoverScale(hoveredIdRef.current, false);
      hoveredIdRef.current = null;
      if (containerRef.current) containerRef.current.style.cursor = "";
    }
    function onClick(e: MouseEvent) {
      const container = getGlobeContainer();
      if (!container) return;
      getNdc(e, container);
      const hitId = findHitId();
      if (hitId === null) return;
      e.stopPropagation();
      setTransmissionText(TRANSMISSIONS[Math.floor(Math.random() * TRANSMISSIONS.length)] as string);
    }
    let attached: HTMLDivElement | null = null;
    function attach() {
      const container = getGlobeContainer();
      if (!container || container === attached) return;
      attached = container;
      container.addEventListener("pointermove", onPointerMove);
      container.addEventListener("pointerleave", onPointerLeave);
      container.addEventListener("click", onClick);
    }
    attach();
    const retry = setInterval(() => {
      attach();
      if (attached) clearInterval(retry);
    }, 300);
    return () => {
      clearInterval(retry);
      if (attached) {
        attached.removeEventListener("pointermove", onPointerMove);
        attached.removeEventListener("pointerleave", onPointerLeave);
        attached.removeEventListener("click", onClick);
        attached.style.cursor = "";
      }
    };
  }, [globeRef, getGlobeContainer]);

  const handleAnother = useCallback(() => {
    setTransmissionText(TRANSMISSIONS[Math.floor(Math.random() * TRANSMISSIONS.length)] as string);
  }, []);

  return (
    <TransmissionModal
      text={transmissionText}
      onClose={() => setTransmissionText(null)}
      onAnother={handleAnother}
    />
  );
}
