"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical, Plus, X, Loader2, AlertTriangle, CheckCircle2,
  Lightbulb, RefreshCw, Zap, ShieldCheck, CalendarCheck,
} from "lucide-react";
import Cookies from "js-cookie";
import Navbar from "@/components/Navbar";
import { ToastContainer, useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { aiApi, remindersApi } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type OverallRisk = "low" | "moderate" | "high" | "unknown";
type Severity    = "Mild" | "Moderate" | "Severe";

interface Interaction {
  medicine_a:     string;
  medicine_b:     string;
  severity:       Severity;
  description:    string;
  recommendation: string;
}

interface InteractionResult {
  success:        boolean;
  ai_available:   boolean;
  overall_risk:   OverallRisk;
  safe_to_combine: boolean | null;
  summary:        string;
  interactions:   Interaction[];
  message?:       string;
}

interface Reminder {
  id: string;
  medicine_name: string;
  is_active: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_BADGE: Record<Severity, string> = {
  Mild:     "bg-yellow-50 text-yellow-700 border-yellow-200",
  Moderate: "bg-orange-50 text-orange-700 border-orange-200",
  Severe:   "bg-red-50   text-red-700   border-red-200",
};

const SEVERITY_BAR: Record<Severity, string> = {
  Mild:     "linear-gradient(135deg,#D97706,#FCD34D)",
  Moderate: "linear-gradient(135deg,#EA580C,#FB923C)",
  Severe:   "linear-gradient(135deg,#DC2626,#F87171)",
};

const RISK_GRADIENT: Record<OverallRisk, string> = {
  low:     "linear-gradient(135deg,#059669,#34D399)",
  moderate:"linear-gradient(135deg,#D97706,#F59E0B)",
  high:    "linear-gradient(135deg,#DC2626,#F87171)",
  unknown: "linear-gradient(135deg,#64748B,#94A3B8)",
};

const RISK_LABEL: Record<OverallRisk, string> = {
  low:     "Low risk — generally safe to combine",
  moderate:"Moderate risk — use with caution",
  high:    "High risk — avoid or consult a doctor",
  unknown: "Unable to check — AI unavailable",
};

const PURPLE = "linear-gradient(135deg,#7C3AED,#A78BFA)";

// ── Component ─────────────────────────────────────────────────────────────────

export default function MedicineCheckerPage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();

  const [medicines, setMedicines]             = useState<string[]>(["", ""]);
  const [result, setResult]                   = useState<InteractionResult | null>(null);
  const [checking, setChecking]               = useState(false);
  const [loadingReminders, setLoadingReminders] = useState(false);

  useEffect(() => {
    if (!Cookies.get("access_token")) router.push("/auth/login");
  }, [router]);

  // ── Input handlers ─────────────────────────────────────────────────────────

  const updateMedicine = (idx: number, value: string) =>
    setMedicines(prev => prev.map((m, i) => (i === idx ? value : m)));

  const addMedicine = () => {
    if (medicines.length < 10) setMedicines(prev => [...prev, ""]);
  };

  const removeMedicine = (idx: number) =>
    setMedicines(prev => prev.filter((_, i) => i !== idx));

  const filledMedicines = medicines.filter(m => m.trim().length > 0);
  const canCheck = filledMedicines.length >= 2 && !checking;

  // ── Check interactions ────────────────────────────────────────────────────

  const handleCheck = async () => {
    if (!canCheck) return;
    setChecking(true);
    setResult(null);
    try {
      const res = await aiApi.checkMedicineInteractions(filledMedicines);
      setResult(res.data as InteractionResult);
    } catch {
      toast("Could not check interactions. Please try again.", "error");
    } finally {
      setChecking(false);
    }
  };

  // ── Load from reminders ───────────────────────────────────────────────────

  const handleLoadReminders = async () => {
    setLoadingReminders(true);
    try {
      const res = await remindersApi.list();
      const names: string[] = (res.data as Reminder[])
        .filter(r => r.is_active)
        .map(r => r.medicine_name)
        .slice(0, 10);

      if (names.length === 0) {
        toast("No active reminders found.", "error");
        return;
      }

      // Always keep at least 2 slots
      const slots = names.length < 2 ? [...names, ""] : names;
      setMedicines(slots);
      setResult(null);
      toast(`Loaded ${names.length} medicine${names.length !== 1 ? "s" : ""} from your reminders.`, "success");
    } catch {
      toast("Could not load reminders. Please try again.", "error");
    } finally {
      setLoadingReminders(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <Navbar />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <PageHeader
        title="Medicine Interaction Checker"
        subtitle="Enter 2 or more medicine names to check for potential drug interactions."
        icon={<FlaskConical className="w-5 h-5" />}
        gradient={PURPLE}
      />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Input card ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="h-1 w-full" style={{ background: PURPLE }} />
          <div className="p-6 space-y-5">

            {/* Header row with Load from reminders */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Medicine names</p>
              <button
                onClick={handleLoadReminders}
                disabled={loadingReminders}
                className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 hover:text-purple-700 disabled:opacity-50 transition-colors"
              >
                {loadingReminders
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <RefreshCw className="w-3.5 h-3.5" />}
                Load from my reminders
              </button>
            </div>

            {/* Dynamic medicine fields */}
            <div className="space-y-2.5">
              {medicines.map((med, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2.5"
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: PURPLE }}
                  >
                    {idx + 1}
                  </div>
                  <input
                    type="text"
                    value={med}
                    onChange={e => updateMedicine(idx, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && idx === medicines.length - 1 && medicines.length < 10) addMedicine();
                    }}
                    placeholder={`Medicine ${idx + 1} (e.g. Metformin)`}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
                  />
                  {idx >= 2 && (
                    <button
                      onClick={() => removeMedicine(idx)}
                      className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Add medicine */}
            {medicines.length < 10 && (
              <button
                onClick={addMedicine}
                className="flex items-center gap-1.5 text-sm font-semibold text-purple-600 hover:text-purple-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add another medicine
              </button>
            )}

            {/* Check button */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleCheck}
              disabled={!canCheck}
              className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 text-white transition-all disabled:opacity-50"
              style={{ background: PURPLE }}
            >
              {checking
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking interactions…</>
                : <><Zap className="w-4 h-4" /> Check Interactions</>}
            </motion.button>

            {filledMedicines.length < 2 && (
              <p className="text-xs text-center text-gray-400">Enter at least 2 medicine names to check</p>
            )}
          </div>
        </div>

        {/* ── Results ───────────────────────────────────────────────────── */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Overall risk banner */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: RISK_GRADIENT[result.overall_risk] }}
              >
                <div className="p-5 flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    {result.safe_to_combine
                      ? <ShieldCheck className="w-6 h-6 text-white" />
                      : <AlertTriangle className="w-6 h-6 text-white" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-white text-base leading-tight">
                      {RISK_LABEL[result.overall_risk]}
                    </p>
                    <p className="text-white/85 text-sm mt-1 leading-relaxed">{result.summary}</p>
                    {!result.ai_available && (
                      <p className="text-white/70 text-xs mt-2">AI unavailable — results may be incomplete.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* No interactions found */}
              {result.interactions.length === 0 && result.safe_to_combine !== false && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-800 text-sm">No known interactions detected</p>
                    <p className="text-emerald-700 text-sm mt-1 leading-relaxed">
                      No significant drug interactions were found between these medicines.
                      Always confirm with your doctor or pharmacist before making changes to your regimen.
                    </p>
                  </div>
                </div>
              )}

              {/* Interaction cards */}
              {result.interactions.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {result.interactions.length} interaction{result.interactions.length !== 1 ? "s" : ""} found
                  </p>

                  {result.interactions.map((ix, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden"
                    >
                      <div className="h-1 w-full" style={{ background: SEVERITY_BAR[ix.severity] }} />
                      <div className="p-5 space-y-3">

                        {/* Medicine pair + severity */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-800 bg-gray-50 border border-gray-200 px-3 py-1 rounded-full">
                            {ix.medicine_a}
                          </span>
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="font-semibold text-sm text-gray-800 bg-gray-50 border border-gray-200 px-3 py-1 rounded-full">
                            {ix.medicine_b}
                          </span>
                          <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full border ${SEVERITY_BADGE[ix.severity]}`}>
                            {ix.severity}
                          </span>
                        </div>

                        {/* Description */}
                        <p className="text-sm text-gray-600 leading-relaxed">{ix.description}</p>

                        {/* Recommendation */}
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                          <p className="text-xs font-bold text-amber-800 mb-1 flex items-center gap-1.5">
                            <Lightbulb className="w-3.5 h-3.5" /> Recommendation
                          </p>
                          <p className="text-sm text-amber-700 leading-relaxed">{ix.recommendation}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Book appointment CTA for moderate/high risk */}
              {(result.overall_risk === "moderate" || result.overall_risk === "high") && (
                <Link
                  href="/appointments"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#0F766E,#06B6D4)" }}
                >
                  <CalendarCheck className="w-4 h-4" /> Book an Appointment with a Doctor
                </Link>
              )}

              {/* Disclaimer */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500 text-center leading-relaxed">
                  ⚠️ This tool is for informational purposes only and is not a substitute for professional
                  medical advice. Always consult your doctor or pharmacist before combining medications.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
