"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Minimal SpeechRecognition types (no `any`) ──────────────────────────────
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: { isFinal: boolean; [index: number]: { transcript: string } };
  };
}
interface SpeechRecognitionHandle {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionHandle;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  if (typeof w["SpeechRecognition"] === "function") return w["SpeechRecognition"] as SpeechRecognitionCtor;
  if (typeof w["webkitSpeechRecognition"] === "function") return w["webkitSpeechRecognition"] as SpeechRecognitionCtor;
  return null;
}

// ── Types ────────────────────────────────────────────────────────────────────
interface AIDispatchResult {
  payloadItem: string;
  urgencyLevel: string;
  locationName: string | null;
  summary: string;
}

interface EmergencyPanelProps {
  userPhone: string;
  userName: string;
  userId: string | null;
  coords: { lat: number; lng: number } | null;
  onEmergencySubmit: (notes: string) => void;
  onVoiceDispatched: (orderId: string, ticketId: string | null) => void;
}

type PanelMode = "idle" | "recording" | "processing" | "dispatched" | "error";

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const URGENCY_COLOR: Record<string, string> = {
  CRITICAL: "text-red-600 bg-red-50 border-red-200",
  HIGH: "text-orange-600 bg-orange-50 border-orange-200",
  STANDARD: "text-emerald-600 bg-emerald-50 border-emerald-200",
};

