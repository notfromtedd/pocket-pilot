"use client";
import dynamic from "next/dynamic";

const GlovoMapInner = dynamic(() => import("./GlovoMapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-100 rounded-2xl">
      <div className="text-center">
        <div className="w-8 h-8 border-3 border-[#e65328] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-xs text-slate-400 font-medium">Loading map...</p>
      </div>
    </div>
  ),
});

interface GlovoMapProps {
  dronePosition: { lat: number; lng: number } | null;
  targetPosition: { lat: number; lng: number };
  customerPosition: { lat: number; lng: number };
  routePath?: { lat: number; lng: number }[];
  activeWaypointIndex?: number;
  isAiRoute?: boolean;
}

export default function GlovoMapWrapper(props: GlovoMapProps) {
  return <GlovoMapInner {...props} />;
}
