import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

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
            // Force Claude to use this exact structure
            tool_choice: { type: "tool", name: "generate_flight_ticket" }
    });


    const toolUseBlock = response.content.find(block => block.type === 'tool_use');

    if (toolUseBlock && toolUseBlock.type === 'tool_use') {
        const ticketData = toolUseBlock.input;
        console.log("Claude generated ticket:", ticketData);
        
        // In the next step, we will save this to a database for the Admin to see.
        // For now, we return it to the frontend successfully.
        return NextResponse.json({ success: true, ticket: ticketData });
    }

    throw new Error("Claude failed to generate a structured ticket.");

    }catch(err: any){
        console.error("Dispatch API Error:", err);
        return NextResponse.json({ success: false, error: "AI Dispatch Failed" }, { status: 500 });
    }
}