"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft, Loader2, FileText, CalendarCheck, User,
  Brain, Copy, CheckCircle2, AlertTriangle,
} from "lucide-react";
import Cookies from "js-cookie";
import HospitalNavbar from "@/components/HospitalNavbar";
import RiskBadge from "@/components/RiskBadge";
import { ToastContainer, useToast } from "@/components/Toast";
import { hospitalApi, authApi, aiApi } from "@/lib/api";

interface Report {
  id: string; report_type: string; file_name: string; risk_score: number | null;
  risk_level: string | null; ai_summary: string | null; raw_text: string | null;
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusColor(s: string) {
  if (s === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "upcoming")  return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "cancelled") return "bg-red-50 text-red-700 border-red-200";
  return "bg-gray-50 text-gray-500 border-gray-200";
}

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

  const [aiSummary, setAiSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
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

        const res = await hospitalApi.patient(patientId);
        setPatient(res.data);
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        setError(status === 404 ? "Patient not found or not associated with your hospital." : "Failed to load patient data.");
      } finally { setLoading(false); }
    };
    init();
  }, [patientId, router]);

  const handleGenerateSummary = async () => {
    if (!patient) return;
    const latestReport = patient.reports.find(r => r.raw_text && r.raw_text.length > 50);
    if (!latestReport?.raw_text) {
      toast("No report text available to generate a summary.", "error");
      return;
    }
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

  const handleCopySummary = () => {
    navigator.clipboard.writeText(aiSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  const latestRisk = patient.reports[0];

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <HospitalNavbar userName={userName} role={role} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Back */}
        <Link href="/hospital/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[var(--primary)] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>

        {/* Patient header */}
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
                <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-xl px-3 py-2 leading-relaxed">
                  {patient.medical_history}
                </p>
              )}
            </div>
            {latestRisk?.risk_level && (
              <div className="shrink-0 text-center">
                <p className="text-xs text-gray-400 mb-1">Latest Risk</p>
                <RiskBadge level={latestRisk.risk_level} />
                {latestRisk.risk_score != null && (
                  <p className={`text-2xl font-extrabold mt-1 ${latestRisk.risk_score >= 80 ? "text-emerald-600" : latestRisk.risk_score >= 60 ? "text-amber-500" : "text-red-500"}`}>
                    {Math.round(latestRisk.risk_score)}
                    <span className="text-xs font-normal text-gray-400">/100</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Reports */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
            <div className="px-5 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--primary)]" /> Reports
              </h2>
              <span className="text-xs text-gray-400">{patient.reports.length} total</span>
            </div>
            <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
              {patient.reports.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No reports uploaded yet.</p>
              ) : patient.reports.map(r => (
                <div key={r.id} className="border border-gray-100 rounded-xl p-3 hover:border-teal-100 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-sm text-gray-800">{r.report_type || r.file_name}</p>
                    {r.risk_level && <RiskBadge level={r.risk_level} size="sm" />}
                  </div>
                  <p className="text-xs text-gray-400">{formatDate(r.created_at)}</p>
                  {r.ai_summary && (
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed line-clamp-2">{r.ai_summary}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Appointments */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }} />
            <div className="px-5 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-purple-500" /> Appointments at your hospital
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
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusColor(a.status)}`}>
                      {a.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 capitalize">{a.type}{a.reason ? ` · ${a.reason}` : ""}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Generate Doctor Summary */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="h-1 w-full" style={{ background: "linear-gradient(135deg,#0369A1,#38BDF8)" }} />
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Brain className="w-4 h-4 text-blue-500" /> AI Doctor Summary
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Generate a clinical summary from the patient&apos;s latest report</p>
              </div>
              <button
                onClick={handleGenerateSummary}
                disabled={summaryLoading || patient.reports.length === 0}
                className="gradient-btn px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
              >
                {summaryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                {summaryLoading ? "Generating…" : "Generate"}
              </button>
            </div>

            {aiSummary ? (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
                <button
                  onClick={handleCopySummary}
                  className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  {copied ? <><CheckCircle2 className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy to clipboard</>}
                </button>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl p-6 text-center">
                <Brain className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Click Generate to create a clinical AI summary for this patient.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
