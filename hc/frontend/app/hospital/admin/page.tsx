"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import {
  BarChart3, Users, Stethoscope, Building2, ClipboardList,
  CreditCard, Loader2, UserPlus, Trash2, CheckCircle2, X,
  Copy, TrendingUp, TrendingDown, Activity, Zap, DollarSign,
  Calendar, ChevronRight, Plus, AlertTriangle, Shield,
  FileText, Star, MoreHorizontal,
} from "lucide-react";
import Cookies from "js-cookie";
import HospitalNavbar from "@/components/HospitalNavbar";
import { ToastContainer, useToast } from "@/components/Toast";
import { hospitalApi, authApi } from "@/lib/api";
import type { MonthPoint, SpecialtyPoint } from "./_AdminCharts";

// ─── Dynamic chart imports (no SSR) ──────────────────────────────────────────
const Charts = {
  Appointments: dynamic(() => import("./_AdminCharts").then(m => ({ default: m.AppointmentsChart })), { ssr: false }),
  Revenue:      dynamic(() => import("./_AdminCharts").then(m => ({ default: m.RevenueChart })),      { ssr: false }),
  Specialty:    dynamic(() => import("./_AdminCharts").then(m => ({ default: m.SpecialtyChart })),    { ssr: false }),
  AIUsage:      dynamic(() => import("./_AdminCharts").then(m => ({ default: m.AIUsageChart })),      { ssr: false }),
  Patients:     dynamic(() => import("./_AdminCharts").then(m => ({ default: m.PatientsChart })),     { ssr: false }),
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface Analytics {
  hospital_name: string;
  total_patients: number;
  total_doctors: number;
  total_reports: number;
  total_appointments: number;
  total_ai_calls: number;
  total_revenue: number;
  appointments_by_month: MonthPoint[];
  patients_by_month: MonthPoint[];
  appointments_by_specialty: SpecialtyPoint[];
  ai_calls_by_month: MonthPoint[];
  revenue_by_month: MonthPoint[];
}

interface Doctor {
  id: string; name: string; specialty: string; qualification?: string;
  experience_years: number; rating: number; total_patients: number;
  appointments_this_month: number;
}

interface Department {
  name: string; doctor_count: number; patient_count: number; appointment_count: number;
}

interface AuditLog {
  id: string; type: string; actor: string; actor_role: string;
  action: string; timestamp: string; badge: string | null;
}

interface Credentials { email: string; temp_password: string; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function logIcon(type: string) {
  switch (type) {
    case "report_upload":   return { icon: FileText,      color: "text-teal-600",   bg: "bg-teal-50"   };
    case "approved":        return { icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-50" };
    case "rejected":        return { icon: X,             color: "text-red-500",    bg: "bg-red-50"    };
    case "appointment":     return { icon: Calendar,      color: "text-purple-600", bg: "bg-purple-50" };
    default:                return { icon: Activity,      color: "text-gray-500",   bg: "bg-gray-50"   };
  }
}

const PLAN_LIMITS = { patients: 100, ai_calls: 500, doctors: 5 };
const BILLING_HISTORY = [
  { date: "Jun 2026", plan: "Starter", amount: "₹0",     status: "Free tier" },
  { date: "May 2026", plan: "Starter", amount: "₹0",     status: "Free tier" },
  { date: "Apr 2026", plan: "Starter", amount: "₹0",     status: "Free tier" },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const Skel = ({ className }: { className: string }) => (
  <div className={`skeleton rounded-xl ${className}`} />
);

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, icon: Icon, gradient, prefix = "", suffix = "", trend,
}: {
  label: string; value: number | string; icon: React.ElementType;
  gradient: string; prefix?: string; suffix?: string; trend?: number;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="h-1" style={{ background: gradient }} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: gradient + "22" }}>
            <Icon className="w-5 h-5" style={{ color: gradient.match(/#[A-Fa-f0-9]{6}/)?.[0] ?? "#0F766E" }} />
          </div>
          {trend !== undefined && (
            <span className={`text-xs font-bold flex items-center gap-0.5 ${trend >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
        <p className="text-3xl font-extrabold text-gray-900 leading-none">
          {prefix}{typeof value === "number" ? value.toLocaleString("en-IN") : value}{suffix}
        </p>
        <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
      </div>
    </div>
  );
}

// ─── Chart Card ──────────────────────────────────────────────────────────────
function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-gray-50">
        <p className="font-bold text-gray-800 text-sm">{title}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",    label: "Overview",    icon: BarChart3     },
  { id: "doctors",     label: "Doctors",     icon: Stethoscope   },
  { id: "departments", label: "Departments", icon: Building2     },
  { id: "audit",       label: "Audit Logs",  icon: ClipboardList },
  { id: "billing",     label: "Billing",     icon: CreditCard    },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminPanelPage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();

  const [userName, setUserName] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);

  // Data
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditFilter, setAuditFilter] = useState("all");

  // Doctor actions
  const [removeConfirm, setRemoveConfirm] = useState<Doctor | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [presetSpecialty, setPresetSpecialty] = useState("");
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", specialty: "General Medicine", qualification: "MBBS", experience_years: 5 });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [newCreds, setNewCreds] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);

  const openInvite = useCallback((specialty = "") => {
    setPresetSpecialty(specialty);
    setInviteForm(f => ({ ...f, specialty: specialty || f.specialty }));
    setNewCreds(null);
    setInviteOpen(true);
  }, []);

  const resetInvite = useCallback(() => {
    setInviteOpen(false);
    setNewCreds(null);
    setCopied(false);
    setInviteForm({ name: "", email: "", specialty: "General Medicine", qualification: "MBBS", experience_years: 5 });
  }, []);

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) { router.push("/hospital/login"); return; }
    const init = async () => {
      try {
        const me = await authApi.me();
        const u = me.data;
        if (u.role !== "admin") { router.push("/hospital/dashboard"); return; }
        setUserName(u.name || "");

        const [analyticsRes, doctorsRes, deptRes, auditRes] = await Promise.allSettled([
          hospitalApi.analytics(),
          hospitalApi.doctors(),
          hospitalApi.departments(),
          hospitalApi.auditLogs(),
        ]);

        if (analyticsRes.status === "fulfilled") setAnalytics(analyticsRes.value.data);
        if (doctorsRes.status === "fulfilled") setDoctors(doctorsRes.value.data);
        if (deptRes.status === "fulfilled") setDepartments(deptRes.value.data);
        if (auditRes.status === "fulfilled") setAuditLogs(auditRes.value.data);
      } catch { router.push("/hospital/login"); }
      finally { setLoading(false); }
    };
    init();
  }, [router]);

  const handleRemoveDoctor = async (doc: Doctor) => {
    setRemoving(doc.id);
    try {
      await hospitalApi.removeDoctor(doc.id);
      setDoctors(prev => prev.filter(d => d.id !== doc.id));
      toast(`${doc.name} removed from hospital.`, "success");
    } catch { toast("Failed to remove doctor.", "error"); }
    finally { setRemoving(null); setRemoveConfirm(null); }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    try {
      const res = await hospitalApi.inviteDoctor(inviteForm as unknown as Record<string, unknown>);
      setNewCreds(res.data.credentials);
      const refreshed = await hospitalApi.doctors().catch(() => null);
      if (refreshed) setDoctors(refreshed.data);
      const refreshedDepts = await hospitalApi.departments().catch(() => null);
      if (refreshedDepts) setDepartments(refreshedDepts.data);
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

  const filteredLogs = auditFilter === "all"
    ? auditLogs
    : auditLogs.filter(l =>
        auditFilter === "reports" ? l.type === "report_upload"
        : auditFilter === "approvals" ? l.type === "approved" || l.type === "rejected"
        : l.type === "appointment"
      );

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--gray-50)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <HospitalNavbar userName={userName} role="admin" />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* ── Remove Doctor Confirm Modal ── */}
      <AnimatePresence>
        {removeConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900 text-center mb-1">Remove Doctor</h3>
              <p className="text-sm text-gray-500 text-center mb-5">
                Remove <span className="font-semibold text-gray-800">{removeConfirm.name}</span> from your hospital? Their account will remain but lose hospital access.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setRemoveConfirm(null)}
                  className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all">
                  Cancel
                </button>
                <button
                  onClick={() => handleRemoveDoctor(removeConfirm)}
                  disabled={removing === removeConfirm.id}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60">
                  {removing === removeConfirm.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Remove"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Invite Doctor Modal ── */}
      <AnimatePresence>
        {inviteOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) resetInvite(); }}>
            <motion.div initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-hero)" }}>
                  <UserPlus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Invite a Doctor</h3>
                  <p className="text-xs text-gray-400">{presetSpecialty ? `Adding to ${presetSpecialty} dept.` : "Temporary password will be generated"}</p>
                </div>
                <button onClick={resetInvite} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>

              {newCreds ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-emerald-800 mb-3 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Doctor invited!
                    </p>
                    <div className="bg-white rounded-lg border border-emerald-100 p-3 font-mono text-sm space-y-1">
                      <p><span className="text-gray-400">Email:</span> {newCreds.email}</p>
                      <p><span className="text-gray-400">Password:</span> {newCreds.temp_password}</p>
                      <p><span className="text-gray-400">Login:</span> /hospital/login</p>
                    </div>
                  </div>
                  <button onClick={handleCopyCreds}
                    className="w-full border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-gray-50 transition-all">
                    {copied ? <><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy credentials</>}
                  </button>
                  <button onClick={resetInvite} className="w-full gradient-btn py-2.5 rounded-xl text-sm font-semibold">Done</button>
                </div>
              ) : (
                <form onSubmit={handleInvite} className="space-y-3">
                  {[
                    { label: "Full name *", key: "name", placeholder: "Dr. Riya Patel" },
                    { label: "Email *", key: "email", placeholder: "dr.riya@hospital.com", type: "email" },
                    { label: "Specialty", key: "specialty", placeholder: "Cardiology" },
                    { label: "Qualification", key: "qualification", placeholder: "MBBS, MD" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">{f.label}</label>
                      <input type={f.type || "text"} required={f.label.includes("*")}
                        value={inviteForm[f.key as keyof typeof inviteForm] as string}
                        onChange={e => setInviteForm(p => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none text-sm transition-all" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Experience (years)</label>
                    <input type="number" min={0} max={50} value={inviteForm.experience_years}
                      onChange={e => setInviteForm(p => ({ ...p, experience_years: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none text-sm transition-all" />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={resetInvite}
                      className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all">Cancel</button>
                    <button type="submit" disabled={inviteLoading}
                      className="flex-1 gradient-btn py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                      {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Invite"}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/10" />
          <div className="absolute bottom-0 left-1/4 w-48 h-48 rounded-full bg-cyan-400/15" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-white/60" />
                <span className="text-white/60 text-xs font-semibold uppercase tracking-widest">Admin Panel</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                {analytics?.hospital_name ?? "Hospital"} CRM
              </h1>
              <p className="text-white/70 text-sm mt-0.5">Full control · Audit logs · Analytics · Staff management</p>
            </div>
            <Link href="/hospital/dashboard"
              className="hidden sm:flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all">
              <BarChart3 className="w-4 h-4" /> Dashboard
            </Link>
          </div>
        </div>
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 20" fill="none" preserveAspectRatio="none">
          <path d="M0 20L1440 0V20H0Z" fill="#F8FAFC" />
        </svg>
        <div className="h-5" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Tab Bar ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] p-1.5 flex gap-1 overflow-x-auto">
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex-1 justify-center ${
                  active ? "text-white shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                }`}
                style={active ? { background: "var(--gradient-hero)" } : undefined}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ══════════════════════════════════════════════════════
            TAB: OVERVIEW
        ══════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {analytics ? (
                <>
                  <KpiCard label="Total Patients"    value={analytics.total_patients}    icon={Users}       gradient="linear-gradient(135deg,#0F766E,#06B6D4)" />
                  <KpiCard label="Est. Revenue"      value={analytics.total_revenue}     icon={DollarSign}  gradient="linear-gradient(135deg,#7C3AED,#A78BFA)" prefix="₹" />
                  <KpiCard label="Total Appointments" value={analytics.total_appointments} icon={Calendar}   gradient="linear-gradient(135deg,#DC2626,#F87171)" />
                  <KpiCard label="AI Calls"          value={analytics.total_ai_calls}    icon={Zap}         gradient="linear-gradient(135deg,#0369A1,#38BDF8)" />
                </>
              ) : (
                Array.from({ length: 4 }, (_, i) => <Skel key={i} className="h-28" />)
              )}
            </div>

            {/* Charts row 1 */}
            <div className="grid lg:grid-cols-2 gap-6">
              <ChartCard title="Appointments Over Time" subtitle="Monthly appointment volume">
                {analytics?.appointments_by_month?.length ? (
                  <Charts.Appointments data={analytics.appointments_by_month} />
                ) : <Skel className="h-52" />}
              </ChartCard>
              <ChartCard title="Estimated Revenue" subtitle="₹800/video · ₹500/in-person">
                {analytics?.revenue_by_month?.length ? (
                  <Charts.Revenue data={analytics.revenue_by_month} />
                ) : <Skel className="h-52" />}
              </ChartCard>
            </div>

            {/* Charts row 2 */}
            <div className="grid lg:grid-cols-2 gap-6">
              <ChartCard title="Active Patients by Month" subtitle="Distinct patients per month">
                {analytics?.patients_by_month?.length ? (
                  <Charts.Patients data={analytics.patients_by_month} />
                ) : <Skel className="h-52" />}
              </ChartCard>
              <ChartCard title="AI Usage by Month" subtitle="Reports analyzed by AI">
                {analytics?.ai_calls_by_month?.length ? (
                  <Charts.AIUsage data={analytics.ai_calls_by_month} />
                ) : (
                  <div className="h-52 flex items-center justify-center text-gray-400 text-sm">
                    <div className="text-center">
                      <Zap className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                      No AI calls recorded yet
                    </div>
                  </div>
                )}
              </ChartCard>
            </div>

            {/* Appointments by Specialty — full width */}
            <ChartCard title="Appointments by Department" subtitle="Volume per specialty">
              {analytics?.appointments_by_specialty?.length ? (
                <Charts.Specialty data={analytics.appointments_by_specialty} />
              ) : <Skel className="h-52" />}
            </ChartCard>

            {/* Summary numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Doctors on staff",  val: analytics?.total_doctors ?? "—",     icon: Stethoscope, color: "text-purple-600" },
                { label: "Total reports",      val: analytics?.total_reports ?? "—",     icon: FileText,    color: "text-teal-600"   },
                { label: "Departments",        val: departments.length || "—",           icon: Building2,   color: "text-blue-600"   },
                { label: "Pending audits",     val: auditLogs.filter(l => l.type === "report_upload").length || "—", icon: ClipboardList, color: "text-amber-600" },
              ].map(({ label, val, icon: Icon, color }) => (
                <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] p-4 flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${color} shrink-0`} />
                  <div>
                    <p className="font-extrabold text-gray-900 text-lg leading-none">{val}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: DOCTORS
        ══════════════════════════════════════════════════════ */}
        {activeTab === "doctors" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }} />
            <div className="px-6 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-purple-500" /> Doctors Management
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">{doctors.length} doctors on staff</p>
              </div>
              <button onClick={() => openInvite()}
                className="gradient-btn px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5">
                <UserPlus className="w-4 h-4" /> Invite Doctor
              </button>
            </div>

            {doctors.length === 0 ? (
              <div className="py-20 text-center">
                <Stethoscope className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No doctors yet. Click &quot;Invite Doctor&quot; to add staff.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Doctor</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Specialty</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Exp.</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Patients</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">This Month</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Rating</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {doctors.map((d, i) => (
                      <motion.tr key={d.id}
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                        className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
                              style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}>
                              {d.name.replace("Dr. ", "").split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800">{d.name}</p>
                              <p className="text-xs text-gray-400">{d.qualification ?? ""}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                            {d.specialty}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-gray-500">{d.experience_years}y</td>
                        <td className="px-4 py-4 font-semibold text-gray-800">{d.total_patients}</td>
                        <td className="px-4 py-4 text-gray-500">{d.appointments_this_month} apts</td>
                        <td className="px-4 py-4">
                          <span className="text-amber-500 font-bold text-sm">★ {d.rating}</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 justify-end">
                            <Link href={`/hospital/doctors/${d.id}`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 hover:underline">
                              <TrendingUp className="w-3.5 h-3.5" /> Analytics
                            </Link>
                            <button onClick={() => setRemoveConfirm(d)}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: DEPARTMENTS
        ══════════════════════════════════════════════════════ */}
        {activeTab === "departments" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900">Departments</h2>
                <p className="text-sm text-gray-400">Derived from doctor specialties · {departments.length} departments</p>
              </div>
              <button onClick={() => openInvite()}
                className="flex items-center gap-1.5 gradient-btn px-4 py-2 rounded-xl text-sm font-semibold">
                <Plus className="w-4 h-4" /> Add Department
              </button>
            </div>

            {departments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] py-20 text-center">
                <Building2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No departments yet. Invite doctors to create departments.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {departments.map((dept, i) => (
                  <motion.div key={dept.name}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                    className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden hover:shadow-md transition-shadow">
                    <div className="h-1" style={{ background: "var(--gradient-hero)" }} />
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
                          <Stethoscope className="w-5 h-5 text-white" />
                        </div>
                        <button onClick={() => openInvite(dept.name)}
                          className="text-xs font-semibold text-[var(--primary)] hover:underline flex items-center gap-0.5">
                          <Plus className="w-3 h-3" /> Add Doctor
                        </button>
                      </div>
                      <h3 className="font-bold text-gray-900 text-base mb-3">{dept.name}</h3>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {[
                          { val: dept.doctor_count,      label: "Doctors"   },
                          { val: dept.patient_count,     label: "Patients"  },
                          { val: dept.appointment_count, label: "Apts"      },
                        ].map(({ val, label }) => (
                          <div key={label} className="bg-gray-50 rounded-xl p-2">
                            <p className="font-extrabold text-gray-900 text-lg leading-none">{val}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: AUDIT LOGS
        ══════════════════════════════════════════════════════ */}
        {activeTab === "audit" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "linear-gradient(135deg,#D97706,#F59E0B)" }} />
            <div className="px-6 pt-5 pb-4 border-b border-gray-50 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-amber-500" /> Audit Logs
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">{filteredLogs.length} events</p>
              </div>
              {/* Filter chips */}
              <div className="flex gap-1.5 flex-wrap">
                {[["all","All"], ["reports","Reports"], ["approvals","Approvals"], ["appointments","Appointments"]].map(([val, label]) => (
                  <button key={val} onClick={() => setAuditFilter(val)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      auditFilter === val
                        ? "text-white border-transparent"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                    style={auditFilter === val ? { background: "var(--gradient-hero)" } : undefined}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
              {filteredLogs.length === 0 ? (
                <div className="py-16 text-center">
                  <ClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">No activity logged yet.</p>
                </div>
              ) : filteredLogs.map((log, i) => {
                const { icon: Icon, color, bg } = logIcon(log.type);
                return (
                  <motion.div key={log.id}
                    initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                    className="px-6 py-3.5 flex items-center gap-4 hover:bg-gray-50/60 transition-colors">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-800 truncate">{log.action}</p>
                        {log.badge && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase shrink-0">
                            {log.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        <span className={`font-semibold ${log.actor_role === "doctor" ? "text-purple-600" : "text-teal-600"}`}>{log.actor}</span>
                        {" · "}{log.actor_role}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 shrink-0 tabular-nums">{timeAgo(log.timestamp)}</p>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: BILLING
        ══════════════════════════════════════════════════════ */}
        {activeTab === "billing" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            {/* Current Plan */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
              <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
              <div className="p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-100">CURRENT PLAN</span>
                    </div>
                    <h2 className="text-2xl font-extrabold text-gray-900">Starter</h2>
                    <p className="text-gray-400 text-sm mt-0.5">Free tier · No credit card required</p>
                  </div>
                  <button className="gradient-btn px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Upgrade to Growth
                  </button>
                </div>

                {/* Usage meters */}
                <div className="mt-6 space-y-4">
                  {[
                    { label: "Patients", used: analytics?.total_patients ?? 0, limit: PLAN_LIMITS.patients, color: "#0F766E" },
                    { label: "AI Calls", used: analytics?.total_ai_calls ?? 0, limit: PLAN_LIMITS.ai_calls, color: "#7C3AED" },
                    { label: "Doctors",  used: analytics?.total_doctors ?? 0,  limit: PLAN_LIMITS.doctors,  color: "#DC2626" },
                  ].map(({ label, used, limit, color }) => {
                    const pct = Math.min(Math.round((used / limit) * 100), 100);
                    const warn = pct >= 80;
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-sm font-semibold text-gray-700">{label}</p>
                          <p className={`text-xs font-semibold ${warn ? "text-red-500" : "text-gray-500"}`}>
                            {used} / {limit}
                            {warn && <AlertTriangle className="w-3.5 h-3.5 inline ml-1" />}
                          </p>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <motion.div
                            className="h-2 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            style={{ background: warn ? "#EF4444" : color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Plan comparison */}
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                {
                  name: "Starter", price: "Free", current: true,
                  features: ["Up to 100 patients", "5 doctors", "500 AI calls/mo", "Basic analytics", "Email support"],
                  gradient: "linear-gradient(135deg,#E2E8F0,#CBD5E1)", textColor: "#475569",
                },
                {
                  name: "Growth", price: "₹2,999/mo", current: false,
                  features: ["Up to 1,000 patients", "20 doctors", "5,000 AI calls/mo", "Advanced analytics", "WhatsApp alerts", "Priority support"],
                  gradient: "var(--gradient-hero)", textColor: "#fff",
                },
                {
                  name: "Enterprise", price: "Custom", current: false,
                  features: ["Unlimited patients", "Unlimited doctors", "Unlimited AI calls", "Custom integrations", "Dedicated account manager", "SLA guarantee"],
                  gradient: "linear-gradient(135deg,#7C3AED,#A78BFA)", textColor: "#fff",
                },
              ].map(plan => (
                <div key={plan.name}
                  className={`rounded-2xl overflow-hidden border ${plan.current ? "border-teal-200" : "border-gray-100"} shadow-[var(--shadow-sm)]`}>
                  <div className="h-1.5" style={{ background: plan.gradient }} />
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-bold text-gray-900">{plan.name}</h3>
                      {plan.current && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100">Current</span>}
                    </div>
                    <p className="text-2xl font-extrabold text-gray-900 mb-4">{plan.price}</p>
                    <ul className="space-y-2 mb-5">
                      {plan.features.map(f => (
                        <li key={f} className="flex items-center gap-2 text-xs text-gray-600">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${plan.current ? "bg-gray-100 text-gray-400 cursor-default" : "text-white hover:opacity-90"}`}
                      style={plan.current ? undefined : { background: plan.gradient }}
                      disabled={plan.current}
                    >
                      {plan.current ? "Current plan" : plan.name === "Enterprise" ? "Contact Sales" : `Upgrade to ${plan.name}`}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Billing History */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
              <div className="px-6 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-gray-500" /> Billing History
                </h2>
                <button className="text-xs font-semibold text-[var(--primary)] hover:underline flex items-center gap-1">
                  Download all <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {BILLING_HISTORY.map((row, i) => (
                  <div key={i} className="px-6 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{row.plan} Plan — {row.date}</p>
                        <p className="text-xs text-gray-400">{row.status}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-900">{row.amount}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">Paid</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

      </div>
    </div>
  );
}
