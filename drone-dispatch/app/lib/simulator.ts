/**
 * Pocket Pilot — Flight Vector Simulator
 * 
 * Provides geo-math utilities for interpolating drone flight paths,
 * calculating distances, and determining proximity thresholds.
 */

// ── TYPES ──

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface DroneVector {
  lat: number;
  lng: number;
  alt: number;
  speed: number;     // km/h
  heading: number;   // degrees (0 = North, 90 = East)
  battery: number;   // percentage
  phase: FlightPhase;
  activeWaypointIndex: number;
}

export interface FlightPlan {
  origin: GeoPoint;
  destination: GeoPoint;
  cruiseAltitude: number; // meters
  maxSpeed: number;       // km/h
  urgencyLevel?: "STANDARD" | "HIGH" | "CRITICAL";
  routePath: RoutePoint[];
}

export type FlightPhase = "LAUNCH" | "CLIMB" | "CRUISE" | "APPROACH" | "DESCENT" | "DELIVERED";
export type RoutePointKind = "base" | "climb" | "cruise" | "turn" | "approach" | "target";

export interface RoutePoint extends GeoPoint {
  alt: number;
  kind: RoutePointKind;
}

export interface FlightPlanOptions {
  urgencyLevel?: "STANDARD" | "HIGH" | "CRITICAL";
  cruiseAltitude?: number;
  maxSpeed?: number;
}

// ── CONSTANTS ──

const EARTH_RADIUS_KM = 6371;
const SMS_TRIGGER_DISTANCE_M = 150;
const DEFAULT_CRUISE_ALT = 120;   // meters
const DEFAULT_MAX_SPEED = 65;     // km/h
const URGENCY_SPEED_BOOST = {
  STANDARD: 1,
  HIGH: 1.12,
  CRITICAL: 1.24,
} as const;
const URGENCY_ALTITUDE_BOOST = {
  STANDARD: 1,
  HIGH: 1.08,
  CRITICAL: 1.15,
} as const;

// ── GEO CALCULATIONS ──

/** Haversine distance between two points in meters */
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 1000;
}

