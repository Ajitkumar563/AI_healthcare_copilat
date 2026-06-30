"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Brain, Stethoscope, FileText, Loader2,
  AlertTriangle, ChevronRight, CheckCircle2, ShieldAlert,
  Pill, ClipboardList, Calendar, Microscope, Heart,
  User, Activity, RefreshCw, ChevronDown, Info, Eye, Clock,
} from "lucide-react";
import Cookies from "js-cookie";
import HospitalNavbar from "@/components/HospitalNavbar";
import { ToastContainer, useToast } from "@/components/Toast";
import RiskBadge from "@/components/RiskBadge";
import { copilotApi, authApi } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PatientInfo {
  id: string; name: string; age: number | null; gender: string | null;
  medical_history: string | null; allergies: string | null; current_medicines: string | null;
}

interface ReportSummary {
  total: number; latest_date: string | null; latest_risk_level: string | null;
  latest_risk_score: number | null; risk_trend: "improving" | "worsening" | "stable";
}

interface AbnormalValue {
  name: string; value: string; unit: string | null;
  reference_min: number | null; reference_max: number | null; status: string;
}

interface AiBrief {
  chief_complaint_guess: string;
  key_concerns: string[];
  critical_values: string[];
  questions_to_ask: string[];
  watch_out_for: string[];
  patient_snapshot: string;
}

interface PreConsultData {
  patient: PatientInfo;
  report_summary: ReportSummary;
  abnormal_values: AbnormalValue[];
  active_medicines: { name: string; dosage: string | null; frequency: string }[];
  ai_brief: AiBrief;
  disclaimer: string;
}

interface DiagnosisItem {
  name: string; probability: "High" | "Medium" | "Low"; reasoning: string; icd_code: string | null;
}

interface DiagnosisData {
  diagnoses: DiagnosisItem[];
  differential: string[];
  red_flags: string[];
  suggested_tests: string[];
  clinical_notes: string;
  disclaimer: string;
}

interface MedicineItem {
  name: string; dosage: string; frequency: string; duration: string;
  instructions: string; caution: string | null;
}

interface PrescriptionDraft {
  medicines: MedicineItem[];
  general_advice: string;
  follow_up_date: string;
  follow_up_tests: string[];
  lifestyle_changes: string[];
  doctor_review_notes: string;
}

interface PrescriptionData {
  patient_name: string; diagnosis: string; draft: PrescriptionDraft;
  status: string; disclaimer: string; generated_at: string;
}

// ── Static ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "pre",   label: "Pre-Consultation",  icon: Eye           },
  { id: "diag",  label: "Diagnosis Support", icon: Stethoscope   },
  { id: "rx",    label: "Prescription Draft",icon: ClipboardList },
] as const;
type TabId = typeof TABS[number]["id"];

const PROB_STYLE: Record<string, string> = {
  High:   "bg-red-50 text-red-700 border-red-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  Low:    "bg-blue-50 text-blue-600 border-blue-100",
};

