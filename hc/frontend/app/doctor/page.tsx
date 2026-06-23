"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Loader2, ChevronDown, Sparkles, User, Stethoscope,
  ClipboardList, Target, Lightbulb, AlertTriangle, Copy, Check,
  RefreshCw,
} from "lucide-react";
import Cookies from "js-cookie";
import Navbar from "@/components/Navbar";
import { ToastContainer, useToast } from "@/components/Toast";
import { reportsApi, aiApi } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Report {
  id: string;
  report_type: string;
  file_name: string;
  created_at: string;
  raw_text?: string;
}

interface SoapNotes {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

interface DoctorSummary {
  clinical_summary: string;
  key_findings: string[];
  recommendations: string[];
  urgency_level: string;
}

const SOAP_SECTIONS = [
  { key: "subjective",  label: "Subjective",  icon: User,          color: "from-blue-50 to-blue-100/50",     border: "border-blue-200",   text: "text-blue-700",   head: "text-blue-900"   },
  { key: "objective",   label: "Objective",   icon: Stethoscope,   color: "from-teal-50 to-teal-100/50",     border: "border-teal-200",   text: "text-teal-700",   head: "text-teal-900"   },
  { key: "assessment",  label: "Assessment",  icon: ClipboardList, color: "from-purple-50 to-purple-100/50", border: "border-purple-200", text: "text-purple-700", head: "text-purple-900" },
  { key: "plan",        label: "Plan",        icon: Target,        color: "from-emerald-50 to-emerald-100/50",border: "border-emerald-200",text: "text-emerald-700",head: "text-emerald-900"},
] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Flatten nested SOAP section to a readable string.
// Gemini returns objects like {chief_complaint, history, duration} for subjective.
function flattenSoapSection(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.join("\n");
  if (typeof v === "object" && v !== null) {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => {
        const label = k.replace(/_/g, " ");
        const value = Array.isArray(val) ? (val as string[]).join(", ") : String(val ?? "");
        return `${label.charAt(0).toUpperCase() + label.slice(1)}: ${value}`;
      })
      .filter(line => !line.endsWith(": "))
      .join("\n");
  }
  return String(v ?? "");
}

function normalizeSoap(raw: unknown): SoapNotes {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    subjective: flattenSoapSection(r.subjective),
    objective:  flattenSoapSection(r.objective),
    assessment: flattenSoapSection(r.assessment),
    plan:       flattenSoapSection(r.plan),
  };
}

function normalizeSummary(raw: unknown): DoctorSummary {
  const d = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    clinical_summary: String(d.ai_summary_paragraph || d.clinical_summary || d.summary || ""),
    key_findings:     (d.key_findings as string[] | undefined) || [],
    recommendations:  (d.recommendations as string[] | undefined) || [],
    urgency_level:    String(d.urgency_level || d.severity || "low"),
  };
}

