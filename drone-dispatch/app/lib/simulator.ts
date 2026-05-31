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
}

export interface FlightPlan {
  origin: GeoPoint;
  destination: GeoPoint;
  cruiseAltitude: number; // meters
  maxSpeed: number;       // km/h
}

// ── CONSTANTS ──

const EARTH_RADIUS_KM = 6371;
const SMS_TRIGGER_DISTANCE_M = 150;
const DEFAULT_CRUISE_ALT = 120;   // meters
const DEFAULT_MAX_SPEED = 65;     // km/h

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

  const lat = plan.origin.lat + (plan.destination.lat - plan.origin.lat) * clampedT;
  const lng = plan.origin.lng + (plan.destination.lng - plan.origin.lng) * clampedT;

  // Parabolic altitude profile: 0 → cruise → 0
  const alt = plan.cruiseAltitude * 4 * clampedT * (1 - clampedT);

  // Speed ramps up then down
  const speedFactor = clampedT < 0.15
    ? clampedT / 0.15
    : clampedT > 0.85
      ? (1 - clampedT) / 0.15
      : 1;
  const speed = plan.maxSpeed * speedFactor;

  // Heading from current interpolated position to destination
  const currentPos: GeoPoint = { lat, lng };
  const head = bearing(currentPos, plan.destination);

  // Battery drain: starts at 100, linearly drops to ~15 at destination
  const battery = Math.max(15, 100 - clampedT * 85);

  return { lat, lng, alt, speed, heading: head, battery };
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
export function createFlightPlan(target: GeoPoint): FlightPlan {
  return {
    origin: { lat: -1.2921, lng: 36.8219 }, // Nairobi base (near KICC)
    destination: target,
    cruiseAltitude: DEFAULT_CRUISE_ALT,
    maxSpeed: DEFAULT_MAX_SPEED,
  };
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
