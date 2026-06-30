"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  ArrowLeft, Loader2, FileText, CalendarCheck, User,
  Brain, Copy, CheckCircle2, AlertTriangle, Clock,
  TrendingUp, Bell, FileCheck, ChevronRight,
  Stethoscope, Activity, X,
} from "lucide-react";
import Cookies from "js-cookie";
import HospitalNavbar from "@/components/HospitalNavbar";
import RiskBadge from "@/components/RiskBadge";
import { ToastContainer, useToast } from "@/components/Toast";
import { hospitalApi, authApi, aiApi } from "@/lib/api";

const TrendsChart = dynamic(() => import("@/app/compare/_TrendsChart"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrendPoint {
  date: string; value: number; unit: string | null;
  is_abnormal: boolean; reference_min: number | null; reference_max: number | null;
}

interface Report {
  id: string; report_type: string; file_name: string; risk_score: number | null;
  risk_level: string | null; ai_summary: string | null; raw_text: string | null;
  approval_status: string; doctor_notes: string | null; reviewed_at: string | null;
  created_at: string;
}

interface Appointment {
  id: string; appointment_date: string; appointment_time: string;
  type: string; status: string; reason: string | null;
}

interface PatientDetail {
  id: string; name: string; email: string; age: number | null; gender: string | null;
  phone: string | null; medical_history: string | null; created_at: string;
  reports: Report[]; appointments: Appointment[];
}

interface TrendsData {
  parameters: Record<string, TrendPoint[]>;
  available_parameters: string[];
}

interface TimelineEvent {
  id: string; date: string; type: "report" | "appointment";
  title: string; subtitle: string; badge: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusColor(s: string) {
  if (s === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "upcoming")  return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "cancelled") return "bg-red-50 text-red-700 border-red-200";
  return "bg-gray-50 text-gray-500 border-gray-200";
}

function approvalColor(s: string) {
  if (s === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "rejected")  return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function buildTimeline(reports: Report[], appointments: Appointment[]): TimelineEvent[] {
  return [
    ...reports.map(r => ({
      id: `r-${r.id}`, date: r.created_at, type: "report" as const,
      title: r.report_type || r.file_name,
      subtitle: r.ai_summary ? r.ai_summary.substring(0, 90) + (r.ai_summary.length > 90 ? "…" : "") : "Report uploaded",
      badge: r.risk_level,
    })),
    ...appointments.map(a => ({
      id: `a-${a.id}`, date: `${a.appointment_date}T${a.appointment_time || "00:00"}`, type: "appointment" as const,
      title: `${a.type === "video" ? "Video" : "In-Person"} Appointment`,
      subtitle: a.reason || a.type,
      badge: a.status,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PatientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params?.id as string;
  const { toasts, toast, removeToast } = useToast();

  const [userName, setUserName] = useState("");
  const [role, setRole] = useState("");
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // AI Summary
  const [aiSummary, setAiSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Doctor actions
  const [doctorNotes, setDoctorNotes] = useState("");
  const [approving, setApproving] = useState<string | null>(null);
  const [followupSending, setFollowupSending] = useState(false);

  // Trends
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [selectedParam, setSelectedParam] = useState("");

  // Prescription modal
  const [prescModal, setPrescModal] = useState(false);
  const [prescReportId, setPrescReportId] = useState("");
  const [prescText, setPrescText] = useState("");
  const [prescSaving, setPrescSaving] = useState(false);

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

        const [patientRes, trendsRes] = await Promise.allSettled([
          hospitalApi.patient(patientId),
          hospitalApi.patientTrends(patientId),
        ]);

        if (patientRes.status === "fulfilled") {
          setPatient(patientRes.value.data);
        } else {
          const err = (patientRes as PromiseRejectedResult).reason;
          const status = err?.response?.status;
          setError(status === 404 ? "Patient not found or not associated with your hospital." : "Failed to load patient data.");
        }

        if (trendsRes.status === "fulfilled") {
          const data = trendsRes.value.data as TrendsData;
          setTrends(data);
          if (data.available_parameters?.length > 0) setSelectedParam(data.available_parameters[0]);
        }
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        setError(status === 404 ? "Patient not found or not associated with your hospital." : "Failed to load patient data.");
      } finally { setLoading(false); }
    };
    init();
  }, [patientId, router]);

  const refreshPatient = async () => {
    const res = await hospitalApi.patient(patientId);
    setPatient(res.data);
  };

  const handleGenerateSummary = async () => {
    if (!patient) return;
    const latestReport = patient.reports.find(r => r.raw_text && r.raw_text.length > 50);
    if (!latestReport?.raw_text) { toast("No report text available to generate a summary.", "error"); return; }
    setSummaryLoading(true);
    try {
      const res = await aiApi.doctorSummary({
        report_text: latestReport.raw_text,
        patient_name: patient.name,
        age: patient.age ?? 25,
        gender: patient.gender ?? "Unknown",
      });
      setAiSummary(res.data?.summary || res.data?.data?.summary || "Summary generated.");
      toast("Doctor summary ready!", "success");
    } catch { toast("Failed to generate summary.", "error"); }
    finally { setSummaryLoading(false); }
  };

  const handleApproveReport = async (reportId: string) => {
    setApproving(reportId);
    try {
      await hospitalApi.approveReport(reportId, doctorNotes);
      toast("Report approved.", "success");
      setDoctorNotes("");
      await refreshPatient();
    } catch { toast("Failed to approve report.", "error"); }
    finally { setApproving(null); }
  };

  const handleSendFollowup = async () => {
    if (!patient) return;
    setFollowupSending(true);
    try {
      await hospitalApi.sendFollowup(patientId, `Dr. ${userName} has reviewed your records and requests a follow-up.`);
      toast("Follow-up notification sent to patient.", "success");
    } catch { toast("Failed to send follow-up.", "error"); }
    finally { setFollowupSending(false); }
  };

  const handleSavePrescription = async () => {
    if (!prescReportId || !prescText.trim()) return;
    setPrescSaving(true);
    try {
      await hospitalApi.approveReport(prescReportId, prescText);
      toast("Prescription saved and report approved.", "success");
      await refreshPatient();
      setPrescModal(false);
      setPrescText("");
    } catch { toast("Failed to save prescription.", "error"); }
    finally { setPrescSaving(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--gray-50)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="min-h-screen bg-[var(--gray-50)]">
        <HospitalNavbar userName={userName} role={role} />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="font-semibold text-gray-700 mb-2">{error || "Patient not found."}</p>
          <Link href="/hospital/dashboard" className="text-[var(--primary)] text-sm font-semibold hover:underline flex items-center justify-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const latestReport = patient.reports[0] ?? null;
  const pendingReports = patient.reports.filter(r => r.approval_status === "pending");
  const approvedReports = patient.reports.filter(r => r.approval_status === "approved");
  const prescriptions = approvedReports.filter(r => r.doctor_notes);
  const timeline = buildTimeline(patient.reports, patient.appointments);
  const chartData = (trends && selectedParam) ? (trends.parameters[selectedParam] ?? []) : [];
  const hasTrends = trends && trends.available_parameters.length > 0;

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <HospitalNavbar userName={userName} role={role} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* ── Prescription Modal ── */}
      {prescModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-teal-600" /> Create Prescription / Notes
              </h3>
              <button onClick={() => { setPrescModal(false); setPrescText(""); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Select Report</label>
              <select
                value={prescReportId}
                onChange={e => setPrescReportId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 mb-4 focus:outline-none focus:border-teal-400"
              >
                <option value="">Select a report…</option>
                {patient.reports.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.report_type || r.file_name} — {formatDate(r.created_at)}
                  </option>
                ))}
              </select>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Prescription / Clinical Notes</label>
              <textarea
                value={prescText}
                onChange={e => setPrescText(e.target.value)}
                rows={5}
                placeholder="Enter prescription, medications, dosage, and clinical notes…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 resize-none focus:outline-none focus:border-teal-400"
              />
              <p className="text-xs text-gray-400 mt-1.5">Saving will also approve the selected report.</p>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={() => { setPrescModal(false); setPrescText(""); }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePrescription}
                disabled={prescSaving || !prescReportId || !prescText.trim()}
                className="flex-1 gradient-btn px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {prescSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                {prescSaving ? "Saving…" : "Save Prescription"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        <Link href="/hospital/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[var(--primary)] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>

        {/* ── Patient Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden"
        >
          <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
          <div className="p-6 flex items-start gap-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold shrink-0"
              style={{ background: "var(--gradient-hero)" }}
            >
              {patient.name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-extrabold text-gray-900">{patient.name}</h1>
              <p className="text-sm text-gray-400">{patient.email}</p>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-600">
                {patient.age && <span><User className="w-3.5 h-3.5 inline mr-1 text-gray-400" />{patient.age} yrs</span>}
                {patient.gender && <span className="capitalize">{patient.gender}</span>}
                {patient.phone && <span>{patient.phone}</span>}
                <span className="text-gray-400">Registered {formatDate(patient.created_at)}</span>
              </div>
              {patient.medical_history && (
                <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-xl px-3 py-2 leading-relaxed">{patient.medical_history}</p>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-2">
              {latestReport?.risk_level && (
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-1">Latest Risk</p>
                  <RiskBadge level={latestReport.risk_level} />
                  {latestReport.risk_score != null && (
                    <p className={`text-2xl font-extrabold mt-1 ${latestReport.risk_score >= 80 ? "text-emerald-600" : latestReport.risk_score >= 60 ? "text-amber-500" : "text-red-500"}`}>
                      {Math.round(latestReport.risk_score)}<span className="text-xs font-normal text-gray-400">/100</span>
                    </p>
                  )}
                </div>
              )}
              {pendingReports.length > 0 && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  {pendingReports.length} pending review
                </span>
              )}
            </div>
          </div>
          {/* Quick stats bar */}
          <div className="border-t border-gray-50 grid grid-cols-3 divide-x divide-gray-50">
            {[
              { label: "Total Reports", val: patient.reports.length, icon: FileText, color: "text-teal-600" },
              { label: "Appointments", val: patient.appointments.length, icon: CalendarCheck, color: "text-purple-500" },
              { label: "Approved", val: approvedReports.length, icon: CheckCircle2, color: "text-emerald-500" },
            ].map(({ label, val, icon: Icon, color }) => (
              <div key={label} className="flex items-center gap-2.5 px-5 py-3">
                <Icon className={`w-4 h-4 ${color}`} />
                <div>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="font-bold text-gray-800">{val}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Doctor Copilot CTA ── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="flex items-center justify-between gap-4 px-5 py-4 bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)]"
          style={{ borderLeft: "4px solid #0F766E" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">Doctor Copilot</p>
              <p className="text-xs text-gray-400">AI-assisted consultation — diagnosis support, prescription drafts & follow-up</p>
            </div>
          </div>
          <Link href={`/hospital/copilot/${patientId}`}
            className="shrink-0 flex items-center gap-1.5 gradient-btn px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap">
            <Brain className="w-4 h-4" /> Open Copilot
          </Link>
        </motion.div>

        {/* ── AI Summary + Doctor Actions ── */}
        <div className="grid lg:grid-cols-5 gap-6">

          {/* AI Summary — 3/5 */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "linear-gradient(135deg,#0369A1,#38BDF8)" }} />
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Brain className="w-4 h-4 text-blue-500" /> AI Doctor Summary
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">Clinical summary from the patient&apos;s latest report</p>
                </div>
                <button
                  onClick={handleGenerateSummary}
                  disabled={summaryLoading || patient.reports.length === 0}
                  className="gradient-btn px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {summaryLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                  {summaryLoading ? "Generating…" : "Generate"}
                </button>
              </div>

              {/* Existing ai_summary from DB */}
              {!aiSummary && latestReport?.ai_summary && (
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">Stored Summary · {latestReport.report_type || latestReport.file_name}</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{latestReport.ai_summary}</p>
                  {latestReport.approval_status === "pending" && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <textarea
                        value={doctorNotes}
                        onChange={e => setDoctorNotes(e.target.value)}
                        rows={2}
                        placeholder="Add clinical notes (optional)…"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 resize-none focus:outline-none focus:border-blue-300 mb-2"
                      />
                      <button
                        onClick={() => handleApproveReport(latestReport.id)}
                        disabled={approving === latestReport.id}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        {approving === latestReport.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Approve Report
                      </button>
                    </div>
                  )}
                  {latestReport.approval_status === "approved" && (
                    <p className="flex items-center gap-1.5 mt-2 text-xs text-emerald-600 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                      {latestReport.reviewed_at && <span className="text-gray-400 font-normal">· {formatDate(latestReport.reviewed_at)}</span>}
                    </p>
                  )}
                </div>
              )}

              {/* Freshly generated summary */}
              {aiSummary ? (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <button onClick={() => { navigator.clipboard.writeText(aiSummary); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                      {copied ? <><CheckCircle2 className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                    </button>
                    {latestReport && latestReport.approval_status === "pending" && (
                      <button
                        onClick={() => handleApproveReport(latestReport.id)}
                        disabled={approving === latestReport.id}
                        className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        {approving === latestReport.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              ) : !latestReport?.ai_summary ? (
                <div className="bg-gray-50 rounded-xl p-6 text-center">
                  <Brain className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Click Generate to create a clinical AI summary for this patient.</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Doctor Actions — 2/5 */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "linear-gradient(135deg,#059669,#34D399)" }} />
            <div className="p-5">
              <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2 mb-4">
                <Stethoscope className="w-4 h-4 text-emerald-600" /> Doctor Actions
              </h2>

              {pendingReports.length > 0 ? (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Pending Reviews ({pendingReports.length})</p>
                  <div className="space-y-2">
                    {pendingReports.slice(0, 3).map(r => (
                      <div key={r.id} className="border border-amber-100 bg-amber-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-gray-800 truncate">{r.report_type || r.file_name}</p>
                        <p className="text-xs text-gray-400 mb-2">{formatDate(r.created_at)}</p>
                        <button
                          onClick={() => handleApproveReport(r.id)}
                          disabled={approving === r.id}
                          className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          {approving === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          Quick Approve
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 mb-4">
                  <CheckCircle2 className="w-3.5 h-3.5" /> All reports reviewed
                </div>
              )}

              <div className="space-y-2 pt-2 border-t border-gray-50">
                <button
                  onClick={() => { setPrescReportId(patient.reports[0]?.id || ""); setPrescModal(true); }}
                  disabled={patient.reports.length === 0}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-teal-200 transition-all disabled:opacity-50"
                >
                  <Stethoscope className="w-4 h-4 text-teal-600" />
                  <span>Create Prescription</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
                </button>
                <button
                  onClick={handleSendFollowup}
                  disabled={followupSending}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-purple-200 transition-all"
                >
                  {followupSending ? <Loader2 className="w-4 h-4 animate-spin text-purple-500" /> : <Bell className="w-4 h-4 text-purple-500" />}
                  <span>{followupSending ? "Sending…" : "Send Follow-up"}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Health Trends ── */}
        {hasTrends && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "linear-gradient(135deg,#0F766E,#5EEAD4)" }} />
            <div className="px-5 pt-5 pb-3 border-b border-gray-50 flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-600" /> Health Trends
              </h2>
              <select
                value={selectedParam}
                onChange={e => setSelectedParam(e.target.value)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:border-teal-400"
              >
                {trends!.available_parameters.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="p-5">
              {chartData.length > 0 ? (
                <TrendsChart chartData={chartData} selectedParam={selectedParam} />
              ) : (
                <div className="py-10 text-center">
                  <Activity className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                  <p className="text-sm text-gray-400">Select a parameter to view trends</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Timeline + Prescriptions ── */}
        <div className="grid lg:grid-cols-2 gap-6">

          {/* Patient Timeline */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }} />
            <div className="px-5 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-500" /> Patient Timeline
              </h2>
              <span className="text-xs text-gray-400">{timeline.length} events</span>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto">
              {timeline.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No events yet.</p>
              ) : (
                <div className="space-y-0">
                  {timeline.map((ev, idx) => (
                    <div key={ev.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${ev.type === "report" ? "bg-teal-500" : "bg-purple-400"}`} />
                        {idx < timeline.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1 min-h-[20px]" />}
                      </div>
                      <div className="pb-3 flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="font-semibold text-xs text-gray-800 truncate">{ev.title}</p>
                          {ev.badge && ev.type === "report" && <RiskBadge level={ev.badge} size="sm" />}
                          {ev.badge && ev.type === "appointment" && (
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${statusColor(ev.badge)}`}>{ev.badge}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{formatDate(ev.date)}</p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{ev.subtitle}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Prescriptions & Doctor Notes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "linear-gradient(135deg,#0369A1,#38BDF8)" }} />
            <div className="px-5 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-blue-500" /> Prescriptions & Notes
              </h2>
              <span className="text-xs text-gray-400">{prescriptions.length} total</span>
            </div>
            <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
              {prescriptions.length === 0 ? (
                <div className="py-8 text-center">
                  <FileCheck className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No prescriptions yet.</p>
                  <button
                    onClick={() => { setPrescReportId(patient.reports[0]?.id || ""); setPrescModal(true); }}
                    className="mt-2 text-xs font-semibold text-teal-600 hover:underline"
                  >
                    + Add prescription notes
                  </button>
                </div>
              ) : prescriptions.map(r => (
                <div key={r.id} className="border border-blue-100 bg-blue-50/50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-xs text-gray-800 truncate">{r.report_type || r.file_name}</p>
                    <span className="text-xs text-gray-400 shrink-0">{formatDate(r.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{r.doctor_notes}</p>
                  {r.reviewed_at && <p className="text-xs text-gray-400 mt-1.5">Reviewed {formatDate(r.reviewed_at)}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── All Reports + Appointments ── */}
        <div className="grid lg:grid-cols-2 gap-6">

          <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
            <div className="px-5 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--primary)]" /> All Reports
              </h2>
              <span className="text-xs text-gray-400">{patient.reports.length} total</span>
            </div>
            <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
              {patient.reports.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No reports uploaded yet.</p>
              ) : patient.reports.map(r => (
                <div key={r.id} className="border border-gray-100 rounded-xl p-3 hover:border-teal-100 transition-colors">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <p className="font-semibold text-sm text-gray-800 truncate">{r.report_type || r.file_name}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {r.risk_level && <RiskBadge level={r.risk_level} size="sm" />}
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full border ${approvalColor(r.approval_status)}`}>
                        {r.approval_status}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">{formatDate(r.created_at)}</p>
                  {r.ai_summary && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed line-clamp-2">{r.ai_summary}</p>}
                  {r.approval_status === "pending" && (
                    <button
                      onClick={() => handleApproveReport(r.id)}
                      disabled={approving === r.id}
                      className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      {approving === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Approve
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }} />
            <div className="px-5 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-purple-500" /> Appointments
              </h2>
              <span className="text-xs text-gray-400">{patient.appointments.length} total</span>
            </div>
            <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
              {patient.appointments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No appointments found.</p>
              ) : patient.appointments.map(a => (
                <div key={a.id} className="border border-gray-100 rounded-xl p-3 hover:border-purple-100 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-sm text-gray-800">{a.appointment_date} · {a.appointment_time}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusColor(a.status)}`}>{a.status}</span>
                  </div>
                  <p className="text-xs text-gray-400 capitalize">{a.type}{a.reason ? ` · ${a.reason}` : ""}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
