"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabase";
import {
  createFlightPlan, createRoutePathFromWaypoints, haversineDistance, interpolatePosition, remainingDistance,
  isWithinSMSRange, formatDistance, formatTime,
  type FlightPhase, type FlightPlan, type RoutePoint,
} from "../lib/simulator";
import { DEFAULT_DRONE_ID, DRONE_FLEET, type DroneFleetUnit } from "../lib/fleet";
import ProductManager from "../components/ProductManager";
import PurchaseLogPanel from "../components/PurchaseLogPanel";
import RevenuePanel from "../components/RevenuePanel";

const FPVMap = dynamic(() => import("../components/FPVMap"), { ssr: false });

interface Ticket {
  id: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  payload_item: string;
  urgency_level: string;
  incident_summary: string;
  latitude: number;
  longitude: number;
  status: string;
  sms_sent?: boolean;
  drone_id?: string;
  order_id?: string;
  call_transcript?: string;
}

type DroneState = "IDLE" | "AIRBORNE" | "DELIVERED" | "RETURNING" | "OVERRIDE";
type AdminTab = "dispatch" | "products" | "orders" | "revenue";
type UrgencyLevel = "STANDARD" | "HIGH" | "CRITICAL";
type AIWaypoint = { lat: number; lng: number; alt: number; reason?: string };
type AIPlan = { altitude: number; reason: string; avoided_risks: string[]; confidence: number; validated: boolean; waypoints: AIWaypoint[] };
type FleetDisplayState = "IDLE" | "ASSIGNED" | "AIRBORNE" | "DELIVERED" | "RETURNING" | "OVERRIDE";
type CameraMode = "free" | "follow" | "chase";

interface DroneTelemetryRow {
  ticket_id?: string;
  order_id?: string;
  drone_id?: string;
  lat: number;
  lng: number;
  alt?: number;
  battery?: number;
  speed?: number;
  heading?: number;
  phase?: FlightPhase;
  active_waypoint_index?: number;
  route_path?: RoutePoint[];
  updated_at?: string;
}

interface MissionSimulation {
  interval: ReturnType<typeof setInterval>;
  timer: ReturnType<typeof setInterval>;
  droneId: string;
}

const TELEMETRY_UPDATE_MS = 250;
const TELEMETRY_DB_UPDATE_MS = 1000;
const SIMULATION_TIME_SCALE = 2;
const DEFAULT_FOLLOW_ZOOM = 17.0;
const DEFAULT_DEMO_CRUISE_ALTITUDE = 140;

function estimateProgressFromTelemetry(
  routePath: RoutePoint[],
  activeWaypointIndex: number,
  position: { lat: number; lng: number },
): number {
  if (routePath.length < 2) return 0;
  const segCount = routePath.length - 1;
  // activeWaypointIndex = segIndex + 1 (from sampleRoute in simulator)
  const segIndex = Math.min(Math.max(0, activeWaypointIndex - 1), segCount - 1);
  const a = routePath[segIndex];
  const b = routePath[Math.min(segIndex + 1, routePath.length - 1)];
  const ax = b.lng - a.lng;
  const ay = b.lat - a.lat;
  const segLenSq = ax * ax + ay * ay;
  const localT = segLenSq > 0
    ? Math.max(0, Math.min(1, ((position.lng - a.lng) * ax + (position.lat - a.lat) * ay) / segLenSq))
    : 0;
  // Cap at 0.98 so the completion branch doesn't fire immediately on resume
  return Math.min(0.98, (segIndex + localT) / segCount);
}

function getDroneBasePosition(droneId: string) {
  const drone = DRONE_FLEET.find((unit) => unit.id === droneId) ?? DRONE_FLEET[0];
  return { lat: drone.baseLat, lng: drone.baseLng, alt: 0 };
}

function getFleetState(
  ticket: Ticket | undefined,
  activeDroneId: string,
  droneId: string,
  activeState: DroneState,
  telemetry?: DroneTelemetryRow,
): FleetDisplayState {
  if (activeDroneId === droneId && activeState === "OVERRIDE") return "OVERRIDE";
  if (telemetry?.phase === "RETURNING") return "RETURNING";
  if (!ticket) return "IDLE";
  if (ticket.status === "DELIVERED") return "DELIVERED";
  if (ticket.status === "IN_FLIGHT") return "AIRBORNE";
  return "ASSIGNED";
}

function sortTicketsByUrgency(items: Ticket[]) {
  const urgencyOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, STANDARD: 2 };
  return [...items].sort((a, b) => (urgencyOrder[a.urgency_level] ?? 2) - (urgencyOrder[b.urgency_level] ?? 2));
}

