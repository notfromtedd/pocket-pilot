"use client";

import { useState } from "react";

interface EmergencyPanelProps {
  userPhone: string;
  userName: string;
  coords: { lat: number; lng: number } | null;
  onEmergencySubmit: (notes: string) => void;
}

export default function EmergencyPanel({ userPhone, userName, coords, onEmergencySubmit }: EmergencyPanelProps) {
  const [notes, setNotes] = useState("");
  const [calling, setCalling] = useState(false);
  const emergencyPhone = process.env.NEXT_PUBLIC_EMERGENCY_PHONE || "+254700000000";

  return (
    <div className="space-y-4">
      {/* Emergency Banner */}
      <div className="bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl p-5 text-white shadow-[0_8px_24px_rgba(239,68,68,0.3)]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-2xl">🚨</span>
          </div>
          <div>
            <h3 className="text-lg font-bold">Emergency Dispatch</h3>
            <p className="text-xs text-white/80">Priority medical delivery service</p>
          </div>
        </div>
        <p className="text-xs text-white/90 leading-relaxed">
          For life-threatening emergencies requiring immediate drone dispatch.
          Call our service line and an operator will load and dispatch a drone to your location.
        </p>
      </div>

      {/* Call Now */}
      <a
        href={`tel:${emergencyPhone}`}
        onClick={() => setCalling(true)}
        className="block w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl text-center text-sm tracking-wider uppercase shadow-[0_4px_16px_rgba(239,68,68,0.35)] transition-all active:scale-[0.99]"
      >
        {calling ? "📞 Connecting..." : "📞 Call Emergency Line Now"}
      </a>

      {calling && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <p className="text-xs font-bold text-red-700">Call Active</p>
          </div>
          <p className="text-[11px] text-red-600">
            Your call is being tracked. An operator will prepare and dispatch a drone to your GPS location.
          </p>
          <div className="mt-2 bg-red-100 rounded-xl p-2.5 text-[10px] font-mono text-red-700">
            <p>📍 Location: {coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : "Nairobi CBD"}</p>
            <p>📱 Phone: {userPhone}</p>
            <p>👤 Name: {userName}</p>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">or describe below</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* Quick Emergency Form */}
      <div className="bg-white/50 border border-white/80 rounded-2xl p-4 space-y-3">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-600/80">
            Emergency Description
          </label>
          <div className="bg-white/60 border border-white/80 rounded-xl p-3 focus-within:bg-white/90 transition-colors">
            <textarea
              className="w-full bg-transparent text-sm focus:outline-none text-slate-800 placeholder-slate-400 h-20 resize-none"
              placeholder="Describe the emergency situation, required supplies, and any critical details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={() => {
            if (notes.trim()) onEmergencySubmit(notes);
          }}
          disabled={!notes.trim()}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-xs tracking-wider uppercase transition-all cursor-pointer disabled:cursor-not-allowed"
        >
          🚁 Submit Emergency Request
        </button>
      </div>

      {/* Info */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5">
        <p className="text-[11px] text-amber-700 leading-relaxed">
          <span className="font-bold">⚡ Emergency orders</span> are given top priority.
          An employee will manually load the required supplies and dispatch the drone immediately.
          You will receive an SMS when the drone is en route.
        </p>
      </div>
    </div>
  );
}
