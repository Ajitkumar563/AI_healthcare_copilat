"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Mail, ArrowRight, Loader2, ShieldCheck, CheckCircle2, Activity, Brain, Users } from "lucide-react";
import Cookies from "js-cookie";
import { authApi } from "@/lib/api";

const FEATURES = [
  { icon: Activity, label: "AI Risk Scoring", desc: "Liver, kidney, heart & diabetes analysis" },
  { icon: Brain, label: "Chat with Reports", desc: "Ask questions in plain language" },
  { icon: Users, label: "Family Health", desc: "Track health for your entire family" },
];

const STATS = [
  { value: "10K+", label: "Reports Analyzed" },
  { value: "98%", label: "Accuracy Rate" },
];

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devOtp, setDevOtp] = useState("");

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await authApi.sendOtp(email, name, "patient");
      setDevOtp(res.data.otp || "");
      setStep("otp");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await authApi.verifyOtp(email, otp);
      Cookies.set("access_token", res.data.access_token, { expires: 1 });
      Cookies.set("user_name", res.data.user?.name || "", { expires: 1 });
      Cookies.set("user_email", res.data.user?.email || email, { expires: 1 });
      const role = res.data.user?.role;
      router.push(role === "admin" || role === "doctor" ? "/hospital/dashboard" : "/dashboard");
    } catch {
      setError("Invalid or expired OTP. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex">
      {/* ── LEFT: Gradient panel ── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10 relative overflow-hidden"
        style={{ background: "var(--gradient-dark)" }}
      >
        {/* Background circles */}
        <div className="absolute -top-16 -left-16 w-72 h-72 rounded-full bg-white/5" />
        <div className="absolute bottom-20 -right-20 w-80 h-80 rounded-full bg-cyan-500/10" />

        {/* Logo */}
        <div className="flex items-center gap-2.5 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <span className="text-white font-bold text-xl leading-none">+</span>
          </div>
          <span className="text-white text-xl font-extrabold tracking-tight">Sahaay</span>
        </div>

        {/* Main content */}
        <div className="relative z-10 my-auto">
          {/* Doctor image */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="relative w-full max-w-xs mb-8 mx-auto"
          >
            <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ transform: "rotate(-2deg)" }}>
              <Image
                src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&q=80"
                alt="Doctor"
                width={400}
                height={300}
                className="object-cover w-full h-56"
              />
            </div>
            {/* Floating stat cards */}
            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 + i * 0.15 }}
                className="absolute rounded-xl px-4 py-2.5 shadow-xl"
                style={{
                  ...(i === 0 ? { bottom: -16, left: -16 } : { top: -12, right: -16 }),
                  background: "rgba(255,255,255,0.15)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.3)",
                }}
              >
                <p className="text-lg font-extrabold text-white">{s.value}</p>
                <p className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.75)" }}>{s.label}</p>
              </motion.div>
            ))}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-3xl font-extrabold text-white mb-3 leading-tight"
          >
            Your AI Health<br />Copilot
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-white/70 text-sm mb-6"
          >
            Get instant insights from your medical reports. No jargon, just clarity.
          </motion.p>

          {/* Feature pills */}
          <div className="space-y-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                whileHover={{ backgroundColor: "rgba(255,255,255,0.22)" }}
                className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors"
                style={{
                  background: "rgba(255,255,255,0.15)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.3)",
                }}
              >
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  <f.icon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{f.label}</p>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.75)" }}>{f.desc}</p>
                </div>
                <CheckCircle2 className="w-4 h-4 ml-auto shrink-0" style={{ color: "rgba(255,255,255,0.7)" }} />
              </motion.div>
            ))}
          </div>
        </div>

        <p className="text-white/30 text-xs relative z-10">Student project demo · Not for real medical use</p>
      </div>

      {/* ── RIGHT: Auth form ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">
        {/* Mobile logo */}
        <Link href="/" className="flex items-center gap-2 mb-8 lg:hidden">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
            <span className="text-white font-bold text-lg">+</span>
          </div>
          <span className="text-xl font-extrabold gradient-text">Sahaay</span>
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {step === "email" ? (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-extrabold gradient-text mb-2">Welcome back 👋</h1>
                <p className="text-[var(--text-secondary)] text-sm">
                  Enter your details and we&apos;ll send you a one-time code.
                </p>
              </div>

              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">Your name</label>
                  <input
                    type="text" required value={name} onChange={e => setName(e.target.value)}
                    placeholder="Prarthna Gautam"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/10 text-sm transition-all"
                    suppressHydrationWarning
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email" required value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/10 text-sm transition-all"
                      suppressHydrationWarning
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">{error}</div>
                )}

                <button
                  type="submit" disabled={loading}
                  className="w-full gradient-btn py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Send code</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>

              <p className="text-center text-xs text-gray-400 mt-6">
                By continuing you agree this is a student demo — not for real medical decisions.
              </p>
            </>
          ) : (
            <>
              <div className="mb-8">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  <ShieldCheck className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-2xl font-extrabold gradient-text mb-2">Check your email</h1>
                <p className="text-[var(--text-secondary)] text-sm">
                  We sent a 6-digit code to <span className="font-semibold text-[var(--text-primary)]">{email}</span>
                </p>
              </div>

              {devOtp && (
                <div className="mb-5 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-xl">
                  Dev mode — your code is <span className="font-bold tracking-widest">{devOtp}</span>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">6-digit code</label>
                  <input
                    type="text" required maxLength={6}
                    value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="w-full px-4 py-4 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/10 text-center text-3xl tracking-[0.6em] font-bold transition-all"
                    suppressHydrationWarning
                  />
                </div>

                {error && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">{error}</div>
                )}

                <button
                  type="submit" disabled={loading || otp.length !== 6}
                  className="w-full gradient-btn py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify & continue"}
                </button>

                <button
                  type="button" onClick={() => setStep("email")}
                  className="w-full text-sm text-gray-400 hover:text-[var(--primary)] transition-colors py-2"
                >
                  Use a different email
                </button>
              </form>
            </>
          )}
          <div className="mt-8 text-center">
            <Link href="/hospital/login" className="text-xs text-gray-400 hover:text-[var(--primary)] transition-colors">
              Hospital staff?{" "}
              <span className="font-medium underline underline-offset-2">Login here</span>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
