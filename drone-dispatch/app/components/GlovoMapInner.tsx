"use client";

import { useRef, useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface GlovoMapInnerProps {
  dronePosition: { lat: number; lng: number } | null;
  targetPosition: { lat: number; lng: number };
  customerPosition: { lat: number; lng: number };
}

/* ── Custom marker HTML factories ── */

function droneIconHtml(): string {
  return `
    <div style="position:relative;width:44px;height:44px;">
      <div style="
        position:absolute;inset:0;
        border-radius:50%;
        background:rgba(230,83,40,0.25);
        animation:dronePulse 2s ease-out infinite;
      "></div>
      <div style="
        position:absolute;inset:6px;
        background:#e65328;
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 4px 14px rgba(230,83,40,0.45);
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L12 22"/>
          <path d="M2 12L22 12"/>
          <circle cx="12" cy="12" r="3"/>
          <path d="M4.5 4.5L8 8"/>
          <path d="M19.5 4.5L16 8"/>
          <path d="M4.5 19.5L8 16"/>
          <path d="M19.5 19.5L16 16"/>
        </svg>
      </div>
    </div>
    <style>
      @keyframes dronePulse {
        0%   { transform:scale(1); opacity:1; }
        100% { transform:scale(2.2); opacity:0; }
      }
    </style>`;
}

function targetIconHtml(): string {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <div style="
        width:28px;height:28px;
        background:#10b981;border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 3px 10px rgba(16,185,129,0.4);
      ">
        <span style="transform:rotate(45deg);color:white;font-size:13px;line-height:1;">📦</span>
      </div>
      <div style="width:6px;height:6px;background:#10b981;border-radius:50%;margin-top:2px;opacity:0.4;"></div>
    </div>`;
}

function customerIconHtml(): string {
  return `
    <div style="
      width:20px;height:20px;
      background:#3b82f6;
      border:3px solid white;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(59,130,246,0.5);
    "></div>`;
}

export default function GlovoMapInner({
  dronePosition,
  targetPosition,
  customerPosition,
}: GlovoMapInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const droneMarkerRef = useRef<L.Marker | null>(null);
  const targetMarkerRef = useRef<L.Marker | null>(null);
  const customerMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);

  /* ── Initialise map once ── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([customerPosition.lat, customerPosition.lng], 14);

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }
    ).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);

    mapRef.current = map;

    /* ── Static markers (target + customer) ── */
    targetMarkerRef.current = L.marker(
      [targetPosition.lat, targetPosition.lng],
      {
        icon: L.divIcon({
          html: targetIconHtml(),
          className: "",
          iconSize: [28, 36],
          iconAnchor: [14, 36],
        }),
      }
    ).addTo(map);

    customerMarkerRef.current = L.marker(
      [customerPosition.lat, customerPosition.lng],
      {
        icon: L.divIcon({
          html: customerIconHtml(),
          className: "",
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      }
    ).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      droneMarkerRef.current = null;
      targetMarkerRef.current = null;
      customerMarkerRef.current = null;
      routeLineRef.current = null;
      radiusCircleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── React to position changes ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    /* Update / create drone marker */
    if (dronePosition) {
      const latLng: L.LatLngExpression = [dronePosition.lat, dronePosition.lng];

      if (droneMarkerRef.current) {
        droneMarkerRef.current.setLatLng(latLng);
      } else {
        droneMarkerRef.current = L.marker(latLng, {
          icon: L.divIcon({
            html: droneIconHtml(),
            className: "",
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          }),
          zIndexOffset: 1000,
        }).addTo(map);
      }

      /* Route line: drone → target */
      const routeCoords: L.LatLngExpression[] = [
        latLng,
        [targetPosition.lat, targetPosition.lng],
      ];

      if (routeLineRef.current) {
        routeLineRef.current.setLatLngs(routeCoords);
      } else {
        routeLineRef.current = L.polyline(routeCoords, {
          color: "#e65328",
          weight: 3,
          opacity: 0.7,
          dashArray: "8, 8",
        }).addTo(map);
      }

      /* Delivery radius circle around drone */
      if (radiusCircleRef.current) {
        radiusCircleRef.current.setLatLng(latLng);
      } else {
        radiusCircleRef.current = L.circle(latLng, {
          radius: 300,
          color: "#e65328",
          fillColor: "#e65328",
          fillOpacity: 0.06,
          weight: 1,
          opacity: 0.25,
        }).addTo(map);
      }
    }

    /* Update static marker positions (in case they change) */
    targetMarkerRef.current?.setLatLng([
      targetPosition.lat,
      targetPosition.lng,
    ]);
    customerMarkerRef.current?.setLatLng([
      customerPosition.lat,
      customerPosition.lng,
    ]);

    /* Fit bounds to show all points */
    const points: L.LatLngExpression[] = [
      [customerPosition.lat, customerPosition.lng],
      [targetPosition.lat, targetPosition.lng],
    ];
    if (dronePosition) {
      points.push([dronePosition.lat, dronePosition.lng]);
    }

    if (points.length >= 2) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [dronePosition, targetPosition, customerPosition]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-2xl overflow-hidden"
      style={{ minHeight: 300 }}
    />
  );
}
