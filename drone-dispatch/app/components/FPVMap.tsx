"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import mapboxgl, { type GeoJSONSource, type LngLatLike, type Map as MapboxMap, type Marker } from "mapbox-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import "mapbox-gl/dist/mapbox-gl.css";
import { densifyRoutePath, type RoutePoint } from "../lib/simulator";

interface FPVMapProps {
  dronePosition: { lat: number; lng: number; alt: number };
  targetPosition: { lat: number; lng: number };
  routePath?: RoutePoint[];
  heading?: number;
  activeWaypointIndex?: number;
  followZoom?: number;
  cameraMode?: "follow" | "chase";
  isAiRoute?: boolean;
}

type Coord = [number, number];
type LineFeature = {
  type: "Feature";
  properties: Record<string, string | number | boolean>;
  geometry: { type: "LineString"; coordinates: Coord[] };
};
type PointFeature = {
  type: "Feature";
  properties: Record<string, string | number | boolean>;
  geometry: { type: "Point"; coordinates: Coord };
};
type FeatureCollection<T extends LineFeature | PointFeature> = {
  type: "FeatureCollection";
  features: T[];
};
type DroneModelState = {
  position: { lat: number; lng: number; alt: number };
  heading: number;
};
type DroneModelLayer = mapboxgl.CustomLayerInterface & {
  dispose?: () => void;
};

const BASE_POSITION: RoutePoint = { lat: -1.2921, lng: 36.8219, alt: 8, kind: "base" };
const TACTICAL_STYLE = "mapbox://styles/mapbox/streets-v12";
const NAIROBI_BOUNDS: [[number, number], [number, number]] = [[36.63, -1.45], [37.10, -1.12]];
const NAIROBI_CENTER: Coord = [36.8219, -1.2921];
const MIN_ZOOM = 12.5;
const MAX_ZOOM = 28;
const DEFAULT_FOLLOW_ZOOM = 28.1;
const SOURCE_ROUTE = "pocket-route";
const SOURCE_TRAVELED = "pocket-route-traveled";
const SOURCE_WAYPOINTS = "pocket-waypoints";
const SOURCE_HEADING = "pocket-heading";
const DRONE_MODEL_LAYER = "pocket-drone-model";
const DRONE_MODEL_URL = "/models/drone.glb";
const DRONE_MODEL_SCALE_METERS = 18;