const TREND_STYLE: Record<string, { cls: string; label: string }> = {
  worsening: { cls: "text-red-600",   label: "↑ Worsening"  },
  improving: { cls: "text-green-600", label: "↓ Improving"  },
  stable:    { cls: "text-gray-500",  label: "→ Stable"     },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── Small shared components ───────────────────────────────────────────────────

function Disclaimer({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
      <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-xs text-amber-800 leading-relaxed font-medium">{text}</p>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, accent = "teal" }:
  { title: string; icon: React.ElementType; children: React.ReactNode; accent?: string }) {
  const grad =
    accent === "teal"   ? "linear-gradient(135deg,#0F766E,#06B6D4)"
    : accent === "blue" ? "linear-gradient(135deg,#2563EB,#7C3AED)"
    : accent === "amber"? "linear-gradient(135deg,#D97706,#F59E0B)"
    : "linear-gradient(135deg,#7C3AED,#A78BFA)";
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="h-0.5 w-full" style={{ background: grad }} />
      <div className="px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] mb-4">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: grad }}>
            <Icon className="w-3.5 h-3.5 text-white" />
          </div>
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

function BulletList({ items, color = "teal" }: { items: string[]; color?: string }) {
  const dot =
    color === "teal"  ? "bg-teal-400"
    : color === "red" ? "bg-red-400"
    : color === "amber"? "bg-amber-400"
    : "bg-gray-300";
  if (!items.length) return <p className="text-xs text-gray-400 italic">None noted.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-gray-700 leading-relaxed">
          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dot}`} />
          {item}
        </li>
      ))}
    </ul>
  );
}

// ── Pre-Consultation Tab ──────────────────────────────────────────────────────

function PreConsultTab({ patientId, role, userName }: { patientId: string; role: string; userName: string }) {
  const [data,    setData]    = useState<PreConsultData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await copilotApi.preConsultation(patientId);
      setData(res.data);
    } catch {
      toast("Could not load patient brief.", "error");
    } finally {
      setLoading(false);
    }
  }, [patientId, toast]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="space-y-4">
      {[1,2,3,4].map(i => <div key={i} className="h-36 rounded-2xl skeleton" />)}
    </div>
  );

  if (!data) return (
    <div className="text-center py-12 text-gray-400 text-sm">Failed to load patient brief.</div>
  );

  const { patient, report_summary: rs, abnormal_values: av, active_medicines, ai_brief: ai } = data;
  const trend = TREND_STYLE[rs.risk_trend] ?? TREND_STYLE.stable;

  return (
    <div className="space-y-4">
      <Disclaimer text={data.disclaimer} />

      {/* Patient snapshot */}
      <SectionCard title="Patient at a Glance" icon={User}>
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          {[
            { label: "Age",    value: patient.age ? `${patient.age} years` : "Unknown" },
            { label: "Gender", value: patient.gender || "Unknown" },
            { label: "Risk Trend", value: <span className={`font-bold ${trend.cls}`}>{trend.label}</span> },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{s.label}</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">{s.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-3">
          <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wide mb-1">AI Snapshot</p>
          <p className="text-sm text-teal-800 leading-relaxed">{ai.patient_snapshot}</p>
        </div>
        {patient.medical_history && (
          <p className="text-xs text-gray-500 mt-3 border-t border-gray-50 pt-3">
            <span className="font-semibold text-gray-600">History:</span> {patient.medical_history}
          </p>
        )}
      </SectionCard>

      {/* Chief complaint + key concerns */}
      <div className="grid sm:grid-cols-2 gap-4">
        <SectionCard title="Likely Chief Complaint" icon={Brain} accent="blue">
          <p className="text-sm text-gray-700 leading-relaxed">{ai.chief_complaint_guess}</p>
          {ai.key_concerns.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-50">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Key Concerns</p>
              <BulletList items={ai.key_concerns} color="teal" />
            </div>
          )}
        </SectionCard>

        <SectionCard title="Questions to Ask" icon={ChevronRight}>
          <BulletList items={ai.questions_to_ask} color="teal" />
        </SectionCard>
      </div>

      {/* Critical + watch out */}
      {(ai.critical_values.length > 0 || ai.watch_out_for.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-4">
          {ai.critical_values.length > 0 && (
            <SectionCard title="Critical Values" icon={AlertTriangle} accent="amber">
              <BulletList items={ai.critical_values} color="red" />
            </SectionCard>
          )}
          {ai.watch_out_for.length > 0 && (
            <SectionCard title="Watch Out For" icon={ShieldAlert} accent="amber">
              <BulletList items={ai.watch_out_for} color="amber" />
            </SectionCard>
          )}
        </div>
      )}

      {/* Abnormal lab values */}
      {av.length > 0 && (
        <SectionCard title="Abnormal Lab Values" icon={Activity} accent="amber">
          <div className="space-y-2">
            {av.map((v, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-orange-50 border border-orange-100">
                <div>
                  <p className="text-xs font-bold text-gray-800">{v.name}</p>
                  <p className="text-[10px] text-gray-400">
                    Ref: {v.reference_min ?? "?"} – {v.reference_max ?? "?"} {v.unit || ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-extrabold text-orange-600">
                    {v.value} {v.unit || ""}
                  </p>
                  <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                    {v.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Reports + medicines */}
      <div className="grid sm:grid-cols-2 gap-4">
        <SectionCard title="Recent Reports" icon={FileText}>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Total reports</span>
              <span className="font-bold text-gray-700">{rs.total}</span>
            </div>
            {rs.latest_date && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Latest</span>
                <span className="font-bold text-gray-700">{fmtDate(rs.latest_date)}</span>
              </div>
            )}
            {rs.latest_risk_level && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">Risk level</span>
                <RiskBadge level={rs.latest_risk_level} size="sm" />
              </div>
            )}
            {rs.latest_risk_score != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Risk score</span>
                <span className="font-bold text-gray-700">{Math.round(rs.latest_risk_score)}/100</span>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Active Medicines" icon={Pill} accent="amber">
          {active_medicines.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No active medicines logged.</p>
          ) : (
            <div className="space-y-1.5">
              {active_medicines.map((m, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <p className="text-xs text-gray-700">
                    <span className="font-semibold">{m.name}</span>
                    {m.dosage && ` — ${m.dosage}`}
                    {m.frequency && `, ${m.frequency.replace(/_/g, " ")}`}
                  </p>
                </div>
              ))}
            </div>
          )}
          {patient.allergies && (
            <div className="mt-3 pt-3 border-t border-gray-50">
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide mb-1">Known Allergies</p>
              <p className="text-xs text-red-700 font-medium">{patient.allergies}</p>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="flex justify-end">
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[var(--primary)] transition-colors font-medium">
          <RefreshCw className="w-3 h-3" /> Refresh brief
        </button>
      </div>
    </div>
  );
}

// ── Diagnosis Tab ─────────────────────────────────────────────────────────────

function DiagnosisTab({ patientId }: { patientId: string }) {
  const [symptoms,   setSymptoms]   = useState("");
  const [reportText, setReportText] = useState("");
  const [result,     setResult]     = useState<DiagnosisData | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [showReport, setShowReport] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symptoms.trim()) { toast("Describe the patient's symptoms first.", "error"); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await copilotApi.suggestDiagnosis({ patient_id: patientId, symptoms, report_text: reportText });
      setResult(res.data);
    } catch {
      toast("Diagnosis suggestion failed.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Disclaimer text="AI-generated differential diagnosis — for clinical decision support only. The doctor makes the final diagnosis." />

      {/* Input form */}
      <SectionCard title="Consultation Input" icon={Stethoscope}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Presenting Symptoms *
            </label>
            <textarea
              required
              rows={4}
              value={symptoms}
              onChange={e => setSymptoms(e.target.value)}
              placeholder="Describe what the patient is presenting with — duration, severity, associated symptoms..."
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none resize-none transition-all"
            />
          </div>

          <button type="button" onClick={() => setShowReport(!showReport)}
            className="flex items-center gap-1.5 text-xs text-[var(--primary)] font-semibold hover:underline">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showReport ? "rotate-180" : ""}`} />
            {showReport ? "Hide" : "Add"} report text for context (optional)
          </button>

          <AnimatePresence initial={false}>
            {showReport && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <textarea
                  rows={3}
                  value={reportText}
                  onChange={e => setReportText(e.target.value)}
                  placeholder="Paste relevant text from the patient's latest lab report..."
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none resize-none transition-all"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={loading}
            className="w-full gradient-btn py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {loading ? "AI thinking…" : "Suggest Diagnoses"}
          </motion.button>
        </form>
      </SectionCard>

      {/* Results */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

            {/* Red flags */}
            {result.red_flags.length > 0 && (
              <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl bg-red-50 border border-red-200">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-red-800 mb-1">Red Flags — Urgent Attention</p>
                  <BulletList items={result.red_flags} color="red" />
                </div>
              </div>
            )}

            {/* Diagnosis cards */}
            <SectionCard title="Differential Diagnoses" icon={Brain} accent="blue">
              <div className="space-y-3">
                {result.diagnoses.map((d, i) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-3.5 hover:border-blue-200 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-sm font-bold text-gray-800">{d.name}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {d.icd_code && (
                          <span className="text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{d.icd_code}</span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PROB_STYLE[d.probability] ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
                          {d.probability}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{d.reasoning}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Suggested tests */}
            {result.suggested_tests.length > 0 && (
              <SectionCard title="Suggested Investigations" icon={Microscope} accent="teal">
                <BulletList items={result.suggested_tests} color="teal" />
              </SectionCard>
            )}

            {/* Differential + clinical notes */}
            <div className="grid sm:grid-cols-2 gap-4">
              {result.differential.length > 0 && (
                <SectionCard title="Also Rule Out" icon={Info}>
                  <BulletList items={result.differential} />
                </SectionCard>
              )}
              {result.clinical_notes && (
                <SectionCard title="Clinical Notes" icon={FileText}>
                  <p className="text-xs text-gray-700 leading-relaxed">{result.clinical_notes}</p>
                </SectionCard>
              )}
            </div>

            <Disclaimer text={result.disclaimer} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Prescription Tab ──────────────────────────────────────────────────────────

function PrescriptionTab({ patientId }: { patientId: string }) {
  const [diagnosis, setDiagnosis] = useState("");
  const [symptoms,  setSymptoms]  = useState("");
  const [result,    setResult]    = useState<PrescriptionData | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [approved,  setApproved]  = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagnosis.trim()) { toast("Enter the confirmed diagnosis first.", "error"); return; }
    setLoading(true);
    setResult(null);
    setApproved(false);
    try {
      const res = await copilotApi.draftPrescription({ patient_id: patientId, diagnosis, symptoms });
      setResult(res.data);
    } catch {
      toast("Prescription draft failed.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Prominent disclaimer at the top */}
      <div className="flex items-start gap-3 px-4 py-4 rounded-2xl bg-red-50 border-2 border-red-200">
        <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-extrabold text-red-800 mb-0.5">Doctor Review Required</p>
          <p className="text-xs text-red-700 leading-relaxed">
            This is an AI-generated draft. It must be reviewed, edited, and explicitly approved
            by a qualified doctor before any clinical use. The AI never finalises a prescription.
          </p>
        </div>
      </div>

      {/* Input */}
      <SectionCard title="Prescription Input" icon={ClipboardList}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Confirmed Diagnosis *
            </label>
            <input required type="text" value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
              placeholder="e.g. Type 2 Diabetes Mellitus, Hypertension"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Symptoms / Chief Complaint (optional)
            </label>
            <textarea rows={2} value={symptoms} onChange={e => setSymptoms(e.target.value)}
              placeholder="Additional context for the AI..."
              className="w-full px-3 py-2.5 text-xs rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none resize-none transition-all" />
          </div>
          <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={loading}
            className="w-full gradient-btn py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
            {loading ? "Drafting prescription…" : "Generate AI Draft"}
          </motion.button>
        </form>
      </SectionCard>

      {/* Draft output */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

            {/* Review notes from AI */}
            {result.draft.doctor_review_notes && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800 leading-relaxed">
                  <span className="font-bold">AI Review Note:</span> {result.draft.doctor_review_notes}
                </p>
              </div>
            )}

            {/* Medicine list */}
            <SectionCard title="Proposed Medicines" icon={Pill} accent="teal">
              <div className="space-y-3">
                {result.draft.medicines.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No medicines suggested. Please prescribe manually.</p>
                ) : result.draft.medicines.map((m, i) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-3.5 hover:border-teal-200 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-sm font-bold text-gray-800">{m.name}</p>
                      <span className="text-xs font-semibold text-[var(--primary)] bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-100">
                        {m.dosage}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{m.frequency}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{m.duration}</span>
                    </div>
                    {m.instructions && <p className="text-xs text-gray-600 mt-1.5 italic">{m.instructions}</p>}
                    {m.caution && (
                      <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5 mt-2 flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> {m.caution}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Follow-up + tests */}
            <div className="grid sm:grid-cols-2 gap-4">
              <SectionCard title="Follow-up & Tests" icon={Calendar} accent="blue">
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Suggested Follow-up</p>
                    <p className="text-sm font-bold text-[var(--text-primary)]">{result.draft.follow_up_date}</p>
                  </div>
                  {result.draft.follow_up_tests.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Tests at Follow-up</p>
                      <BulletList items={result.draft.follow_up_tests} color="teal" />
                    </div>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Lifestyle Changes" icon={Heart} accent="amber">
                <BulletList items={result.draft.lifestyle_changes} color="amber" />
              </SectionCard>
            </div>

            {/* General advice */}
            {result.draft.general_advice && (
              <SectionCard title="General Patient Advice" icon={Info}>
                <p className="text-xs text-gray-700 leading-relaxed">{result.draft.general_advice}</p>
              </SectionCard>
            )}

            {/* Doctor approval gate */}
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-5 space-y-3">
              <p className="text-xs font-bold text-gray-600 text-center uppercase tracking-wide">
                Doctor Sign-Off Required
              </p>
              <p className="text-xs text-gray-500 text-center leading-relaxed">
                By marking this prescription as reviewed, you confirm that you have examined the patient,
                verified the AI draft, and taken clinical responsibility for this prescription.
              </p>
              {!approved ? (
                <motion.button whileTap={{ scale: 0.97 }}
                  onClick={() => { setApproved(true); toast("Prescription marked as reviewed by Dr. " + result.patient_name, "success"); }}
                  className="w-full gradient-btn py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> I have reviewed and approve this draft
                </motion.button>
              ) : (
                <div className="flex items-center justify-center gap-2 py-3 bg-green-50 border border-green-200 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <p className="text-sm font-bold text-green-700">Reviewed &amp; approved</p>
                </div>
              )}
            </div>

            <Disclaimer text={result.disclaimer} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DoctorCopilotPage() {
  const router   = useRouter();
  const params   = useParams();
  const patientId = params.patientId as string;
  const { toasts, removeToast } = useToast();

  const [userName, setUserName] = useState("");
  const [role,     setRole]     = useState("");
  const [tab,      setTab]      = useState<TabId>("pre");

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) { router.push("/hospital/login"); return; }
    authApi.me().then(res => {
      const u = res.data;
      if (!["doctor","admin"].includes(u.role)) { router.push("/dashboard"); return; }
      setUserName(u.name || "");
      setRole(u.role || "");
    }).catch(() => router.push("/hospital/login"));
  }, [router]);

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <HospitalNavbar userName={userName} role={role} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <div className="border-b border-gray-100 bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <button onClick={() => router.push(`/hospital/patients/${patientId}`)}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[var(--primary)] transition-colors font-medium mb-3">
            <ArrowLeft className="w-4 h-4" /> Back to Patient
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-[var(--text-primary)]">Doctor Copilot</h1>
              <p className="text-xs text-gray-400">AI-assisted consultation support · Always requires doctor review</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mt-4">
            {TABS.map(t => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    active ? "text-[var(--primary)] font-semibold" : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                  }`}>
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full" style={{ background: "var(--gradient-hero)" }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-16">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            {tab === "pre"  && <PreConsultTab patientId={patientId} role={role} userName={userName} />}
            {tab === "diag" && <DiagnosisTab patientId={patientId} />}
            {tab === "rx"   && <PrescriptionTab patientId={patientId} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
