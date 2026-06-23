"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Stethoscope, TrendingUp, Loader2, UserPlus, ChevronRight,
  Copy, CheckCircle2, X,
} from "lucide-react";
import Cookies from "js-cookie";
import HospitalNavbar from "@/components/HospitalNavbar";
import { ToastContainer, useToast } from "@/components/Toast";
import { hospitalApi, authApi } from "@/lib/api";

interface Doctor {
  id: string; name: string; specialty: string; experience_years: number;
  rating: number; total_patients: number; appointments_this_month: number;
}

interface Credentials { email: string; temp_password: string; }

export default function HospitalDoctorsPage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();

  const [userName, setUserName] = useState("");
  const [role, setRole] = useState("");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", specialty: "General Medicine", qualification: "MBBS", experience_years: 5 });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [newCreds, setNewCreds] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) { router.push("/hospital/login"); return; }

    const init = async () => {
      try {
        const me = await authApi.me();
        const u = me.data;
        if (u.role !== "admin" && u.role !== "doctor") { router.push("/dashboard"); return; }
        setUserName(u.name || "");
        setRole(u.role || "");

        if (u.role === "admin") {
          const res = await hospitalApi.doctors().catch(() => null);
          if (res) setDoctors(res.data);
        }
      } catch { router.push("/hospital/login"); }
      finally { setLoading(false); }
    };
    init();
  }, [router]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    try {
      const res = await hospitalApi.inviteDoctor(inviteForm as unknown as Record<string, unknown>);
      setNewCreds(res.data.credentials);
      const refreshed = await hospitalApi.doctors().catch(() => null);
      if (refreshed) setDoctors(refreshed.data);
      toast("Doctor invited successfully!", "success");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast(msg || "Failed to invite doctor.", "error");
    } finally { setInviteLoading(false); }
  };

  const handleCopyCreds = () => {
    if (!newCreds) return;
    navigator.clipboard.writeText(`Email: ${newCreds.email}\nPassword: ${newCreds.temp_password}\nLogin: /hospital/login`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetInviteModal = () => {
    setInviteOpen(false);
    setNewCreds(null);
    setCopied(false);
    setInviteForm({ name: "", email: "", specialty: "General Medicine", qualification: "MBBS", experience_years: 5 });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--gray-50)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <HospitalNavbar userName={userName} role={role} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/10" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                  <Stethoscope className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-extrabold text-white">Doctors</h1>
                  <p className="text-white/70 text-sm">{doctors.length} on staff</p>
                </div>
              </div>
              {role === "admin" && (
                <button
                  onClick={() => setInviteOpen(true)}
                  className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                >
                  <UserPlus className="w-4 h-4" /> Invite Doctor
                </button>
              )}
            </div>
          </motion.div>
        </div>
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 24" fill="none" preserveAspectRatio="none">
          <path d="M0 24L1440 0V24H0Z" fill="#F8FAFC" />
        </svg>
        <div className="h-6" />
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {role !== "admin" ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <Stethoscope className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Doctor directory is visible to admins only.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="h-1 w-full" style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }} />

            <div className="overflow-x-auto">
              {doctors.length === 0 ? (
                <div className="text-center py-20">
                  <Stethoscope className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">No doctors yet. Use &quot;Invite Doctor&quot; to add staff.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Doctor</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Specialty</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Experience</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Patients</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">This Month</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Rating</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {doctors.map((d, i) => (
                      <motion.tr
                        key={d.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        whileHover={{ backgroundColor: "#F8FAFC" }}
                        className="transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
                              style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}
                            >
                              {d.name.replace("Dr. ", "").split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800">{d.name}</p>
                              <p className="text-xs text-gray-400">{d.qualification ?? ""}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-gray-600">{d.specialty}</td>
                        <td className="px-4 py-4 text-gray-500">{d.experience_years}y</td>
                        <td className="px-4 py-4 font-semibold text-gray-800">{d.total_patients}</td>
                        <td className="px-4 py-4 text-gray-600">{d.appointments_this_month} apts</td>
                        <td className="px-4 py-4">
                          <span className="text-amber-500 font-bold">★ {d.rating}</span>
                        </td>
                        <td className="px-4 py-4">
                          <Link
                            href={`/hospital/doctors/${d.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 hover:underline"
                          >
                            <TrendingUp className="w-3.5 h-3.5" /> Analytics <ChevronRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Invite Doctor Modal */}
      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={e => { if (e.target === e.currentTarget) resetInviteModal(); }}
        >
          <motion.div
            initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}>
                <UserPlus className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Invite a Doctor</h3>
                <p className="text-xs text-gray-400">A temporary password will be generated</p>
              </div>
              <button onClick={resetInviteModal} className="ml-auto text-gray-300 hover:text-gray-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {newCreds ? (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-emerald-800 mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Doctor invited successfully!
                  </p>
                  <p className="text-xs text-gray-600 mb-1">Share these credentials with the doctor:</p>
                  <div className="bg-white rounded-lg border border-emerald-100 p-3 font-mono text-sm space-y-1">
                    <p><span className="text-gray-400">Email:</span> {newCreds.email}</p>
                    <p><span className="text-gray-400">Password:</span> {newCreds.temp_password}</p>
                    <p><span className="text-gray-400">Login:</span> /hospital/login</p>
                  </div>
                </div>
                <button
                  onClick={handleCopyCreds}
                  className="w-full border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"
                >
                  {copied ? <><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy credentials</>}
                </button>
                <button onClick={resetInviteModal} className="w-full gradient-btn py-2.5 rounded-xl text-sm font-semibold">Done</button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-3">
                {[
                  { label: "Full name *", key: "name", placeholder: "Dr. Riya Patel" },
                  { label: "Email address *", key: "email", placeholder: "dr.riya@hospital.com", type: "email" },
                  { label: "Specialty", key: "specialty", placeholder: "Cardiology" },
                  { label: "Qualification", key: "qualification", placeholder: "MBBS, MD" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{f.label}</label>
                    <input
                      type={f.type || "text"}
                      required={f.label.includes("*")}
                      value={inviteForm[f.key as keyof typeof inviteForm] as string}
                      onChange={e => setInviteForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none text-sm transition-all"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Experience (years)</label>
                  <input
                    type="number" min={0} max={50}
                    value={inviteForm.experience_years}
                    onChange={e => setInviteForm(prev => ({ ...prev, experience_years: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none text-sm transition-all"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={resetInviteModal}
                    className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all">
                    Cancel
                  </button>
                  <button type="submit" disabled={inviteLoading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 text-white"
                    style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}>
                    {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Invite"}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
