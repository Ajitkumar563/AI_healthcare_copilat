"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Building2, Mail, Lock, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import Cookies from "js-cookie";
import { hospitalApi } from "@/lib/api";

export default function HospitalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await hospitalApi.login(email, password);
      Cookies.set("access_token", res.data.access_token, { expires: 7 });
      Cookies.set("user_name", res.data.user?.name || "", { expires: 7 });
      Cookies.set("user_email", res.data.user?.email || email, { expires: 7 });
      router.push("/hospital/dashboard");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Invalid credentials. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[var(--gray-50)] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "var(--gradient-hero)" }}
          >
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold gradient-text mb-2">Hospital Staff Login</h1>
          <p className="text-sm text-gray-400">For admins and doctors. Patients use the{" "}
            <Link href="/auth/login" className="text-[var(--primary)] font-semibold hover:underline">regular login</Link>.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] p-8 space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">Email address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email" required
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="admin@hospital.com"
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/10 text-sm transition-all"
                suppressHydrationWarning
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={showPw ? "text" : "password"} required
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full pl-11 pr-10 py-3 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/10 text-sm transition-all"
                suppressHydrationWarning
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">{error}</div>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full gradient-btn py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><span>Sign in</span><ArrowRight className="w-4 h-4" /></>}
          </button>

          <p className="text-center text-xs text-gray-400 pt-1">
            New hospital?{" "}
            <Link href="/hospital/register" className="text-[var(--primary)] font-semibold hover:underline">
              Register here
            </Link>
          </p>
        </form>

        {/* Dev hint */}
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
          <strong>Seeded credentials:</strong><br />
          Admin → admin@sahaaytest.com / Admin@1234<br />
          Doctor → dr.sharma@sahaaytest.com / Doctor@1234
        </div>
      </motion.div>
    </div>
  );
}
