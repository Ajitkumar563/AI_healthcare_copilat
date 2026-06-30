"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitCompare, Loader2, ChevronDown, TrendingUp, TrendingDown,
  Minus, FileText, Activity,
} from "lucide-react";
import Cookies from "js-cookie";
import Navbar from "@/components/Navbar";
import { ToastContainer, useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { reportsApi, aiApi } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// Recharts is imported lazily at component level to avoid SSR hydration mismatch.
// In Next.js App Router, even "use client" pages are server-rendered initially;
// recharts accesses DOM/ResizeObserver at module load and will throw on the server.
import dynamic from "next/dynamic";

const TrendsChart = dynamic(() => import("./_TrendsChart"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

interface Report {
  id: string;
  report_type: string;
  file_name: string;
  created_at: string;
  raw_text?: string;
}

interface CompareRow {
  parameter: string;
  value1: string;
  value2: string;
  status1: string;
  status2: string;
  normal_range: string;
  unit: string;
  trend: "better" | "worse" | "stable";
}

export interface TrendPoint {
  date: string;
  value: number;
  unit: string | null;
  is_abnormal: boolean;
  reference_min: number | null;
  reference_max: number | null;
}

export interface TrendsData {
  parameters: Record<string, TrendPoint[]>;
  available_parameters: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusColor(status: string) {
  const s = status?.toLowerCase();
  if (s === "normal") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (s === "low")    return "text-blue-700 bg-blue-50 border-blue-200";
  if (s === "high")   return "text-orange-700 bg-orange-50 border-orange-200";
  return "text-gray-500 bg-gray-50 border-gray-200";
}

function TrendIcon({ trend }: { trend: CompareRow["trend"] }) {
  if (trend === "better") return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (trend === "worse")  return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

// ── ReportPicker ──────────────────────────────────────────────────────────────
// NOTE: The outer card must NOT have overflow-hidden — the dropdown is absolute-
// positioned and would be clipped. We use rounded-t-2xl on the gradient bar
// instead to preserve the card's rounded-corner appearance.

function ReportPicker({ reports, selected, onSelect, label }: {
  reports: Report[];
  selected: Report | null;
  onSelect: (r: Report | null) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex-1 min-w-0">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all ${
          selected
            ? "border-[var(--primary)] bg-teal-50/30 shadow-[var(--shadow-sm)]"
            : "border-gray-200 bg-white hover:border-teal-300 hover:bg-teal-50/20"
        }`}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: selected ? "var(--gradient-hero)" : "linear-gradient(135deg,#F1F5F9,#E2E8F0)" }}
        >
          <FileText className={`w-4 h-4 ${selected ? "text-white" : "text-gray-400"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-0.5">{label}</p>
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {selected ? (selected.file_name || `Report — ${formatDate(selected.created_at)}`) : "Select a report"}
          </p>
          {selected && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">{formatDate(selected.created_at)}</span>
              {selected.report_type && selected.report_type !== "Other" && (
                <span className="text-[10px] font-semibold text-teal-600 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded-md">{selected.report_type}</span>
              )}
            </div>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            className="absolute top-full mt-2 left-0 right-0 bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-md)] z-20 overflow-hidden"
          >
            <div className="p-2 max-h-60 overflow-y-auto space-y-0.5">
              <button
                onClick={() => { onSelect(null); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:bg-gray-50 transition-all"
              >
                Clear selection
              </button>
              {reports.map(r => (
                <button
                  key={r.id}
                  onClick={() => { onSelect(r); setOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                    selected?.id === r.id ? "text-white font-semibold" : "hover:bg-gray-50 text-gray-700"
                  }`}
                  style={selected?.id === r.id ? { background: "var(--gradient-hero)" } : {}}
                >
                  <p className="truncate font-medium">{r.file_name || `Report — ${formatDate(r.created_at)}`}</p>
                  <p className={`text-xs ${selected?.id === r.id ? "text-white/70" : "text-gray-400"}`}>
                    {formatDate(r.created_at)}{r.report_type && r.report_type !== "Other" ? ` · ${r.report_type}` : ""}
                  </p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();
  const { language } = useLanguage();

  const [reports, setReports]               = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [report1, setReport1]               = useState<Report | null>(null);
  const [report2, setReport2]               = useState<Report | null>(null);
  const [comparing, setComparing]           = useState(false);
  const [rows, setRows]                     = useState<CompareRow[]>([]);
  const [summary, setSummary]               = useState("");

  const [trendsData, setTrendsData]         = useState<TrendsData | null>(null);
  const [trendsLoading, setTrendsLoading]   = useState(true);
  const [selectedParam, setSelectedParam]   = useState<string>("");

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) { router.push("/auth/login"); return; }

    const fetchReports = async () => {
      setLoadingReports(true);
      try { const res = await reportsApi.list(); setReports(res.data); }
      catch { toast("Could not load reports.", "error"); }
      finally { setLoadingReports(false); }
    };

    const fetchTrends = async () => {
      setTrendsLoading(true);
      try {
        const res = await reportsApi.getTrends();
        const data = res.data as TrendsData;
        setTrendsData(data);
        if (data.available_parameters.length > 0) setSelectedParam(data.available_parameters[0]);
      } catch {
        // Non-critical; show empty state
      } finally {
        setTrendsLoading(false);
      }
    };

    fetchReports();
    fetchTrends();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleCompare = async () => {
    if (!report1 || !report2) { toast("Please select two reports.", "error"); return; }
    if (report1.id === report2.id) { toast("Please select two different reports.", "error"); return; }

    // Pre-flight: both reports must have extractable text for the AI to compare
    if (!report1.raw_text?.trim()) {
      toast(`"${report1.file_name || "Report A"}" has no extractable text. Try re-uploading as a clearer PDF or image.`, "error");
      return;
    }
    if (!report2.raw_text?.trim()) {
      toast(`"${report2.file_name || "Report B"}" has no extractable text. Try re-uploading as a clearer PDF or image.`, "error");
      return;
    }

    setComparing(true); setRows([]); setSummary("");
    try {
      const payload = {
        report_text_1: report1.raw_text,
        report_text_2: report2.raw_text,
        patient_name: Cookies.get("user_name") || "Patient",
        date_1: new Date(report1.created_at).toLocaleDateString("en-IN"),
        date_2: new Date(report2.created_at).toLocaleDateString("en-IN"),
        language,
      };

      const res = await aiApi.compare(payload);
      const responseData = res.data as {
        success: boolean; ai_available: boolean; message?: string;
        data?: { ai_summary?: string; improved?: Record<string, string | number>[]; worsened?: Record<string, string | number>[]; stable?: Record<string, string | number>[] };
      };

      // Backend returns HTTP 200 even when AI is unavailable — must check success flag explicitly
      if (!responseData.success || !responseData.ai_available) {
        toast(
          responseData.message ||
          "AI comparison requires a Gemini API key. Check your backend .env and restart the server.",
          "error"
        );
        return;
      }

      const d = responseData.data;
      if (!d) {
        toast("Comparison returned no data. Please try again.", "error");
        return;
      }

      setSummary(d.ai_summary || "");
      const improved: CompareRow[] = (d.improved || []).map((r) => ({
        parameter: String(r.parameter || ""), value1: String(r.old_value || ""), value2: String(r.new_value || ""),
        status1: "Normal", status2: "Normal", normal_range: "", unit: "", trend: "better" as const,
      }));
      const worsened: CompareRow[] = (d.worsened || []).map((r) => ({
        parameter: String(r.parameter || ""), value1: String(r.old_value || ""), value2: String(r.new_value || ""),
        status1: "Normal", status2: "High", normal_range: "", unit: "", trend: "worse" as const,
      }));
      const stable: CompareRow[] = (d.stable || []).map((r) => ({
        parameter: String(r.parameter || ""), value1: String(r.value || ""), value2: String(r.value || ""),
        status1: "Normal", status2: "Normal", normal_range: "", unit: "", trend: "stable" as const,
      }));
      const allRows = [...improved, ...worsened, ...stable];
      setRows(allRows);

      if (allRows.length === 0) {
        toast("AI found no common parameters between these two reports.", "error");
      }
    } catch (err) {
      console.error("[Compare] API error:", err);
      toast("Comparison failed. Check your connection and try again.", "error");
    } finally { setComparing(false); }
  };

  const better = rows.filter(r => r.trend === "better").length;
  const worse  = rows.filter(r => r.trend === "worse").length;
  const stable = rows.filter(r => r.trend === "stable").length;

  const chartData: TrendPoint[] = trendsData?.parameters[selectedParam] ?? [];

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <Navbar />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <PageHeader
        title="Compare Reports"
        subtitle="Side-by-side analysis of two lab reports to track changes."
        icon={<GitCompare className="w-5 h-5" />}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-6">

        {/* ── Report selectors ──────────────────────────────────────────────
            No overflow-hidden on this card — ReportPicker uses absolute
            positioning for its dropdown and would be clipped otherwise. */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)]">
          <div className="h-1 w-full rounded-t-2xl" style={{ background: "var(--gradient-hero)" }} />
          <div className="p-5">
            {loadingReports ? (
              <div className="flex gap-4">
                <div className="flex-1 h-20 rounded-2xl skeleton" />
                <div className="flex-1 h-20 rounded-2xl skeleton" />
              </div>
            ) : reports.length < 2 ? (
              <div className="text-center py-8">
                <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Upload at least 2 reports to compare</p>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <ReportPicker reports={reports} selected={report1} onSelect={setReport1} label="Report A — Baseline" />
                <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
                  <span className="text-xs font-black text-gray-400">VS</span>
                </div>
                <ReportPicker reports={reports} selected={report2} onSelect={setReport2} label="Report B — Latest" />
              </div>
            )}
          </div>
          {reports.length >= 2 && (
            <div className="px-5 pb-5">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleCompare}
                disabled={comparing || !report1 || !report2}
                className="w-full gradient-btn py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {comparing
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Comparing…</>
                  : <><GitCompare className="w-4 h-4" />Compare Reports</>}
              </motion.button>
            </div>
          )}
        </div>

        {/* ── Compare results ───────────────────────────────────────────── */}
        <AnimatePresence>
          {rows.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-2xl border border-emerald-200 shadow-[var(--shadow-sm)] p-4 text-center">
                  <TrendingUp className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                  <div className="text-2xl font-extrabold text-emerald-600">{better}</div>
                  <div className="text-xs text-gray-400">Improved</div>
                </div>
                <div className="bg-white rounded-2xl border border-red-200 shadow-[var(--shadow-sm)] p-4 text-center">
                  <TrendingDown className="w-6 h-6 text-red-500 mx-auto mb-1.5" />
                  <div className="text-2xl font-extrabold text-red-600">{worse}</div>
                  <div className="text-xs text-gray-400">Worsened</div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-sm)] p-4 text-center">
                  <Minus className="w-6 h-6 text-gray-400 mx-auto mb-1.5" />
                  <div className="text-2xl font-extrabold text-gray-500">{stable}</div>
                  <div className="text-xs text-gray-400">Stable</div>
                </div>
              </div>

              {summary && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] p-5 mb-6">
                  <h3 className="font-bold text-sm text-[var(--text-primary)] mb-2 flex items-center gap-2">
                    <GitCompare className="w-4 h-4 text-[var(--primary)]" /> AI Summary
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{summary}</p>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
                <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
                <div className="grid grid-cols-[1fr_auto_1fr_1fr_auto] px-5 py-3 border-b border-gray-50 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                  <div>Parameter</div>
                  <div className="w-20 text-center">Trend</div>
                  <div className="text-center">{report1?.report_type || "Report A"}</div>
                  <div className="text-center">{report2?.report_type || "Report B"}</div>
                  <div className="w-28 text-center">Normal Range</div>
                </div>
                <div className="divide-y divide-gray-50">
                  {rows.map((row, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                      className="grid grid-cols-[1fr_auto_1fr_1fr_auto] items-center px-5 py-4 hover:bg-gray-50/50 transition-colors gap-2"
                    >
                      <div>
                        <p className="font-semibold text-sm text-[var(--text-primary)]">{row.parameter}</p>
                        {row.unit && <p className="text-xs text-gray-400">{row.unit}</p>}
                      </div>
                      <div className="w-20 flex justify-center">
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold ${
                          row.trend === "better" ? "bg-emerald-50 text-emerald-600"
                            : row.trend === "worse" ? "bg-red-50 text-red-600"
                            : "bg-gray-50 text-gray-400"
                        }`}>
                          <TrendIcon trend={row.trend} />
                          <span className="capitalize">{row.trend}</span>
                        </div>
                      </div>
                      <div className="text-center">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-lg border ${statusColor(row.status1)}`}>
                          {row.value1 || "—"}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-lg border ${statusColor(row.status2)}`}>
                          {row.value2 || "—"}
                        </span>
                      </div>
                      <div className="w-28 text-center text-xs text-gray-400">{row.normal_range || "—"}</div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!comparing && rows.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)]">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
              <GitCompare className="w-8 h-8 text-white" />
            </div>
            <h3 className="font-bold text-[var(--text-primary)] mb-2">Compare two reports</h3>
            <p className="text-sm text-gray-400">Select any two of your reports above to see a detailed side-by-side comparison.</p>
          </div>
        )}

        {/* ── Health Trends Over Time ───────────────────────────────────── */}
        <div id="trends" className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)]">
          <div className="h-1 w-full rounded-t-2xl" style={{ background: "var(--gradient-hero)" }} />
          <div className="p-5">

            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "var(--gradient-hero)" }}
              >
                <Activity className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[var(--text-primary)]">Health Trends Over Time</h3>
                <p className="text-xs text-gray-400">Parameter values across all your approved reports</p>
              </div>
            </div>

            {trendsLoading ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-8 w-24 rounded-full skeleton" />)}
                </div>
                <div className="h-64 rounded-2xl skeleton" />
              </div>
            ) : !trendsData || trendsData.available_parameters.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-gray-50 border border-gray-100">
                  <Activity className="w-6 h-6 text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-500 mb-1">No trend data yet</p>
                <p className="text-xs text-gray-400 max-w-xs mx-auto">
                  Upload more reports to see how your health parameters change over time.
                  Parameters need to appear in at least 2 approved reports.
                </p>
              </div>
            ) : (
              <>
                {/* Parameter selector */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {trendsData.available_parameters.map(param => (
                    <button
                      key={param}
                      onClick={() => setSelectedParam(param)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        selectedParam === param
                          ? "text-white border-transparent"
                          : "text-gray-600 border-gray-200 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50"
                      }`}
                      style={selectedParam === param ? { background: "var(--gradient-hero)" } : {}}
                    >
                      {param}
                    </button>
                  ))}
                </div>

                {/* Chart — rendered client-only via dynamic import (no ssr) */}
                <TrendsChart
                  chartData={chartData}
                  selectedParam={selectedParam}
                />
              </>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
