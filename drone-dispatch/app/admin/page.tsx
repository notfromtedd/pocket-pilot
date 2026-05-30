"use client";
import { useState } from "react";

const MOCK_TICKETS = [
  { id: "FLT-092", customer: "Cyril Baraka", payload: "Asthma Inhaler", urgency: "CRITICAL", lat: -1.2882, lng: 36.8225, status: "pending" },
  { id: "FLT-093", customer: "Aisha W.", payload: "Blood Bags (O-)", urgency: "CRITICAL", lat: -1.2910, lng: 36.8150, status: "pending" },
  { id: "FLT-094", customer: "Mercy K.", payload: "EpiPen", urgency: "HIGH", lat: -1.2845, lng: 36.8261, status: "pending" },
];

export default function AdminControlCenter() {
  const [selectedTicket, setSelectedTicket] = useState(MOCK_TICKETS[0]);
  const [cameraMode, setCameraMode] = useState<"SATELLITE" | "COCKPIT">("SATELLITE");
  const [droneState, setDroneState] = useState<"IDLE" | "AIRBORNE" | "OVERRIDE">("IDLE");

  return (
    <div className="relative h-screen w-full bg-[#e2e8f0] text-[#2d3748] font-sans antialiased overflow-hidden flex p-4 gap-4">
      
      {/* ── BACKGROUND GRADIENT MESH ── */}
      <div className="absolute top-0 inset-0 bg-linear-to-tr from-[#dfebd4] via-[#e2e9e1] to-[#f3e7dc] z-0"></div>
      <div className="absolute top-[-10%] right-[20%] w-200 h-200 bg-[#cbdcc1] rounded-full blur-[120px] opacity-60 mix-blend-multiply z-0 pointer-events-none"></div>

      {/* ── ZONE 1: LOGISTICS QUEUE (Left Sidebar, 25%) ── */}
      <div className="relative w-1/5 h-full bg-white/40 backdrop-blur-xl border border-white/60 rounded-4xl p-6 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] flex flex-col z-10">
        <div className="mb-6">
          <h2 className="text-xl font-bold tracking-tight text-[#1a202c]">Active Queue</h2>
          <p className="text-xs text-emerald-800/60 font-medium">Awaiting Commander Auth</p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          {MOCK_TICKETS.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => setSelectedTicket(ticket)}
              className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
                selectedTicket.id === ticket.id
                  ? "bg-white/80 border-white shadow-sm scale-[1.02]"
                  : "bg-white/30 border-white/40 hover:bg-white/50"
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-slate-800">{ticket.id}</span>
                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  ticket.urgency === "CRITICAL" ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"
                }`}>
                  {ticket.urgency}
                </span>
              </div>
              <p className="text-sm font-semibold text-[#1a202c] truncate">{ticket.payload}</p>
              <p className="text-[11px] text-slate-500 mt-1">Node: {ticket.customer}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ZONE 2: TACTICAL VIEWPORT (Center) */}
      <div className="relative w-2/3 h-full bg-white/40 backdrop-blur-xl border border-white/60 rounded-4xl p-2 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] flex flex-col z-10">
        
        {/* The 3D Map Container Placeholder */}
        <div className="relative flex-1 bg-[#d8e2d2]/40 rounded-3xl border border-white/50 overflow-hidden shadow-inner flex items-center justify-center">
          
          {/* Top-Right Camera Toggle */}
          <div className="absolute top-4 right-4 bg-white/60 backdrop-blur-md border border-white/80 p-1 rounded-full flex shadow-sm z-20">
            <button 
              onClick={() => setCameraMode("SATELLITE")}
              className={`cursor-pointer px-4 py-1.5 rounded-full text-xs font-bold tracking-wider transition-colors ${cameraMode === "SATELLITE" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-700"}`}
            >
              SATELLITE
            </button>
            <button 
              onClick={() => setCameraMode("COCKPIT")}
              className={`cursor-pointer px-4 py-1.5 rounded-full text-xs font-bold tracking-wider transition-colors ${cameraMode === "COCKPIT" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-700"}`}
            >
              COCKPIT
            </button>
          </div>

          {/* Map Placeholder Graphic */}
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-4 border-2 border-emerald-600/20 rounded-full flex items-center justify-center bg-emerald-600/5">
              <span className="text-emerald-700/50 text-4xl">⛛</span>
            </div>
            <p className="text-sm font-bold text-slate-600">Three.js Canvas Mount Point</p>
            <p className="text-xs text-slate-400 mt-1 font-mono">{selectedTicket.lat.toFixed(4)}, {selectedTicket.lng.toFixed(4)}</p>
          </div>

        </div>
      </div>

      {/* ── ZONE 3: COMMAND & TELEMETRY (Right Sidebar, 25%) ── */}
      <div className="relative w-1/4 h-full bg-white/40 backdrop-blur-xl border border-white/60 rounded-4xl p-6 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] flex flex-col justify-between z-10">
        
        {/* Selected Ticket Details */}
        <div>
          <div className="mb-6">
            <h2 className="text-xl font-bold tracking-tight text-[#1a202c]">Command Center</h2>
            <p className="text-xs text-slate-500 font-medium">Drone SN-402 Link</p>
          </div>

          <div className="bg-white/50 border border-white/80 rounded-2xl p-4 shadow-sm mb-6 space-y-3">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Target Payload</p>
              <p className="text-sm font-bold text-[#1a202c]">{selectedTicket.payload}</p>
            </div>
            <hr className="border-white/60" />
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">AI Route Assessment</p>
              <p className="text-xs text-slate-600 leading-relaxed mt-1">Clear skies. 3.2km flight path generated. No restricted airspace conflicts detected.</p>
            </div>
          </div>

          {/* Telemetry Grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-white/40 border border-white/60 p-3 rounded-2xl text-center shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Battery</p>
              <p className="text-lg font-mono font-bold text-emerald-600 mt-0.5">94%</p>
            </div>
            <div className="bg-white/40 border border-white/60 p-3 rounded-2xl text-center shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Signal</p>
              <p className="text-lg font-mono font-bold text-slate-700 mt-0.5">-42dBm</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => setDroneState("AIRBORNE")}
            disabled={droneState === "AIRBORNE"}
            className="w-full bg-[#e65328] hover:bg-[#d4431b] hover:cursor-pointer text-white font-semibold py-4 px-4 rounded-2xl text-xs tracking-wider uppercase shadow-[0_4px_12px_rgba(230,83,40,0.25)] transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {droneState === "AIRBORNE" ? "Vector Airborne" : "Approve & Launch Vector"}
          </button>

          <button
            onClick={() => setDroneState("OVERRIDE")}
            className="w-full bg-red-600/10 hover:bg-red-600 hover:cursor-pointer hover:text-white text-red-600 border border-red-200 hover:border-red-600 font-bold py-3.5 px-4 rounded-2xl text-[11px] tracking-wider uppercase transition-all duration-200 active:scale-[0.99]"
          >
            Manual Gyro Override
          </button>
        </div>

      </div>
    </div>
  );
}