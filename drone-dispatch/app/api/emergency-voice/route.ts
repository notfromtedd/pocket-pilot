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

-- HOSPITALS --
Kenyatta National Hospital: -1.3013, 36.8060
Aga Khan Hospital: -1.2617, 36.8211
Karen Hospital: -1.3215, 36.7121
Nairobi Hospital: -1.2983, 36.7882
MP Shah Hospital: -1.2702, 36.8152
Mater Hospital: -1.3059, 36.8470
Gertrude's Children Hospital: -1.2562, 36.8378
Coptic Hospital: -1.2815, 36.8037
Avenue Hospital: -1.2930, 36.7882
Strathmore University Health: -1.3077, 36.8115

-- HOTELS --
Serena Hotel: -1.2871, 36.8140
Fairmont The Norfolk: -1.2823, 36.8197
Villa Rosa Kempinski: -1.2683, 36.8052
Tribe Hotel Gigiri: -1.2260, 36.8059
Safari Park Hotel: -1.2186, 36.8977
Hemingways Nairobi Karen: -1.3207, 36.7136
Crowne Plaza Upper Hill: -1.2989, 36.7793
Ole Sereni Mombasa Road: -1.3309, 36.8490
Radisson Blu Upper Hill: -1.2803, 36.8119
House of Waine Karen: -1.3260, 36.7091

-- RESTAURANTS & BARS --
Carnivore Restaurant: -1.3326, 36.7831
Talisman Restaurant Karen: -1.3173, 36.7143
The Alchemist Westlands: -1.2686, 36.7981
Tamarind Westlands: -1.2660, 36.7973
Nyama Mama Westlands: -1.2695, 36.7841
The Rusty Nail Karen: -1.3200, 36.7121
Brew Bistro Westlands: -1.2668, 36.8012
Lord Erroll Runda: -1.2011, 36.8071
Osteria del Chianti Lavington: -1.2895, 36.7803
Mediterraneo Westlands: -1.2647, 36.8018
Artcaffe Westlands: -1.2672, 36.8048
Java House Junction: -1.2994, 36.7762
K'Osewe Ranalo Foods: -1.2835, 36.8295

-- MALLS & SHOPPING --
Sarit Centre: -1.2631, 36.8030
Village Market: -1.2259, 36.8055
Westgate Mall: -1.2636, 36.8025
Two Rivers Mall: -1.1904, 36.8025
The Hub Karen: -1.3285, 36.7079
Junction Mall: -1.2994, 36.7762
Yaya Centre: -1.2963, 36.7826
Garden City Mall: -1.2195, 36.8933
Prestige Plaza: -1.3082, 36.7763
Galleria Mall Langata: -1.3385, 36.7695
ABC Place Westlands: -1.2700, 36.8053
Thika Road Mall: -1.2189, 36.8878
T-Mall Langata: -1.3240, 36.7725
Capital Centre South B: -1.3091, 36.8321

-- AREAS & NEIGHBOURHOODS --
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
Langata: -1.3350, 36.7780
Runda: -1.1970, 36.8030
Ridgeways: -1.2240, 36.8430
Kileleshwa: -1.2870, 36.7790
Spring Valley: -1.2590, 36.7890
Riverside Drive: -1.2741, 36.7985
Lower Kabete: -1.2480, 36.7610
Kitisuru: -1.2390, 36.7830
Loresho: -1.2540, 36.7710
Rongai: -1.3990, 36.7450
Syokimau: -1.3650, 36.8910
Embakasi: -1.3190, 36.8980
Kasarani: -1.2210, 36.8990
Buruburu: -1.2990, 36.8680

-- LANDMARKS & INSTITUTIONS --
Nairobi National Museum: -1.2734, 36.8126
Giraffe Centre: -1.3722, 36.7557
Nairobi Arboretum: -1.2779, 36.7979
Uhuru Park: -1.2895, 36.8200
City Park Parklands: -1.2582, 36.8280
Nairobi Railway Station: -1.2976, 36.8275
Wilson Airport: -1.3219, 36.8147
JKIA: -1.3192, 36.9275
Nairobi National Park Gate: -1.3557, 36.8492
Karen Blixen Museum: -1.3554, 36.7059
Bomas of Kenya: -1.3468, 36.7598
City Hall: -1.2855, 36.8233
University of Nairobi: -1.2793, 36.8163
Kenyatta University: -1.1792, 36.9336
USIU Kasarani: -1.2191, 36.8826
Strathmore University: -1.3077, 36.8115
US Embassy Gigiri: -1.2283, 36.8082`;

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
