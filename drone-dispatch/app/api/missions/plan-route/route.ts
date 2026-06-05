import { NextResponse } from "next/server";
import { callWithTools } from "@/app/lib/ai-client";

export const dynamic = "force-dynamic";

const NAIROBI_BOUNDS = { minLng: 36.63, maxLng: 37.1, minLat: -1.45, maxLat: -1.12 };

interface AIWaypoint {
  lat: number;
  lng: number;
  alt: number;
  reason?: string;
}

interface PlanInput {
  altitude: number;
  reason: string;
  avoided_risks: string[];
  confidence: number;
  waypoints: AIWaypoint[];
}

function inNairobi(lat: number, lng: number) {
  return (
    lat >= NAIROBI_BOUNDS.minLat && lat <= NAIROBI_BOUNDS.maxLat &&
    lng >= NAIROBI_BOUNDS.minLng && lng <= NAIROBI_BOUNDS.maxLng
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const { destination, urgency_level, payload_item, current_altitude } = body as {
    destination: { lat: number; lng: number };
    urgency_level: string;
    payload_item: string;
    current_altitude: number;
  };

  if (!destination?.lat || !destination?.lng) {
    return NextResponse.json({ error: "destination required" }, { status: 400 });
  }
  if (!inNairobi(destination.lat, destination.lng)) {
    return NextResponse.json({ error: "destination out of Nairobi airspace" }, { status: 422 });
  }

  const systemPrompt = `You are an AI flight planner for a drone delivery network in Nairobi, Kenya.
Origin (base): -1.2921, 36.8219 (near KICC, Nairobi CBD).

Nairobi airspace zones:
HIGH RISK — avoid overflight:
- CBD / Upperhill: -1.28 to -1.31, 36.81 to 36.83 — dense 30-120m towers
- JKIA approach corridor: -1.31 to -1.36, 36.91 to 36.96 — active controlled airspace

MEDIUM RISK — route around if on or near path:
- Westlands masts: -1.255 to -1.275, 36.80 to 36.81 — telecom masts 60-90m
- Muthaiga / Gigiri: -1.23 to -1.26, 36.83 to 36.86 — embassy restricted zones
- Eastleigh: -1.265 to -1.285, 36.845 to 36.87 — dense residential 20-40m
- South B / South C: -1.305 to -1.33, 36.83 to 36.86 — dense residential 15-30m
- Kileleshwa / Lavington: -1.28 to -1.30, 36.77 to 36.80 — medium-density residential
- Ngong Road corridor: -1.30 to -1.32, 36.76 to 36.80 — surface congestion, signal risk
- Dagoretti / Kawangware: -1.29 to -1.32, 36.73 to 36.77 — dense informal settlement

SAFE CORRIDORS:
- Karen / Langata: -1.33 to -1.37, 36.69 to 36.76 — low residential
- Industrial Area: -1.30 to -1.32, 36.84 to 36.86 — warehouses 10-20m
- Ruaka / Banana Hill: -1.19 to -1.23, 36.79 to 36.83 — semi-urban, open
- Embakasi / Mlolongo: -1.33 to -1.42, 36.93 to 37.02 — industrial, open

Safe cruise altitude: 130-180m, multiples of 5m only.
Propose 2-3 intermediate waypoints routing around hazards.

CRITICAL: In avoided_risks, only list zones that actually intersect or border the straight-line path between this specific origin and destination. Do not list all known hazards — only the ones the route genuinely navigates around for this delivery. If a zone is far from the route, omit it.`;

  const dLat = destination.lat - (-1.2921);
  const dLng = destination.lng - 36.8219;
  const bearingDeg = Math.round(Math.atan2(dLng, -dLat) * (180 / Math.PI) + 360) % 360;
  const cardinal = bearingDeg < 22.5 || bearingDeg >= 337.5 ? "N" : bearingDeg < 67.5 ? "NE" : bearingDeg < 112.5 ? "E" : bearingDeg < 157.5 ? "SE" : bearingDeg < 202.5 ? "S" : bearingDeg < 247.5 ? "SW" : bearingDeg < 292.5 ? "W" : "NW";

  const userPrompt = `Plan this drone delivery:
- Payload: ${payload_item}
- Urgency: ${urgency_level}
- Origin: -1.2921, 36.8219
- Destination: ${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)} (bearing ${bearingDeg}° ${cardinal} from origin)
- Requested cruise altitude: ${current_altitude}m

Based on the bearing and destination coordinates, identify which specific zones lie on or near this route, then propose intermediate waypoints that avoid those zones only.`;

  const raw = await callWithTools<PlanInput>({
    systemPrompt,
    userPrompt,
    tool: {
      name: "propose_flight_plan",
      description: "Propose a validated flight plan with intermediate waypoints",
      schema: {
        type: "object",
        properties: {
          altitude: { type: "number", description: "Recommended cruise altitude in meters (130-180, multiples of 5)" },
          reason: { type: "string", description: "One sentence summary of the routing strategy" },
          avoided_risks: {
            type: "array",
            items: { type: "string" },
            description: "Up to 3 specific hazards the route avoids",
          },
          confidence: { type: "number", description: "Confidence score 0-100" },
          waypoints: {
            type: "array",
            items: {
              type: "object",
              properties: {
                lat: { type: "number", description: "Latitude (-1.45 to -1.12)" },
                lng: { type: "number", description: "Longitude (36.63 to 37.1)" },
                alt: { type: "number", description: "Altitude in meters (130-180)" },
                reason: { type: "string", description: "Why this waypoint is placed here" },
              },
              required: ["lat", "lng", "alt"],
            },
            description: "2-3 intermediate waypoints in order from origin to destination",
          },
        },
        required: ["altitude", "reason", "avoided_risks", "confidence", "waypoints"],
      },
    },
  });

  const altitude = Math.max(60, Math.min(180, Math.round(raw.altitude / 5) * 5));
  const waypoints = (raw.waypoints ?? [])
    .slice(0, 3)
    .filter(wp => inNairobi(wp.lat, wp.lng) && wp.alt >= 60 && wp.alt <= 180)
    .map(wp => ({ lat: wp.lat, lng: wp.lng, alt: Math.round(wp.alt / 5) * 5, reason: wp.reason ?? "" }));

  const validated = raw.altitude >= 60 && raw.altitude <= 180 && waypoints.length >= 1;

  return NextResponse.json({
    altitude,
    reason: raw.reason,
    avoided_risks: (raw.avoided_risks ?? []).slice(0, 3),
    confidence: Math.max(0, Math.min(100, Math.round(raw.confidence))),
    waypoints,
    validated,
  });
}
