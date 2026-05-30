import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase'; // Import your Supabase client

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: Request) {
    try{
        const body = await request.json();
        const { profile, gpsLocation, message } = body;

        const systemPrompt = `You are the central AI dispatcher for a drone delivery network in Nairobi. 
        Analyze the customer's emergency request. Extract the payload needed, determine the urgency, 
        and output a structured JSON ticket.`;

        const userPrompt = `
            Customer: ${profile.name} (${profile.phone})
            GPS: ${gpsLocation.lat}, ${gpsLocation.lng}
            Request: "${message}"
        `;

        const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            tools: [
                {
                    name: "generate_flight_ticket",
                    description: "Generates the logistics ticket for the Admin to review.",
                    input_schema: {
                        type: "object",
                        properties: {
                            urgency_level: { 
                                type: "string", 
                                enum: ["STANDARD", "HIGH", "CRITICAL"],
                                description: "Critical for medical/life-threatening, High for urgent supplies, Standard for normal."
                            },
                            payload_item: { 
                                type: "string", 
                                description: "A short 2-3 word description of the item to be flown (e.g., 'Asthma Inhaler', 'Blood Bags')." 
                            },
                            incident_summary: { 
                                type: "string", 
                                description: "A clean, 1-sentence summary of the situation for the Admin." 
                            },
                            target_coordinates: {
                                type: "object",
                                properties: {
                                    lat: { type: "number" },
                                    lng: { type: "number" }
                                }
                            }
                        },
                        required: ["urgency_level", "payload_item", "incident_summary", "target_coordinates"]
                    }
                }
            ],
            tool_choice: { type: "tool", name: "generate_flight_ticket" }
        });

        const toolUseBlock = response.content.find(block => block.type === 'tool_use');

        if (toolUseBlock && toolUseBlock.type === 'tool_use') {
            // Typecast Claude's output so TypeScript knows exactly what it is
            const ticketData = toolUseBlock.input as {
                urgency_level: string;
                payload_item: string;
                incident_summary: string;
                target_coordinates: { lat: number; lng: number };
            };
            
            console.log("Claude generated ticket, saving to Supabase...");
            
            // ── THE MISSING PIECE: INSERT INTO DATABASE ──
            const { error: dbError } = await supabase
                .from('tickets')
                .insert([
                    {
                        customer_name: profile.name,
                        customer_phone: profile.phone,
                        payload_item: ticketData.payload_item,
                        urgency_level: ticketData.urgency_level,
                        incident_summary: ticketData.incident_summary,
                        latitude: ticketData.target_coordinates.lat,
                        longitude: ticketData.target_coordinates.lng,
                        status: 'PENDING'
                    }
                ]);

            // If Supabase rejects the insert, catch it before telling the client it succeeded
            if (dbError) {
                console.error("Supabase Insert Error:", dbError);
                throw new Error("Failed to save ticket to database");
            }

            return NextResponse.json({ success: true, ticket: ticketData });
        }

        throw new Error("Claude failed to generate a structured ticket.");

    } catch(err: any) {
        console.error("Dispatch API Error:", err);
        return NextResponse.json({ success: false, error: "AI Dispatch Failed" }, { status: 500 });
    }
}