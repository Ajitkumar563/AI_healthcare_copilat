"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Upload, FileText, Loader2, Pill, Calendar,
  Stethoscope, ChevronDown, AlertTriangle, CheckCircle2,
  Clock, ShieldAlert, RefreshCw,
} from "lucide-react";
import Cookies from "js-cookie";
import Navbar from "@/components/Navbar";
import { ToastContainer, useToast } from "@/components/Toast";
import RiskBadge from "@/components/RiskBadge";
import { familyApi, reportsApi, aiApi } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FamilyMember {
  id: string; name: string; relationship_type: string; age?: number;
  gender?: string; conditions?: string; medicines?: string; risk_level: string; last_checkup?: string;
}

interface MemberSummary {
  member: FamilyMember;
  total_reports: number;
  latest_report_date: string | null;
  latest_report_name: string | null;
  risk_level: string;
  risk_score: number | null;
  approval_status: string | null;
}

interface MemberReport {
  id: string; file_name: string; file_url: string; report_type: string;
  risk_level: string | null; risk_score: number | null;
  ai_summary: string | null; approval_status: string; doctor_notes: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#0F766E,#06B6D4)",
  "linear-gradient(135deg,#7C3AED,#A78BFA)",
  "linear-gradient(135deg,#D97706,#FCD34D)",
  "linear-gradient(135deg,#059669,#34D399)",
  "linear-gradient(135deg,#DC2626,#F87171)",
  "linear-gradient(135deg,#0369A1,#38BDF8)",
];

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

const RISK_SCORE_COLOR: Record<string, string> = {
  Critical: "#DC2626", High: "#EA580C", Medium: "#D97706", Low: "#059669",
};