/** Bearing from point A to point B in degrees (0-360) */
export function bearing(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ── INTERPOLATION ──

/**
 * Linearly interpolate between origin and destination.
 * t = 0 means origin, t = 1 means destination.
 * Altitude follows a parabolic arc (climb → cruise → descend).
 */
export function interpolatePosition(
  plan: FlightPlan,
  t: number
): DroneVector {
  const clampedT = Math.max(0, Math.min(1, t));
  const routeSample = sampleRoute(plan.routePath, clampedT);
  const phase = clampedT >= 1 ? "DELIVERED" : phaseForRouteKind(routeSample.kind);
  const { lat, lng, alt, activeWaypointIndex } = routeSample;

  const speedFactor = clampedT < 0.12
    ? clampedT / 0.12
    : clampedT > 0.88
      ? (1 - clampedT) / 0.12
      : phase === "APPROACH" ? 0.72 : 1;
  const speed = plan.maxSpeed * speedFactor;

  const tripMeters = haversineDistance(plan.origin, plan.destination);
  const tripKmPenalty = Math.min(18, tripMeters / 1000 * 2.2);
  const speedPenalty = plan.maxSpeed > DEFAULT_MAX_SPEED ? 4 : 0;
  const battery = Math.max(12, 100 - clampedT * (62 + tripKmPenalty + speedPenalty));

  return { lat, lng, alt, speed, heading: routeSample.heading, battery, phase, activeWaypointIndex };
}

// ── PROXIMITY CHECK ──

/** Returns true if the drone is within SMS trigger distance of the target */
export function isWithinSMSRange(drone: GeoPoint, target: GeoPoint): boolean {
  return haversineDistance(drone, target) <= SMS_TRIGGER_DISTANCE_M;
}

/** Get the remaining distance in meters */
export function remainingDistance(drone: GeoPoint, target: GeoPoint): number {
  return haversineDistance(drone, target);
}

// ── FLIGHT PLAN FACTORY ──

/** Create a default flight plan from the Nairobi base to a target */
export function createFlightPlan(target: GeoPoint, options: FlightPlanOptions = {}): FlightPlan {
  const urgencyLevel = options.urgencyLevel ?? "STANDARD";
  const cruiseAltitude = Math.round((options.cruiseAltitude ?? DEFAULT_CRUISE_ALT) * URGENCY_ALTITUDE_BOOST[urgencyLevel]);
  const origin = { lat: -1.2921, lng: 36.8219 };
  return {
    origin, // Nairobi base (near KICC)
    destination: target,
    cruiseAltitude,
    maxSpeed: Math.round((options.maxSpeed ?? DEFAULT_MAX_SPEED) * URGENCY_SPEED_BOOST[urgencyLevel]),
    urgencyLevel,
    routePath: createRoutePath(origin, target, cruiseAltitude),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** Build a route from explicit intermediate waypoints (AI-supplied). No bezier — literal path. */
export function createRoutePathFromWaypoints(
  origin: GeoPoint,
  intermediates: { lat: number; lng: number; alt: number }[],
  destination: GeoPoint,
): RoutePoint[] {
  const path: RoutePoint[] = [{ ...origin, alt: 8, kind: "base" }];
  intermediates.forEach((wp, i) => {
    const kind: RoutePointKind =
      i === 0 ? "climb" : i === intermediates.length - 1 ? "approach" : "cruise";
    path.push({ lat: wp.lat, lng: wp.lng, alt: Math.max(60, Math.min(180, wp.alt)), kind });
  });
  path.push({ ...destination, alt: 8, kind: "target" });
  return path;
}

export function createRoutePath(origin: GeoPoint, destination: GeoPoint, cruiseAltitude = DEFAULT_CRUISE_ALT): RoutePoint[] {
  const dx = destination.lng - origin.lng;
  const dy = destination.lat - origin.lat;
  const dist = Math.hypot(dx, dy) || 0.001;
  const nx = -dy / dist;
  const ny = dx / dist;
  const bend = Math.min(0.0038, Math.max(0.0013, dist * 0.32));

  const pointAt = (t: number, offset = 0): GeoPoint => ({
    lat: origin.lat + dy * t + ny * offset,
    lng: origin.lng + dx * t + nx * offset,
  });

  const climb = pointAt(0.16, bend * 0.55);
  const cruiseA = pointAt(0.36, bend);
  const turn = pointAt(0.58, -bend * 0.75);
  const cruiseB = pointAt(0.76, -bend * 0.35);
  const approach = pointAt(0.92, bend * 0.18);

  return [
    { ...origin, alt: 8, kind: "base" },
    { ...climb, alt: Math.max(55, cruiseAltitude * 0.48), kind: "climb" },
    { ...cruiseA, alt: cruiseAltitude, kind: "cruise" },
    { ...turn, alt: cruiseAltitude + 18, kind: "turn" },
    { ...cruiseB, alt: cruiseAltitude - 8, kind: "cruise" },
    { ...approach, alt: 45, kind: "approach" },
    { ...destination, alt: 8, kind: "target" },
  ];
}

export function densifyRoutePath(routePath: RoutePoint[], samplesPerSegment = 10): RoutePoint[] {
  if (routePath.length < 2) return routePath;

  const dense: RoutePoint[] = [];
  for (let i = 0; i < routePath.length - 1; i++) {
    const a = routePath[i];
    const b = routePath[i + 1];
    for (let step = 0; step < samplesPerSegment; step++) {
      const t = step / samplesPerSegment;
      dense.push({
        lat: lerp(a.lat, b.lat, t),
        lng: lerp(a.lng, b.lng, t),
        alt: lerp(a.alt, b.alt, smoothstep(t)),
        kind: t < 0.5 ? a.kind : b.kind,
      });
    }
  }
  dense.push(routePath[routePath.length - 1]);
  return dense;
}

function sampleRoute(routePath: RoutePoint[], progress: number): RoutePoint & { heading: number; activeWaypointIndex: number } {
  if (routePath.length === 0) {
    return { lat: -1.2921, lng: 36.8219, alt: 0, kind: "base", heading: 0, activeWaypointIndex: 0 };
  }
  if (routePath.length === 1 || progress <= 0) {
    const next = routePath[1] ?? routePath[0];
    return { ...routePath[0], heading: bearing(routePath[0], next), activeWaypointIndex: 0 };
  }
  if (progress >= 1) {
    const last = routePath[routePath.length - 1];
    const prev = routePath[routePath.length - 2];
    return { ...last, heading: bearing(prev, last), activeWaypointIndex: routePath.length - 1 };
  }

  const segmentCount = routePath.length - 1;
  const scaled = progress * segmentCount;
  const index = Math.min(segmentCount - 1, Math.floor(scaled));
  const localT = smoothstep(scaled - index);
  const a = routePath[index];
  const b = routePath[index + 1];
  const lat = lerp(a.lat, b.lat, localT);
  const lng = lerp(a.lng, b.lng, localT);
  const alt = lerp(a.alt, b.alt, localT) + Math.sin(localT * Math.PI) * 3;

  return {
    lat,
    lng,
    alt,
    kind: localT < 0.5 ? a.kind : b.kind,
    heading: bearing({ lat, lng }, b),
    activeWaypointIndex: index + 1,
  };
}

function phaseForRouteKind(kind: RoutePointKind): FlightPhase {
  if (kind === "base") return "LAUNCH";
  if (kind === "climb") return "CLIMB";
  if (kind === "approach") return "APPROACH";
  if (kind === "target") return "DESCENT";
  return "CRUISE";
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

// ── FORMAT HELPERS ──

/** Format meters to a readable string */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/** Format seconds to MM:SS */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
