"use client";

import { useState, useRef, useEffect } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "";

interface CustomerMapProps {
  dronePosition: { lat: number; lng: number } | null;
  targetPosition: { lat: number; lng: number };
  customerPosition: { lat: number; lng: number };
  routePath?: { lat: number; lng: number }[];
  activeWaypointIndex?: number;
  isAiRoute?: boolean;
}

type Coord = [number, number];

function droneIconHtml(): string {
  return `<div style="position:relative;width:44px;height:44px;"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(230,83,40,0.25);animation:dronePulse 2s ease-out infinite;"></div><div style="position:absolute;inset:6px;background:#e65328;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(230,83,40,0.45);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L12 22"/><path d="M2 12L22 12"/><circle cx="12" cy="12" r="3"/><path d="M4.5 4.5L8 8"/><path d="M19.5 4.5L16 8"/><path d="M4.5 19.5L8 16"/><path d="M19.5 19.5L16 16"/></svg></div></div><style>@keyframes dronePulse{0%{transform:scale(1);opacity:1}100%{transform:scale(2.2);opacity:0}}</style>`;
}
function targetIconHtml(): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;"><div style="width:28px;height:28px;background:#10b981;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(16,185,129,0.4);"><span style="transform:rotate(45deg);color:white;font-size:13px;line-height:1;">📦</span></div><div style="width:6px;height:6px;background:#10b981;border-radius:50%;margin-top:2px;opacity:0.4;"></div></div>`;
}
function customerIconHtml(): string {
  return `<div style="width:20px;height:20px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(59,130,246,0.5);"></div>`;
}

function lineFeature(coords: Coord[]): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } };
}

const SRC_TRAVELED = "route-traveled";
const SRC_REMAINING = "route-remaining";

export default function GlovoMapInner({
  dronePosition,
  targetPosition,
  customerPosition,
  routePath = [],
  activeWaypointIndex = 0,
  isAiRoute = false,
}: CustomerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const droneMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const targetMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const customerMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // ── Init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [customerPosition.lng, customerPosition.lat],
      zoom: 14,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });

    mapRef.current = map; // set immediately so cleanup always has a ref

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => {
      // Static markers
      const tEl = document.createElement("div");
      tEl.innerHTML = targetIconHtml();
      targetMarkerRef.current = new mapboxgl.Marker({ element: tEl, anchor: "bottom" })
        .setLngLat([targetPosition.lng, targetPosition.lat]).addTo(map);

      const cEl = document.createElement("div");
      cEl.innerHTML = customerIconHtml();
      customerMarkerRef.current = new mapboxgl.Marker({ element: cEl })
        .setLngLat([customerPosition.lng, customerPosition.lat]).addTo(map);

      // Route sources
      map.addSource(SRC_REMAINING, { type: "geojson", data: lineFeature([]) });
      map.addSource(SRC_TRAVELED, { type: "geojson", data: lineFeature([]) });

      // Remaining: dashed, dim
      map.addLayer({
        id: "remaining-layer",
        type: "line",
        source: SRC_REMAINING,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#00c7e6", "line-width": 3, "line-opacity": 0.45, "line-dasharray": [2, 2] },
      });

      // Traveled: solid, bright — rendered on top
      map.addLayer({
        id: "traveled-layer",
        type: "line",
        source: SRC_TRAVELED,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#e65328", "line-width": 5, "line-opacity": 0.92 },
      });

      // Initial fit to show origin→destination before flight
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([customerPosition.lng, customerPosition.lat]);
      bounds.extend([targetPosition.lng, targetPosition.lat]);
      map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 800 });

      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      droneMarkerRef.current = null;
      targetMarkerRef.current = null;
      customerMarkerRef.current = null;
      // Reset so the update effect waits for the new map's load event
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update on telemetry ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // 1. Drone marker
    if (dronePosition) {
      const lngLat: Coord = [dronePosition.lng, dronePosition.lat];
      if (droneMarkerRef.current) {
        droneMarkerRef.current.setLngLat(lngLat);
      } else {
        const el = document.createElement("div");
        el.innerHTML = droneIconHtml();
        droneMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat(lngLat).addTo(map);
      }
    }

    // 2. Route split: traveled (orange) / remaining (cyan/purple)
    const traveledSrc = map.getSource(SRC_TRAVELED) as mapboxgl.GeoJSONSource | undefined;
    const remainingSrc = map.getSource(SRC_REMAINING) as mapboxgl.GeoJSONSource | undefined;

    // Sources are added inside map.on("load") — if they don't exist yet, bail out
    if (!traveledSrc || !remainingSrc) return;

    if (routePath.length >= 2) {
      const split = Math.min(Math.max(0, activeWaypointIndex), routePath.length - 1);
      const traveledCoords: Coord[] = routePath.slice(0, split + 1).map(p => [p.lng, p.lat]);
      if (dronePosition) traveledCoords.push([dronePosition.lng, dronePosition.lat]);

      const remainingCoords: Coord[] = dronePosition
        ? [[dronePosition.lng, dronePosition.lat], ...routePath.slice(split).map(p => [p.lng, p.lat] as Coord)]
        : routePath.slice(split).map(p => [p.lng, p.lat]);

      traveledSrc.setData(lineFeature(traveledCoords));
      remainingSrc.setData(lineFeature(remainingCoords));
    } else if (dronePosition) {
      // Pre-flight or no route yet: straight dashed line drone → target
      traveledSrc.setData(lineFeature([]));
      remainingSrc.setData(lineFeature([[dronePosition.lng, dronePosition.lat], [targetPosition.lng, targetPosition.lat]]));
    }

    // 3. AI route colour
    if (map.getLayer("remaining-layer")) {
      map.setPaintProperty("remaining-layer", "line-color", isAiRoute ? "#a855f7" : "#00c7e6");
    }

    // 4. Smooth follow — keep drone centred without refitting all bounds
    if (dronePosition) {
      map.easeTo({ center: [dronePosition.lng, dronePosition.lat], zoom: 15, duration: 300, essential: true });
    }

  }, [dronePosition, routePath, activeWaypointIndex, isAiRoute, mapReady]);

  return (
    <div ref={containerRef} className="w-full h-full rounded-2xl overflow-hidden" style={{ minHeight: 300 }} />
  );
}
