"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabase";
import {
  createFlightPlan, haversineDistance, interpolatePosition, remainingDistance,
  isWithinSMSRange, formatDistance, formatTime,
  type FlightPhase, type RoutePoint,
} from "../lib/simulator";
import ProductManager from "../components/ProductManager";
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
  order_id?: string;
}

type DroneState = "IDLE" | "AIRBORNE" | "DELIVERED" | "OVERRIDE";
type AdminTab = "dispatch" | "products" | "revenue";
type UrgencyLevel = "STANDARD" | "HIGH" | "CRITICAL";

const TELEMETRY_UPDATE_MS = 250;
const SIMULATION_TIME_SCALE = 8;

export default function AdminControlCenter() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [adminTab, setAdminTab] = useState<AdminTab>("dispatch");

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

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const smsSentRef = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [flightLogs]);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    setFlightLogs((prev) => [...prev, `[${ts}] ${msg}`]);
  }, []);

  // ── Supabase realtime ──
  useEffect(() => {
    const fetchQueue = async () => {
      const { data } = await supabase
        .from("tickets")
        .select("*")
        .in("status", ["PENDING", "IN_FLIGHT"])
        .order("created_at", { ascending: false });
      if (data && data.length > 0) {
        // Sort: emergencies first, then by urgency
        const sorted = data.sort((a, b) => {
          const urgencyOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, STANDARD: 2 };
          return (urgencyOrder[a.urgency_level] ?? 2) - (urgencyOrder[b.urgency_level] ?? 2);
        });
        setTickets(sorted);
        setSelectedTicket((curr) => curr ?? sorted[0]);
      }
    };
    fetchQueue();

    const channel = supabase
      .channel("admin-queue")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tickets" }, (payload) => {
        const t = payload.new as Ticket;
        setTickets((prev) => {
          const updated = [t, ...prev];
          return updated.sort((a, b) => {
            const o: Record<string, number> = { CRITICAL: 0, HIGH: 1, STANDARD: 2 };
            return (o[a.urgency_level] ?? 2) - (o[b.urgency_level] ?? 2);
          });
        });
        setSelectedTicket((curr) => curr ?? t);
        addLog(`📥 New dispatch: ${t.payload_item} → ${t.customer_name}`);
        if (t.urgency_level === "CRITICAL") addLog(`🚨 EMERGENCY — Priority escalated!`);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTelemetry = useCallback((t: {
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
    setDronePosition({ lat: t.lat, lng: t.lng, alt: t.alt ?? 0 });
    setBattery(t.battery ?? 100);
    setCurrentSpeed(t.speed ?? 0);
    setCurrentHeading(t.heading ?? 0);
    setActiveWaypointIndex(t.active_waypoint_index ?? 0);
    if (Array.isArray(t.route_path) && t.route_path.length > 0) setRoutePath(t.route_path);
    if (t.phase) setCurrentPhase(t.phase);
  }, []);

  useEffect(() => {
    if (!selectedTicket) return;

    const fetchLatestTelemetry = async () => {
      const { data } = await supabase
        .from("drone_telemetry")
        .select("*")
        .eq("ticket_id", selectedTicket.id)
        .maybeSingle();

      if (data) {
        applyTelemetry(data as {
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
        if (selectedTicket.status === "IN_FLIGHT") setDroneState("AIRBORNE");
        if (selectedTicket.status === "DELIVERED") setDroneState("DELIVERED");
      } else {
        setDronePosition({ lat: -1.2921, lng: 36.8219, alt: 0 });
        setBattery(100);
        setCurrentSpeed(0);
        setCurrentHeading(0);
        setActiveWaypointIndex(0);
        setRoutePath([]);
        setCurrentPhase("LAUNCH");
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
  }, [selectedTicket, applyTelemetry]);

  // ── Flight sim ──
  const handleLaunchVector = useCallback(async () => {
    if (!selectedTicket || droneState === "AIRBORNE") return;
    const commandRes = await fetch("/api/missions/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticket_id: selectedTicket.id,
        order_id: selectedTicket.order_id,
        command: "launch",
        source: "admin",
      }),
    });
    const commandData = await commandRes.json().catch(() => null);
    if (!commandRes.ok || commandData?.accepted === false) {
      addLog(`⚠️ Launch denied — ${commandData?.reason || commandData?.error || "mission command rejected"}`);
      return;
    }

    setDroneState("AIRBORNE");
    setFlightProgress(0);
    setElapsedTime(0);
    setCurrentPhase("LAUNCH");
    setActiveWaypointIndex(0);
    smsSentRef.current = false;
    addLog("🚀 Launch vector approved. Drone ascending...");

    await supabase.from("tickets").update({ status: "IN_FLIGHT" }).eq("id", selectedTicket.id);
    if (selectedTicket.order_id) {
      await supabase.from("orders").update({ status: "IN_FLIGHT" }).eq("id", selectedTicket.order_id);
    }

    const plan = createFlightPlan(
      { lat: selectedTicket.latitude, lng: selectedTicket.longitude },
      { urgencyLevel: (selectedTicket.urgency_level as UrgencyLevel) || "STANDARD" }
    );
    setRoutePath(plan.routePath);
    setCurrentHeading(0);
    const estimatedFlightSeconds = Math.max(
      35,
      haversineDistance(plan.origin, plan.destination) / (plan.maxSpeed * 1000 / 3600)
    );
    let progress = 0;
    const loggedMilestones = new Set<number>();
    let lastPhase: FlightPhase | null = null;

    timerRef.current = setInterval(() => setElapsedTime((t) => t + 1), 1000);

    intervalRef.current = setInterval(async () => {
      progress += ((TELEMETRY_UPDATE_MS / 1000) * SIMULATION_TIME_SCALE) / estimatedFlightSeconds;
      if (progress > 1) progress = 1;

      const vec = interpolatePosition(plan, progress);
      const dist = remainingDistance({ lat: vec.lat, lng: vec.lng }, plan.destination);

      setDronePosition({ lat: vec.lat, lng: vec.lng, alt: vec.alt });
      setFlightProgress(Math.round(progress * 100));
      setBattery(Math.round(vec.battery));
      setCurrentSpeed(Math.round(vec.speed));
      setCurrentHeading(Math.round(vec.heading));
      setCurrentPhase(vec.phase);
      setActiveWaypointIndex(vec.activeWaypointIndex);

      await supabase.from("drone_telemetry").upsert({
        ticket_id: selectedTicket.id,
        order_id: selectedTicket.order_id,
        lat: vec.lat, lng: vec.lng, alt: vec.alt,
        battery: Math.round(vec.battery), speed: Math.round(vec.speed), heading: Math.round(vec.heading),
        phase: vec.phase,
        active_waypoint_index: vec.activeWaypointIndex,
        route_path: plan.routePath,
        updated_at: new Date().toISOString(),
      }, { onConflict: "ticket_id" });

      const pct = Math.round(progress * 100);
      [25, 50, 75].forEach((milestone) => {
        if (pct >= milestone && !loggedMilestones.has(milestone)) {
          loggedMilestones.add(milestone);
          addLog(`📍 ${milestone}% — ${milestone === 75 ? "Descent approach" : milestone === 50 ? "Cruise corridor" : "Climb corridor"}`);
        }
      });

      if (vec.phase !== lastPhase) {
        lastPhase = vec.phase;
        addLog(`🛰️ Phase transition — ${vec.phase}`);
      }

      if (!smsSentRef.current && isWithinSMSRange({ lat: vec.lat, lng: vec.lng }, plan.destination)) {
        smsSentRef.current = true;
        addLog(`📱 SMS triggered — ${Math.round(dist)}m from target`);
        fetch("/api/send-sms", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: selectedTicket.customer_phone, customerName: selectedTicket.customer_name, ticketId: selectedTicket.id, distanceMeters: dist }),
        }).catch(console.error);
        await supabase.from("tickets").update({ sms_sent: true }).eq("id", selectedTicket.id);
      }

      if (progress >= 1) {
        clearInterval(intervalRef.current!);
        clearInterval(timerRef.current!);
        setDroneState("DELIVERED");
        setCurrentPhase("DELIVERED");
        setActiveWaypointIndex(plan.routePath.length - 1);
        addLog("✅ Payload delivered.");
        await supabase.from("tickets").update({ status: "DELIVERED" }).eq("id", selectedTicket.id);
        if (selectedTicket.order_id) {
          await supabase.from("orders").update({ status: "DELIVERED" }).eq("id", selectedTicket.order_id);
        }
      }
    }, TELEMETRY_UPDATE_MS);
  }, [selectedTicket, droneState, addLog]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const distanceToTarget = selectedTicket
    ? formatDistance(remainingDistance({ lat: dronePosition.lat, lng: dronePosition.lng }, { lat: selectedTicket.latitude, lng: selectedTicket.longitude }))
    : "—";

  // ── Admin Tab Bar ──
  const ADMIN_TABS: { key: AdminTab; label: string; icon: string }[] = [
    { key: "dispatch", label: "Dispatch", icon: "🛰️" },
    { key: "products", label: "Products", icon: "📦" },
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
                  onClick={() => setSelectedTicket(t)}
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
                <div className="bg-[#e65328] text-white px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wider uppercase">Follow</div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                  droneState === "IDLE" ? "bg-slate-100 text-slate-500" : droneState === "AIRBORNE" ? "bg-[#e65328]/10 text-[#e65328]" : droneState === "DELIVERED" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${droneState === "AIRBORNE" ? "bg-[#e65328] animate-pulse" : droneState === "DELIVERED" ? "bg-emerald-500" : "bg-slate-400"}`} />
                  {droneState}
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-600 bg-white/50 px-2.5 py-1 rounded-full border border-white/60">{formatTime(elapsedTime)}</span>
              </div>
            </div>

            <div className="flex-1 bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl overflow-hidden shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)]">
              {selectedTicket ? (
                <FPVMap
                  dronePosition={dronePosition}
                  targetPosition={{ lat: selectedTicket.latitude, lng: selectedTicket.longitude }}
                  routePath={routePath}
                  heading={currentHeading}
                  activeWaypointIndex={activeWaypointIndex}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <div className="text-center"><span className="text-2xl block mb-2">⛛</span><p className="text-xs font-bold uppercase tracking-widest">System Standby</p></div>
                </div>
              )}
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
            {selectedTicket ? (
              <>
                <div className="mb-3">
                  <h2 className="text-sm font-bold text-[#1a202c]">Command Center</h2>
                  <p className="text-[10px] text-slate-500">Drone SN-402</p>
                </div>

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
                    { label: "Speed", value: `${currentSpeed}`, color: "text-slate-700" },
                  ].map((m) => (
                    <div key={m.label} className="bg-white/40 border border-white/60 p-2.5 rounded-xl text-center">
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{m.label}</p>
                      <p className={`text-base font-mono font-bold ${m.color} mt-0.5`}>{m.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex-1 bg-white/30 border border-white/50 rounded-xl p-2.5 mb-3 overflow-hidden flex flex-col min-h-0">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Flight Logs</p>
                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5 text-[9px] font-mono text-slate-600 min-h-0">
                    {flightLogs.length === 0 ? <p className="text-slate-400 text-center mt-3 animate-pulse">Awaiting data...</p>
                      : flightLogs.map((l, i) => <p key={i}>{l}</p>)}
                    <div ref={logsEndRef} />
                  </div>
                </div>

                <div className="space-y-2">
                  <button onClick={handleLaunchVector} disabled={droneState === "AIRBORNE" || droneState === "DELIVERED"}
                    className="w-full bg-[#e65328] hover:bg-[#d4431b] cursor-pointer text-white font-semibold py-3 rounded-2xl text-[10px] tracking-wider uppercase shadow-[0_4px_12px_rgba(230,83,40,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {droneState === "AIRBORNE" ? "Vector Airborne" : droneState === "DELIVERED" ? "Delivered ✓" : "Approve & Launch Vector"}
                  </button>
                  <button onClick={() => { if (intervalRef.current) clearInterval(intervalRef.current); if (timerRef.current) clearInterval(timerRef.current); setDroneState("OVERRIDE"); addLog("⚠️ Override engaged."); }}
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

      {/* ── REVENUE TAB ── */}
      {adminTab === "revenue" && (
        <div className="relative z-10 flex-1 p-3 overflow-y-auto">
          <div className="max-w-2xl mx-auto bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-6 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)]">
            <RevenuePanel />
          </div>
        </div>
      )}
    </div>
  );
}