export default function DoctorPage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();
  const { language } = useLanguage();
  const [reports, setReports]               = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [loadingReports, setLoadingReports] = useState(true);
  const [fetchingFull, setFetchingFull]     = useState(false);
  const [showDropdown, setShowDropdown]     = useState(false);
  const [loadingSOAP, setLoadingSOAP]       = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [soap, setSoap]                     = useState<SoapNotes | null>(null);
  const [summary, setSummary]               = useState<DoctorSummary | null>(null);
  const [soapError, setSoapError]           = useState("");
  const [summaryError, setSummaryError]     = useState("");
  const [copied, setCopied]                 = useState(false);

  // Fetch the full report (with raw_text) and merge it into state.
  const fetchFullReport = async (r: Report): Promise<Report> => {
    if (r.raw_text) return r;
    try {
      setFetchingFull(true);
      const res = await reportsApi.get(r.id);
      const full: Report = res.data?.report || res.data || r;
      return full;
    } catch {
      return r;
    } finally {
      setFetchingFull(false);
    }
  };

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) { router.push("/auth/login"); return; }
    const fetchReports = async () => {
      setLoadingReports(true);
      try {
        const res = await reportsApi.list();
        const reps: Report[] = res.data?.reports || res.data || [];
        setReports(reps);
        if (reps.length > 0) {
          // Auto-select the most recent report and fetch its full content
          const full = await fetchFullReport(reps[0]);
          setSelectedReport(full);
        }
      } catch {
        toast("Could not load reports.", "error");
      } finally {
        setLoadingReports(false);
      }
    };
    fetchReports();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleSelectReport = async (r: Report) => {
    setShowDropdown(false);
    setSoap(null);
    setSummary(null);
    setSoapError("");
    setSummaryError("");
    setSelectedReport(r);
    const full = await fetchFullReport(r);
    setSelectedReport(full);
  };

  const getReportText = (r: Report) =>
    r.raw_text?.trim() ||
    `Report type: ${r.report_type || r.file_name}. Uploaded on ${formatDate(r.created_at)}.`;

  const handleGenerateSOAP = async () => {
    if (!selectedReport) return;
    console.log("[SOAP] Generating for report:", selectedReport.id, "has raw_text:", !!selectedReport.raw_text);
    setLoadingSOAP(true);
    setSoap(null);
    setSoapError("");
    try {
      const res = await aiApi.soapNotes({
        raw_text: getReportText(selectedReport),
        patient_name: Cookies.get("user_name") || "Patient",
        language,
      });
      const payload = res.data?.data || res.data?.soap_notes || res.data;
      if (res.data?.ai_available === false) {
        setSoapError(res.data?.message || "AI service is currently unavailable. Please check your Gemini API key.");
        toast("AI unavailable — SOAP notes could not be generated.", "error");
      } else {
        setSoap(normalizeSoap(payload));
        toast("SOAP notes generated!", "success");
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; detail?: string }; status?: number } };
      const msg = e.response?.data?.message || e.response?.data?.detail || "Failed to generate SOAP notes.";
      setSoapError(msg);
      toast(msg, "error");
      console.error("[SOAP] Error:", err);
    } finally {
      setLoadingSOAP(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!selectedReport) return;
    console.log("[Summary] Generating for report:", selectedReport.id, "has raw_text:", !!selectedReport.raw_text);
    setLoadingSummary(true);
    setSummary(null);
    setSummaryError("");
    try {
      const res = await aiApi.doctorSummary({
        report_text: getReportText(selectedReport),
        patient_name: Cookies.get("user_name") || "Patient",
        language,
      });
      const payload = res.data?.data || res.data?.summary || res.data;
      if (res.data?.ai_available === false) {
        setSummaryError(res.data?.message || "AI service is currently unavailable. Please check your Gemini API key.");
        toast("AI unavailable — clinical summary could not be generated.", "error");
      } else {
        setSummary(normalizeSummary(payload));
        toast("Clinical summary generated!", "success");
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; detail?: string }; status?: number } };
      const msg = e.response?.data?.message || e.response?.data?.detail || "Failed to generate clinical summary.";
      setSummaryError(msg);
      toast(msg, "error");
      console.error("[Summary] Error:", err);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleCopy = () => {
    const text = soap
      ? Object.entries(soap).map(([k, v]) => `${k.toUpperCase()}:\n${v}`).join("\n\n")
      : "";
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const urgencyColors: Record<string, string> = {
    low:      "bg-emerald-50 border-emerald-200 text-emerald-700",
    medium:   "bg-amber-50 border-amber-200 text-amber-700",
    high:     "bg-orange-50 border-orange-200 text-orange-700",
    critical: "bg-red-50 border-red-200 text-red-700",
  };

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <Navbar />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Custom header */}
      <div className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/10" />
          <div className="absolute bottom-0 left-1/4 w-48 h-48 rounded-full bg-cyan-400/20" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white">Doctor View</h1>
                <p className="text-white/70 text-sm">Clinical SOAP notes and summaries for healthcare providers.</p>
              </div>
            </div>
          </div>
          <div className="hidden md:block float-slow">
            <Image src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400&q=80"
              alt="Doctor" width={150} height={120} className="rounded-2xl object-cover opacity-75" />
          </div>
        </div>
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 28" fill="none" preserveAspectRatio="none">
          <path d="M0 28L60 22.7C120 17.3 240 6.7 360 4.7C480 2.7 600 9.3 720 12C840 14.7 960 13.3 1080 11.3C1200 9.3 1320 6.7 1380 5.3L1440 4V28H0Z" fill="#F8FAFC"/>
        </svg>
        <div className="h-7" />
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-6">

        {/* Report selector */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-hero)" }}>
                {fetchingFull ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <FileText className="w-5 h-5 text-white" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-0.5">Selected Report</p>
                <p className="font-semibold text-sm text-[var(--text-primary)] truncate">
                  {loadingReports
                    ? "Loading reports…"
                    : selectedReport
                    ? (selectedReport.file_name || `Report — ${formatDate(selectedReport.created_at)}`)
                    : reports.length === 0
                    ? "No reports found"
                    : "Select a report"}
                </p>
                {selectedReport && (
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    {formatDate(selectedReport.created_at)}
                    {selectedReport.report_type && selectedReport.report_type !== "Other" && (
                      <span className="text-[10px] font-semibold text-teal-600 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded-md">{selectedReport.report_type}</span>
                    )}
                    {selectedReport.raw_text
                      ? <span className="text-emerald-500 font-medium">· report text loaded</span>
                      : fetchingFull
                      ? <span className="text-amber-500">· loading text…</span>
                      : <span className="text-amber-500">· no text — AI will use report metadata</span>
                    }
                  </p>
                )}
              </div>
            </div>

            {reports.length > 0 && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 hover:border-teal-300 text-sm font-medium text-gray-600 hover:bg-teal-50/40 transition-all"
                >
                  Change report <ChevronDown className={`w-4 h-4 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
                </button>
                {showDropdown && <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />}
                <AnimatePresence>
                  {showDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                      className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-md)] z-20 overflow-hidden"
                    >
                      <div className="p-2 max-h-60 overflow-y-auto space-y-0.5">
                        {reports.map(r => (
                          <button
                            key={r.id}
                            onClick={() => handleSelectReport(r)}
                            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${selectedReport?.id === r.id ? "text-white font-semibold" : "hover:bg-gray-50 text-gray-700"}`}
                            style={selectedReport?.id === r.id ? { background: "var(--gradient-hero)" } : {}}
                          >
                            <p className="truncate font-medium">{r.file_name || `Report — ${formatDate(r.created_at)}`}</p>
                            <p className={`text-xs ${selectedReport?.id === r.id ? "text-white/70" : "text-gray-400"}`}>
                              {formatDate(r.created_at)}{r.report_type && r.report_type !== "Other" ? ` · ${r.report_type}` : ""}
                            </p>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {reports.length === 0 && !loadingReports && (
            <div className="mt-4 text-center py-6 bg-gray-50 rounded-xl border border-gray-100">
              <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No reports found. Upload a report from the dashboard first.</p>
            </div>
          )}

          {selectedReport && (
            <div className="mt-4 flex gap-3">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleGenerateSOAP}
                disabled={loadingSOAP || fetchingFull}
                className="flex-1 gradient-btn py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loadingSOAP
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                  : fetchingFull
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Loading report…</>
                  : <><ClipboardList className="w-4 h-4" />Generate SOAP Notes</>
                }
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleGenerateSummary}
                disabled={loadingSummary || fetchingFull}
                className="flex-1 border border-gray-200 hover:border-teal-300 bg-white hover:bg-teal-50/30 py-3 rounded-xl font-semibold text-sm text-gray-600 hover:text-[var(--primary)] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loadingSummary
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                  : <><Sparkles className="w-4 h-4" />Clinical Summary</>
                }
              </motion.button>
            </div>
          )}
        </div>

        {/* SOAP error */}
        {soapError && !loadingSOAP && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-800 mb-0.5">SOAP Notes Failed</p>
              <p className="text-sm text-amber-700">{soapError}</p>
            </div>
            <button onClick={() => setSoapError("")} className="text-amber-400 hover:text-amber-600 shrink-0">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* SOAP Notes */}
        <AnimatePresence>
          {soap && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
              <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
              <div className="px-6 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-[var(--text-primary)]">SOAP Notes</h2>
                  <p className="text-sm text-gray-400 mt-0.5">Clinical documentation format</p>
                </div>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-[var(--primary)] border border-gray-200 hover:border-teal-300 px-3 py-2 rounded-xl transition-all"
                >
                  {copied
                    ? <><Check className="w-3.5 h-3.5 text-emerald-500" />Copied!</>
                    : <><Copy className="w-3.5 h-3.5" />Copy</>
                  }
                </button>
              </div>
              <div className="p-6 grid sm:grid-cols-2 gap-4">
                {SOAP_SECTIONS.map(({ key, label, icon: Icon, color, border, text, head }) => (
                  <motion.div key={key} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                    className={`rounded-2xl bg-gradient-to-br ${color} border ${border} p-4`}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-lg bg-white/60 flex items-center justify-center">
                        <Icon className={`w-3.5 h-3.5 ${text}`} />
                      </div>
                      <h4 className={`text-xs font-black uppercase tracking-widest ${head}`}>{label}</h4>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                      {soap[key as keyof SoapNotes] || "—"}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Summary error */}
        {summaryError && !loadingSummary && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-800 mb-0.5">Clinical Summary Failed</p>
              <p className="text-sm text-amber-700">{summaryError}</p>
            </div>
            <button onClick={() => setSummaryError("")} className="text-amber-400 hover:text-amber-600 shrink-0">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Clinical Summary */}
        <AnimatePresence>
          {summary && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
              <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
              <div className="px-6 pt-5 pb-4 border-b border-gray-50">
                <h2 className="font-bold text-[var(--text-primary)]">Clinical Summary</h2>
                <p className="text-sm text-gray-400 mt-0.5">AI-generated summary for medical review</p>
              </div>
              <div className="p-6 space-y-4">
                {summary.urgency_level && (
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold border ${urgencyColors[summary.urgency_level?.toLowerCase()] || urgencyColors.low}`}>
                    <AlertTriangle className="w-4 h-4" /> Urgency: {summary.urgency_level}
                  </div>
                )}
                {summary.clinical_summary && (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <p className="text-sm font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-[var(--primary)]" /> Clinical Overview
                    </p>
                    <p className="text-sm text-gray-600 leading-relaxed">{summary.clinical_summary}</p>
                  </div>
                )}
                {summary.key_findings?.length > 0 && (
                  <div className="bg-teal-50 rounded-xl p-4 border border-teal-100">
                    <p className="text-sm font-bold text-teal-800 mb-2 flex items-center gap-2">
                      <ClipboardList className="w-4 h-4" /> Key Findings
                    </p>
                    <ul className="space-y-1.5">
                      {summary.key_findings.map((f, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                          <span className="text-teal-500 mt-0.5 shrink-0">•</span>{f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.recommendations?.length > 0 && (
                  <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                    <p className="text-sm font-bold text-emerald-800 mb-2 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4" /> Recommendations
                    </p>
                    <ul className="space-y-1.5">
                      {summary.recommendations.map((r, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                          <span className="text-emerald-500 mt-0.5 shrink-0">•</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {!soap && !summary && !soapError && !summaryError && selectedReport && (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)]">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
              <Stethoscope className="w-8 h-8 text-white" />
            </div>
            <h3 className="font-bold text-[var(--text-primary)] mb-2">Generate Clinical Documentation</h3>
            <p className="text-sm text-gray-400 max-w-xs mx-auto">
              Click &quot;Generate SOAP Notes&quot; or &quot;Clinical Summary&quot; to create professional medical documentation.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
