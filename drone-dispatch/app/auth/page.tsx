"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  EMAIL_OTP_LENGTH,
  MAX_EMAIL_OTP_LENGTH,
  requestSignInCode,
  requestSignUpCode,
  verifyEmailCode,
} from "../lib/auth";

type AuthMode = "signin" | "signup" | "verify";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [pendingMode, setPendingMode] = useState<Exclude<AuthMode, "verify">>("signin");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await requestSignUpCode(email, fullName);
    if (result.success) {
      setPendingMode("signup");
      setMode("verify");
    } else {
      setError(result.error || "Sign up failed");
    }
    setLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await requestSignInCode(email);
    if (result.success) {
      setPendingMode("signin");
      setMode("verify");
    } else {
      setError(result.error || "Could not send verification code");
    }
    setLoading(false);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await verifyEmailCode(email, otpCode, pendingMode === "signup" ? fullName : undefined);
    if (result.success) {
      router.push("/customer");
    } else {
      setError(result.error || "Verification failed");
    }
    setLoading(false);
  };

  const handleResend = async () => {
    setResending(true);
    setError("");

    const result =
      pendingMode === "signup"
        ? await requestSignUpCode(email, fullName)
        : await requestSignInCode(email);

    if (!result.success) {
      setError(result.error || "Could not send verification code");
    }

    setResending(false);
  };

  return (
    <div className="relative min-h-screen bg-[#f0f2f5] text-[#2d3748] flex items-center justify-center font-sans antialiased overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#dfebd4] via-[#e2e9e1] to-[#f3e7dc] z-0" />
      <div className="absolute top-[-15%] right-[15%] w-[500px] h-[500px] bg-[#cbdcc1] rounded-full blur-[140px] opacity-50 mix-blend-multiply z-0 pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[10%] w-[400px] h-[400px] bg-[#f3e7dc] rounded-full blur-[120px] opacity-40 mix-blend-multiply z-0 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-white/50 backdrop-blur-xl border border-white/60 rounded-2xl flex items-center justify-center shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)]">
            <span className="text-2xl">🚁</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1a202c]">Drone Dispatch</h1>
          <p className="text-xs text-slate-500 mt-1">Medical Drone Dispatch — Nairobi</p>
        </div>

        {/* Auth Card */}
        <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-8 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)]">
          {/* Mode Toggle */}
          {mode !== "verify" && (
            <div className="flex bg-white/50 border border-white/80 rounded-full p-1 mb-6">
              <button
                onClick={() => { setMode("signin"); setPendingMode("signin"); setError(""); }}
                className={`flex-1 py-2 rounded-full text-xs font-bold tracking-wider transition-colors cursor-pointer ${
                  mode === "signin" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                SIGN IN
              </button>
              <button
                onClick={() => { setMode("signup"); setPendingMode("signup"); setError(""); }}
                className={`flex-1 py-2 rounded-full text-xs font-bold tracking-wider transition-colors cursor-pointer ${
                  mode === "signup" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                SIGN UP
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 mb-4">
              <p className="text-xs text-red-600 font-medium">{error}</p>
            </div>
          )}

          {/* ── SIGN IN ── */}
          {mode === "signin" && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600/80 px-1">Email Address</label>
                <div className="bg-white/50 border border-white/80 rounded-2xl px-4 py-3 focus-within:bg-white/80 transition-colors">
                  <input
                    type="email"
                    className="w-full bg-transparent text-sm focus:outline-none text-slate-800"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#e65328] hover:bg-[#d4431b] disabled:opacity-60 text-white font-semibold py-3.5 rounded-2xl text-xs tracking-wider uppercase shadow-[0_4px_12px_rgba(230,83,40,0.25)] transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? "Sending code..." : "Email Me a Code"}
              </button>
            </form>
          )}

          {/* ── SIGN UP ── */}
          {mode === "signup" && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600/80 px-1">Full Name</label>
                <div className="bg-white/50 border border-white/80 rounded-2xl px-4 py-3 focus-within:bg-white/80 transition-colors">
                  <input
                    type="text"
                    className="w-full bg-transparent text-sm focus:outline-none text-slate-800"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600/80 px-1">Email Address</label>
                <div className="bg-white/50 border border-white/80 rounded-2xl px-4 py-3 focus-within:bg-white/80 transition-colors">
                  <input
                    type="email"
                    className="w-full bg-transparent text-sm focus:outline-none text-slate-800"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#e65328] hover:bg-[#d4431b] disabled:opacity-60 text-white font-semibold py-3.5 rounded-2xl text-xs tracking-wider uppercase shadow-[0_4px_12px_rgba(230,83,40,0.25)] transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? "Sending code..." : "Sign Up & Email Code"}
              </button>
            </form>
          )}

          {/* ── OTP VERIFICATION ── */}
          {mode === "verify" && (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="text-center mb-4">
                <div className="w-14 h-14 mx-auto mb-3 bg-emerald-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">✉️</span>
                </div>
                <h3 className="text-sm font-bold text-[#1a202c]">Verify Your Email</h3>
                <p className="text-xs text-slate-500 mt-1">
                  We sent a verification code to <span className="font-mono font-bold">{email}</span>
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600/80 px-1">Verification Code</label>
                <div className="bg-white/50 border border-white/80 rounded-2xl px-4 py-3 focus-within:bg-white/80 transition-colors">
                  <input
                    type="text"
                    className="w-full bg-transparent text-lg text-center focus:outline-none text-slate-800 font-mono font-bold tracking-[0.32em]"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, MAX_EMAIL_OTP_LENGTH))}
                    placeholder={"0".repeat(EMAIL_OTP_LENGTH)}
                    maxLength={MAX_EMAIL_OTP_LENGTH}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || otpCode.length !== EMAIL_OTP_LENGTH}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-2xl text-xs tracking-wider uppercase shadow-[0_4px_12px_rgba(16,185,129,0.25)] transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? "Verifying..." : "Verify & Continue"}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={resending || loading}
                className="w-full text-xs text-[#e65328] hover:text-[#d4431b] disabled:opacity-60 font-semibold uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed"
              >
                {resending ? "Sending..." : "Resend Code"}
              </button>

              <button
                type="button"
                onClick={() => { setOtpCode(""); setMode(pendingMode); }}
                className="w-full text-xs text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
              >
                ← Back
              </button>
            </form>
          )}
        </div>

        {/* Admin link */}
        <div className="text-center mt-6">
          <a href="/admin" className="text-[10px] text-slate-400 hover:text-slate-600 uppercase tracking-widest font-medium transition-colors">
            Admin Console →
          </a>
        </div>
      </div>
    </div>
  );
}
