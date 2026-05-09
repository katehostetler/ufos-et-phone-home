/**
 * FloatingUfos.tsx
 *
 * Renders 3D UFO meshes (silver flying saucers + Navy-style tic-tacs) directly
 * into the react-globe.gl Three.js scene. Handles raycasting for hover/click,
 * and shows the TransmissionModal on click.
 *
 * Design constraints:
 * - Never more than 2 craft on screen at once (enforced by makeSpawnManager),
 *   and the two are always different metal tones / sizes — never identical.
 * - Small craft, iconic silhouettes (saucer dome + rim lights; smooth tic-tac).
 * - Dispose geometry + materials + textures on despawn / unmount.
 * - Reuse Raycaster + Vector2 — never allocate per frame.
 * - No audio.
 * - Respect prefers-reduced-motion (skip animation, keep UFOs static + clickable).
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
  mesh: THREE.Object3D;
  geos: THREE.BufferGeometry[];
  mats: THREE.Material[];
  textures: THREE.Texture[];
  /** the craft's resting scale (from spec.scale) — hover scales relative to this */
  baseScale: number;
}

/**
 * Classic flying saucer: thin tapered disc + prominent half-sphere dome +
 * a ring of bright emissive rim lights + a small underbelly down-light.
 * Globe is ~100-unit radius; the disc here is ~6 units across before the
 * per-craft `spec.scale` multiplier, so it reads as a distant craft.
 */
function buildSaucerMesh(spec: UfoSpec): UfoMeshData {
  const color = new THREE.Color(spec.color);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const group = new THREE.Group();

  // Thin disc body (wider top edge → classic saucer profile). Chrome Phong so
  // it catches globe.gl's directional light and reads as polished metal.
  const bodyGeo = new THREE.CylinderGeometry(3.0, 1.9, 0.55, 28, 1, false);
  geos.push(bodyGeo);
  const bodyMat = new THREE.MeshPhongMaterial({
    color,
    shininess: 95,
    specular: new THREE.Color(0xe2e9f0),
    emissive: color.clone().multiplyScalar(0.14),
  });
  mats.push(bodyMat);
  group.add(new THREE.Mesh(bodyGeo, bodyMat));

  // Prominent half-sphere dome — the bit that makes it unmistakably a saucer.
  const domeGeo = new THREE.SphereGeometry(1.65, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  geos.push(domeGeo);
  const domeMat = new THREE.MeshPhongMaterial({
    color: new THREE.Color(spec.color).offsetHSL(0, 0, 0.08),
    shininess: 140,
    specular: new THREE.Color(0xffffff),
    emissive: color.clone().multiplyScalar(0.1),
    transparent: true,
    opacity: 0.82,
  });
  mats.push(domeMat);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.y = 0.28;
  group.add(dome);

  // Ring of 8 bright emissive rim lights (windows / running lights).
  const dotGeo = new THREE.SphereGeometry(0.3, 8, 8);
  geos.push(dotGeo);
  const dotMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(spec.color).offsetHSL(0, 0.18, 0.42),
    transparent: true,
    opacity: Math.min(1, spec.glowIntensity + 0.3),
  });
  mats.push(dotMat);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(Math.cos(a) * 2.65, -0.06, Math.sin(a) * 2.65);
    group.add(dot);
  }

  // Tiny down-light underneath — sells the "craft hovering" read.
  const underGeo = new THREE.SphereGeometry(0.42, 8, 8);
  geos.push(underGeo);
  const underMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(spec.color).offsetHSL(0, 0.28, 0.5),
    transparent: true,
    opacity: spec.glowIntensity,
  });
  mats.push(underMat);
  const under = new THREE.Mesh(underGeo, underMat);
  under.position.y = -0.32;
  group.add(under);

  group.scale.setScalar(spec.scale);
  return { mesh: group, geos, mats, textures, baseScale: spec.scale };
}