export default function FPVMap({
  dronePosition,
  targetPosition,
  routePath = [],
  heading = 0,
  activeWaypointIndex = 0,
  followZoom = DEFAULT_FOLLOW_ZOOM,
  cameraMode = "follow",
  isAiRoute = false,
}: FPVMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const droneMarkerRef = useRef<Marker | null>(null);
  const targetMarkerRef = useRef<Marker | null>(null);
  const droneModelLayerRef = useRef<DroneModelLayer | null>(null);
  const droneModelStateRef = useRef<DroneModelState>({ position: dronePosition, heading });
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const [error, setError] = useState<string | null>(
    mapboxToken ? null : "Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to enable the Mapbox tactical 3D map."
  );
  const [loading, setLoading] = useState(Boolean(mapboxToken));
  const [mapReady, setMapReady] = useState(false);
  const mapReadyRef = useRef(false);

  const tacticalRoute = useMemo<RoutePoint[]>(() => {
    if (routePath.length > 1) return routePath;
    return [
      BASE_POSITION,
      { lat: dronePosition.lat, lng: dronePosition.lng, alt: Math.max(dronePosition.alt, 60), kind: "cruise" },
      { lat: targetPosition.lat, lng: targetPosition.lng, alt: 8, kind: "target" },
    ];
  }, [routePath, dronePosition.lat, dronePosition.lng, dronePosition.alt, targetPosition.lat, targetPosition.lng]);

  const denseRoute = useMemo(() => densifyRoutePath(tacticalRoute, 14), [tacticalRoute]);
  const routeData = useMemo(() => routeFeatureCollection(denseRoute), [denseRoute]);
  const traveledData = useMemo(() => {
    const cutoff = Math.max(1, Math.round((activeWaypointIndex / Math.max(tacticalRoute.length - 1, 1)) * denseRoute.length));
    return routeFeatureCollection(denseRoute.slice(0, Math.min(denseRoute.length, cutoff + 1)));
  }, [activeWaypointIndex, denseRoute, tacticalRoute.length]);
  const waypointData = useMemo(() => waypointFeatureCollection(tacticalRoute, activeWaypointIndex), [activeWaypointIndex, tacticalRoute]);
  const headingData = useMemo(() => headingFeatureCollection(dronePosition, heading), [dronePosition, heading]);
  const latestDataRef = useRef({ routeData, traveledData, waypointData, headingData });

  useEffect(() => {
    latestDataRef.current = { routeData, traveledData, waypointData, headingData };
  }, [headingData, routeData, traveledData, waypointData]);

  useEffect(() => {
    droneModelStateRef.current = { position: dronePosition, heading };
    mapRef.current?.triggerRepaint();
  }, [dronePosition, heading]);

  useEffect(() => {
    if (!containerRef.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken.trim();
    mapReadyRef.current = false;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: TACTICAL_STYLE,
      center: routeCenter(tacticalRoute),
      zoom: 15.7,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: NAIROBI_BOUNDS,
      pitch: 56,
      bearing: 0,
      antialias: true,
      attributionControl: false,
      failIfMajorPerformanceCaveat: false,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    map.scrollZoom.setWheelZoomRate(1 / 900);
    map.scrollZoom.setZoomRate(1 / 140);

    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
      if (map.loaded()) {
        setMapReady(true);
        mapReadyRef.current = true;
      }
    });
    resizeObserver.observe(containerRef.current);
    const initialRafId = requestAnimationFrame(() => {
      map.resize();
      map.triggerRepaint();
    });

    const droneMarker = new mapboxgl.Marker({
      element: createDroneElement(),
      anchor: "center",
      rotationAlignment: "map",
      pitchAlignment: "map",
    }).setLngLat([dronePosition.lng, dronePosition.lat]);
    droneMarker.addTo(map);
    droneMarkerRef.current = droneMarker;

    const targetMarker = new mapboxgl.Marker({
      element: createTargetElement(),
      anchor: "bottom",
    }).setLngLat([targetPosition.lng, targetPosition.lat]);
    targetMarker.addTo(map);
    targetMarkerRef.current = targetMarker;

    const syncLayers = () => {
      try {
        addTacticalSourcesAndLayers(map, latestDataRef.current);
        if (!map.getLayer(DRONE_MODEL_LAYER)) {
          const modelLayer = createDroneModelLayer(
            map,
            droneModelStateRef,
            () => undefined,
            () => {
              droneMarker.getElement().style.display = "";
            }
          );
          map.addLayer(modelLayer);
          droneModelLayerRef.current = modelLayer;
        }
        setError(null);
      } catch (err) {
        console.error("Mapbox tactical layer setup failed:", err);
        setError("Mapbox loaded, but the 3D building/route layers failed to initialize.");
      }
      setLoading(false);
    };

    const onError = (event: mapboxgl.ErrorEvent) => {
      console.error("Mapbox runtime error:", event.error);
      const message = event.error?.message ?? "";
      if (/401|403|token|unauthorized|forbidden/i.test(message)) {
        setError("Mapbox rejected the access token or style request. Check NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN and token URL restrictions.");
      } else if (!mapReadyRef.current) {
        setError(message || "Mapbox failed before the map finished loading.");
      }
      setLoading(false);
    };

    const onRenderReady = () => {
      if (!map.loaded()) return;
      map.resize();
      setError(null);
      setLoading(false);
      setMapReady(true);
      mapReadyRef.current = true;
    };

    map.on("load", syncLayers);
    map.on("style.load", syncLayers);
    map.on("idle", onRenderReady);
    map.on("error", onError);

    const loadTimeout = window.setTimeout(() => {
      if (mapReadyRef.current) return;
      setLoading(false);
      setError("Mapbox did not finish rendering. Check browser console/network for blocked Mapbox style, sprite, glyph, or tile requests.");
    }, 8000);

    return () => {
      window.clearTimeout(loadTimeout);
      cancelAnimationFrame(initialRafId);
      map.off("load", syncLayers);
      map.off("style.load", syncLayers);
      map.off("idle", onRenderReady);
      map.off("error", onError);
      droneModelLayerRef.current?.dispose?.();
      droneMarker.remove();
      targetMarker.remove();
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      droneMarkerRef.current = null;
      targetMarkerRef.current = null;
      droneModelLayerRef.current = null;
    };
    // Initial map creation only; data/camera updates are handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    setSourceData(map, SOURCE_ROUTE, routeData);
    setSourceData(map, SOURCE_TRAVELED, traveledData);
    setSourceData(map, SOURCE_WAYPOINTS, waypointData);
    setSourceData(map, SOURCE_HEADING, headingData);
  }, [headingData, routeData, traveledData, waypointData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer("route-corridor")) {
      map.setPaintProperty("route-corridor", "line-color", isAiRoute ? "#a855f7" : "#00c7e6");
    }
    if (map.getLayer("route-traveled")) {
      map.setPaintProperty("route-traveled", "line-color", isAiRoute ? "#7c3aed" : "#e65328");
    }
  }, [isAiRoute, mapReady]);

  useEffect(() => {
    droneMarkerRef.current?.setLngLat([dronePosition.lng, dronePosition.lat]);
    targetMarkerRef.current?.setLngLat([targetPosition.lng, targetPosition.lat]);

    const el = droneMarkerRef.current?.getElement();
    if (el) {
      el.style.setProperty("--drone-heading", `${heading}deg`);
      const altitude = el.querySelector<HTMLSpanElement>("[data-altitude]");
      if (altitude) altitude.textContent = `${Math.round(dronePosition.alt)}m`;
    }
  }, [dronePosition, heading, targetPosition]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const target = cameraMode === "chase"
      ? chaseCameraTarget(dronePosition, heading, followZoom)
      : followCameraTarget(dronePosition, followZoom);

    map.easeTo({
      center: target.center,
      zoom: target.zoom,
      pitch: target.pitch,
      bearing: target.bearing,
      duration: 200,
      essential: true,
    });
  }, [dronePosition, heading, followZoom, cameraMode]);

  return (
    <div className="relative w-full h-full bg-[#edf1f3]" style={{ minHeight: "200px" }}>
      <div ref={containerRef} className="pocket-mapbox absolute inset-0 h-full w-full bg-[#edf1f3]" />
      {(loading || error || !mapReady) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#edf1f3] text-slate-600">
          <div className="max-w-xs text-center px-5">
            {loading || (!error && !mapReady) ? (
              <>
                <div className="w-8 h-8 border-3 border-[#e65328] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs font-bold uppercase tracking-widest">Loading Mapbox 3D city</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-slate-800 mb-1">3D map unavailable</p>
                <p className="text-xs leading-relaxed">{error}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function addTacticalSourcesAndLayers(
  map: MapboxMap,
  data: {
    routeData: FeatureCollection<LineFeature>;
    traveledData: FeatureCollection<LineFeature>;
    waypointData: FeatureCollection<PointFeature>;
    headingData: FeatureCollection<LineFeature>;
  }
) {
  addBuildingExtrusions(map);
  addGeoJsonSource(map, SOURCE_ROUTE, data.routeData);
  addGeoJsonSource(map, SOURCE_TRAVELED, data.traveledData);
  addGeoJsonSource(map, SOURCE_WAYPOINTS, data.waypointData);
  addGeoJsonSource(map, SOURCE_HEADING, data.headingData);

  if (!map.getLayer("route-corridor")) {
    map.addLayer({
      id: "route-corridor",
      type: "line",
      source: SOURCE_ROUTE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#00c7e6", "line-width": 5, "line-opacity": 0.82 },
    });
  }

  if (!map.getLayer("route-traveled")) {
    map.addLayer({
      id: "route-traveled",
      type: "line",
      source: SOURCE_TRAVELED,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#e65328", "line-width": 7, "line-opacity": 0.92 },
    });
  }

  if (!map.getLayer("drone-heading")) {
    map.addLayer({
      id: "drone-heading",
      type: "line",
      source: SOURCE_HEADING,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#e65328",
        "line-width": 3,
        "line-opacity": 0.7,
        "line-dasharray": [1.5, 1.2],
      },
    });
  }

  if (!map.getLayer("waypoints")) {
    map.addLayer({
      id: "waypoints",
      type: "circle",
      source: SOURCE_WAYPOINTS,
      paint: {
        "circle-radius": ["case", ["==", ["get", "active"], true], 6, 4],
        "circle-color": ["case", ["==", ["get", "active"], true], "#e65328", "#0f766e"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-opacity": 0.95,
      },
    });
  }
}

function createDroneModelLayer(
  map: MapboxMap,
  stateRef: RefObject<DroneModelState>,
  onReady: () => void,
  onFallback: () => void
): DroneModelLayer {
  let camera: THREE.Camera;
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer;
  let modelRoot: THREE.Group | null = null;

  return {
    id: DRONE_MODEL_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd: (_map, gl) => {
      camera = new THREE.Camera();
      scene = new THREE.Scene();

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
      keyLight.position.set(0, -70, 120);
      scene.add(ambientLight, keyLight);

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;

      const loader = new GLTFLoader();
      loader.load(
        DRONE_MODEL_URL,
        (gltf) => {
          modelRoot = new THREE.Group();
          modelRoot.add(gltf.scene);
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = false;
              child.frustumCulled = false;
            }
          });
          scene.add(modelRoot);
          onReady();
          map.triggerRepaint();
        },
        undefined,
        (error) => {
          console.warn("Unable to load drone GLTF model:", error);
          onFallback();
        }
      );
    },
    render: (_gl, matrix) => {
      if (!renderer || !scene || !camera || !modelRoot) return;

      const { position, heading } = stateRef.current;
      const center = clampCoord([position.lng, position.lat]);
      const mercator = mapboxgl.MercatorCoordinate.fromLngLat(center, Math.max(position.alt, 12));
      const meterScale = mercator.meterInMercatorCoordinateUnits() * DRONE_MODEL_SCALE_METERS;

      const mapMatrix = new THREE.Matrix4().fromArray(matrix as number[]);
      const transformMatrix = new THREE.Matrix4()
        .makeTranslation(mercator.x, mercator.y, mercator.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationZ((-heading * Math.PI) / 180));

      camera.projectionMatrix = mapMatrix.multiply(transformMatrix);
      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },
    dispose: () => {
      if (modelRoot) {
        modelRoot.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => material.dispose());
          }
        });
      }
      renderer?.dispose();
      modelRoot = null;
    },
  };
}

