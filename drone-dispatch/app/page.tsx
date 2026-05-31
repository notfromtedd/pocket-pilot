"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export default function Home() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour12: false }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#f0f2f5] text-[#2d3748] flex items-center justify-center font-sans antialiased overflow-hidden">
      {/* Ambient gradient background */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#dfebd4] via-[#e2e9e1] to-[#f3e7dc] z-0"></div>
      <div className="absolute top-[-15%] right-[15%] w-[500px] h-[500px] bg-[#cbdcc1] rounded-full blur-[140px] opacity-50 mix-blend-multiply z-0 pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[10%] w-[400px] h-[400px] bg-[#f3e7dc] rounded-full blur-[120px] opacity-40 mix-blend-multiply z-0 pointer-events-none"></div>

      <div className="relative z-10 text-center max-w-lg mx-4">
        {/* Logo and Title */}
        <div className="mb-8">
          <div className="w-20 h-20 mx-auto mb-6 bg-white/50 backdrop-blur-xl border border-white/60 rounded-3xl flex items-center justify-center shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)]">
            <span className="text-3xl">🚁</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#1a202c] mb-2">
            Pocket Pilot
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            AI-Powered Drone Dispatch — Nairobi
          </p>
        </div>

        {/* System Time */}
        <div className="bg-white/30 backdrop-blur-sm border border-white/60 rounded-2xl px-6 py-3 inline-block mb-10 shadow-sm">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-0.5">System Time</p>
          <p className="text-lg font-mono font-bold text-[#1a202c]">{time || "--:--:--"}</p>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/auth" className="group">
            <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-6 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)] transition-all duration-300 hover:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.1)] hover:scale-[1.02] hover:bg-white/60">
              <div className="w-12 h-12 bg-[#e65328]/10 rounded-2xl flex items-center justify-center mb-4 mx-auto group-hover:bg-[#e65328]/20 transition-colors">
                <span className="text-xl">📦</span>
              </div>
              <h2 className="text-sm font-bold text-[#1a202c] mb-1">Request Delivery</h2>
              <p className="text-xs text-slate-400">Customer portal — order dispatch & live tracking</p>
            </div>
          </Link>

          <Link href="/admin" className="group">
            <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-6 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)] transition-all duration-300 hover:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.1)] hover:scale-[1.02] hover:bg-white/60">
              <div className="w-12 h-12 bg-emerald-600/10 rounded-2xl flex items-center justify-center mb-4 mx-auto group-hover:bg-emerald-600/20 transition-colors">
                <span className="text-xl">🛰️</span>
              </div>
              <h2 className="text-sm font-bold text-[#1a202c] mb-1">Command Center</h2>
              <p className="text-xs text-slate-400">Admin console — flight ops & telemetry</p>
            </div>
          </Link>
        </div>

        {/* Footer */}
        <p className="mt-10 text-[10px] text-slate-400 uppercase tracking-widest font-medium">
          Pocket Pilot v1.0 · Nairobi Hub Operations
        </p>
      </div>
    </div>
  );
}
