import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

export const dynamic = "force-dynamic";

const ALLOWED_COMMANDS = new Set([
  "launch",
  "hold",
  "reroute",
  "return_to_base",
  "land",
  "abort",
]);

const ALLOWED_SOURCES = new Set(["admin", "claude", "system"]);

export async function POST(request: Request) {
  const body = await request.json();
  const {
    ticket_id,
    order_id,
    command,
    source = "admin",
    payload = {},
  } = body;

  if (!ticket_id && !order_id) {
    return NextResponse.json(
      { success: false, error: "ticket_id or order_id is required" },
      { status: 400 }
    );
  }

  if (!command || !ALLOWED_COMMANDS.has(command)) {
    return NextResponse.json(
      { success: false, error: "Unsupported mission command" },
      { status: 400 }
    );
  }

  if (!ALLOWED_SOURCES.has(source)) {
    return NextResponse.json(
      { success: false, error: "Unsupported command source" },
      { status: 400 }
    );
  }

  let ticketQuery = supabase.from("tickets").select("*").limit(1);
  ticketQuery = ticket_id
    ? ticketQuery.eq("id", ticket_id)
    : ticketQuery.eq("order_id", order_id);

  const { data: tickets, error: ticketError } = await ticketQuery;
  const ticket = tickets?.[0];

  if (ticketError || !ticket) {
    return NextResponse.json(
      { success: false, error: ticketError?.message || "Mission ticket not found" },
      { status: 404 }
    );
  }

  const rejection = validateCommand(command, ticket.status);

  const { data: event, error: eventError } = await supabase
    .from("mission_events")
    .insert({
      ticket_id: ticket.id,
      order_id: ticket.order_id,
      command,
      source,
      payload,
      accepted: !rejection,
      reason: rejection,
    })
    .select()
    .single();

  if (eventError) {
    if (isMissingMissionEventsTable(eventError)) {
      const schemaWarning = "mission_events table is missing; apply schema.sql to persist command history.";

      if (rejection) {
        return NextResponse.json(
          { success: false, accepted: false, reason: rejection, warning: schemaWarning },
          { status: 409 }
        );
      }

      return NextResponse.json({
        success: true,
        accepted: true,
        event: null,
        warning: schemaWarning,
      });
    }

    return NextResponse.json(
      { success: false, error: eventError.message },
      { status: 500 }
    );
  }

  if (rejection) {
    return NextResponse.json(
      { success: false, accepted: false, reason: rejection, event },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true, accepted: true, event });
}

function validateCommand(command: string, ticketStatus: string): string | null {
  if (command === "launch" && ticketStatus !== "PENDING") {
    return "Launch is only allowed for pending missions.";
  }

  if (["hold", "reroute", "return_to_base", "land"].includes(command) && ticketStatus !== "IN_FLIGHT") {
    return `${command} is only allowed while the mission is in flight.`;
  }

  if (ticketStatus === "DELIVERED") {
    return "Delivered missions cannot accept new control commands.";
  }

  return null;
}

function isMissingMissionEventsTable(error: { code?: string; message?: string }): boolean {
  const message = error.message?.toLowerCase() ?? "";
  return error.code === "42P01" || error.code === "PGRST205" || message.includes("mission_events");
}
