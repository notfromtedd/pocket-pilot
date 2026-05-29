"use client";

import { useState, useEffect } from "react";

export default function CustomerDashboard() {
  // 1. Simulate pulling cached profile info from the app session
  const [userProfile] = useState({
    name: "Cyril Baraka",
    phone: "+254 712 345678",
    email: "barakacreal@gmail.com"
  });

  const [description, setDescription] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [flightStatus, setFlightStatus] = useState("idle"); // idle, pending_admin, airborne

  // 2. Automatically poll phone hardware GPS on component load
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => console.error("Error fetching hardware GPS:", error)
      );
    }
  }, []);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFlightStatus("pending_admin");

    // 3. Package cached profile details + live sensor GPS + description
    const payload = {
      profile: userProfile,
      gpsLocation: coords || { lat: -1.2880, lng: 36.8220 }, // Fallback to Nairobi CBD if GPS denied
      message: description,
    };

    // 4. Send directly to your Next.js API route that connects to Claude
    try {
      const response = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        console.log("Logistics ticket successfully queued for Admin approval!");
      }
    } catch (err) {
      console.error("Dispatch endpoint failure:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-md bg-slate-800 rounded-xl p-6 shadow-2xl border border-slate-700">
        <h1 className="text-xl font-bold mb-2 text-cyan-400">SMART DISPATCH NETWORK</h1>
        <p className="text-xs text-slate-400 mb-6">User: {userProfile.name} ({userProfile.phone})</p>

        {flightStatus === "idle" && (
          <form onSubmit={handleSubmitOrder} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">Describe Emergency & Payload Needs</label>
              <textarea
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-cyan-500 h-28 resize-none"
                placeholder="e.g., I have an asthmatic patient near KICC tower, need an inhaler payload dispatched immediately..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs text-slate-400">
              {coords ? (
                <p className="text-emerald-400 font-mono">✅ Hardware GPS Locked: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</p>
              ) : (
                <p className="text-amber-400 animate-pulse">📡 Fetching real-time satellite coordinates...</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-4 rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              {isSubmitting ? "Generating Flight Vector..." : "Transmit Dispatch Request"}
            </button>
          </form>
        )}

        {flightStatus === "pending_admin" && (
          <div className="text-center py-8 space-y-4">
            <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <h2 className="text-lg font-semibold animate-pulse">Awaiting Operations Commander Approval</h2>
            <p className="text-xs text-slate-400 px-4">Claude has structuralized your data and sent the coordinates to the Admin console hub.</p>
          </div>
        )}
      </div>
    </div>
  );
}