function addBuildingExtrusions(map: MapboxMap) {
  if (map.getLayer("3d-buildings") || !map.getSource("composite")) return;

  const labelLayerId = map.getStyle().layers?.find(
    (layer) => layer.type === "symbol" && typeof layer.layout?.["text-field"] !== "undefined"
  )?.id;

  try {
    map.addLayer({
      id: "3d-buildings",
      source: "composite",
      "source-layer": "building",
      type: "fill-extrusion",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": "#9ca3af",
        "fill-extrusion-height": ["coalesce", ["get", "height"], 20],
        "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
        "fill-extrusion-opacity": 0.65,
        "fill-extrusion-vertical-gradient": true,
      },
    }, labelLayerId);
  } catch (err) {
    console.warn("Unable to add Mapbox building extrusions:", err);
  }
}

function addGeoJsonSource(
  map: MapboxMap,
  sourceId: string,
  data: FeatureCollection<LineFeature | PointFeature>
) {
  if (map.getSource(sourceId)) {
    setSourceData(map, sourceId, data);
    return;
  }

  map.addSource(sourceId, { type: "geojson", data });
}

function setSourceData(
  map: MapboxMap,
  sourceId: string,
  data: FeatureCollection<LineFeature | PointFeature>
) {
  const source = map.getSource(sourceId);
  if (source && "setData" in source) {
    (source as GeoJSONSource).setData(data);
  }
}

