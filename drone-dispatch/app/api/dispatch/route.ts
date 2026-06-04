import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { callWithTools } from '@/app/lib/ai-client';

export const dynamic = 'force-dynamic';

interface TicketOutput {
  urgency_level: string;
  payload_item: string;
  incident_summary: string;
  target_coordinates: { lat: number; lng: number };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { profile, gpsLocation, message } = body;

    const systemPrompt = `You are the central AI dispatcher for a drone delivery network in Nairobi.
Analyze the customer's emergency request. Extract the payload needed, determine the urgency,
and output a structured JSON ticket.`;

    const userPrompt = `Customer: ${profile.name} (${profile.phone})
GPS: ${gpsLocation.lat}, ${gpsLocation.lng}
Request: "${message}"`;

    const ticketData = await callWithTools<TicketOutput>({
      systemPrompt,
      userPrompt,
      tool: {
        name: "generate_flight_ticket",
        description: "Generates the logistics ticket for the Admin to review.",
        schema: {
          type: "object",
          properties: {
            urgency_level: {
              type: "string",
              enum: ["STANDARD", "HIGH", "CRITICAL"],
              description: "Critical for medical/life-threatening, High for urgent supplies, Standard for normal.",
            },
            payload_item: {
              type: "string",
              description: "A short 2-3 word description of the item to be flown (e.g., 'Asthma Inhaler', 'Blood Bags').",
            },
            incident_summary: {
              type: "string",
              description: "A clean, 1-sentence summary of the situation for the Admin.",
            },
            target_coordinates: {
              type: "object",
              properties: {
                lat: { type: "number" },
                lng: { type: "number" },
              },
              required: ["lat", "lng"],
            },
          },
          required: ["urgency_level", "payload_item", "incident_summary", "target_coordinates"],
        },
      },
    });

    const { error: dbError } = await supabase.from('tickets').insert([{
      customer_name: profile.name,
      customer_phone: profile.phone,
      payload_item: ticketData.payload_item,
      urgency_level: ticketData.urgency_level,
      incident_summary: ticketData.incident_summary,
      latitude: ticketData.target_coordinates.lat,
      longitude: ticketData.target_coordinates.lng,
      status: 'PENDING',
    }]);

    if (dbError) throw new Error("Failed to save ticket to database");

    return NextResponse.json({ success: true, ticket: ticketData });

  } catch (err: unknown) {
    console.error("Dispatch API Error:", err);
    return NextResponse.json({ success: false, error: "AI Dispatch Failed" }, { status: 500 });
  }
}