function RiskGauge({ score, level }: { score: number; level: string }) {
  const color = RISK_SCORE_COLOR[level] ?? "#64748B";
  return (
    <div className="relative w-20 h-20 mx-auto">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#F1F5F9" strokeWidth="3" />
        <motion.circle cx="18" cy="18" r="15.915" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          initial={{ strokeDasharray: "0 100" }} animate={{ strokeDasharray: `${Math.min(100, score)} 100` }}
          transition={{ duration: 1.2 }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-extrabold" style={{ color }}>{Math.round(score)}</span>
        <span className="text-[9px] text-gray-400">/ 100</span>
      </div>
    </div>
  );
}

// ── Report card ───────────────────────────────────────────────────────────────

function ReportCard({ report, onAnalyze }: { report: MemberReport; onAnalyze: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="h-0.5 w-full" style={{
        background: report.risk_level === "Critical" ? "linear-gradient(90deg,#DC2626,#F87171)"
          : report.risk_level === "High" ? "linear-gradient(90deg,#EA580C,#FB923C)"
          : report.risk_level === "Medium" ? "linear-gradient(90deg,#D97706,#FCD34D)"
          : "linear-gradient(90deg,#0F766E,#06B6D4)"
      }} />
      <button type="button" onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3.5 hover:bg-gray-50/60 transition-colors">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-[var(--primary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-sm text-[var(--text-primary)] leading-snug truncate">{report.file_name}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-gray-400">{fmtDate(report.created_at)}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {report.report_type && report.report_type !== "Other" && (
                <span className="text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-100 px-1.5 py-0.5 rounded-md">{report.report_type}</span>
              )}
              {report.risk_level && <RiskBadge level={report.risk_level} size="sm" />}
              {report.approval_status === "pending" && (
                <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> Pending review
                </span>
              )}
              {report.approval_status === "approved" && (
                <span className="text-[10px] font-semibold bg-green-50 text-green-600 border border-green-100 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Approved
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
              {report.approval_status === "pending" && (
                <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                  Awaiting doctor approval — AI summary visible once reviewed.
                </p>
              )}
              {report.ai_summary && (
                <div className="bg-teal-50 border border-teal-100 rounded-xl px-3 py-2">
                  <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wide mb-1">AI Summary</p>
                  <p className="text-xs text-teal-800 leading-relaxed">{report.ai_summary}</p>
                </div>
              )}
              {report.doctor_notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-1">Doctor&apos;s Notes</p>
                  <p className="text-xs text-amber-800 leading-relaxed">{report.doctor_notes}</p>
                </div>
              )}
              {!report.ai_summary && report.approval_status !== "pending" && (
                <button
                  onClick={async () => {
                    setAnalyzing(true);
                    try { await onAnalyze(); } finally { setAnalyzing(false); }
                  }}
                  disabled={analyzing}
                  className="text-xs font-semibold text-[var(--primary)] hover:underline flex items-center gap-1">
                  {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  {analyzing ? "Analyzing…" : "Run AI analysis"}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MemberWorkspacePage() {
  const router  = useRouter();
  const params  = useParams();
  const memberId = params.id as string;
  const { toasts, toast, removeToast } = useToast();

  const [summary,   setSummary]   = useState<MemberSummary | null>(null);
  const [reports,   setReports]   = useState<MemberReport[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [sumRes, repRes] = await Promise.all([
        familyApi.getSummary(memberId),
        familyApi.getReports(memberId),
      ]);
      setSummary(sumRes.data);
      setReports(repRes.data);
    } catch {
      toast("Could not load member data.", "error");
    } finally {
      setLoading(false);
    }
  }, [memberId, toast]);

  useEffect(() => {
    if (!Cookies.get("access_token")) { router.push("/auth/login"); return; }
    fetchData();
  }, [router, fetchData]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const upRes = await reportsApi.upload(file, memberId);
      const reportId: string = upRes.data.report_id;
      if (reportId && upRes.data.extracted_text) {
        // Run AI analysis immediately
        await aiApi.analyze({
          report_id: reportId,
          report_text: upRes.data.extracted_text,
          language: "en",
        });
      }
      toast(`${file.name} uploaded!`, "success");
      await fetchData(); // refresh
    } catch {
      toast("Upload failed.", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--gray-50)]">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-12 space-y-4">
          <div className="h-48 rounded-2xl skeleton" />
          <div className="h-32 rounded-2xl skeleton" />
          <div className="h-24 rounded-2xl skeleton" />
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-screen bg-[var(--gray-50)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-sm mb-3">Member not found.</p>
          <button onClick={() => router.push("/family")} className="text-[var(--primary)] text-sm font-semibold hover:underline">← Back to Family</button>
        </div>
      </div>
    );
  }

  const { member } = summary;
  const gradientIdx = member.name.charCodeAt(0) % AVATAR_GRADIENTS.length;
  const medList     = member.medicines ? member.medicines.split(",").map(s => s.trim()).filter(Boolean) : [];
  const condList    = member.conditions ? member.conditions.split(",").map(s => s.trim()).filter(Boolean) : [];

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <Navbar />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-5">

        {/* Back link */}
        <button onClick={() => router.push("/family")}
          className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors font-medium">
          <ArrowLeft className="w-4 h-4" /> Family Dashboard
        </button>

        {/* ── Member header card ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="h-24 relative flex items-end px-6 pb-0" style={{ background: AVATAR_GRADIENTS[gradientIdx] }}>
            <div className="absolute top-4 right-4">
              <button onClick={fetchData} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/40 flex items-center justify-center text-white transition-all">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-white/30 flex items-center justify-center translate-y-8 border-4 border-white shadow-lg">
              <span className="text-white text-2xl font-extrabold">{initials(member.name)}</span>
            </div>
          </div>
          <div className="pt-10 pb-5 px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-extrabold text-[var(--text-primary)]">{member.name}</h1>
                <p className="text-sm text-gray-400">
                  {member.relationship_type}
                  {member.age ? ` · ${member.age} years` : ""}
                  {member.gender && member.gender !== "not specified" ? ` · ${member.gender}` : ""}
                </p>
              </div>
              {summary.risk_score != null ? (
                <RiskGauge score={summary.risk_score} level={summary.risk_level} />
              ) : (
                <RiskBadge level={summary.risk_level} />
              )}
            </div>

            {/* Tags */}
            {(condList.length > 0 || medList.length > 0) && (
              <div className="mt-4 space-y-2">
                {condList.length > 0 && (
                  <div className="flex items-start gap-2 flex-wrap">
                    <Stethoscope className="w-3.5 h-3.5 text-gray-300 mt-0.5 shrink-0" />
                    {condList.map((c, i) => (
                      <span key={i} className="text-xs bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full font-medium">{c}</span>
                    ))}
                  </div>
                )}
                {medList.length > 0 && (
                  <div className="flex items-start gap-2 flex-wrap">
                    <Pill className="w-3.5 h-3.5 text-gray-300 mt-0.5 shrink-0" />
                    {medList.map((m, i) => (
                      <span key={i} className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">{m}</span>
                    ))}
                  </div>
                )}
                {member.last_checkup && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                    <span className="text-xs text-gray-500">Last checkup: {member.last_checkup}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Summary stats strip */}
          <div className="border-t border-gray-50 grid grid-cols-3">
            {[
              { label: "Total Reports", value: summary.total_reports },
              { label: "Last Report",   value: summary.latest_report_date ? fmtDate(summary.latest_report_date) : "None" },
              { label: "Risk Level",    value: summary.risk_level },
            ].map(s => (
              <div key={s.label} className="py-3.5 text-center border-r border-gray-50 last:border-r-0">
                <p className="text-xs font-bold text-gray-700">{s.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── High-risk alert ───────────────────────────────────────────── */}
        {["High","Critical"].includes(summary.risk_level) && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 px-4 py-3.5 rounded-2xl border border-red-200 bg-red-50">
            <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-700">{summary.risk_level} Risk Detected</p>
              <p className="text-xs text-red-600 mt-0.5">
                {member.name}&apos;s latest report shows elevated risk. Consider booking a doctor&apos;s appointment.
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Upload report ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] p-5">
          <h2 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Upload className="w-4 h-4 text-[var(--primary)]" /> Upload Report for {member.name}
          </h2>
          <label
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl py-8 cursor-pointer transition-all ${
              dragActive ? "border-[var(--primary)] bg-teal-50/60" : "border-gray-200 hover:border-teal-300 hover:bg-teal-50/30"
            }`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin" />
                <p className="text-sm text-gray-500">Uploading & analyzing…</p>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center mb-3">
                  <Upload className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <p className="text-sm font-semibold text-gray-600">Drop PDF or image here</p>
                <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
              </>
            )}
          </label>
        </div>

        {/* ── Reports list ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--primary)]" />
              Health Reports
              {reports.length > 0 && (
                <span className="text-[10px] font-bold bg-teal-50 text-teal-600 border border-teal-100 px-1.5 py-0.5 rounded-full">{reports.length}</span>
              )}
            </h2>
          </div>

          {reports.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-gray-100">
              <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No reports uploaded yet for {member.name}.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map(r => (
                <ReportCard key={r.id} report={r} onAnalyze={async () => {
                  toast("Upload the report again to trigger AI analysis.", "info");
                }} />
              ))}
            </div>
          )}
        </div>

        {/* Footer summary */}
        {reports.length > 0 && (
          <p className="text-center text-xs text-gray-400 pt-1">
            {reports.length} report{reports.length !== 1 ? "s" : ""} · last updated {fmtDate(reports[0].created_at)} at {fmtTime(reports[0].created_at)}
          </p>
        )}
      </main>
    </div>
  );
}
