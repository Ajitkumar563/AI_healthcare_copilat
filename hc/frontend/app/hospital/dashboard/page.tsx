"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, ShieldAlert, CalendarCheck, Stethoscope, TrendingUp,
  Search, X, Loader2, Copy, CheckCircle2, UserPlus, ChevronRight,
  Eye, FileText, ClipboardList, Zap, BarChart3, AlertTriangle,
} from "lucide-react";
import Cookies from "js-cookie";
import HospitalNavbar from "@/components/HospitalNavbar";
import StatCard from "@/components/StatCard";
import RiskBadge from "@/components/RiskBadge";
import { ToastContainer, useToast } from "@/components/Toast";
import { hospitalApi, authApi, reportsApi } from "@/lib/api";

interface Stats {
  total_patients: number;
  new_patients_this_month: number;
  high_risk_patients_count: number;
  pending_appointments: number;
  total_appointments_today: number;
  total_doctors: number;
}

interface Patient {
  id: string; name: string; email: string; age: number | null;
  last_visit: string | null; risk_level: string | null; risk_score: number | null;
}

interface Doctor {
  id: string; name: string; specialty: string; experience_years: number;
  rating: number; total_patients: number; appointments_this_month: number;
}

interface Credentials { email: string; temp_password: string; }

interface PendingReport {
  id: string; patient_id: string; patient_name: string; patient_email: string;
  report_type: string; file_name: string; risk_score: number | null;
  risk_level: string | null; ai_summary: string | null; created_at: string;
}

interface BulkReport {
  id: string; file_name: string; report_type: string; patient_name: string; created_at: string;
}

interface BulkResult {
  index: number; total: number; report_id: string; report_name: string;
  patient_name?: string; status: "processing" | "done" | "error" | "complete";
  result?: { health_score: number; risk_level: string; summary: string; key_finding: string; recommendation: string };
  error?: string;
}

