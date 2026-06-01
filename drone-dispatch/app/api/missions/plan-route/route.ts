import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: `You are an AI flight planner for a drone delivery network in Nairobi, Kenya.
Origin (base): -1.2921, 36.8219 (near KICC, Nairobi CBD).
Nairobi geography context:
- CBD / Upperhill: -1.28 to -1.31, 36.81 to 36.83 — dense 30-120m towers, avoid direct overflight
- Westlands: -1.265, 36.803 — telecom masts 60-90m, route around if heading NW
- Karen / Langata: -1.33 to -1.37, 36.69 to 36.76 — low residential, safe corridor
- Eastleigh / Parklands: -1.26 to -1.28, 36.84 to 36.86 — medium density, 20-40m buildings
- Industrial Area: -1.30 to -1.32, 36.84 to 36.86 — warehouses 10-20m, good corridor
Safe cruise altitude range: 60-180m. Multiples of 5m only.
Propose 2-3 intermediate waypoints that route around hazards. Each waypoint is a real geographic location in Nairobi.`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Plan this drone delivery:
- Payload: ${payload_item}
- Urgency: ${urgency_level}
- Origin: -1.2921, 36.8219
- Destination: ${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}
- Requested cruise altitude: ${current_altitude}m

Propose an intermediate waypoint route that avoids the main hazard corridors, with a recommended cruise altitude.`,
      },
    ],
    tools: [
      {
        name: "propose_flight_plan",
        description: "Propose a validated flight plan with intermediate waypoints",
        input_schema: {
          type: "object" as const,
          properties: {
            altitude: {
              type: "number",
              description: "Recommended cruise altitude in meters (60-180, multiples of 5)",
            },
            reason: {
              type: "string",
              description: "One sentence summary of the routing strategy",
            },
            avoided_risks: {
              type: "array",
              items: { type: "string" },
              description: "Up to 3 specific hazards the route avoids",
            },
            confidence: {
              type: "number",
              description: "Confidence score 0-100",
            },
            waypoints: {
              type: "array",
              items: {
                type: "object" as const,
                properties: {
                  lat: { type: "number", description: "Latitude (-1.45 to -1.12)" },
                  lng: { type: "number", description: "Longitude (36.63 to 37.1)" },
                  alt: { type: "number", description: "Altitude in meters (60-180)" },
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
    ],
    tool_choice: { type: "tool", name: "propose_flight_plan" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ error: "No plan generated" }, { status: 500 });
  }

  const raw = toolUse.input as PlanInput;
  const altitude = Math.max(60, Math.min(180, Math.round(raw.altitude / 5) * 5));

  const waypoints = (raw.waypoints ?? [])
    .slice(0, 3)
    .filter((wp) => inNairobi(wp.lat, wp.lng) && wp.alt >= 60 && wp.alt <= 180)
    .map((wp) => ({
      lat: wp.lat,
      lng: wp.lng,
      alt: Math.round(wp.alt / 5) * 5,
      reason: wp.reason ?? "",
    }));

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