// ── Component ────────────────────────────────────────────────────────────────
export default function EmergencyPanel({
  userPhone,
  userName,
  userId,
  coords,
  onEmergencySubmit,
  onVoiceDispatched,
}: EmergencyPanelProps) {
  const [mode, setMode] = useState<PanelMode>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [dispatchResult, setDispatchResult] = useState<AIDispatchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [notes, setNotes] = useState("");

  const recognitionRef = useRef<SpeechRecognitionHandle | null>(null);
  const transcriptRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Recording timer
  useEffect(() => {
    if (mode === "recording") {
      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [mode]);

  const startRecording = useCallback(() => {
    const SpeechAPI = getSpeechRecognition();
    if (!SpeechAPI) {
      setErrorMsg("Voice recognition isn't supported in this browser. Use Chrome or Edge, or use the text form below.");
      setMode("error");
      return;
    }

    const recognition = new SpeechAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    const finalParts: string[] = [];

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalParts.push(event.results[i][0].transcript.trim());
        }
      }
      const last = event.results[event.results.length - 1];
      const interim = !last.isFinal ? last[0].transcript : "";
      const display = [...finalParts, interim].filter(Boolean).join(" ");
      transcriptRef.current = finalParts.join(" ");
      setLiveTranscript(display);
    };

    recognition.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setErrorMsg("Microphone permission denied. Allow microphone access in your browser settings, then try again.");
        setMode("error");
      } else if (e.error !== "aborted" && e.error !== "no-speech") {
        setErrorMsg(`Recording error: ${e.error}. Try again or use the text form below.`);
        setMode("error");
      }
    };

    recognition.onend = () => {
      // If still recording (recognition stopped by itself), restart to keep it continuous
      if (recognitionRef.current === recognition) {
        try { recognition.start(); } catch { /* recognition already restarting */ }
      }
    };

    recognitionRef.current = recognition;
    transcriptRef.current = "";
    setLiveTranscript("");
    setRecordingSeconds(0);

    try {
      recognition.start();
      setMode("recording");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not access microphone";
      setErrorMsg(`${msg} — check that your browser has microphone permission.`);
      setMode("error");
    }
  }, []);

  const stopAndDispatch = useCallback(async () => {
    // Clear ref BEFORE calling stop so the onend handler doesn't restart recording
    const r = recognitionRef.current;
    recognitionRef.current = null;
    r?.stop();

    const transcript = transcriptRef.current.trim();

    if (!transcript) {
      setErrorMsg("No speech was captured. Make sure your microphone is unmuted and speak clearly, then try again.");
      setMode("error");
      return;
    }

    setMode("processing");

    try {
      const res = await fetch("/api/emergency-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          coords,
          userPhone,
          userName,
          customerId: userId,
        }),
      });
      const data: { success?: boolean; error?: string; order?: { id: string }; ticket?: { id: string }; ai?: AIDispatchResult } = await res.json();

      if (res.ok && data.success && data.order) {
        setDispatchResult(data.ai ?? null);
        setMode("dispatched");
        setTimeout(() => onVoiceDispatched(data.order!.id, data.ticket?.id ?? null), 2000);
      } else {
        setErrorMsg(data.error || "Dispatch failed — please try the text form below.");
        setMode("error");
      }
    } catch {
      setErrorMsg("Network error — please try again.");
      setMode("error");
    }
  }, [coords, userPhone, userName, userId, onVoiceDispatched]);

  const showTextForm = mode === "idle" || mode === "error";

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className="bg-linear-to-r from-red-500 to-orange-500 rounded-2xl p-5 text-white shadow-[0_8px_24px_rgba(239,68,68,0.3)]">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
            <span className="text-xl">🚨</span>
          </div>
          <div>
            <h3 className="text-base font-bold">Emergency Dispatch</h3>
            <p className="text-xs text-white/80">AI-powered priority medical delivery</p>
          </div>
        </div>
        <p className="text-xs text-white/90 leading-relaxed">
          Describe your emergency by voice and our AI will identify the supplies needed and dispatch a drone to your location.
        </p>
      </div>

      {/* ── IDLE: Record button ── */}
      {mode === "idle" && (
        <button
          onClick={startRecording}
          className="w-full flex items-center justify-center gap-3 bg-red-600 hover:bg-red-700 text-white font-bold py-5 rounded-2xl text-sm tracking-wider uppercase shadow-[0_4px_16px_rgba(239,68,68,0.35)] transition-all active:scale-[0.99] cursor-pointer"
        >
          <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
          </span>
          Record Emergency Call
        </button>
      )}

      {/* ── RECORDING ── */}
      {mode === "recording" && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-bold text-red-700">Recording</span>
            </div>
            <span className="text-sm font-mono font-bold text-red-600">{formatTimer(recordingSeconds)}</span>
          </div>

          <p className="text-[11px] text-red-500">
            Speak clearly — describe the emergency and mention your location (e.g. &quot;I&apos;m at Sarit Centre&quot;)
          </p>

          {liveTranscript ? (
            <div className="bg-white/70 border border-red-100 rounded-xl p-3 min-h-15 max-h-32 overflow-y-auto">
              <p className="text-xs text-slate-700 italic leading-relaxed">&quot;{liveTranscript}&quot;</p>
            </div>
          ) : (
            <div className="bg-white/40 border border-red-100 rounded-xl p-3 h-14 flex items-center justify-center">
              <p className="text-xs text-slate-400 animate-pulse">Listening...</p>
            </div>
          )}

          <button
            onClick={stopAndDispatch}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-xs tracking-wider uppercase transition-all cursor-pointer"
          >
            ⏹ Stop &amp; Dispatch
          </button>
        </div>
      )}

      {/* ── PROCESSING ── */}
      {mode === "processing" && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[#e65328] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-orange-700">AI analyzing emergency call...</p>
          <p className="text-[11px] text-orange-500 text-center">Identifying supplies, determining location, calculating priority</p>
        </div>
      )}

      {/* ── DISPATCHED ── */}
      {mode === "dispatched" && dispatchResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">✅</span>
            <p className="text-sm font-bold text-emerald-700">Emergency Dispatched</p>
          </div>
          <div className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border w-fit ${URGENCY_COLOR[dispatchResult.urgencyLevel] ?? URGENCY_COLOR.STANDARD}`}>
            {dispatchResult.urgencyLevel}
          </div>
          <p className="text-sm font-bold text-slate-800">{dispatchResult.payloadItem}</p>
          {dispatchResult.locationName && (
            <p className="text-xs text-slate-600">📍 {dispatchResult.locationName}</p>
          )}
          <p className="text-[11px] text-slate-500 leading-relaxed">{dispatchResult.summary}</p>
          <p className="text-[10px] text-slate-400 pt-1 animate-pulse">Switching to live tracking...</p>
        </div>
      )}

      {/* ── ERROR ── */}
      {mode === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-bold text-red-700">⚠ {errorMsg}</p>
          <button
            onClick={() => { setMode("idle"); setErrorMsg(null); }}
            className="text-[10px] font-bold text-red-600 underline cursor-pointer"
          >
            Try again
          </button>
        </div>
      )}

      {/* ── OR divider + text form (shown in idle/error) ── */}
      {showTextForm && (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">or describe below</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="bg-white/50 border border-white/80 rounded-2xl p-4 space-y-3">
            <label className="block text-xs font-semibold text-slate-600/80">Emergency Description</label>
            <div className="bg-white/60 border border-white/80 rounded-xl p-3 focus-within:bg-white/90 transition-colors">
              <textarea
                className="w-full bg-transparent text-sm focus:outline-none text-slate-800 placeholder-slate-400 h-20 resize-none"
                placeholder="Describe the emergency, required supplies, and your location..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <button
              onClick={() => { if (notes.trim()) onEmergencySubmit(notes); }}
              disabled={!notes.trim()}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-xs tracking-wider uppercase transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              🚁 Submit Emergency Request
            </button>
          </div>
        </>
      )}

      {/* Info footer */}
      {showTextForm && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5">
          <p className="text-[11px] text-amber-700 leading-relaxed">
            <span className="font-bold">⚡ Emergency orders</span> are given top priority.
            The AI will load and dispatch the right supplies immediately.
            You will receive an SMS when the drone is en route.
          </p>
        </div>
      )}
    </div>
  );
}