export default function HospitalDashboard() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();

  const [userName, setUserName] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("");

  // Pending reviews
  const [pendingReports, setPendingReports] = useState<PendingReport[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<{ reportId: string; notes: string; submitting: boolean } | null>(null);

  // Bulk analysis
  const [bulkReports, setBulkReports] = useState<BulkReport[]>([]);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Invite doctor modal
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
        if (u.role !== "admin" && u.role !== "doctor") {
          router.push("/dashboard"); return;
        }
        setUserName(u.name || "");
        setRole(u.role || "");
        Cookies.set("user_name", u.name || "", { expires: 7 });

        const [statsRes, patientsRes] = await Promise.allSettled([
          hospitalApi.stats(),
          hospitalApi.patients(),
        ]);
        if (statsRes.status === "fulfilled") setStats(statsRes.value.data);
        if (patientsRes.status === "fulfilled") setPatients(patientsRes.value.data);

        if (u.role === "admin") {
          const doctorsRes = await hospitalApi.doctors().catch(() => null);
          if (doctorsRes) setDoctors(doctorsRes.data);
        }

        const pendingRes = await hospitalApi.getPendingReports().catch(() => null);
        if (pendingRes) setPendingReports(pendingRes.data);
        setPendingLoading(false);
      } catch { router.push("/hospital/login"); }
      finally { setLoading(false); }
    };
    init();
  }, [router]);

  const loadBulkReports = async () => {
    try {
      const res = await reportsApi.list();
      setBulkReports((res.data as BulkReport[]).slice(0, 100));
    } catch { /* silent */ }
  };

  const handleBulkAnalyze = async () => {
    if (bulkSelected.size === 0) return;
    setBulkRunning(true);
    setBulkResults([]);
    setBulkProgress(0);
    const ids = Array.from(bulkSelected);
    setBulkTotal(ids.length);
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = Cookies.get("access_token") || "";
      const resp = await fetch(`${API_BASE}/api/hospital/reports/bulk-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ report_ids: ids }),
      });
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt: BulkResult = JSON.parse(line.slice(6));
            if (evt.status === "complete") { setBulkProgress(evt.total); break; }
            if (evt.status === "done" || evt.status === "error") {
              setBulkResults(prev => [...prev, evt]);
              setBulkProgress(p => p + 1);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch { toast("Bulk analysis failed. Please try again.", "error"); }
    finally { setBulkRunning(false); }
  };

  const filteredPatients = patients.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase());
    const matchRisk = !riskFilter || (p.risk_level || "").toLowerCase() === riskFilter.toLowerCase();
    return matchSearch && matchRisk;
  });

  const highRiskPatients = patients.filter(p =>
    p.risk_level?.toLowerCase() === "high" || p.risk_level?.toLowerCase() === "critical"
  );

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

  const handleApprove = async (reportId: string) => {
    try {
      await hospitalApi.approveReport(reportId, "");
      setPendingReports(prev => prev.filter(r => r.id !== reportId));
      toast("Report approved — patient can now see their results.", "success");
    } catch {
      toast("Failed to approve report.", "error");
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    if (!rejectModal.notes.trim()) { toast("Please add notes for the patient before rejecting.", "error"); return; }
    setRejectModal(prev => prev ? { ...prev, submitting: true } : null);
    try {
      await hospitalApi.rejectReport(rejectModal.reportId, rejectModal.notes);
      setPendingReports(prev => prev.filter(r => r.id !== rejectModal.reportId));
      setRejectModal(null);
      toast("Report sent back to patient with your notes.", "success");
    } catch {
      setRejectModal(prev => prev ? { ...prev, submitting: false } : null);
      toast("Failed to send feedback.", "error");
    }
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

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/10" />
          <div className="absolute bottom-0 left-1/3 w-48 h-48 rounded-full bg-cyan-400/20" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-white/70 text-sm font-medium mb-1">
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-1">
              Welcome back, {userName?.split(" ")[0]} 👋
            </h1>
            <p className="text-white/70 text-sm">Hospital management overview</p>
          </motion.div>
        </div>
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 28" fill="none" preserveAspectRatio="none">
          <path d="M0 28L60 22.7C120 17.3 240 6.7 360 4.7C480 2.7 600 9.3 720 12C840 14.7 960 13.3 1080 11.3C1200 9.3 1320 6.7 1380 5.3L1440 4V28H0Z" fill="#F8FAFC"/>
        </svg>
        <div className="h-7" />
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Patients"      value={stats?.total_patients ?? "—"}          icon={<Users className="w-5 h-5" />}        gradient="linear-gradient(135deg,#0F766E,#06B6D4)" subtitle={`${stats?.new_patients_this_month ?? 0} new this month`} />
          <StatCard label="High Risk"           value={stats?.high_risk_patients_count ?? "—"} icon={<ShieldAlert className="w-5 h-5" />}  gradient="linear-gradient(135deg,#DC2626,#F87171)" subtitle="need attention" />
          <StatCard label="Today's Appointments" value={stats?.total_appointments_today ?? "—"} icon={<CalendarCheck className="w-5 h-5" />} gradient="linear-gradient(135deg,#7C3AED,#A78BFA)" subtitle={`${stats?.pending_appointments ?? 0} upcoming`} />
          <StatCard label="Doctors"             value={stats?.total_doctors ?? "—"}            icon={<Stethoscope className="w-5 h-5" />}  gradient="linear-gradient(135deg,#059669,#34D399)" subtitle="on staff" />
        </div>

        {/* Pending Reviews — always visible so staff know it exists */}
        <div className="bg-white rounded-2xl border border-amber-200 shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="h-1 w-full rounded-t-2xl" style={{ background: "linear-gradient(135deg,#D97706,#F59E0B)" }} />
          <div className="px-6 pt-5 pb-4 border-b border-gray-50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-[var(--text-primary)]">Pending Reviews</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                {pendingLoading
                  ? "Checking for reports…"
                  : pendingReports.length === 0
                  ? "All clear — no reports awaiting review"
                  : `${pendingReports.length} report${pendingReports.length !== 1 ? "s" : ""} awaiting your review`}
              </p>
            </div>
            {!pendingLoading && pendingReports.length > 0 && (
              <span className="text-xs font-bold text-white bg-amber-500 px-2.5 py-1 rounded-full">
                {pendingReports.length}
              </span>
            )}
          </div>
          <div className="p-6">
            {pendingLoading ? (
              <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-16 rounded-xl skeleton" />)}</div>
            ) : pendingReports.length === 0 ? (
              <div className="flex items-center gap-3 py-4 px-2 text-sm text-gray-400">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                No patient reports are waiting for review right now.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingReports.map(r => (
                  <div key={r.id} className="border border-amber-100 rounded-xl p-4 flex items-start gap-4 hover:border-amber-200 hover:bg-amber-50/20 transition-all">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm">{r.patient_name}</p>
                      <p className="text-xs text-gray-500 mb-1">{r.patient_email}</p>
                      <p className="text-xs text-gray-400 mb-1.5">
                        <span className="font-medium text-gray-600">{r.file_name || r.report_type || "Report"}</span>
                        {r.report_type && r.report_type !== "Other" && (
                          <span className="ml-1.5 text-[10px] font-semibold text-teal-600 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded-md">{r.report_type}</span>
                        )}
                        <span className="ml-1.5">· {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </p>
                      {r.risk_level && <RiskBadge level={r.risk_level} size="sm" />}
                      {r.ai_summary && (
                        <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">{r.ai_summary}</p>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleApprove(r.id)}
                        className="text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => setRejectModal({ reportId: r.id, notes: "", submitting: false })}
                        className="text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 border border-red-200"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* High-risk patients alert */}
        {highRiskPatients.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3"
          >
            <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-red-700 text-sm">{highRiskPatients.length} patient{highRiskPatients.length > 1 ? "s" : ""} with high/critical risk</p>
              <p className="text-red-600 text-xs mt-0.5">{highRiskPatients.map(p => p.name).slice(0, 3).join(", ")}{highRiskPatients.length > 3 ? ` and ${highRiskPatients.length - 3} more` : ""}</p>
            </div>
            <Link href="/hospital/patients" className="text-xs font-bold text-red-600 hover:underline shrink-0">View all</Link>
          </motion.div>
        )}

        {/* Patients table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
          <div className="px-6 pt-5 pb-4 border-b border-gray-50 flex flex-wrap items-center gap-3 justify-between">
            <div>
              <h2 className="font-bold text-[var(--text-primary)]">Patients</h2>
              <p className="text-sm text-gray-400 mt-0.5">{filteredPatients.length} of {patients.length} shown</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search patients…"
                  className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[var(--primary)] w-48 transition-all"
                />
              </div>
              <select
                value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[var(--primary)]"
              >
                <option value="">All risk levels</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredPatients.length === 0 ? (
              <div className="text-center py-16">
                <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">
                  {patients.length === 0 ? "No patients yet. Patients appear here once they book an appointment." : "No patients match your search."}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Patient</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Last Visit</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Risk</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Score</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredPatients.map(p => (
                    <motion.tr key={p.id} whileHover={{ backgroundColor: "#F8FAFC" }} className="transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
                            style={{ background: "var(--gradient-hero)" }}>
                            {p.name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800">{p.name}</p>
                            <p className="text-xs text-gray-400">{p.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-500 text-sm">
                        {p.last_visit
                          ? new Date(p.last_visit).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                          : "—"}
                      </td>
                      <td className="px-4 py-4">
                        {p.risk_level ? <RiskBadge level={p.risk_level} size="sm" /> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-4">
                        {p.risk_score != null
                          ? <span className={`font-bold text-sm ${p.risk_score >= 80 ? "text-emerald-600" : p.risk_score >= 60 ? "text-amber-500" : "text-red-500"}`}>{Math.round(p.risk_score)}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          href={`/hospital/patients/${p.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </Link>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Feature 7: Bulk Report Analysis */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="h-1 w-full" style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }} />
          <button
            className="w-full px-6 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between text-left hover:bg-gray-50/50 transition-all"
            onClick={() => { setBulkOpen(o => !o); if (!bulkOpen && bulkReports.length === 0) loadBulkReports(); }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}>
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-[var(--text-primary)]">Bulk Report Analysis</h2>
                <p className="text-sm text-gray-400 mt-0.5">AI-analyze up to 20 patient reports at once</p>
              </div>
            </div>
            <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${bulkOpen ? "rotate-90" : ""}`} />
          </button>

          <AnimatePresence initial={false}>
            {bulkOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-6 space-y-4">
                  {/* Report picker */}
                  {bulkReports.length === 0 ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading reports…
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-gray-500">{bulkSelected.size} selected (max 20)</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setBulkSelected(new Set(bulkReports.slice(0, 20).map(r => r.id)))}
                            className="text-xs font-semibold text-purple-600 hover:underline"
                          >Select first 20</button>
                          <span className="text-gray-300">·</span>
                          <button
                            onClick={() => setBulkSelected(new Set())}
                            className="text-xs font-semibold text-gray-400 hover:underline"
                          >Clear</button>
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {bulkReports.map(r => {
                          const checked = bulkSelected.has(r.id);
                          return (
                            <label
                              key={r.id}
                              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${checked ? "border-purple-300 bg-purple-50" : "border-gray-100 hover:border-purple-200"}`}
                            >
                              <input
                                type="checkbox" checked={checked}
                                onChange={() => {
                                  setBulkSelected(prev => {
                                    const next = new Set(prev);
                                    if (next.has(r.id)) { next.delete(r.id); }
                                    else if (next.size < 20) { next.add(r.id); }
                                    return next;
                                  });
                                }}
                                className="accent-purple-600 w-4 h-4"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{r.file_name || r.report_type || "Report"}</p>
                                <p className="text-xs text-gray-400">{r.report_type} · {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      <button
                        onClick={handleBulkAnalyze}
                        disabled={bulkSelected.size === 0 || bulkRunning}
                        className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                        style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)", color: "#fff" }}
                      >
                        {bulkRunning
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing {bulkProgress}/{bulkTotal}…</>
                          : <><Zap className="w-4 h-4" /> Run Bulk Analysis ({bulkSelected.size})</>}
                      </button>

                      {/* Progress bar */}
                      {bulkRunning && bulkTotal > 0 && (
                        <div className="space-y-1">
                          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <motion.div
                              className="h-2 rounded-full"
                              style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}
                              animate={{ width: `${Math.round((bulkProgress / bulkTotal) * 100)}%` }}
                              transition={{ duration: 0.4 }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 text-center">{Math.round((bulkProgress / bulkTotal) * 100)}% complete</p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Results */}
                  {bulkResults.length > 0 && (
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center gap-2 mb-1">
                        <BarChart3 className="w-4 h-4 text-purple-500" />
                        <p className="text-sm font-bold text-gray-700">Results ({bulkResults.length})</p>
                      </div>
                      {bulkResults.map((r, i) => (
                        <div key={i} className={`p-3 rounded-xl border ${r.status === "error" ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"}`}>
                          <div className="flex items-start gap-2">
                            {r.status === "error"
                              ? <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                              : <CheckCircle2 className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-gray-800 truncate">{r.report_name}</p>
                                {r.result && (
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${r.result.risk_level === "Low" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : r.result.risk_level === "High" || r.result.risk_level === "Critical" ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                                    {r.result.risk_level} · {r.result.health_score}/100
                                  </span>
                                )}
                              </div>
                              {r.result && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{r.result.summary}</p>}
                              {r.error && <p className="text-xs text-red-500 mt-1">{r.error}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Doctors table (admin only) */}
        {role === "admin" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }} />
            <div className="px-6 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[var(--text-primary)]">Doctors</h2>
                <p className="text-sm text-gray-400 mt-0.5">{doctors.length} doctors on staff</p>
              </div>
              <button
                onClick={() => setInviteOpen(true)}
                className="gradient-btn px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" /> Invite Doctor
              </button>
            </div>

            <div className="overflow-x-auto">
              {doctors.length === 0 ? (
                <div className="text-center py-16">
                  <Stethoscope className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">No doctors yet. Use &quot;Invite Doctor&quot; to add staff.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Doctor</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Specialty</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Patients</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">This Month</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Rating</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {doctors.map(d => (
                      <motion.tr key={d.id} whileHover={{ backgroundColor: "#F8FAFC" }} className="transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
                              style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}>
                              {d.name.replace("Dr. ", "").split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800">{d.name}</p>
                              <p className="text-xs text-gray-400">{d.experience_years}y exp</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-gray-600">{d.specialty}</td>
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

      {/* Reject Report Modal */}
      <AnimatePresence>
        {rejectModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={e => { if (e.target === e.currentTarget && !rejectModal.submitting) setRejectModal(null); }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <X className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">Send back to patient</h3>
                  <p className="text-xs text-gray-400">Your notes will be shown to the patient</p>
                </div>
                <button
                  onClick={() => !rejectModal.submitting && setRejectModal(null)}
                  className="ml-auto text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Notes for patient <span className="text-red-400">*required</span>
              </label>
              <textarea
                value={rejectModal.notes}
                onChange={e => setRejectModal(prev => prev ? { ...prev, notes: e.target.value } : null)}
                placeholder="E.g. Some parameters appear unclear. Please repeat the test at a certified lab and upload the new report."
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-all resize-none"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => !rejectModal.submitting && setRejectModal(null)}
                  className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={rejectModal.submitting}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                >
                  {rejectModal.submitting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                    : "Send to Patient"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invite Doctor Modal */}
      <AnimatePresence>
        {inviteOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={e => { if (e.target === e.currentTarget) resetInviteModal(); }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }}
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
                /* Credentials result */
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
                /* Invite form */
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
    </div>
  );
}
