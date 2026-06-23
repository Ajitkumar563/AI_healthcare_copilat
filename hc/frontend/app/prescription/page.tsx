"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileText, Loader2, Pill, Sparkles, X, AlertTriangle,
  Clock, CheckCircle2, Bell, ChevronRight, RefreshCw,
} from "lucide-react";
import Cookies from "js-cookie";
import Navbar from "@/components/Navbar";
import { ToastContainer, useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { aiApi, remindersApi } from "@/lib/api";

interface Medicine {
  name: string; dosage: string; frequency: string; duration: string;
  instructions: string; purpose: string; refill_date?: string;
}
interface PrescriptionResult {
  medicines: Medicine[]; doctor_notes?: string; diagnosis?: string; follow_up?: string; ai_available?: boolean;
}

export default function PrescriptionPage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<PrescriptionResult | null>(null);
  const [error, setError] = useState("");
  const [addingReminder, setAddingReminder] = useState<string | null>(null);

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) { router.push("/auth/login"); return; }
  }, [router]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files?.[0]) { setFile(e.dataTransfer.files[0]); setResult(null); setError(""); }
  }, []);

  const handleUploadAndAnalyze = async () => {
    if (!file) return;
    setError(""); setResult(null);
    setUploading(true);
    try {
      // /api/ai/prescription takes a file directly — it does OCR internally
      const res = await aiApi.prescription(file);
      setUploading(false); setAnalyzing(true);
      const payload = res.data?.data || {};
      setResult({
        medicines:    payload.medicines    || [],
        doctor_notes: payload.special_instructions || payload.doctor_notes,
        diagnosis:    payload.diagnosis,
        follow_up:    payload.follow_up,
        ai_available: res.data?.ai_available,
      });
      toast("Prescription analyzed!", "success");
    } catch {
      setError("Upload or analysis failed. Make sure the file is a clear PDF or image.");
      toast("Analysis failed.", "error");
    } finally {
      setUploading(false); setAnalyzing(false);
    }
  };

  const handleAddToReminders = async (m: Medicine) => {
    setAddingReminder(m.name);
    try {
      const freqMap: Record<string, { value: string; times: string[] }> = {
        "once daily":        { value: "once_daily",   times: ["8:00 AM"] },
        "twice daily":       { value: "twice_daily",  times: ["8:00 AM", "8:00 PM"] },
        "three times daily": { value: "thrice_daily", times: ["8:00 AM", "2:00 PM", "8:00 PM"] },
        "at bedtime":        { value: "bedtime",       times: ["10:00 PM"] },
      };
      const freq = freqMap[m.frequency?.toLowerCase()] || { value: "once_daily", times: ["8:00 AM"] };
      await remindersApi.create({
        medicine_name: m.name, dosage: m.dosage, frequency: freq.value,
        times: freq.times, duration: m.duration, instructions: m.instructions,
      });
      toast(`${m.name} added to reminders!`, "success");
    } catch { toast("Failed to add to reminders.", "error"); }
    finally { setAddingReminder(null); }
  };

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <Navbar />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <PageHeader title="Prescription Analyzer" subtitle="Upload a prescription to extract medicines and set reminders."
        icon={<Pill className="w-5 h-5" />} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-6">

        {/* Upload card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
          <div className="px-6 pt-5 pb-4 border-b border-gray-50">
            <h2 className="font-bold text-[var(--text-primary)]">Upload Prescription</h2>
            <p className="text-sm text-gray-400 mt-0.5">Doctor&apos;s prescription, discharge summary, or medicine list</p>
          </div>
          <div className="p-6">
            <div onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all ${dragActive ? "border-[var(--primary)] bg-teal-50" : "border-gray-200 hover:border-teal-300/60 hover:bg-gray-50/80"}`}>
              <input type="file" id="rx-upload" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => { if (e.target.files?.[0]) { setFile(e.target.files[0]); setResult(null); setError(""); } }} />
              {!file ? (
                <label htmlFor="rx-upload" className="cursor-pointer block">
                  <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
                    <Upload className="w-7 h-7 text-white" />
                  </div>
                  <p className="font-semibold text-gray-700 mb-1">{dragActive ? "Drop it here! 🎯" : "Drop your prescription here"}</p>
                  <p className="text-sm text-gray-400">or click to browse · PDF, JPG, PNG</p>
                </label>
              ) : (
                <div>
                  <div className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
                    <FileText className="w-7 h-7 text-white" />
                  </div>
                  <p className="font-semibold text-gray-700 mb-1 break-all">{file.name}</p>
                  <p className="text-sm text-gray-400 mb-3">{(file.size / 1024).toFixed(1)} KB</p>
                  <button onClick={() => { setFile(null); setResult(null); }}
                    className="text-xs text-red-500 hover:underline flex items-center gap-1 mx-auto"><X className="w-3 h-3" /> Remove</button>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-3 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />{error}
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleUploadAndAnalyze}
                disabled={!file || uploading || analyzing}
                className="flex-1 gradient-btn py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {uploading ? <><Loader2 className="w-4 h-4 animate-spin" />Uploading…</>
                  : analyzing ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing…</>
                  : <><Sparkles className="w-4 h-4" />Analyze Prescription</>}
              </motion.button>
              {result && (
                <button onClick={() => { setFile(null); setResult(null); }}
                  className="p-3.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-all">
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {result.diagnosis && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] p-5">
                  <h3 className="font-bold text-sm text-[var(--text-primary)] mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[var(--primary)]" /> Diagnosis / Notes
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{result.diagnosis}</p>
                  {result.doctor_notes && <p className="text-sm text-gray-500 mt-2 italic">&quot;{result.doctor_notes}&quot;</p>}
                  {result.follow_up && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl">
                      <Clock className="w-3.5 h-3.5 shrink-0" /> <strong>Follow-up:</strong> {result.follow_up}
                    </div>
                  )}
                </div>
              )}

              {!result.ai_available && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700">AI is currently unavailable. Showing basic extracted information.</p>
                </div>
              )}

              {result.medicines?.length > 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
                  <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
                  <div className="px-6 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-[var(--text-primary)]">Medicines Prescribed</h2>
                      <p className="text-sm text-gray-400 mt-0.5">{result.medicines.length} medicine{result.medicines.length > 1 ? "s" : ""} found</p>
                    </div>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
                      <Pill className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {result.medicines.map((m, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                        className="p-5 hover:bg-gray-50/50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-hero)" }}>
                              <Pill className="w-4 h-4 text-white" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="font-bold text-[var(--text-primary)]">{m.name}</h3>
                                {m.dosage && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{m.dosage}</span>}
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-2">
                                {m.frequency && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{m.frequency}</span>}
                                {m.duration && <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{m.duration}</span>}
                              </div>
                              {m.instructions && <p className="text-xs text-gray-400">{m.instructions}</p>}
                              {m.purpose && (
                                <div className="mt-1.5 inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 text-xs px-2 py-0.5 rounded-full">
                                  <Sparkles className="w-3 h-3" />{m.purpose}
                                </div>
                              )}
                            </div>
                          </div>
                          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleAddToReminders(m)}
                            disabled={addingReminder === m.name}
                            className="shrink-0 flex items-center gap-1.5 gradient-btn px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50">
                            {addingReminder === m.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                            {addingReminder === m.name ? "Adding…" : "Add Reminder"}
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-50 flex items-center justify-between">
                    <p className="text-xs text-gray-400">Add all medicines to your reminder schedule</p>
                    <button onClick={async () => {
                      for (const m of result.medicines) await handleAddToReminders(m);
                    }} className="flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] hover:underline">
                      Add all <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)]">
                  <Pill className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No medicines could be extracted from this document.</p>
                  <p className="text-xs text-gray-400 mt-1">Try a clearer image or a different file format.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!result && !uploading && !analyzing && (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)]">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
              <Pill className="w-8 h-8 text-white" />
            </div>
            <h3 className="font-bold text-[var(--text-primary)] mb-2">Upload a Prescription</h3>
            <p className="text-sm text-gray-400 max-w-xs mx-auto">
              AI will extract all medicines, dosages, and instructions — and let you set one-tap reminders.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