export default function AdminControlCenter() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [adminTab, setAdminTab] = useState<AdminTab>("dispatch");
  const [selectedDroneId, setSelectedDroneId] = useState(DEFAULT_DRONE_ID);
  const [fleetTelemetry, setFleetTelemetry] = useState<Record<string, DroneTelemetryRow>>({});

  const [droneState, setDroneState] = useState<DroneState>("IDLE");
  const [dronePosition, setDronePosition] = useState({ lat: -1.2921, lng: 36.8219, alt: 0 });
  const [flightProgress, setFlightProgress] = useState(0);
  const [battery, setBattery] = useState(100);
  const [flightLogs, setFlightLogs] = useState<string[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<FlightPhase>("LAUNCH");
  const [currentHeading, setCurrentHeading] = useState(0);
  const [activeWaypointIndex, setActiveWaypointIndex] = useState(0);
  const [routePath, setRoutePath] = useState<RoutePoint[]>([]);
  const [followZoom, setFollowZoom] = useState(DEFAULT_FOLLOW_ZOOM);
  const [demoCruiseAltitude, setDemoCruiseAltitude] = useState(DEFAULT_DEMO_CRUISE_ALTITUDE);
  const [cameraMode, setCameraMode] = useState<CameraMode>("free");
  const [mapFocusKey, setMapFocusKey] = useState(0);
  const [aiPlan, setAiPlan] = useState<AIPlan | null>(null);
  const [aiPlanLoading, setAiPlanLoading] = useState(false);
  const [isAiRoute, setIsAiRoute] = useState(false);
  const [aiPlanModalOpen, setAiPlanModalOpen] = useState(false);

  const simulationsRef = useRef<Record<string, MissionSimulation>>({});
  const selectedTicketRef = useRef<Ticket | null>(null);
  const selectedDroneIdRef = useRef(selectedDroneId);
  const smsSentRef = useRef<Record<string, boolean>>({});
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [flightLogs]);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    setFlightLogs((prev) => [...prev, `[${ts}] ${msg}`]);
  }, []);

  useEffect(() => { selectedTicketRef.current = selectedTicket; }, [selectedTicket]);
  useEffect(() => { selectedDroneIdRef.current = selectedDroneId; }, [selectedDroneId]);

  const clearSimulation = useCallback((ticketId: string) => {
    const simulation = simulationsRef.current[ticketId];
    if (!simulation) return;
    clearInterval(simulation.interval);
    clearInterval(simulation.timer);
    delete simulationsRef.current[ticketId];
  }, []);

  // ── Supabase realtime ──
  useEffect(() => {
    const fetchQueue = async () => {
      const { data } = await supabase
        .from("tickets")
        .select("*")
        .in("status", ["PENDING", "IN_FLIGHT"])
        .order("created_at", { ascending: false });
      const sorted = sortTicketsByUrgency((data ?? []) as Ticket[]);
      setTickets(sorted);
      setSelectedTicket((curr) => curr ?? sorted[0] ?? null);
    };
    fetchQueue();

    const channel = supabase
      .channel("admin-queue")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tickets" }, (payload) => {
        const t = payload.new as Ticket;
        setTickets((prev) => {
          const without = prev.filter((ticket) => ticket.id !== t.id);
          return sortTicketsByUrgency([t, ...without]);
        });
        setSelectedTicket((curr) => curr ?? t);
        addLog(`📥 New dispatch: ${t.payload_item} → ${t.customer_name}`);
        if (t.urgency_level === "CRITICAL") addLog(`🚨 EMERGENCY — Priority escalated!`);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedTicket?.drone_id) return;
    const syncDrone = window.setTimeout(() => {
      setSelectedDroneId(selectedTicket.drone_id as string);
    }, 0);
    return () => { window.clearTimeout(syncDrone); };
  }, [selectedTicket?.drone_id]);

  useEffect(() => {
    const fetchFleetTelemetry = async () => {
      const { data } = await supabase
        .from("drone_telemetry")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100);

      if (!data) return;

      const grouped: Record<string, DroneTelemetryRow> = {};
      (data as DroneTelemetryRow[]).forEach((row) => {
        if (row.drone_id && !grouped[row.drone_id]) grouped[row.drone_id] = row;
      });
      setFleetTelemetry(grouped);
    };

    fetchFleetTelemetry();

    const channel = supabase
      .channel("admin-fleet-telemetry")
      .on("postgres_changes", { event: "*", schema: "public", table: "drone_telemetry" }, (payload) => {
        const row = payload.new as DroneTelemetryRow;
        if (!row?.drone_id) return;
        setFleetTelemetry((prev) => ({ ...prev, [row.drone_id as string]: row }));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tickets" }, (payload) => {
        const updatedTicket = payload.new as Ticket;
        setTickets((prev) => {
          const without = prev.filter((ticket) => ticket.id !== updatedTicket.id);
          if (updatedTicket.status === "DELIVERED") return without;
          return sortTicketsByUrgency([updatedTicket, ...without]);
        });
        setSelectedTicket((curr) => curr?.id === updatedTicket.id ? updatedTicket : curr);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const applyTelemetry = useCallback((t: {
    drone_id?: string;
    lat: number;
    lng: number;
    alt?: number;
    battery?: number;
    speed?: number;
    heading?: number;
    phase?: FlightPhase;
    active_waypoint_index?: number;
    route_path?: RoutePoint[];
  }) => {
    if (!t.lat || !t.lng) return;
    if (t.drone_id) setSelectedDroneId(t.drone_id);
    setDronePosition({ lat: t.lat, lng: t.lng, alt: t.alt ?? 0 });
    setBattery(t.battery ?? 100);
    setCurrentSpeed(t.speed ?? 0);
    setCurrentHeading(t.heading ?? 0);
    setActiveWaypointIndex(t.active_waypoint_index ?? 0);
    if (Array.isArray(t.route_path) && t.route_path.length > 0) setRoutePath(t.route_path);
    if (t.phase) {
      setCurrentPhase(t.phase);
      if (t.phase === "RETURNING") setDroneState("RETURNING");
      else if (t.phase === "DELIVERED") setDroneState("DELIVERED");
      else setDroneState("AIRBORNE");
    }
  }, []);

  const launchSimulationLoop = useCallback((ticket: Ticket, plan: FlightPlan, initialProgress: number) => {
    clearSimulation(ticket.id);

    const activeDroneId = ticket.drone_id || selectedDroneId || DEFAULT_DRONE_ID;
    const base = getDroneBasePosition(activeDroneId);
    const isViewingMission = () => selectedTicketRef.current?.id === ticket.id || (
      selectedDroneIdRef.current === activeDroneId && !selectedTicketRef.current
    );
    const mirrorTelemetry = (
      telemetry: DroneTelemetryRow,
      state: DroneState,
      progressPct: number,
      path: RoutePoint[],
    ) => {
      setFleetTelemetry((prev) => ({ ...prev, [activeDroneId]: telemetry }));
      if (!isViewingMission()) return;
      setDronePosition({ lat: telemetry.lat, lng: telemetry.lng, alt: telemetry.alt ?? 0 });
      setFlightProgress(progressPct);
      setBattery(telemetry.battery ?? 100);
      setCurrentSpeed(telemetry.speed ?? 0);
      setCurrentHeading(telemetry.heading ?? 0);
      setCurrentPhase(telemetry.phase ?? "LAUNCH");
      setActiveWaypointIndex(telemetry.active_waypoint_index ?? 0);
      setRoutePath(path);
      setDroneState(state);
    };
    const writeTelemetry = (telemetry: DroneTelemetryRow) => {
      supabase.from("drone_telemetry").upsert({
        ticket_id: ticket.id,
        order_id: ticket.order_id,
        drone_id: activeDroneId,
        lat: telemetry.lat,
        lng: telemetry.lng,
        alt: telemetry.alt,
        battery: telemetry.battery,
        speed: telemetry.speed,
        heading: telemetry.heading,
        phase: telemetry.phase,
        active_waypoint_index: telemetry.active_waypoint_index,
        route_path: telemetry.route_path,
        updated_at: new Date().toISOString(),
      }, { onConflict: "ticket_id" }).then(({ error }) => {
        if (error) console.error("Telemetry update failed:", error);
      });
    };

    setSelectedDroneId(activeDroneId);
    setRoutePath(plan.routePath);

    let outboundProgress = initialProgress;
    let returnProgress = 0;
    let lastTelemetryWrite = 0;
    let lastPhase: FlightPhase | null = null;
    const loggedMilestones = new Set<number>();
    [25, 50, 75].forEach((m) => { if (Math.round(outboundProgress * 100) >= m) loggedMilestones.add(m); });

    const timer = setInterval(() => {
      if (isViewingMission()) setElapsedTime((t) => t + 1);
    }, 1000);

    const startReturnToBase = () => {
      addLog(`↩ ${activeDroneId} returning to base.`);
      const returnPlan = createFlightPlan(
        { lat: base.lat, lng: base.lng },
        {
          origin: plan.destination,
          urgencyLevel: "STANDARD",
          cruiseAltitude: Math.min(90, plan.cruiseAltitude),
          maxSpeed: Math.max(42, Math.round(plan.maxSpeed * 0.72)),
        },
      );
      const returnSeconds = Math.max(
        28,
        haversineDistance(returnPlan.origin, returnPlan.destination) / (returnPlan.maxSpeed * 1000 / 3600),
      );

      const returnInterval = setInterval(() => {
        returnProgress += ((TELEMETRY_UPDATE_MS / 1000) * SIMULATION_TIME_SCALE) / returnSeconds;
        if (returnProgress > 1) returnProgress = 1;

        const vec = interpolatePosition(returnPlan, returnProgress);
        const telemetry: DroneTelemetryRow = {
          ticket_id: ticket.id,
          order_id: ticket.order_id,
          drone_id: activeDroneId,
          lat: vec.lat,
          lng: vec.lng,
          alt: vec.alt,
          battery: Math.round(Math.max(vec.battery, 35)),
          speed: Math.round(vec.speed),
          heading: Math.round(vec.heading),
          phase: returnProgress >= 1 ? "DELIVERED" : "RETURNING",
          active_waypoint_index: vec.activeWaypointIndex,
          route_path: returnPlan.routePath,
          updated_at: new Date().toISOString(),
        };

        mirrorTelemetry(telemetry, returnProgress >= 1 ? "IDLE" : "RETURNING", Math.max(0, 100 - Math.round(returnProgress * 100)), returnPlan.routePath);

        const now = Date.now();
        if (now - lastTelemetryWrite >= TELEMETRY_DB_UPDATE_MS || returnProgress >= 1) {
          lastTelemetryWrite = now;
          writeTelemetry(returnProgress >= 1 ? { ...telemetry, lat: base.lat, lng: base.lng, alt: 0, speed: 0 } : telemetry);
        }

        if (returnProgress >= 1) {
          clearSimulation(ticket.id);
          addLog(`⌂ ${activeDroneId} docked at base.`);
          if (isViewingMission()) {
            setDronePosition(base);
            setCurrentSpeed(0);
            setCurrentPhase("DELIVERED");
            setDroneState("IDLE");
            setFlightProgress(0);
          }
        }
      }, TELEMETRY_UPDATE_MS);

      simulationsRef.current[ticket.id] = { interval: returnInterval, timer, droneId: activeDroneId };
    };

    const estimatedFlightSeconds = Math.max(
      35,
      haversineDistance(plan.origin, plan.destination) / (plan.maxSpeed * 1000 / 3600),
    );

    const outboundInterval = setInterval(async () => {
      outboundProgress += ((TELEMETRY_UPDATE_MS / 1000) * SIMULATION_TIME_SCALE) / estimatedFlightSeconds;
      if (outboundProgress > 1) outboundProgress = 1;

      const vec = interpolatePosition(plan, outboundProgress);
      const dist = remainingDistance({ lat: vec.lat, lng: vec.lng }, plan.destination);
      const telemetry: DroneTelemetryRow = {
        ticket_id: ticket.id,
        order_id: ticket.order_id,
        drone_id: activeDroneId,
        lat: vec.lat,
        lng: vec.lng,
        alt: vec.alt,
        battery: Math.round(vec.battery),
        speed: Math.round(vec.speed),
        heading: Math.round(vec.heading),
        phase: vec.phase,
        active_waypoint_index: vec.activeWaypointIndex,
        route_path: plan.routePath,
        updated_at: new Date().toISOString(),
      };
      const pct = Math.round(outboundProgress * 100);

      mirrorTelemetry(telemetry, outboundProgress >= 1 ? "DELIVERED" : "AIRBORNE", pct, plan.routePath);

      const now = Date.now();
      if (now - lastTelemetryWrite >= TELEMETRY_DB_UPDATE_MS || outboundProgress >= 1) {
        lastTelemetryWrite = now;
        writeTelemetry(telemetry);
      }

      [25, 50, 75].forEach((milestone) => {
        if (pct >= milestone && !loggedMilestones.has(milestone)) {
          loggedMilestones.add(milestone);
          addLog(`📍 ${milestone}% — ${milestone === 75 ? "Descent approach" : milestone === 50 ? "Cruise corridor" : "Climb corridor"}`);
        }
      });

      if (vec.phase !== lastPhase) {
        lastPhase = vec.phase;
        addLog(`🛰️ ${activeDroneId} phase — ${vec.phase}`);
      }

      if (!smsSentRef.current[ticket.id] && isWithinSMSRange({ lat: vec.lat, lng: vec.lng }, plan.destination)) {
        smsSentRef.current[ticket.id] = true;
        addLog(`📱 SMS triggered — ${Math.round(dist)}m from target`);
        fetch("/api/send-sms", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: ticket.customer_phone, customerName: ticket.customer_name, ticketId: ticket.id, distanceMeters: dist }),
        }).catch(console.error);
        await supabase.from("tickets").update({ sms_sent: true }).eq("id", ticket.id);
      }

      if (outboundProgress >= 1) {
        clearInterval(outboundInterval);
        addLog("✅ Payload delivered.");
        await supabase.from("tickets").update({ status: "DELIVERED" }).eq("id", ticket.id);
        setSelectedTicket((curr) => curr?.id === ticket.id ? { ...curr, status: "DELIVERED" } : curr);
        if (ticket.order_id) {
          await supabase.from("orders").update({ status: "DELIVERED" }).eq("id", ticket.order_id);
        }
        startReturnToBase();
      }
    }, TELEMETRY_UPDATE_MS);

    simulationsRef.current[ticket.id] = { interval: outboundInterval, timer, droneId: activeDroneId };
  }, [addLog, clearSimulation, selectedDroneId]);

  useEffect(() => {
    if (!selectedTicket) return;

    const fetchLatestTelemetry = async () => {
      const { data } = await supabase
        .from("drone_telemetry")
        .select("*")
        .eq("ticket_id", selectedTicket.id)
        .maybeSingle();

      if (data) {
        const tel = data as {
          drone_id?: string;
          lat: number; lng: number; alt: number; battery: number;
          speed: number; heading: number; phase: FlightPhase;
          active_waypoint_index: number; route_path: RoutePoint[];
        };
        applyTelemetry(tel);
        if (selectedTicket.status === "IN_FLIGHT") {
          setDroneState("AIRBORNE");
          if (!simulationsRef.current[selectedTicket.id] && tel.route_path?.length > 1) {
            smsSentRef.current[selectedTicket.id] = !!selectedTicket.sms_sent;
            const resumeDroneId = selectedTicket.drone_id || tel.drone_id || selectedDroneId || DEFAULT_DRONE_ID;
            const resumeBase = getDroneBasePosition(resumeDroneId);
            setSelectedDroneId(resumeDroneId);
            const resumePlan = createFlightPlan(
              { lat: selectedTicket.latitude, lng: selectedTicket.longitude },
              {
                urgencyLevel: (selectedTicket.urgency_level as UrgencyLevel) || "STANDARD",
                origin: { lat: resumeBase.lat, lng: resumeBase.lng },
              }
            );
            resumePlan.routePath = tel.route_path;
            const progress = estimateProgressFromTelemetry(
              tel.route_path, tel.active_waypoint_index, { lat: tel.lat, lng: tel.lng }
            );
            setFlightProgress(Math.round(progress * 100));
            addLog(`↻ Resumed at ${Math.round(progress * 100)}% — continuing from last position`);
            launchSimulationLoop({ ...selectedTicket, drone_id: resumeDroneId }, resumePlan, progress);
          }
        }
        if (selectedTicket.status === "DELIVERED") setDroneState("DELIVERED");
      } else {
        setDronePosition(getDroneBasePosition(selectedTicket.drone_id || selectedDroneId));
        setBattery(100);
        setCurrentSpeed(0);
        setCurrentHeading(0);
        setActiveWaypointIndex(0);
        setRoutePath([]);
        setCurrentPhase("LAUNCH");
        setDroneState(selectedTicket.status === "IN_FLIGHT" ? "AIRBORNE" : selectedTicket.status === "DELIVERED" ? "DELIVERED" : "IDLE");
      }
    };

    fetchLatestTelemetry();

    const telCh = supabase
      .channel(`admin-telemetry-${selectedTicket.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "drone_telemetry",
          filter: `ticket_id=eq.${selectedTicket.id}`,
        },
        (payload) => {
          applyTelemetry(payload.new as {
            lat: number;
            lng: number;
            alt: number;
            battery: number;
            speed: number;
            heading: number;
            phase: FlightPhase;
            active_waypoint_index: number;
            route_path: RoutePoint[];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(telCh);
    };
  }, [selectedTicket, selectedDroneId, applyTelemetry, launchSimulationLoop, addLog]);

  // ── Flight sim ──
  const handleLaunchVector = useCallback(async () => {
    if (!selectedTicket || selectedTicket.status === "DELIVERED" || droneState === "DELIVERED") return;
    const launchDroneId = selectedTicket.drone_id || selectedDroneId || DEFAULT_DRONE_ID;
    const launchBase = getDroneBasePosition(launchDroneId);
    const busyTicket = tickets.find((ticket) =>
      ticket.drone_id === launchDroneId &&
      ticket.status === "IN_FLIGHT" &&
      ticket.id !== selectedTicket.id
    );
    const returningDrone = fleetTelemetry[launchDroneId]?.phase === "RETURNING";

    if (busyTicket) {
      addLog(`Launch paused - ${launchDroneId} is already assigned to FLT-${busyTicket.id.substring(0, 5).toUpperCase()}`);
      return;
    }
    if (returningDrone) {
      addLog(`Launch paused - ${launchDroneId} is returning to base.`);
      return;
    }

    setSelectedDroneId(launchDroneId);

    const commandRes = await fetch("/api/missions/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticket_id: selectedTicket.id,
        order_id: selectedTicket.order_id,
        command: "launch",
        source: "admin",
        payload: { reset: selectedTicket.status === "IN_FLIGHT", drone_id: launchDroneId },
      }),
    });
    const commandData = await commandRes.json().catch(() => null);
    if (!commandRes.ok || commandData?.accepted === false) {
      addLog(`⚠️ Launch denied — ${commandData?.reason || commandData?.error || "mission command rejected"}`);
      return;
    }

    const resetLaunch = selectedTicket.status === "IN_FLIGHT";
    if (resetLaunch) {
      addLog("↻ Resetting stale in-flight telemetry for demo launch...");
      await supabase.from("drone_telemetry").upsert({
        ticket_id: selectedTicket.id,
        order_id: selectedTicket.order_id,
        drone_id: launchDroneId,
        lat: launchBase.lat,
        lng: launchBase.lng,
        alt: 0,
        battery: 100,
        speed: 0,
        heading: 0,
        phase: "LAUNCH",
        active_waypoint_index: 0,
        route_path: [],
        updated_at: new Date().toISOString(),
      }, { onConflict: "ticket_id" });
    }

    setFlightProgress(0);
    setElapsedTime(0);
    setDronePosition(launchBase);
    setBattery(100);
    setCurrentSpeed(0);
    setCurrentHeading(0);
    setCurrentPhase("LAUNCH");
    setActiveWaypointIndex(0);
    setRoutePath([]);
    setDroneState("AIRBORNE");
    smsSentRef.current[selectedTicket.id] = false;
    addLog(`🚀 Launch vector approved for ${launchDroneId}. Drone ascending...`);

    await supabase.from("tickets").update({ status: "IN_FLIGHT", drone_id: launchDroneId }).eq("id", selectedTicket.id);
    setSelectedTicket((curr) => curr?.id === selectedTicket.id ? { ...curr, status: "IN_FLIGHT", drone_id: launchDroneId } : curr);
    if (selectedTicket.order_id) {
      await supabase.from("orders").update({ status: "IN_FLIGHT" }).eq("id", selectedTicket.order_id);
    }

    const plan = createFlightPlan(
      { lat: selectedTicket.latitude, lng: selectedTicket.longitude },
      {
        urgencyLevel: (selectedTicket.urgency_level as UrgencyLevel) || "STANDARD",
        cruiseAltitude: aiPlan?.validated ? aiPlan.altitude : demoCruiseAltitude,
        origin: { lat: launchBase.lat, lng: launchBase.lng },
      }
    );

    if (aiPlan?.validated && aiPlan.waypoints.length >= 1) {
      plan.routePath = createRoutePathFromWaypoints(plan.origin, aiPlan.waypoints, plan.destination);
      setIsAiRoute(true);
      addLog(`🤖 AI route: ${aiPlan.waypoints.length} waypoints applied`);
    } else {
      setIsAiRoute(false);
      addLog(`↥ Cruise altitude set to ${plan.cruiseAltitude}m.`);
    }

    setCurrentHeading(0);
    launchSimulationLoop({ ...selectedTicket, drone_id: launchDroneId }, plan, 0);
  }, [selectedTicket, selectedDroneId, tickets, fleetTelemetry, droneState, addLog, demoCruiseAltitude, aiPlan, launchSimulationLoop]);

  useEffect(() => {
    const simulations = simulationsRef.current;
    return () => {
      Object.values(simulations).forEach((simulation) => {
        clearInterval(simulation.interval);
        clearInterval(simulation.timer);
      });
    };
  }, []);

  useEffect(() => {
    const resetPlan = window.setTimeout(() => { setAiPlan(null); }, 0);
    return () => { window.clearTimeout(resetPlan); };
  }, [selectedTicket?.id]);

  const handleAIPlanRoute = useCallback(async () => {
    if (!selectedTicket) return;
    setAiPlanLoading(true);
    setAiPlan(null);
    try {
      const res = await fetch("/api/missions/plan-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: { lat: selectedTicket.latitude, lng: selectedTicket.longitude },
          urgency_level: selectedTicket.urgency_level,
          payload_item: selectedTicket.payload_item,
          current_altitude: demoCruiseAltitude,
        }),
      });
      const data: AIPlan & { error?: string } = await res.json();
      if (res.ok && data.validated) {
        setAiPlan(data);
        setDemoCruiseAltitude(data.altitude);
        setDronePosition((prev) => droneState === "IDLE" ? { ...prev, alt: data.altitude } : prev);
        addLog(`🤖 AI Plan: ${data.altitude}m — ${data.reason}`);
      } else {
        addLog(`⚠️ AI plan rejected — ${data.error ?? "validation failed"}`);
      }
    } catch {
      addLog("⚠️ AI planner failed — using manual settings");
    }
    setAiPlanLoading(false);
  }, [selectedTicket, demoCruiseAltitude, droneState, addLog]);

  const distanceToTarget = selectedTicket
    ? formatDistance(remainingDistance({ lat: dronePosition.lat, lng: dronePosition.lng }, { lat: selectedTicket.latitude, lng: selectedTicket.longitude }))
    : "—";

  const selectedDrone: DroneFleetUnit = DRONE_FLEET.find((drone) => drone.id === selectedDroneId) ?? DRONE_FLEET[0];
  const activeDroneId = selectedTicket?.drone_id || selectedDroneId;
  const fleetCards = DRONE_FLEET.map((drone) => {
    const assignedTicket =
      tickets.find((ticket) => ticket.drone_id === drone.id && ticket.status === "IN_FLIGHT") ??
      tickets.find((ticket) => ticket.drone_id === drone.id && ticket.status !== "DELIVERED");
    const telemetry = fleetTelemetry[drone.id];
    const state = getFleetState(assignedTicket, activeDroneId, drone.id, droneState, telemetry);
    return { drone, assignedTicket, telemetry, state };
  });
  const selectedDroneBusyTicket = selectedTicket
    ? tickets.find((ticket) =>
        ticket.drone_id === selectedDroneId &&
        ticket.status === "IN_FLIGHT" &&
        ticket.id !== selectedTicket.id
      )
    : null;
  const selectedDroneReturning = fleetTelemetry[selectedDroneId]?.phase === "RETURNING";

  // ── Admin Tab Bar ──
  const ADMIN_TABS: { key: AdminTab; label: string; icon: string }[] = [
    { key: "dispatch", label: "Dispatch", icon: "🛰️" },
    { key: "products", label: "Products", icon: "📦" },
    { key: "orders", label: "Orders", icon: "🧾" },
    { key: "revenue", label: "Revenue", icon: "💰" },
  ];

  return (
    <div className="relative h-screen w-full bg-[#f0f2f5] text-[#2d3748] font-sans antialiased overflow-hidden flex flex-col">
      <div className="absolute inset-0 bg-linear-to-tr from-[#dfebd4] via-[#e2e9e1] to-[#f3e7dc] z-0" />
      <div className="absolute top-[-10%] right-[20%] w-125 h-125 bg-[#cbdcc1] rounded-full blur-[120px] opacity-50 mix-blend-multiply z-0 pointer-events-none" />

      {/* Top Admin Tab Bar */}
      <div className="relative z-10 px-3 pt-3">
        <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-2xl px-4 py-2 flex items-center justify-between shadow-[0_4px_16px_-4px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚁</span>
            <h1 className="text-sm font-bold text-[#1a202c]">Pocket Pilot Admin</h1>
          </div>
          <div className="flex bg-white/50 border border-white/80 rounded-full p-0.5">
            {ADMIN_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setAdminTab(tab.key)}
                className={`px-4 py-1.5 rounded-full text-[10px] font-bold tracking-wider transition-colors cursor-pointer ${
                  adminTab === tab.key ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── DISPATCH TAB ── */}
      {adminTab === "dispatch" && (
        <div className="relative z-10 flex-1 flex p-3 gap-3 overflow-hidden">
          {/* Queue */}
          <div className="w-[20%] h-full bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-4 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)] flex flex-col">
            <div className="mb-4">
              <h2 className="text-sm font-bold text-[#1a202c]">Active Queue</h2>
              <p className="text-[10px] text-slate-500">{tickets.length} pending</p>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {tickets.length === 0 ? (
                <p className="text-xs text-slate-500 text-center mt-10 animate-pulse">Listening...</p>
              ) : tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTicket(t);
                    setMapFocusKey((key) => key + 1);
                  }}
                  className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                    selectedTicket?.id === t.id ? "bg-white/80 border-white shadow-sm scale-[1.02]" : "bg-white/30 border-white/40 hover:bg-white/50"
                  } ${t.urgency_level === "CRITICAL" ? "ring-1 ring-red-300" : ""}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-bold text-slate-800 truncate pr-2">
                      {t.urgency_level === "CRITICAL" && "🚨 "}FLT-{t.id.substring(0, 5).toUpperCase()}
                    </span>
                    <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                      t.urgency_level === "CRITICAL" ? "bg-red-100 text-red-600 animate-pulse" : t.urgency_level === "HIGH" ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-500"
                    }`}>{t.urgency_level}</span>
                  </div>
                  <p className="text-xs font-semibold text-[#1a202c] truncate">{t.payload_item}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">{t.customer_name}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Viewport */}
          <div className="w-[55%] h-full flex flex-col gap-3">
            <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-2xl px-4 py-2.5 flex items-center justify-between shadow-[0_4px_16px_-4px_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-2">
                <div className="bg-slate-800 text-white px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider">3D REALISTIC</div>
                <div className="flex bg-white/50 border border-white/60 rounded-full p-0.5">
                  {(["free", "follow", "chase"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setCameraMode(mode)}
                      className={`px-3 py-1 rounded-full text-[9px] font-bold tracking-wider uppercase transition-colors cursor-pointer ${
                        cameraMode === mode ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {mode === "free" ? "FREE" : mode === "follow" ? "TOP" : "CHASE"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 rounded-full border border-white/60 bg-white/50 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  <span>Zoom {followZoom.toFixed(1)}</span>
                  <input
                    type="range"
                    min="12.5"
                    max="18"
                    step="0.1"
                    value={followZoom}
                    onChange={(event) => setFollowZoom(Number(event.target.value))}
                    className="w-24 accent-[#e65328]"
                    aria-label="Follow camera zoom"
                  />
                </label>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                  droneState === "IDLE" ? "bg-slate-100 text-slate-500" : droneState === "AIRBORNE" ? "bg-[#e65328]/10 text-[#e65328]" : droneState === "RETURNING" ? "bg-blue-100 text-blue-600" : droneState === "DELIVERED" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${droneState === "AIRBORNE" ? "bg-[#e65328] animate-pulse" : droneState === "RETURNING" ? "bg-blue-500 animate-pulse" : droneState === "DELIVERED" ? "bg-emerald-500" : "bg-slate-400"}`} />
                  {droneState}
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-600 bg-white/50 px-2.5 py-1 rounded-full border border-white/60">{formatTime(elapsedTime)}</span>
              </div>
            </div>

            <div className="flex-1 bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl overflow-hidden shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)]">
              <FPVMap
                dronePosition={dronePosition}
                targetPosition={selectedTicket ? { lat: selectedTicket.latitude, lng: selectedTicket.longitude } : { lat: selectedDrone.baseLat, lng: selectedDrone.baseLng }}
                routePath={routePath}
                heading={currentHeading}
                activeWaypointIndex={activeWaypointIndex}
                followZoom={followZoom}
                cameraMode={cameraMode}
                onCameraModeChange={setCameraMode}
                focusKey={mapFocusKey}
                isAiRoute={isAiRoute}
              />
            </div>

            <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-2xl px-4 py-2.5 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.04)]">
              <div className="h-1.5 bg-slate-200/60 rounded-full overflow-hidden mb-2">
                <div className="h-full progress-shimmer rounded-full transition-all duration-300" style={{ width: `${flightProgress}%` }} />
              </div>
              <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-slate-500">
                <span>Progress: {flightProgress}%</span><span>Waypoint: {activeWaypointIndex}/{Math.max(routePath.length - 1, 0)}</span><span>Distance: {distanceToTarget}</span><span>Speed: {currentSpeed} km/h</span>
              </div>
            </div>
          </div>

          {/* Command Panel */}
          <div className="w-[25%] h-full bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-4 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)] flex flex-col overflow-hidden">
            <div className="mb-3">
              <h2 className="text-sm font-bold text-[#1a202c]">Command Center</h2>
              <p className="text-[10px] text-slate-500">{selectedDrone.id} · {selectedDrone.name}</p>
            </div>

            <div className="bg-white/40 border border-white/60 rounded-xl p-2.5 mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Fleet Tracker</p>
                <span className="text-[8px] font-bold text-slate-500">{DRONE_FLEET.length} drones</span>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {fleetCards.map(({ drone, assignedTicket, telemetry, state }) => (
                  <button
                    key={drone.id}
                    onClick={() => {
                      setSelectedDroneId(drone.id);
                      setMapFocusKey((key) => key + 1);
                      if (assignedTicket) {
                        setSelectedTicket(assignedTicket);
                        return;
                      }
                      const base = getDroneBasePosition(drone.id);
                      setSelectedTicket(null);
                      setDroneState(state === "RETURNING" ? "RETURNING" : "IDLE");
                      setCurrentPhase(telemetry?.phase ?? "LAUNCH");
                      setRoutePath(telemetry?.route_path ?? []);
                      setCurrentSpeed(telemetry?.speed ?? 0);
                      setCurrentHeading(telemetry?.heading ?? 0);
                      setBattery(telemetry?.battery ?? 100);
                      setDronePosition(telemetry ? { lat: telemetry.lat, lng: telemetry.lng, alt: telemetry.alt ?? 0 } : base);
                    }}
                    className={`w-full rounded-lg border px-2 py-1.5 text-left transition-all cursor-pointer ${
                      selectedDroneId === drone.id ? "border-[#e65328] bg-white/80 shadow-sm" : "border-white/60 bg-white/35 hover:bg-white/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-mono font-bold text-slate-800">{drone.id}</span>
                      <span className={`text-[7px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 ${
                        state === "AIRBORNE" ? "bg-[#e65328]/10 text-[#e65328]" :
                        state === "RETURNING" ? "bg-blue-100 text-blue-600" :
                        state === "ASSIGNED" ? "bg-amber-100 text-amber-600" :
                        state === "DELIVERED" ? "bg-emerald-100 text-emerald-600" :
                        state === "OVERRIDE" ? "bg-red-100 text-red-600" :
                        "bg-slate-100 text-slate-500"
                      }`}>{state}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[8px] text-slate-500">
                      <span className="truncate">{assignedTicket ? `FLT-${assignedTicket.id.substring(0, 5).toUpperCase()}` : `${drone.name} · ${drone.model}`}</span>
                      <span className="font-mono">{telemetry?.battery ?? 100}%</span>
                    </div>
                    <p className="mt-0.5 truncate text-[8px] font-mono text-slate-400">
                      {telemetry ? `${telemetry.lat.toFixed(4)}, ${telemetry.lng.toFixed(4)} · ${Math.round(telemetry.speed ?? 0)}km/h` : `${drone.baseLat.toFixed(4)}, ${drone.baseLng.toFixed(4)} · base`}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {selectedTicket ? (
              <>
                <div className={`bg-white/50 border rounded-2xl p-3 shadow-sm mb-3 space-y-2 ${selectedTicket.urgency_level === "CRITICAL" ? "border-red-300 bg-red-50/30" : "border-white/80"}`}>
                  {selectedTicket.urgency_level === "CRITICAL" && (
                    <div className="bg-red-100 border border-red-200 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                      <span className="text-sm">🚨</span>
                      <span className="text-[9px] font-bold text-red-600 uppercase tracking-wider">Emergency Priority</span>
                    </div>
                  )}
                  <div>
                    <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Payload</p>
                    <p className="text-xs font-bold text-[#1a202c]">{selectedTicket.payload_item}</p>
                  </div>
                  <hr className="border-white/60" />
                  <div>
                    <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Summary</p>
                    <p className="text-[10px] text-slate-600 leading-relaxed">{selectedTicket.incident_summary}</p>
                  </div>
                  {selectedTicket.call_transcript && (
                    <div className="bg-orange-50/60 border border-orange-100 rounded-xl p-2.5">
                      <p className="text-[8px] uppercase font-bold text-orange-400 tracking-widest mb-1">🎙 Call Transcript</p>
                      <p className="text-[9px] text-slate-600 italic leading-relaxed line-clamp-4">&quot;{selectedTicket.call_transcript}&quot;</p>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <div>
                      <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Customer</p>
                      <p className="text-[10px] font-semibold text-slate-700">{selectedTicket.customer_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Phone</p>
                      <p className="text-[10px] font-mono text-slate-700">{selectedTicket.customer_phone || "—"}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { label: "Battery", value: `${battery}%`, color: battery > 50 ? "text-emerald-600" : battery > 25 ? "text-orange-500" : "text-red-500" },
                    { label: "Phase", value: currentPhase, color: "text-slate-700" },
                    { label: "Altitude", value: `${Math.round(dronePosition.alt)}m`, color: "text-slate-700" },
                    { label: "Cruise", value: `${demoCruiseAltitude}m`, color: "text-slate-700" },
                  ].map((m) => (
                    <div key={m.label} className="bg-white/40 border border-white/60 p-2.5 rounded-xl text-center">
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{m.label}</p>
                      <p className={`text-base font-mono font-bold ${m.color} mt-0.5`}>{m.value}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-white/40 border border-white/60 rounded-xl p-3 mb-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Demo Cruise Altitude</p>
                      <p className="text-[9px] text-slate-500">Simulation tuning only</p>
                    </div>
                    <span className="text-sm font-mono font-bold text-slate-700">{demoCruiseAltitude}m</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="180"
                    step="5"
                    value={demoCruiseAltitude}
                    onChange={(event) => {
                      const val = Number(event.target.value);
                      setDemoCruiseAltitude(val);
                      setAiPlan(null);
                      if (droneState === "IDLE") setDronePosition((prev) => ({ ...prev, alt: val }));
                    }}
                    disabled={droneState === "AIRBORNE"}
                    className="w-full accent-[#e65328] disabled:opacity-50"
                    aria-label="Demo cruise altitude"
                  />
                </div>

                {aiPlan && (
                  <div className="bg-white/50 border border-emerald-200 rounded-xl p-3 mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">AI Route Plan</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${aiPlan.confidence >= 80 ? "bg-emerald-100 text-emerald-600" : "bg-orange-100 text-orange-600"}`}>
                          {aiPlan.confidence}% conf
                        </span>
                        <button onClick={() => setAiPlanModalOpen(true)} className="text-[8px] font-bold text-purple-500 hover:text-purple-700 cursor-pointer px-1.5 py-0.5 bg-purple-50 hover:bg-purple-100 rounded-full transition-colors" title="Expand">
                          ↗ Full
                        </button>
                      </div>
                    </div>
                    <div className="flex items-baseline gap-1.5 mb-1">
                      <span className="text-sm font-mono font-bold text-slate-700">{aiPlan.altitude}m</span>
                      <span className="text-[8px] text-emerald-600 font-bold">✓ validated</span>
                    </div>
                    <p className="text-[9px] text-slate-600 leading-relaxed line-clamp-2">{aiPlan.reason}</p>
                  </div>
                )}

                <div className="flex-1 bg-white/30 border border-white/50 rounded-xl p-2.5 mb-3 overflow-hidden flex flex-col min-h-0">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Flight Logs</p>
                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5 text-[9px] font-mono text-slate-600 min-h-0">
                    {flightLogs.length === 0 ? <p className="text-slate-400 text-center mt-3 animate-pulse">Awaiting data...</p>
                      : flightLogs.map((l, i) => <p key={i}>{l}</p>)}
                    <div ref={logsEndRef} />
                  </div>
                </div>

                <div className="space-y-2">
                  {selectedDroneBusyTicket && (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[9px] font-semibold text-amber-700">
                      {selectedDrone.id} is busy on FLT-{selectedDroneBusyTicket.id.substring(0, 5).toUpperCase()}.
                    </p>
                  )}
                  {selectedDroneReturning && (
                    <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[9px] font-semibold text-blue-700">
                      {selectedDrone.id} is returning to base.
                    </p>
                  )}
                  <button
                    onClick={handleAIPlanRoute}
                    disabled={aiPlanLoading || droneState === "AIRBORNE" || droneState === "DELIVERED" || selectedTicket.status === "DELIVERED"}
                    className="w-full bg-slate-800/5 hover:bg-slate-800 cursor-pointer hover:text-white text-slate-700 border border-slate-200 hover:border-slate-800 font-bold py-2.5 rounded-2xl text-[9px] tracking-wider uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {aiPlanLoading ? "Planning..." : "🤖 AI Plan Route"}
                  </button>
                  <button onClick={handleLaunchVector} disabled={droneState === "DELIVERED" || selectedTicket.status === "DELIVERED" || Boolean(selectedDroneBusyTicket) || selectedDroneReturning}
                    className="w-full bg-[#e65328] hover:bg-[#d4431b] cursor-pointer text-white font-semibold py-3 rounded-2xl text-[10px] tracking-wider uppercase shadow-[0_4px_12px_rgba(230,83,40,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {selectedDroneReturning ? "Drone Returning" : selectedDroneBusyTicket ? "Selected Drone Busy" : droneState === "DELIVERED" || selectedTicket.status === "DELIVERED" ? "Delivered ✓" : selectedTicket.status === "IN_FLIGHT" ? "Reset & Relaunch Vector" : "Approve & Launch Vector"}
                  </button>
                  <button onClick={() => { if (selectedTicket) clearSimulation(selectedTicket.id); setDroneState("OVERRIDE"); addLog("⚠️ Override engaged."); }}
                    className="w-full bg-red-600/10 hover:bg-red-600 cursor-pointer hover:text-white text-red-600 border border-red-200 hover:border-red-600 font-bold py-2.5 rounded-2xl text-[9px] tracking-wider uppercase transition-all">
                    Manual Gyro Override
                  </button>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                <span className="text-lg">📡</span>
                <p className="text-xs uppercase tracking-widest font-bold">No Active Link</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PRODUCTS TAB ── */}
      {adminTab === "products" && (
        <div className="relative z-10 flex-1 p-3 overflow-y-auto">
          <div className="max-w-4xl mx-auto bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-6 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)]">
            <ProductManager />
          </div>
        </div>
      )}

      {/* ── ORDERS TAB ── */}
      {adminTab === "orders" && (
        <div className="relative z-10 flex-1 p-3 overflow-y-auto">
          <div className="max-w-6xl mx-auto bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-6 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)]">
            <PurchaseLogPanel />
          </div>
        </div>
      )}

      {/* ── REVENUE TAB ── */}
      {adminTab === "revenue" && (
        <div className="relative z-10 flex-1 p-3 overflow-y-auto">
          <div className="max-w-2xl mx-auto bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-6 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)]">
            <RevenuePanel />
          </div>
        </div>
      )}

      {/* ── AI PLAN MODAL ── */}
      {aiPlanModalOpen && aiPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm" onClick={() => setAiPlanModalOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-linear-to-r from-purple-600 to-violet-500 rounded-t-3xl p-6 text-white">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest opacity-75 mb-1">AI Route Plan</p>
                  <h2 className="text-2xl font-bold font-mono">{aiPlan.altitude}m cruise altitude</h2>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${aiPlan.confidence >= 80 ? "bg-white/30 text-white" : "bg-orange-200/30 text-orange-100"}`}>
                    {aiPlan.confidence}% confidence
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 font-bold">✓ Validated</span>
                </div>
              </div>
              <p className="text-sm leading-relaxed opacity-90">{aiPlan.reason}</p>
            </div>

            <div className="p-6 space-y-5">
              {/* Avoided risks */}
              {aiPlan.avoided_risks.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Avoided Risks</p>
                  <div className="space-y-1.5">
                    {aiPlan.avoided_risks.map((risk, i) => (
                      <div key={i} className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                        <span className="text-red-400 mt-0.5 shrink-0">⚠</span>
                        <p className="text-xs text-red-700">{risk}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Waypoints */}
              {aiPlan.waypoints.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{aiPlan.waypoints.length} AI Waypoints</p>
                  <div className="space-y-2">
                    {aiPlan.waypoints.map((wp, i) => (
                      <div key={i} className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">WP{i + 1}</span>
                          <span className="text-sm font-mono font-bold text-slate-700">{wp.alt}m</span>
                        </div>
                        <p className="text-[10px] font-mono text-slate-500 mb-1">{wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}</p>
                        {wp.reason && <p className="text-xs text-slate-600 leading-relaxed">{wp.reason}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setAiPlanModalOpen(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-2xl text-sm tracking-wider transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
