"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Bell, CheckCircle2, Clock, X, AlertTriangle, Pill, Calendar,
  ChevronDown, Loader2, Flame, RefreshCw,
} from "lucide-react";
import Cookies from "js-cookie";
import Navbar from "@/components/Navbar";
import { ToastContainer, useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { remindersApi } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Reminder {
  id: string; medicine_name: string; dosage?: string; frequency: string;
  times: string[]; duration?: string; instructions?: string;
  is_active: boolean; missed_count: number; taken_today: boolean; created_at?: string;
}

const FREQUENCY_VALUES = [
  { value: "once_daily",   tkey: "freq_once"   as const, times: ["8:00 AM"] },
  { value: "twice_daily",  tkey: "freq_twice"  as const, times: ["8:00 AM", "8:00 PM"] },
  { value: "thrice_daily", tkey: "freq_thrice" as const, times: ["8:00 AM", "2:00 PM", "8:00 PM"] },
  { value: "bedtime",      tkey: "freq_bedtime"as const, times: ["10:00 PM"] },
];

export default function RemindersPage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();
  const { t } = useLanguage();

  const FREQUENCIES = FREQUENCY_VALUES.map(f => ({ ...f, label: t(f.tkey) }));
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [medicine, setMedicine] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("once_daily");
  const [duration, setDuration] = useState("7 days");
  const [instructions, setInstructions] = useState("After food");

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) { router.push("/auth/login"); return; }
    fetchReminders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchReminders = async () => {
    setLoading(true);
    try {
      // Reset taken_today for any reminders that were last taken before today
      await remindersApi.resetDaily().catch(() => {});
      const res = await remindersApi.list();
      setReminders(res.data);
    }
    catch { toast("Could not load reminders.", "error"); }
    finally { setLoading(false); }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medicine.trim()) return;
    setSubmitting(true);
    const freq = FREQUENCIES.find(f => f.value === frequency) || FREQUENCIES[0];
    try {
      const res = await remindersApi.create({ medicine_name: medicine, dosage, frequency, times: freq.times, duration, instructions });
      setReminders(prev => [res.data, ...prev]);
      setMedicine(""); setDosage(""); setDuration("7 days"); setInstructions("After food"); setFrequency("once_daily");
      setShowForm(false);
      toast(`${medicine} added to reminders!`, "success");
    } catch { toast("Failed to add reminder.", "error"); }
    finally { setSubmitting(false); }
  };

  const handleMarkTaken = async (id: string, name: string) => {
    try { await remindersApi.markTaken(id); setReminders(prev => prev.map(r => r.id === id ? { ...r, taken_today: true, missed_count: 0 } : r)); toast(`${name} marked as taken!`, "success"); }
    catch { toast("Failed to update.", "error"); }
  };

  const handleMarkMissed = async (id: string) => {
    try { await remindersApi.markMissed(id); setReminders(prev => prev.map(r => r.id === id ? { ...r, taken_today: false, missed_count: r.missed_count + 1 } : r)); }
    catch { toast("Failed to update.", "error"); }
  };

  const handleDelete = async (id: string, name: string) => {
    try { await remindersApi.delete(id); setReminders(prev => prev.filter(r => r.id !== id)); toast(`${name} removed.`, "info"); }
    catch { toast("Failed to delete.", "error"); }
  };

  const takenCount = reminders.filter(r => r.taken_today).length;
  const missedReminders = reminders.filter(r => r.missed_count >= 2);
  const pendingToday = reminders.filter(r => !r.taken_today);
  const takenToday = reminders.filter(r => r.taken_today);
  const streakCount = reminders.filter(r => r.missed_count === 0 && r.taken_today).length;

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <Navbar />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <PageHeader title={t("reminders_title")} subtitle={t("reminders_subtitle")}
        icon={<Pill className="w-5 h-5" />} />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-4">

        {/* Header actions */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--text-secondary)]">{reminders.length} medicines tracked</p>
          <div className="flex items-center gap-2">
            <button onClick={fetchReminders} className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-all">
              <RefreshCw className="w-4 h-4" />
            </button>
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 gradient-btn px-4 py-2.5 rounded-xl text-sm font-semibold">
              <Plus className="w-4 h-4" /> {t("add_medicine")}
            </motion.button>
          </div>
        </div>

        {/* Missed alert */}
        {missedReminders.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm text-red-700">Missed dose alert</p>
              <p className="text-sm text-red-600 mt-0.5">
                You&apos;ve missed <strong>{missedReminders.map(r => r.medicine_name).join(", ")}</strong> for 2+ days.
              </p>
            </div>
          </div>
        )}

        {/* Streak */}
        {streakCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
            <Flame className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-700 font-medium">
              You&apos;ve taken {streakCount} medicine{streakCount > 1 ? "s" : ""} today 🔥 Keep it up!
            </p>
          </div>
        )}

        {/* Progress */}
        {reminders.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">{t("todays_progress")}</h3>
              <span className="text-xs font-semibold text-[var(--text-secondary)]">{takenCount} / {reminders.length} taken</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div className="h-full rounded-full" style={{ background: "var(--gradient-hero)" }}
                initial={{ width: "0%" }} animate={{ width: `${reminders.length > 0 ? (takenCount / reminders.length) * 100 : 0}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }} />
            </div>
            <p className="text-xs text-gray-400 mt-2">{reminders.length - takenCount} remaining today</p>
          </div>
        )}

        {/* Add form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="bg-white rounded-2xl border border-teal-200 shadow-[var(--shadow-md)] overflow-hidden">
              <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-[var(--text-primary)]">{t("add_new_reminder")}</h3>
                  <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>
                <form onSubmit={handleAdd} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">{t("medicine_name")} *</label>
                      <input required type="text" value={medicine} onChange={e => setMedicine(e.target.value)} placeholder="e.g. Thyroxine"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/10 text-sm transition-all" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">{t("dosage_label")}</label>
                      <input type="text" value={dosage} onChange={e => setDosage(e.target.value)} placeholder="e.g. 50 mcg"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/10 text-sm transition-all" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">{t("frequency_label")}</label>
                      <div className="relative">
                        <select value={frequency} onChange={e => setFrequency(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none text-sm bg-white appearance-none pr-8">
                          {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">{t("duration_label")}</label>
                      <input type="text" value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g. 7 days"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/10 text-sm transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">{t("instructions_label")}</label>
                    <input type="text" value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="e.g. After food, With water"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/10 text-sm transition-all" />
                  </div>
                  <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={submitting}
                    className="w-full gradient-btn py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                    {submitting ? t("loading") : t("add_medicine")}
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl skeleton" />)}</div>
        ) : reminders.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)]">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
              <Pill className="w-8 h-8 text-gray-200" />
            </div>
            <p className="text-sm font-semibold text-gray-500">{t("no_reminders")}</p>
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowForm(true)}
              className="gradient-btn px-5 py-2.5 rounded-xl text-sm font-semibold mt-4">
              {t("add_medicine")}
            </motion.button>
          </div>
        ) : (
          <div className="space-y-6">
            {pendingToday.length > 0 && (
              <div>
                <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">Due Today</p>
                <div className="space-y-3">
                  {pendingToday.map(r => (
                    <ReminderCard key={r.id} reminder={r}
                      onTaken={() => handleMarkTaken(r.id, r.medicine_name)}
                      onMissed={() => handleMarkMissed(r.id)}
                      onDelete={() => handleDelete(r.id, r.medicine_name)} />
                  ))}
                </div>
              </div>
            )}
            {takenToday.length > 0 && (
              <div>
                <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">Taken Today</p>
                <div className="space-y-3">
                  {takenToday.map(r => (
                    <ReminderCard key={r.id} reminder={r}
                      onTaken={() => handleMarkTaken(r.id, r.medicine_name)}
                      onMissed={() => handleMarkMissed(r.id)}
                      onDelete={() => handleDelete(r.id, r.medicine_name)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ReminderCard({ reminder, onTaken, onMissed, onDelete }: {
  reminder: Reminder; onTaken: () => void; onMissed: () => void; onDelete: () => void;
}) {
  const { t } = useLanguage();
  const isTaken = reminder.taken_today;
  const isMissed = reminder.missed_count >= 2;
  const borderColor = isTaken ? "#D1FAE5" : isMissed ? "#FECACA" : "#E2E8F0";

  return (
    <motion.div whileHover={{ y: -2 }}
      className="bg-white rounded-2xl shadow-[var(--shadow-sm)] overflow-hidden"
      style={{ border: `1px solid ${borderColor}` }}>
      <div className="h-1 w-full" style={{ background: isTaken ? "linear-gradient(90deg,#10B981,#34D399)" : isMissed ? "linear-gradient(90deg,#EF4444,#F87171)" : "var(--gradient-hero)" }} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${isTaken ? "bg-emerald-50" : "bg-gradient-to-br from-teal-50 to-cyan-50"}`}>
              <Pill className={`w-5 h-5 ${isTaken ? "text-emerald-500" : "text-[var(--primary)]"}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-[var(--text-primary)]">{reminder.medicine_name}</h3>
                {reminder.dosage && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{reminder.dosage}</span>}
                {isMissed && <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{reminder.missed_count} missed</span>}
                {isTaken && <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Taken</span>}
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{reminder.times.join(", ")}</span>
                {reminder.duration && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{reminder.duration}</span>}
              </div>
              {reminder.instructions && <p className="text-xs text-gray-400 mt-1">{reminder.instructions}</p>}
            </div>
          </div>
          <button onClick={onDelete} className="text-gray-300 hover:text-red-400 transition-colors shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex gap-2">
          <motion.button whileTap={{ scale: 0.97 }} onClick={onTaken} disabled={isTaken}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all ${
              isTaken ? "bg-emerald-50 text-emerald-600 cursor-default" : "gradient-btn"
            }`}>
            <CheckCircle2 className="w-4 h-4" />
            {isTaken ? t("mark_taken") : t("mark_taken")}
          </motion.button>
          {!isTaken && (
            <button onClick={onMissed} className="px-4 py-2.5 rounded-xl text-sm text-gray-400 border border-gray-200 hover:border-red-300 hover:text-red-500 transition-all">
              {t("mark_missed")}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
