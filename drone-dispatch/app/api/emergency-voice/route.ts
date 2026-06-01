import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { callWithTools } from "@/app/lib/ai-client";

export const dynamic = "force-dynamic";

interface Product {
  id: string;
  name: string;
  category: string;
  priority_level: string;
  price: number;
}

interface DispatchOutput {
  product_id: string;
  urgency_level: "STANDARD" | "HIGH" | "CRITICAL";
  payload_item: string;
  incident_summary: string;
  location_name: string;
  latitude: number;
  longitude: number;
}

export async function POST(request: Request) {
  const { transcript, coords, userPhone, userName, customerId } = await request.json() as {
    transcript: string;
    coords: { lat: number; lng: number } | null;
    userPhone: string;
    userName: string;
    customerId: string | null;
  };

  if (!transcript?.trim()) {
    return NextResponse.json({ error: "transcript required" }, { status: 400 });
  }

  const fallbackLat = coords?.lat ?? -1.2880;
  const fallbackLng = coords?.lng ?? 36.8220;

  const { data: products } = await supabase
    .from("products")
    .select("id,name,category,priority_level,price")
    .eq("in_stock", true);

  const inventory = (products as Product[]) ?? [];
  const inventoryList = inventory.length > 0
    ? inventory.map(p => `  ${p.id}: ${p.name} (${p.category}, ${p.priority_level})`).join("\n")
    : "  [no inventory available — describe what's needed in payload_item]";

  const systemPrompt = `You are an emergency drone dispatch AI for Nairobi, Kenya.
Parse the caller's voice transcript to dispatch the right medical supply.

COORDINATE RULES:
- If the caller mentions a recognisable Nairobi landmark or area, return its coordinates.
- If the location is ambiguous or not mentioned, return the GPS fallback exactly: lat=${fallbackLat}, lng=${fallbackLng}.
- Never guess wildly — use fallback rather than wrong coordinates.

NAIROBI LANDMARK COORDINATES (lat, lng):
Sarit Centre: -1.2631, 36.8030
Village Market: -1.2259, 36.8055
Westgate Mall: -1.2636, 36.8025
Kenyatta National Hospital: -1.3013, 36.8060
Aga Khan Hospital: -1.2617, 36.8211
Karen Hospital: -1.3215, 36.7121
Nairobi Hospital: -1.2983, 36.7882
MP Shah Hospital: -1.2702, 36.8152
KICC / CBD: -1.2921, 36.8219
Westlands: -1.2684, 36.8078
Parklands: -1.2617, 36.8211
Kilimani: -1.2943, 36.7855
Lavington: -1.2924, 36.7752
Karen: -1.3180, 36.7130
Gigiri / UN: -1.2376, 36.8071
Muthaiga: -1.2517, 36.8438
Eastleigh: -1.2752, 36.8573
South B / South C: -1.3100, 36.8330
Industrial Area: -1.3050, 36.8450
Ruaka: -1.2010, 36.7650
Thika Road Mall: -1.2189, 36.8878`;

  const userPrompt = `Emergency call transcript:
"${transcript}"

Caller GPS fallback: ${fallbackLat.toFixed(4)}, ${fallbackLng.toFixed(4)}
Caller name: ${userName || "Unknown"}
Caller phone: ${userPhone || "Unknown"}

Available in-stock inventory:
${inventoryList}`;

  const ai = await callWithTools<DispatchOutput>({
    systemPrompt,
    userPrompt,
    tool: {
      name: "dispatch_emergency",
      description: "Parse the call and create a dispatch order",
      schema: {
        type: "object",
        properties: {
          product_id: {
            type: "string",
            description: "ID from the inventory list. Pick the closest match. Use 'NONE' if nothing fits.",
          },
          urgency_level: {
            type: "string",
            enum: ["STANDARD", "HIGH", "CRITICAL"],
            description: "CRITICAL = life-threatening, HIGH = urgent, STANDARD = routine",
          },
          payload_item: {
            type: "string",
            description: "2-3 word description of what to send (e.g. 'Asthma Inhaler')",
          },
          incident_summary: {
            type: "string",
            description: "One sentence for the admin: what happened and where",
          },
          location_name: {
            type: "string",
            description: "Human-readable location name. Use 'Caller GPS Location' if not identifiable.",
          },
          latitude: {
            type: "number",
            description: `Delivery latitude. Use landmark coords if identifiable, otherwise use fallback ${fallbackLat}.`,
          },
          longitude: {
            type: "number",
            description: `Delivery longitude. Use landmark coords if identifiable, otherwise use fallback ${fallbackLng}.`,
          },
        },
        required: ["product_id", "urgency_level", "payload_item", "incident_summary", "location_name", "latitude", "longitude"],
      },
    },
  });

  const matchedProduct = inventory.find(p => p.id === ai.product_id);

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      customer_id: customerId || null,
      status: "PENDING",
      is_emergency: true,
      total_price: matchedProduct?.price ?? 0,
      delivery_lat: ai.latitude,
      delivery_lng: ai.longitude,
      delivery_phone: userPhone || "",
      notes: transcript.substring(0, 500),
    })
    .select()
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: orderErr?.message || "Failed to create order" }, { status: 500 });
  }

  if (matchedProduct) {
    await supabase.from("order_items").insert({
      order_id: order.id,
      product_id: matchedProduct.id,
      product_name: matchedProduct.name,
      quantity: 1,
      price: matchedProduct.price,
    });
  }

  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .insert({
      customer_name: userName || "Emergency Caller",
      customer_phone: userPhone || "",
      payload_item: ai.payload_item,
      urgency_level: ai.urgency_level,
      incident_summary: ai.incident_summary,
      latitude: ai.latitude,
      longitude: ai.longitude,
      status: "PENDING",
      order_id: order.id,
      call_transcript: transcript,
    })
    .select()
    .single();

  if (ticketErr || !ticket) {
    return NextResponse.json({ error: ticketErr?.message || "Failed to create ticket" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    order,
    ticket,
    ai: {
      payloadItem: ai.payload_item,
      urgencyLevel: ai.urgency_level,
      locationName: ai.location_name,
      summary: ai.incident_summary,
    },
  });
}
