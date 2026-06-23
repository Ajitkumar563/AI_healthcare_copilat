"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Building2, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import Cookies from "js-cookie";
import { hospitalApi } from "@/lib/api";

export default function HospitalRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    hospital_name: "",
    address: "",
    city: "",
    phone: "",
    admin_name: "",
    admin_email: "",
    admin_password: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.admin_password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError(""); setLoading(true);
    try {
      const res = await hospitalApi.register(form);
      Cookies.set("access_token", res.data.access_token, { expires: 7 });
      Cookies.set("user_name", res.data.user?.name || "", { expires: 7 });
      Cookies.set("user_email", res.data.user?.email || "", { expires: 7 });
      router.push("/hospital/dashboard");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Registration failed. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[var(--gray-50)] flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "var(--gradient-hero)" }}
          >
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold gradient-text mb-2">Register your Hospital</h1>
          <p className="text-sm text-gray-400">
            Set up your hospital on Sahaay and create the admin account.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] p-8 space-y-5"
        >
          {/* Hospital details */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Hospital Details</p>
            <div className="space-y-3">
              <Field label="Hospital name *" value={form.hospital_name} onChange={set("hospital_name")} placeholder="City General Hospital" required />
              <Field label="Address" value={form.address} onChange={set("address")} placeholder="42, MG Road" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="City" value={form.city} onChange={set("city")} placeholder="Bengaluru" />
                <Field label="Phone" value={form.phone} onChange={set("phone")} placeholder="+91-80-12345678" type="tel" />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Admin account */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Admin Account</p>
            <div className="space-y-3">
              <Field label="Your name *" value={form.admin_name} onChange={set("admin_name")} placeholder="Dr. Jane Smith" required />
              <Field label="Email address *" value={form.admin_email} onChange={set("admin_email")} placeholder="admin@hospital.com" type="email" required />
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">Password *</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    minLength={8}
                    value={form.admin_password}
                    onChange={set("admin_password")}
                    placeholder="Min. 8 characters"
                    className="w-full pr-10 px-4 py-3 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/10 text-sm transition-all"
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
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full gradient-btn py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><span>Create Hospital Account</span><ArrowRight className="w-4 h-4" /></>}
          </button>

          <p className="text-center text-xs text-gray-400">
            Already registered?{" "}
            <Link href="/hospital/login" className="text-[var(--primary)] font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text", required,
}: {
  label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/10 text-sm transition-all"
      />
    </div>
  );
}
