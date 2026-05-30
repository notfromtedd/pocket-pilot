"use client";

import { useState, useEffect } from "react";

export default function CustomerView() {
  const [userProfile] = useState({
    name: "Cyril Baraka",
    phone: "+254 712 345678",
  });

  const [description, setDescription] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [flightStatus, setFlightStatus] = useState("idle");

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error("GPS Access Error:", err)
      );
    }
  }, []);

  const handleSubmitOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Package cached profile details + live sensor GPS + text description
    const payload = {
      profile: userProfile,
      gpsLocation: coords || { lat: -1.2880, lng: 36.8220 }, // Fallback to Nairobi CBD if GPS is missing
      message: description,
    };

    try {
      const response = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();

      if (response.ok && data.success) {
        console.log("Logistics ticket successfully queued for Admin approval!");
        // Switch to the loading/awaiting matrix state only on verified network success
        setFlightStatus("pending_admin");
      } else {
        console.error("Server-side dispatch rejection:", data.error);
        setFlightStatus("idle");
        alert("Dispatch routing failed. Please verify connection and try again.");
      }
    } catch (err) {
      console.error("Dispatch endpoint failure:", err);
      setFlightStatus("idle");
      alert("Network transport layer failure. Check local environment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#e2e8f0] text-[#2d3748] flex items-center justify-center font-sans antialiased overflow-hidden">
      
      {/* Ambient background mesh configurations */}
      <div className="absolute top-0 inset-0 bg-linear-to-tr from-[#dfebd4] via-[#e2e9e1] to-[#f3e7dc] z-0"></div>
      <div className="absolute top-[-20%] right-[-10%] w-150 h-150 bg-[#cbdcc1] rounded-full blur-[120px] opacity-60 mix-blend-multiply z-0"></div>

      {/* ── MAIN CONTENT CONTAINER (The main frosted glass layout panel) ── */}
      <div className="relative w-full max-w-md mx-4 bg-white/40 backdrop-blur-xl border border-white/60 rounded-4xl p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] z-10">
        
        {/* Header Block */}
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#1a202c]">
              Drone Dispatch
            </h1>
            <p className="text-xs text-emerald-800/60 font-medium mt-0.5">
              Nairobi Hub Operations
            </p>
          </div>
        </div>

        {flightStatus === "idle" ? (
          <form 
            onSubmit={handleSubmitOrder} 
            className="space-y-5"
          >
            {/* Input Wrapper - Clean white pill-style input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600/80 px-1">
                Enter emergency or delivery description
              </label>
              <div className="bg-white/50 backdrop-blur-sm border border-white/80 rounded-2xl p-4 shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)] transition-all duration-200 focus-within:bg-white/80">
                <textarea
                  className="w-full bg-transparent text-sm focus:outline-none text-slate-800 placeholder-slate-400 h-28 resize-none leading-relaxed"
                  placeholder="Tell us what you need and any local landmark context..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Telemetry Row */}
            <div className="bg-white/30 border border-white/60 px-4 py-3.5 rounded-2xl flex justify-between items-center text-xs shadow-sm">
              <span className="text-slate-500 font-medium">Your GPS Location</span>
              {coords ? (
                <span className="font-mono font-bold text-slate-700">
                  {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                </span>
              ) : (
                <span className="text-slate-400 animate-pulse text-[11px] font-medium">Fetching satellite fix...</span>
              )}
            </div>

            {/* Bright Orange Solid Action Button */}
            <button
              disabled={isSubmitting}
              type="submit"
              className="w-full bg-[#e65328] hover:bg-[#d4431b] disabled:bg-[#e65328]/60 text-white font-semibold py-3.5 px-4 rounded-2xl text-xs tracking-wider uppercase shadow-[0_4px_12px_rgba(230,83,40,0.25)] transition-all duration-200 active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Generating Flight Vector..." : "Transmit Dispatch Request"}
            </button>
          </form>
        ) : (
          /* Processing State - Clean Minimal Spinner */
          <div className="py-10 text-center space-y-4">
            <div className="w-8 h-8 border-3 border-[#e65328] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div className="space-y-0.5">
              <p className="text-sm font-bold text-slate-800">Awaiting Operator Confirmation</p>
              <p className="text-xs text-slate-500/70">Routing details via automated system pipeline...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}