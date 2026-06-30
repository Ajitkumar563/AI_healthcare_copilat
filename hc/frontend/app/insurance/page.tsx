"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, FileText, Sparkles, Loader2, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, ClipboardList, BookOpen, Lightbulb,
} from "lucide-react";
import Cookies from "js-cookie";
import Navbar from "@/components/Navbar";
import { ToastContainer, useToast } from "@/components/Toast";
import { reportsApi, aiApi } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Report {
  id: string; file_name: string; report_type: string;
  created_at: string; raw_text?: string; approval_status?: string;
}

interface ICD10Code { code: string; description: string; note: string; }
interface InsuranceData {
  icd10_codes: ICD10Code[];
  covered_tests: string[];
  claim_tips: string[];
  documentation_needed: string[];
  estimated_coverage: string;
  disclaimer: string;
}

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[var(--text-primary)] text-sm">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function InsurancePage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();
  const { language } = useLanguage();
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InsuranceData | null>(null);
  const [aiAvailable, setAiAvailable] = useState(true);

  useEffect(() => {
    if (!Cookies.get("access_token")) { router.push("/auth/login"); return; }
    reportsApi.list()
      .then(res => {
        const approved = (res.data as Report[]).filter(r => r.raw_text && r.raw_text.length > 50);
        setReports(approved);
        if (approved.length > 0) setSelectedId(approved[0].id);
      })
      .catch(() => {});
  }, [router]);

  const handleAnalyze = async () => {
    const report = reports.find(r => r.id === selectedId);
    if (!report?.raw_text) { toast("Select a report with text first.", "error"); return; }
    setLoading(true); setResult(null);
    try {
      const res = await aiApi.insuranceHelper({ report_text: report.raw_text, patient_name: Cookies.get("user_name") || "Patient", language });
      if (res.data?.data) {
        setResult(res.data.data);
        setAiAvailable(res.data.ai_available !== false);
      } else {
        toast("Could not generate insurance guidance. Please try again.", "error");
      }
    } catch {
      toast("Something went wrong. Please try again.", "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <Navbar />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/10" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-10">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white">Insurance Claim Helper</h1>
                <p className="text-white/70 text-sm">AI-powered ICD-10 codes and claim guidance from your lab report</p>
              </div>
            </div>
          </motion.div>
        </div>
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 24" fill="none" preserveAspectRatio="none">
          <path d="M0 24L1440 0V24H0Z" fill="#F8FAFC" />
        </svg>
        <div className="h-6" />
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Report selector */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-bold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--primary)]" /> Select a Lab Report
          </h2>
          {reports.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No approved reports found. Upload and get a report analyzed first.</p>
          ) : (
            <div className="space-y-2">
              {reports.map(r => (
                <label key={r.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedId === r.id ? "border-[var(--primary)] bg-teal-50" : "border-gray-100 hover:border-teal-200"}`}>
                  <input type="radio" name="report" value={r.id} checked={selectedId === r.id} onChange={() => setSelectedId(r.id)} className="accent-[var(--primary)]" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 truncate">{r.file_name}</p>
                    <p className="text-xs text-gray-400">{r.report_type} · {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleAnalyze}
            disabled={!selectedId || loading || reports.length === 0}
            className="w-full mt-4 gradient-btn py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</> : <><Sparkles className="w-4 h-4" /> Generate Insurance Guidance</>}
          </motion.button>
        </div>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

              {!aiAvailable && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  AI unavailable — showing standard guidance. Results may not be personalized to your report.
                </div>
              )}

              {/* Coverage estimate */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-hero)" }}>
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-0.5">Estimated Coverage</p>
                  <p className="text-sm font-semibold text-gray-800">{result.estimated_coverage}</p>
                </div>
              </div>

              {/* ICD-10 codes */}
              {result.icd10_codes?.length > 0 && (
                <Section title="ICD-10 Diagnosis Codes" icon={ClipboardList}>
                  <div className="space-y-2 mt-1">
                    {result.icd10_codes.map((c, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <span className="font-bold text-xs text-[var(--primary)] bg-teal-50 border border-teal-100 px-2 py-1 rounded-lg shrink-0 font-mono">{c.code}</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{c.description}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{c.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Covered tests */}
              {result.covered_tests?.length > 0 && (
                <Section title="Typically Covered Tests" icon={CheckCircle2}>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {result.covered_tests.map((t, i) => (
                      <span key={i} className="text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1.5 rounded-full">{t}</span>
                    ))}
                  </div>
                </Section>
              )}

              {/* Claim tips */}
              {result.claim_tips?.length > 0 && (
                <Section title="Claim Filing Tips" icon={Lightbulb}>
                  <ul className="space-y-2 mt-1">
                    {result.claim_tips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle2 className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Documentation */}
              {result.documentation_needed?.length > 0 && (
                <Section title="Documentation Checklist" icon={BookOpen}>
                  <ul className="space-y-2 mt-1">
                    {result.documentation_needed.map((doc, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="w-5 h-5 rounded-md border-2 border-gray-300 shrink-0 flex items-center justify-center text-[10px] font-bold text-gray-400">{i + 1}</span>
                        {doc}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Disclaimer */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-500 leading-relaxed flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" />
                {result.disclaimer}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