function routeFeatureCollection(route: RoutePoint[]): FeatureCollection<LineFeature> {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: route.map(pointToCoord) },
    }],
  };
}

function waypointFeatureCollection(route: RoutePoint[], activeWaypointIndex: number): FeatureCollection<PointFeature> {
  return {
    type: "FeatureCollection",
    features: route.map((point, index) => ({
      type: "Feature",
      properties: { active: index === activeWaypointIndex },
      geometry: { type: "Point", coordinates: pointToCoord(point) },
    })),
  };
}

function headingFeatureCollection(
  dronePosition: { lat: number; lng: number; alt: number },
  heading: number
): FeatureCollection<LineFeature> {
  const nose = offsetPoint(dronePosition, heading, 95);
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [[dronePosition.lng, dronePosition.lat], [nose.lng, nose.lat]],
      },
    }],
  };
}

function followCameraTarget(dronePosition: { lat: number; lng: number; alt: number }, followZoom: number) {
  const center = clampCoord([dronePosition.lng, dronePosition.lat]);
  return {
    center: center as LngLatLike,
    zoom: clampNumber(followZoom, MIN_ZOOM, MAX_ZOOM),
    pitch: 56,
    bearing: 0,
  };
}

function chaseCameraTarget(dronePosition: { lat: number; lng: number; alt: number }, headingDeg: number, followZoom: number) {
  // Offset the map center 100m behind the drone so the drone sits in the upper portion of the frame
  const behind = offsetPoint(dronePosition, (headingDeg + 180) % 360, 100);
  const center = clampCoord([behind.lng, behind.lat]);
  return {
    center: center as LngLatLike,
    zoom: clampNumber(followZoom, MIN_ZOOM, MAX_ZOOM),
    pitch: 65,
    bearing: headingDeg,
  };
}