/**
 * Tic-tac shape (Navy UAP style): smooth elongated capsule, no wings, no
 * markings. Polished silver Phong body + a faint additive halo so it pops
 * against dark ocean. ~5 units long before `spec.scale`.
 */
function buildTicTacMesh(spec: UfoSpec): UfoMeshData {
  const color = new THREE.Color(spec.color);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const group = new THREE.Group();

  const len = 3.0; // cylinder length
  const r = 0.95;

  const cylGeo = new THREE.CylinderGeometry(r, r, len, 18, 1, false);
  geos.push(cylGeo);
  const bodyMat = new THREE.MeshPhongMaterial({
    color,
    shininess: 80,
    specular: new THREE.Color(0xccd3db),
    emissive: color.clone().multiplyScalar(0.18),
  });
  mats.push(bodyMat);
  const cyl = new THREE.Mesh(cylGeo, bodyMat);
  cyl.rotation.z = Math.PI / 2; // long axis along X
  group.add(cyl);

  const capGeo = new THREE.SphereGeometry(r, 14, 10);
  geos.push(capGeo);
  const capA = new THREE.Mesh(capGeo, bodyMat);
  capA.position.x = len / 2;
  group.add(capA);
  const capB = new THREE.Mesh(capGeo, bodyMat);
  capB.position.x = -len / 2;
  group.add(capB);

  // Faint additive halo
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,0.5)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.16)");
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

  group.scale.setScalar(spec.scale);
  return { mesh: group, geos, mats, textures, baseScale: spec.scale };
}

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

export default function FloatingUfos({ globeRef }: FloatingUfosProps) {
  const [transmissionText, setTransmissionText] = useState<string | null>(null);

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

      // ≤2 craft on screen at once; long cool-down between spawn attempts.
      // Craft live ~11-14s while the cool-down is 18s, so there are real
      // stretches with no UFO at all — rare-sighting cadence.
      const spawnManager = makeSpawnManager({
        cap: 2,
        now: performance.now(),
        spawnIntervalMs: 18000,
      });

      let lastFrameTime = performance.now();

      function frame(now: number) {
        rafRef.current = requestAnimationFrame(frame);
        const dtSec = Math.min((now - lastFrameTime) / 1000, 0.1);
        lastFrameTime = now;
        if (!globeRef.current) return;

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
          const meshData = ufo.spec.kind === "tictac" ? buildTicTacMesh(ufo.spec) : buildSaucerMesh(ufo.spec);
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

        for (const entry of sceneUfosRef.current.values()) {
          if (!globeRef.current) break;

          if (!reducedMotion.current) {
            const speed = entry.data.spec.driftSpeed;
            entry.lat += entry.driftLat * speed * dtSec;
            entry.lng += entry.driftLng * speed * dtSec;
            if (entry.lat > entry.data.spec.latRange[1]) {
              entry.lat = entry.data.spec.latRange[1];
              entry.driftLat *= -1;
            }
            if (entry.lat < entry.data.spec.latRange[0]) {
              entry.lat = entry.data.spec.latRange[0];
              entry.driftLat *= -1;
            }
            if (entry.lng > 180) entry.lng -= 360;
            if (entry.lng < -180) entry.lng += 360;
          }

          const coords = (globeRef.current as any).getCoords(
            entry.lat,
            entry.lng,
            entry.data.spec.altitude,
          ) as { x: number; y: number; z: number };
          entry.meshData.mesh.position.set(coords.x, coords.y, coords.z);
          entry.meshData.mesh.lookAt(0, 0, 0);
          entry.meshData.mesh.rotateX(-Math.PI / 2);

          if (!reducedMotion.current) {
            if (entry.data.spec.kind === "saucer") {
              entry.meshData.mesh.rotateY(entry.data.spec.spinSpeed * dtSec);
            } else {
              const age = (now - entry.spawnedAt) / 1000;
              entry.meshData.mesh.rotateZ(
                Math.sin(age * entry.data.spec.spinSpeed * Math.PI * 2) * 0.08 * dtSec,
              );
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
