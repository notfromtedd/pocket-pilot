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

  const lastUserInteractionRef = useRef<number>(0);
  const targetPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const currentPositionRef = useRef<{ lat: number; lng: number } | null>(null);

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

    map.on("movestart", (e) => {
      if (e.originalEvent) {
        lastUserInteractionRef.current = Date.now();
      }
    });

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

  // ── Sync target positions and handle marker removal ────────────────────────
  useEffect(() => {
    if (dronePosition) {
      targetPositionRef.current = dronePosition;
      if (!currentPositionRef.current) {
        currentPositionRef.current = { ...dronePosition };
      }
    } else {
      targetPositionRef.current = null;
      currentPositionRef.current = null;
      if (droneMarkerRef.current) {
        droneMarkerRef.current.remove();
        droneMarkerRef.current = null;
      }
    }
  }, [dronePosition]);

  // ── AI Route Colour ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer("remaining-layer")) {
      map.setPaintProperty("remaining-layer", "line-color", isAiRoute ? "#a855f7" : "#00c7e6");
    }
  }, [isAiRoute, mapReady]);

  // ── Smooth glide animation loop ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let active = true;
    let lastTime = performance.now();

    const loop = (now: number) => {
      if (!active) return;

      const target = targetPositionRef.current;
      const curr = currentPositionRef.current;

      if (target && curr) {
        const elapsed = Math.min(50, now - lastTime);
        lastTime = now;

        const decayTime = 150; // smooth decay catch-up
        const t = 1 - Math.exp(-elapsed / decayTime);

        const dLat = target.lat - curr.lat;
        const dLng = target.lng - curr.lng;

        // If the difference is meaningful, interpolate
        if (Math.abs(dLat) > 1e-7 || Math.abs(dLng) > 1e-7) {
          curr.lat += dLat * t;
          curr.lng += dLng * t;
        } else {
          curr.lat = target.lat;
          curr.lng = target.lng;
        }

        // Update or create drone marker
        if (droneMarkerRef.current) {
          droneMarkerRef.current.setLngLat([curr.lng, curr.lat]);
        } else {
          const el = document.createElement("div");
          el.innerHTML = droneIconHtml();
          droneMarkerRef.current = new mapboxgl.Marker({ element: el })
            .setLngLat([curr.lng, curr.lat]).addTo(map);
        }

        // Update traveled/remaining route lines based on smooth interpolated position
        const traveledSrc = map.getSource(SRC_TRAVELED) as mapboxgl.GeoJSONSource | undefined;
        const remainingSrc = map.getSource(SRC_REMAINING) as mapboxgl.GeoJSONSource | undefined;
        if (traveledSrc && remainingSrc) {
          if (routePath.length >= 2) {
            const split = Math.min(Math.max(0, activeWaypointIndex), routePath.length - 1);
            const traveledCoords: Coord[] = routePath.slice(0, split + 1).map(p => [p.lng, p.lat]);
            traveledCoords.push([curr.lng, curr.lat]);

            const remainingCoords: Coord[] = [
              [curr.lng, curr.lat],
              ...routePath.slice(split).map(p => [p.lng, p.lat] as Coord)
            ];

            traveledSrc.setData(lineFeature(traveledCoords));
            remainingSrc.setData(lineFeature(remainingCoords));
          } else {
            traveledSrc.setData(lineFeature([]));
            remainingSrc.setData(lineFeature([[curr.lng, curr.lat], [targetPosition.lng, targetPosition.lat]]));
          }
        }

        // Auto-center map on drone if user has not interacted recently (6 seconds)
        const timeSinceInteraction = Date.now() - lastUserInteractionRef.current;
        if (timeSinceInteraction > 6000) {
          map.jumpTo({ center: [curr.lng, curr.lat], zoom: 15 });
        }
      } else {
        lastTime = now;
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);

    return () => {
      active = false;
    };
  }, [mapReady, routePath, activeWaypointIndex, targetPosition.lat, targetPosition.lng]);

  return (
    <div ref={containerRef} className="w-full h-full rounded-2xl overflow-hidden" style={{ minHeight: 300 }} />
  );
}