function createDroneElement(): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "relative flex h-14 w-14 items-center justify-center";
  wrapper.style.setProperty("--drone-heading", "0deg");
  wrapper.innerHTML = `
    <div class="absolute h-14 w-14 rounded-full bg-[#e65328]/20 animate-ping"></div>
    <div class="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-[#e65328] shadow-[0_6px_18px_rgba(230,83,40,0.45)]" style="transform: rotate(var(--drone-heading));">
      <div class="h-1 w-7 rounded-full bg-white"></div>
      <div class="absolute h-7 w-1 rounded-full bg-white"></div>
      <div class="absolute h-2 w-2 rounded-full bg-slate-900"></div>
    </div>
    <span data-altitude class="absolute -bottom-3 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 shadow">0m</span>
  `;
  return wrapper;
}

function createTargetElement(): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "flex flex-col items-center";
  wrapper.innerHTML = `
    <div class="h-8 w-8 rounded-full border-2 border-white bg-emerald-500 shadow-[0_4px_14px_rgba(16,185,129,0.4)]"></div>
    <div class="mt-1 h-2 w-2 rounded-full bg-emerald-500/70"></div>
  `;
  return wrapper;
}

function routeCenter(route: RoutePoint[]): LngLatLike {
  const points = route.length > 0 ? route : [BASE_POSITION];
  return clampCoord([
    points.reduce((sum, point) => sum + point.lng, 0) / points.length,
    points.reduce((sum, point) => sum + point.lat, 0) / points.length,
  ]);
}

function pointToCoord(point: { lat: number; lng: number }): Coord {
  return [point.lng, point.lat];
}

function offsetPoint(point: { lat: number; lng: number }, headingDeg: number, meters: number) {
  const earthRadius = 6378137;
  const heading = headingDeg * Math.PI / 180;
  const lat1 = point.lat * Math.PI / 180;
  const lng1 = point.lng * Math.PI / 180;
  const angularDistance = meters / earthRadius;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(heading)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(heading) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );

  return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI };
}

function clampCoord(coord: Coord): Coord {
  if (!isFinite(coord[0]) || !isFinite(coord[1])) return NAIROBI_CENTER;
  return [
    clampNumber(coord[0], NAIROBI_BOUNDS[0][0], NAIROBI_BOUNDS[1][0]),
    clampNumber(coord[1], NAIROBI_BOUNDS[0][1], NAIROBI_BOUNDS[1][1]),
  ];
}

function clampNumber(value: number, min: number, max: number): number {
  if (!isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
