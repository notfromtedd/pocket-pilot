"use client";

import { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";

interface FPVMapProps {
  dronePosition: { lat: number; lng: number; alt: number };
  targetPosition: { lat: number; lng: number };
  viewMode: "3D" | "2D";
}

// ── Coordinate helpers ──
// Map lat/lng offsets to scene units (arbitrary scale for visual clarity)
const BASE_LAT = -1.2921;
const BASE_LNG = 36.8219;
const SCALE = 8000;

function geoToScene(lat: number, lng: number): [number, number] {
  return [(lng - BASE_LNG) * SCALE, -(lat - BASE_LAT) * SCALE];
}

// ── Building colour palette ──
const BUILDING_COLORS = [0xe8e4de, 0xd4cfc7, 0xf0ece6, 0xddd8d0, 0xe5e0d8];

export default function FPVMap({
  dronePosition,
  targetPosition,
  viewMode,
}: FPVMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    viewMode,
    dronePosition,
    targetPosition,
  });

  // Keep latest props in ref so the animation loop always reads fresh values
  useEffect(() => {
    stateRef.current.viewMode = viewMode;
    stateRef.current.dronePosition = dronePosition;
    stateRef.current.targetPosition = targetPosition;
  }, [viewMode, dronePosition, targetPosition]);

  // ── Main Three.js lifecycle ──
  const setupScene = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // ── Scene ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f2f5);
    scene.fog = new THREE.FogExp2(0xf0f2f5, 0.0012);

    // ── Cameras ──
    const aspect = container.clientWidth / container.clientHeight;
    const perspCam = new THREE.PerspectiveCamera(50, aspect, 0.1, 2000);
    perspCam.position.set(200, 260, 320);
    perspCam.lookAt(0, 0, 0);

    const orthoHalf = 250;
    const orthoCam = new THREE.OrthographicCamera(
      -orthoHalf * aspect,
      orthoHalf * aspect,
      orthoHalf,
      -orthoHalf,
      0.1,
      2000
    );
    orthoCam.position.set(0, 500, 0);
    orthoCam.lookAt(0, 0, 0);

    // Active camera bookkeeping
    let activeCam: THREE.Camera = perspCam;
    const camPos = new THREE.Vector3().copy(perspCam.position);
    const camTarget = new THREE.Vector3(0, 0, 0);

    // ── Lighting ──
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.0);
    dirLight.position.set(150, 300, 200);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 800;
    dirLight.shadow.camera.left = -300;
    dirLight.shadow.camera.right = 300;
    dirLight.shadow.camera.top = 300;
    dirLight.shadow.camera.bottom = -300;
    scene.add(dirLight);

    const hemisphereLight = new THREE.HemisphereLight(0xc8d5b9, 0x8b9c7a, 0.4);
    scene.add(hemisphereLight);

    // ── Ground plane ──
    const groundGeo = new THREE.PlaneGeometry(800, 800);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0xc8d5b9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ── Grid overlay (road network) ──
    const gridHelper = new THREE.GridHelper(800, 40, 0xb0bfa8, 0xc0ccb8);
    gridHelper.position.y = 0.1;
    scene.add(gridHelper);

    // ── Procedural buildings ──
    const buildingGroup = new THREE.Group();
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xaaaaaa,
      transparent: true,
      opacity: 0.25,
    });

    for (let i = 0; i < 45; i++) {
      const w = 8 + Math.random() * 16;
      const d = 8 + Math.random() * 16;
      const h = 20 + Math.random() * 100;
      const bx = (Math.random() - 0.5) * 600;
      const bz = (Math.random() - 0.5) * 600;

      // Skip if too close to center (leave room for landmarks)
      if (Math.abs(bx) < 50 && Math.abs(bz) < 50) continue;

      const geo = new THREE.BoxGeometry(w, h, d);
      const color =
        BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)];
      const mat = new THREE.MeshLambertMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(bx, h / 2, bz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      buildingGroup.add(mesh);

      // Edge outlines
      const edges = new THREE.EdgesGeometry(geo);
      const line = new THREE.LineSegments(edges, edgeMat);
      line.position.copy(mesh.position);
      buildingGroup.add(line);
    }
    scene.add(buildingGroup);

    // ── Landmark buildings ──
    // KICC – tall cylinder
    const kiccGeo = new THREE.CylinderGeometry(10, 12, 140, 24);
    const kiccMat = new THREE.MeshLambertMaterial({ color: 0xd5cfc5 });
    const kicc = new THREE.Mesh(kiccGeo, kiccMat);
    kicc.position.set(15, 70, -10);
    kicc.castShadow = true;
    scene.add(kicc);

    // Times Tower – tall thin box
    const ttGeo = new THREE.BoxGeometry(14, 130, 14);
    const ttMat = new THREE.MeshLambertMaterial({ color: 0xc8c2b8 });
    const tt = new THREE.Mesh(ttGeo, ttMat);
    tt.position.set(-40, 65, 30);
    tt.castShadow = true;
    scene.add(tt);

    // Kenyatta Conference – dome
    const domeGeo = new THREE.SphereGeometry(22, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshLambertMaterial({ color: 0xe0ddd5 });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.set(50, 0, 50);
    dome.castShadow = true;
    scene.add(dome);

    // ── Animated highway (Waiyaki Way / Expressway) ──
    const highwayCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-350, 0.5, -80),
      new THREE.Vector3(-150, 0.5, -60),
      new THREE.Vector3(0, 0.5, -30),
      new THREE.Vector3(150, 0.5, -50),
      new THREE.Vector3(350, 0.5, -90),
    ]);
    // Road surface
    const tubeGeo = new THREE.TubeGeometry(highwayCurve, 80, 5, 4, false);
    const tubeMat = new THREE.MeshLambertMaterial({
      color: 0x999999,
      transparent: true,
      opacity: 0.45,
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    scene.add(tube);

    // Cars
    const carGroup = new THREE.Group();
    const carColors = [0x3b82f6, 0xef4444, 0xfbbf24, 0x10b981, 0xf97316];
    interface Car {
      mesh: THREE.Mesh;
      t: number;
      speed: number;
    }
    const cars: Car[] = [];
    for (let c = 0; c < 12; c++) {
      const carGeo = new THREE.BoxGeometry(4, 2.5, 3);
      const carMat = new THREE.MeshLambertMaterial({
        color: carColors[c % carColors.length],
      });
      const carMesh = new THREE.Mesh(carGeo, carMat);
      carMesh.castShadow = true;
      carGroup.add(carMesh);
      cars.push({ mesh: carMesh, t: Math.random(), speed: 0.02 + Math.random() * 0.03 });
    }
    scene.add(carGroup);

    // ── Drone ──
    const droneGroup = new THREE.Group();

    // Body sphere
    const droneGeo = new THREE.SphereGeometry(5, 16, 16);
    const droneMat = new THREE.MeshPhongMaterial({
      color: 0xe65328,
      emissive: 0xe65328,
      emissiveIntensity: 0.3,
    });
    const droneMesh = new THREE.Mesh(droneGeo, droneMat);
    droneGroup.add(droneMesh);

    // Pulsing glow ring
    const glowRingGeo = new THREE.RingGeometry(6, 9, 32);
    const glowRingMat = new THREE.MeshBasicMaterial({
      color: 0xe65328,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
    glowRing.rotation.x = -Math.PI / 2;
    droneGroup.add(glowRing);

    // Vertical light beam below drone
    const beamGeo = new THREE.CylinderGeometry(1.5, 3, 60, 8, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xe65328,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = -30;
    droneGroup.add(beam);

    scene.add(droneGroup);

    // ── Target marker ──
    const targetRingGeo = new THREE.RingGeometry(7, 10, 32);
    const targetRingMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const targetRing = new THREE.Mesh(targetRingGeo, targetRingMat);
    targetRing.rotation.x = -Math.PI / 2;
    targetRing.position.y = 0.5;
    scene.add(targetRing);

    // Inner ring
    const targetInnerGeo = new THREE.RingGeometry(3, 5, 32);
    const targetInnerMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const targetInner = new THREE.Mesh(targetInnerGeo, targetInnerMat);
    targetInner.rotation.x = -Math.PI / 2;
    targetInner.position.y = 0.5;
    scene.add(targetInner);

    // ── Radar sweep wedge (for 2D mode) ──
    const radarGeo = new THREE.CircleGeometry(350, 32, 0, Math.PI / 4);
    const radarMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
    });
    const radarSweep = new THREE.Mesh(radarGeo, radarMat);
    radarSweep.rotation.x = -Math.PI / 2;
    radarSweep.position.y = 1;
    scene.add(radarSweep);

    // Radar range circles
    const radarCircles: THREE.LineLoop[] = [];
    [100, 200, 300].forEach((r) => {
      const circGeo = new THREE.BufferGeometry();
      const circPoints: THREE.Vector3[] = [];
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * Math.PI * 2;
        circPoints.push(
          new THREE.Vector3(Math.cos(angle) * r, 0.2, Math.sin(angle) * r)
        );
      }
      circGeo.setFromPoints(circPoints);
      const circLine = new THREE.LineLoop(
        circGeo,
        new THREE.LineBasicMaterial({
          color: 0x22c55e,
          transparent: true,
          opacity: 0.0,
        })
      );
      scene.add(circLine);
      radarCircles.push(circLine);
    });

    // ── Animation ──
    const clock = new THREE.Clock();
    let animFrameId: number;

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const dt = clock.getDelta();
      const state = stateRef.current;
      const is3D = state.viewMode === "3D";

      // ── Camera transition ──
      const targetCamPos = is3D
        ? new THREE.Vector3(
            200 * Math.cos(elapsed * 0.05),
            260,
            200 * Math.sin(elapsed * 0.05) + 120
          )
        : new THREE.Vector3(0, 500, 0.01);

      camPos.lerp(targetCamPos, 0.02);

      if (is3D) {
        perspCam.position.copy(camPos);
        perspCam.lookAt(camTarget);
        activeCam = perspCam;
      } else {
        orthoCam.position.copy(camPos);
        orthoCam.lookAt(camTarget);
        activeCam = orthoCam;
      }

      // ── Drone position ──
      const [dx, dz] = geoToScene(state.dronePosition.lat, state.dronePosition.lng);
      const droneAlt = Math.max(state.dronePosition.alt * 0.5, 30);
      droneGroup.position.set(dx, droneAlt, dz);

      // Drone hover bob
      droneMesh.position.y = Math.sin(elapsed * 3) * 1.5;

      // Glow ring pulse
      const pulse = 0.3 + Math.sin(elapsed * 4) * 0.2;
      glowRingMat.opacity = pulse;
      const ringScale = 1 + Math.sin(elapsed * 4) * 0.15;
      glowRing.scale.set(ringScale, ringScale, 1);

      // Beam shimmer
      beamMat.opacity = 0.08 + Math.sin(elapsed * 2) * 0.04;
      beam.position.y = -droneAlt / 2;
      beam.scale.y = droneAlt / 60;

      // ── Target position ──
      const [tx, tz] = geoToScene(state.targetPosition.lat, state.targetPosition.lng);
      targetRing.position.set(tx, 0.5, tz);
      targetInner.position.set(tx, 0.5, tz);

      // Target pulse
      const tPulse = 0.4 + Math.sin(elapsed * 3) * 0.25;
      targetRingMat.opacity = tPulse;
      const tScale = 1 + Math.sin(elapsed * 3) * 0.1;
      targetRing.scale.set(tScale, tScale, 1);

      // ── Cars ──
      cars.forEach((car) => {
        car.t = (car.t + car.speed * 0.01) % 1;
        const pos = highwayCurve.getPointAt(car.t);
        const tangent = highwayCurve.getTangentAt(car.t);
        car.mesh.position.copy(pos);
        car.mesh.position.y = 2;
        car.mesh.lookAt(pos.clone().add(tangent));
      });

      // ── Radar sweep (2D mode) ──
      const radarTargetOpacity = is3D ? 0.0 : 0.08;
      radarMat.opacity += (radarTargetOpacity - radarMat.opacity) * 0.05;
      radarSweep.rotation.y = elapsed * 1.2;

      radarCircles.forEach((c) => {
        const mat = c.material as THREE.LineBasicMaterial;
        const circTarget = is3D ? 0.0 : 0.15;
        mat.opacity += (circTarget - mat.opacity) * 0.05;
      });

      // ── Fog density transition ──
      if (scene.fog instanceof THREE.FogExp2) {
        const fogTarget = is3D ? 0.0012 : 0.0002;
        scene.fog.density += (fogTarget - scene.fog.density) * 0.02;
      }

      // ── Buildings: flatten in 2D ──
      buildingGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          const targetScaleY = is3D ? 1 : 0.05;
          child.scale.y += (targetScaleY - child.scale.y) * 0.04;
        }
      });

      // ── Grid prominence in 2D ──
      const gridMat = gridHelper.material as THREE.Material;
      const gridTargetOpacity = is3D ? 0.3 : 0.8;
      if ("opacity" in gridMat) {
        gridMat.transparent = true;
        (gridMat as THREE.LineBasicMaterial).opacity +=
          (gridTargetOpacity - (gridMat as THREE.LineBasicMaterial).opacity) * 0.03;
      }

      renderer.render(scene, activeCam);
    };

    animate();

    // ── Resize handler ──
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      const a = w / h;
      perspCam.aspect = a;
      perspCam.updateProjectionMatrix();
      orthoCam.left = -orthoHalf * a;
      orthoCam.right = orthoHalf * a;
      orthoCam.top = orthoHalf;
      orthoCam.bottom = -orthoHalf;
      orthoCam.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // ── Cleanup ──
    return () => {
      cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
      renderer.dispose();
      scene.clear();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    const cleanup = setupScene();
    return cleanup;
  }, [setupScene]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: "200px" }}
    />
  );
}
