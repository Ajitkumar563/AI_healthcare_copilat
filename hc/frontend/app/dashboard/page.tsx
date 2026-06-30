"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Upload, FileText, Loader2, Sparkles, X, Activity, Brain, Salad,
  MessageCircle, GitCompare, Bell, Clock, Users, Pill, Heart, Droplets,
  TrendingUp, AlertTriangle, ChevronRight, ShieldAlert, CheckCircle2, CalendarCheck,
  Phone, Send, Download, Stethoscope, FlaskConical, Lightbulb, ShieldCheck,
  RefreshCw, RotateCcw, Scale,
} from "lucide-react";

const HealthScoreChart = dynamic(() => import("./_HealthScoreChart"), { ssr: false });
import Cookies from "js-cookie";
import Navbar from "@/components/Navbar";
import { ToastContainer, useToast } from "@/components/Toast";
import StatCard from "@/components/StatCard";
import RiskBadge from "@/components/RiskBadge";
import { reportsApi, aiApi, remindersApi, familyApi, authApi, patientsApi } from "@/lib/api";
import type { HealthScorePoint } from "./_HealthScoreChart";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import {
  isNotificationSupported,
  requestNotificationPermission,
  showEmergencyNotification,
} from "@/lib/notifications";

interface Report {
  id: string; report_type: string; file_name: string; file_url: string;
  created_at: string; ai_summary?: string; risk_score?: number; risk_level?: string; raw_text?: string;
  approval_status?: string; doctor_notes?: string;
  days_since_upload?: number; recommended_retest_days?: number; retest_due?: boolean;
}
interface DailyTip { tip: string; category: string; icon: string; date: string; personalized: boolean; }
interface SecondOpinionResult {
  opinion_a: { health_score: number; risk_level: string; summary: string; key_findings: string[]; recommendations: string[] };
  opinion_b: { health_score: number; risk_level: string; summary: string; key_findings: string[]; recommendations: string[] };
  consensus: { health_score: number; risk_level: string; agreement: boolean; agreement_note: string; summary: string };
}
interface RiskData {
  overall_score: number; risk_level: string;
  liver_risk: { score: number; level: string; explanation: string };
  diabetes_risk: { score: number; level: string; explanation: string };
  heart_risk: { score: number; level: string; explanation: string };
  kidney_risk: { score: number; level: string; explanation: string };
  overall_explanation: string;
}
interface Finding { parameter: string; value: string; status: string; explanation: string; }
interface AnalysisResult {
  findings: Finding[]; summary: string; recommendations: string[];
  risk_level: string; health_score?: number;
}

const QUICK_LINKS = [
  { icon: MessageCircle, label: "Chat",        href: "/chat",        gradient: "linear-gradient(135deg,#0F766E,#06B6D4)" },
  { icon: GitCompare,   label: "Compare",      href: "/compare",     gradient: "linear-gradient(135deg,#7C3AED,#A78BFA)" },
  { icon: Bell,         label: "Reminders",    href: "/reminders",   gradient: "linear-gradient(135deg,#D97706,#FCD34D)" },
  { icon: Clock,        label: "Timeline",     href: "/timeline",    gradient: "linear-gradient(135deg,#0F766E,#14B8A6)" },
  { icon: Users,        label: "Family",       href: "/family",      gradient: "linear-gradient(135deg,#059669,#34D399)" },
  { icon: Pill,         label: "Prescription", href: "/prescription",gradient: "linear-gradient(135deg,#DC2626,#F87171)" },
  { icon: Brain,         label: "Symptoms",     href: "/symptoms",          gradient: "linear-gradient(135deg,#7C3AED,#C084FC)" },
  { icon: Salad,         label: "Diet Plan",    href: "/diet",              gradient: "linear-gradient(135deg,#D97706,#F59E0B)" },
  { icon: CalendarCheck, label: "Appointments", href: "/appointments",      gradient: "linear-gradient(135deg,#0369A1,#38BDF8)" },
  { icon: FlaskConical,  label: "Med Checker",  href: "/medicine-checker",  gradient: "linear-gradient(135deg,#7C3AED,#A78BFA)" },
  { icon: ShieldCheck,   label: "Insurance",    href: "/insurance",         gradient: "linear-gradient(135deg,#0369A1,#0EA5E9)" },
  { icon: Scale,         label: "Widget",       href: "/widget/embed-guide",gradient: "linear-gradient(135deg,#0F766E,#34D399)" },
];

const ORGAN_KEYS = [
  { key: "liver_risk",    label: "Liver",    Icon: Activity },
  { key: "diabetes_risk", label: "Diabetes", Icon: Droplets },
  { key: "heart_risk",    label: "Heart",    Icon: Heart },
  { key: "kidney_risk",   label: "Kidney",   Icon: TrendingUp },
] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function riskColor(level: string) {
  const l = level?.toLowerCase();
  if (l === "high" || l === "critical") return "#EF4444";
  if (l === "medium") return "#F59E0B";
  return "#10B981";
}

function statusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "normal": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "low":    return "bg-red-50 text-red-700 border-red-200";
    case "high":   return "bg-orange-50 text-orange-700 border-orange-200";
    default:       return "bg-gray-50 text-gray-500 border-gray-200";
  }
}

function CircleGauge({ score, level }: { score: number; level: string }) {
  const color = riskColor(level);
  return (
    <div className="relative w-16 h-16 mx-auto mb-2">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#F1F5F9" strokeWidth="3" />
        <motion.circle cx="18" cy="18" r="15.915" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          initial={{ strokeDasharray: "0 100" }} animate={{ strokeDasharray: `${Math.min(100, score)} 100` }}
          transition={{ duration: 1.2, delay: 0.4 }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();
  const { t, language } = useLanguage();
  const [userName, setUserName] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [remindersCount, setRemindersCount] = useState(0);
  const [familyCount, setFamilyCount] = useState(0);
  const [highRiskFamily, setHighRiskFamily] = useState<{ id: string; name: string; risk_level: string }[]>([]);
  const [latestRisk, setLatestRisk] = useState<RiskData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [freshRisk, setFreshRisk] = useState<RiskData | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [emergencyAlert, setEmergencyAlert] = useState<string | null>(null);
  const [criticalSystems, setCriticalSystems] = useState<string[]>([]);
  const [alertEmailSent, setAlertEmailSent] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("unsupported");

  // WhatsApp modal
  const [waModal, setWaModal] = useState<{ reportId: string; riskData?: object } | null>(null);
  const [waPhone, setWaPhone] = useState("+91");
  const [waSending, setWaSending] = useState(false);

  // PDF download
  const [pdfDownloading, setPdfDownloading] = useState(false);

  // Feature 1: Health score history
  const [scoreHistory, setScoreHistory] = useState<HealthScorePoint[]>([]);

  // Feature 2: Daily tip
  const [dailyTip, setDailyTip] = useState<DailyTip | null>(null);

  // Feature 5: Second opinion
  const [secondOpinionModal, setSecondOpinionModal] = useState(false);
  const [secondOpinionResult, setSecondOpinionResult] = useState<SecondOpinionResult | null>(null);
  const [secondOpinionLoading, setSecondOpinionLoading] = useState(false);

  // Seed notification permission state after mount (client-only)
  useEffect(() => {
    if (isNotificationSupported()) {
      console.log("[EmergencyAlert] Page load — Notification.permission:", Notification.permission);
      setNotifPermission(Notification.permission);
    } else {
      console.log("[EmergencyAlert] Page load — Notification API unsupported in this browser.");
      setNotifPermission("unsupported");
    }
  }, []);

  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission();
    if (perm) setNotifPermission(perm);
  };

  const handleDownloadPdf = async (reportId: string) => {
    setPdfDownloading(true);
    try {
      const res = await reportsApi.downloadPdf(reportId);
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `sahaay-health-summary.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("PDF downloaded!", "success");
    } catch {
      toast("Could not generate PDF. Please try again.", "error");
    } finally {
      setPdfDownloading(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!waModal) return;
    // Basic E.164 validation — strip non-digits, require 10–15 digits
    const digits = waPhone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      toast("Enter a valid phone number (10–15 digits with country code)", "error");
      return;
    }
    setWaSending(true);
    try {
      const res = await reportsApi.sendWhatsApp(waModal.reportId, waPhone, waModal.riskData);
      if (res.data?.success) {
        toast(res.data.message || "Summary sent to WhatsApp!", "success");
        setWaModal(null);
        setWaPhone("+91");
      } else {
        const msg: string = res.data?.message || "";
        const lower = msg.toLowerCase();
        if (lower.includes("twilio") || lower.includes("not configured") || lower.includes("account_sid")) {
          toast("WhatsApp not configured — add Twilio credentials to .env to enable this feature", "error");
        } else if (lower.includes("token expired") || lower.includes("token")) {
          toast("Session expired — please log in again.", "error");
        } else {
          toast("WhatsApp unavailable — please try again later", "error");
        }
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const errMsg = (err as { message?: string })?.message?.toLowerCase() ?? "";
      if (errMsg.includes("twilio") || errMsg.includes("not configured")) {
        toast("WhatsApp not configured — add Twilio credentials to .env to enable this feature", "error");
      } else if (status === 401) {
        toast("Session expired — please log in again.", "error");
      } else {
        toast("WhatsApp unavailable — please try again later", "error");
      }
    } finally {
      setWaSending(false);
    }
  };

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) { router.push("/auth/login"); return; }
    const fetchAll = async () => {
      setLoadingData(true);
      try {
        const [profileRes, reportsRes, remRes, famRes] = await Promise.allSettled([
          authApi.me(), reportsApi.list(), remindersApi.list(), familyApi.list(),
        ]);
        if (profileRes.status === "fulfilled") {
          const u = profileRes.value.data;
          setUserName(u.name || Cookies.get("user_name") || "there");
          Cookies.set("user_name", u.name || "", { expires: 1 });
        } else setUserName(Cookies.get("user_name") || "there");
        if (reportsRes.status === "fulfilled") {
          const reps: Report[] = reportsRes.value.data; setReports(reps);
          const latest = reps.find(r => r.raw_text && r.raw_text.length > 50);
          if (latest?.raw_text) aiApi.riskScore({ report_text: latest.raw_text, patient_name: latest.file_name, language }).then(r => { if (r.data?.data) setLatestRisk(r.data.data); }).catch(() => {});
        }
        if (remRes.status === "fulfilled") setRemindersCount(remRes.value.data.length);
        if (famRes.status === "fulfilled") {
          const fam: { id: string; name: string; risk_level: string }[] = famRes.value.data;
          setFamilyCount(fam.length);
          setHighRiskFamily(fam.filter(m => ["High","Critical"].includes(m.risk_level)));
        }

        // Feature 1: health score history (non-blocking)
        patientsApi.getHealthScoreHistory().then(r => setScoreHistory(r.data)).catch(() => {});

        // Feature 2: daily tip (non-blocking)
        aiApi.getDailyTip().then(r => setDailyTip(r.data)).catch(() => {});

      } catch { /**/ } finally { setLoadingData(false); }
    };
    fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleSecondOpinion = async () => {
    const latest = reports.find(r => r.raw_text && r.raw_text.length > 50);
    if (!latest?.raw_text) { toast("Upload and analyze a report first.", "error"); return; }
    setSecondOpinionModal(true); setSecondOpinionResult(null); setSecondOpinionLoading(true);
    try {
      const res = await aiApi.secondOpinion({ report_text: latest.raw_text, patient_name: userName || "Patient", age: 25, language });
      if (res.data?.success) setSecondOpinionResult(res.data);
      else toast(res.data?.message || "Second opinion failed. Please try again.", "error");
    } catch { toast("Second opinion failed. Please try again.", "error"); }
    finally { setSecondOpinionLoading(false); }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files?.[0]) { setFile(e.dataTransfer.files[0]); setAnalysis(null); setFreshRisk(null); setUploadError(""); }
  }, []);

  const handleUploadAndAnalyze = async () => {
    if (!file) return;
    setUploadError(""); setEmergencyAlert(null); setCriticalSystems([]); setAlertEmailSent(false); setAnalysis(null); setFreshRisk(null);
    setUploading(true);
    let extractedText = ""; let reportId: string | null = null;
    try {
      const up = await reportsApi.upload(file);
      extractedText = up.data.extracted_text || ""; reportId = up.data.report_id || null;
    } catch { setUploadError("Upload failed. Please try again."); setUploading(false); return; }
    setUploading(false); toast("Report uploaded!", "success"); setAnalyzing(true);
    try {
      const text = extractedText || `File: ${file.name}`;
      const [analysisRes, riskRes] = await Promise.allSettled([
        aiApi.analyze({ report_text: text, patient_name: userName || "Patient", age: 25, gender: "Unknown", language }),
        aiApi.riskScore({ report_text: text, patient_name: userName || "Patient", age: 25, gender: "Unknown", user_email: Cookies.get("user_email") || undefined, language }),
      ]);
      if (analysisRes.status === "fulfilled" && analysisRes.value.data?.report) {
        const r = analysisRes.value.data.report;
        const recs = [...(r.nutrition || []), ...(r.lifestyle || [])];
        setAnalysis({ findings: r.findings || [], summary: r.summary || "", recommendations: recs.length ? recs : ["Maintain a balanced diet."], risk_level: r.status === "Action Required" ? "High" : "Low", health_score: r.health_score });
        const hb = r.findings?.find((f: Finding) => f.parameter.toLowerCase().includes("hemoglobin") && f.status === "Low");
        if (hb && parseFloat(hb.value) < 7) setEmergencyAlert("Hemoglobin critically low (<7 g/dL). Please see a doctor immediately.");
        if (reportId) reportsApi.saveAnalysis(reportId, { analysis_result: r, ai_summary: r.summary, risk_score: r.health_score, risk_level: r.status === "Action Required" ? "high" : "low", report_type: r.type || "Other" }).catch(() => {});
      }
      if (riskRes.status === "fulfilled" && riskRes.value.data?.data) {
        const rd = riskRes.value.data.data as RiskData;
        setFreshRisk(rd); setLatestRisk(rd);

        console.log("[EmergencyAlert] risk-score response — ai_available:", riskRes.value.data.ai_available, "risk_level:", rd.risk_level, "message:", riskRes.value.data.message);
        if (riskRes.value.data.ai_available === false) {
          console.log("[EmergencyAlert] AI is UNAVAILABLE — backend returned the static fallback risk data, which is never \"Critical\". Emergency banner/notification cannot fire until the Gemini API key/quota issue is fixed.");
        }

        // Detect which organ systems are critical
        const ORGAN_LABELS: { key: keyof RiskData; name: string }[] = [
          { key: "liver_risk",    name: "Liver"    },
          { key: "diabetes_risk", name: "Diabetes" },
          { key: "heart_risk",    name: "Heart"    },
          { key: "kidney_risk",   name: "Kidney"   },
        ];
        const criticals = ORGAN_LABELS
          .filter(o => (rd[o.key] as { level?: string })?.level?.toLowerCase() === "critical")
          .map(o => o.name);
        const isCritical = rd.risk_level?.toLowerCase() === "critical" || criticals.length > 0;
        console.log("[EmergencyAlert] isCritical:", isCritical, "criticalSystems:", criticals);

        if (isCritical) {
          console.log("[EmergencyAlert] Critical risk detected — calling showEmergencyNotification()");
          const alertMsg = criticals.length > 0
            ? `Critical risk detected in: ${criticals.join(", ")}. Please see a doctor immediately.`
            : "Critical overall health risk detected. Please consult a doctor immediately.";
          setEmergencyAlert(alertMsg);
          setCriticalSystems(criticals);

          // Browser push notification (works even if tab is in background)
          showEmergencyNotification(
            "⚠️ Critical Health Alert — Sahaay",
            criticals.length > 0
              ? `Critical risk in ${criticals.join(", ")}. See a doctor immediately.`
              : "Critical health risk detected. Please consult a doctor immediately.",
          );

          if (riskRes.value.data.emergency_alert_sent) setAlertEmailSent(true);
        }
      }
      const refreshed = await reportsApi.list(); setReports(refreshed.data);
      toast("Analysis complete!", "success");
    } catch { setUploadError("Analysis failed."); toast("Analysis failed.", "error"); }
    finally { setAnalyzing(false); }
  };

  const displayRisk = freshRisk || latestRisk;
  const healthScore = analysis?.health_score || reports[0]?.risk_score;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("greeting_morning") : hour < 17 ? t("greeting_afternoon") : t("greeting_evening");

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <Navbar userName={userName} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Hero Banner */}
      <div className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/10" />
          <div className="absolute bottom-0 left-1/3 w-48 h-48 rounded-full bg-cyan-400/20" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 flex items-center justify-between">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-white/70 text-sm font-medium mb-1">
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-1">{greeting}, {userName || "there"} 👋</h1>
            <p className="text-white/70 text-sm">{t("health_overview")}</p>
          </motion.div>
          <div className="hidden md:block float-slow">
            <Image src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&q=80"
              alt="Health" width={160} height={120} className="rounded-2xl object-cover opacity-70" />
          </div>
        </div>
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 28" fill="none" preserveAspectRatio="none">
          <path d="M0 28L60 22.7C120 17.3 240 6.7 360 4.7C480 2.7 600 9.3 720 12C840 14.7 960 13.3 1080 11.3C1200 9.3 1320 6.7 1380 5.3L1440 4V28H0Z" fill="#F8FAFC"/>
        </svg>
        <div className="h-7" />
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* File input always in DOM so labels/htmlFor work from any section */}
        <input type="file" id="file-upload" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
          onChange={e => { if (e.target.files?.[0]) { setFile(e.target.files[0]); setAnalysis(null); setFreshRisk(null); setUploadError(""); }}} />

        {/* Notification permission request — subtle, non-blocking */}
        <AnimatePresence>
          {notifPermission === "default" && !emergencyAlert && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3"
            >
              <Bell className="w-5 h-5 text-blue-500 shrink-0" />
              <p className="text-sm text-blue-700 flex-1">
                <span className="font-semibold">Enable health alerts</span> — get notified if your reports show critical readings, even when this tab is in the background.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleEnableNotifications}
                  className="text-xs font-bold text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-all"
                >
                  Enable
                </button>
                <button
                  onClick={() => setNotifPermission("denied")}
                  className="text-xs text-blue-400 hover:text-blue-600 px-2 py-1.5 transition-all"
                >
                  Later
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Emergency alert — full-impact banner, persists until dismissed */}
        <AnimatePresence>
          {emergencyAlert && (
            <motion.div
              initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl overflow-hidden shadow-xl"
              style={{ background: "linear-gradient(135deg,#DC2626 0%,#EF4444 55%,#F97316 100%)" }}
            >
              <div className="p-5 flex items-start gap-4">
                {/* Pulsing icon */}
                <motion.div
                  animate={{ scale: [1, 1.18, 1] }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
                  className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0"
                >
                  <ShieldAlert className="w-7 h-7 text-white" />
                </motion.div>

                <div className="flex-1 min-w-0">
                  <p className="font-extrabold text-white text-base leading-tight">⚠️ Emergency Health Alert</p>
                  <p className="text-white/90 text-sm mt-1 leading-relaxed">{emergencyAlert}</p>

                  {/* Critical system badges */}
                  {criticalSystems.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {criticalSystems.map(sys => (
                        <span key={sys} className="bg-white/20 border border-white/30 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                          {sys} — Critical
                        </span>
                      ))}
                    </div>
                  )}

                  {alertEmailSent && (
                    <p className="text-white/70 text-xs mt-2 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Alert email sent to your registered address.
                    </p>
                  )}

                  {/* CTA buttons */}
                  <div className="flex flex-wrap gap-2 mt-4">
                    <Link
                      href="/appointments"
                      className="inline-flex items-center gap-1.5 bg-white text-red-600 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-red-50 transition-all"
                    >
                      <CalendarCheck className="w-4 h-4" /> Find a Doctor
                    </Link>
                    <a
                      href="tel:112"
                      className="inline-flex items-center gap-1.5 border border-white/40 text-white font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-white/10 transition-all"
                    >
                      <Phone className="w-4 h-4" /> Emergency: 112
                    </a>
                  </div>
                </div>

                <button
                  onClick={() => { setEmergencyAlert(null); setCriticalSystems([]); setAlertEmailSent(false); }}
                  className="text-white/60 hover:text-white transition-colors shrink-0 p-1"
                  aria-label="Dismiss alert"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Family high-risk alert */}
        <AnimatePresence>
          {highRiskFamily.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="flex items-start gap-3 px-4 py-3.5 rounded-2xl border border-orange-200 bg-orange-50 shadow-sm">
              <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-orange-800">
                  {highRiskFamily.length} family member{highRiskFamily.length !== 1 ? "s" : ""} need attention
                </p>
                <p className="text-xs text-orange-700 mt-0.5">
                  {highRiskFamily.map(m => m.name).join(", ")} — {highRiskFamily.length === 1 ? "shows" : "show"} high or critical health risk.
                </p>
              </div>
              <Link href="/family" className="text-xs font-bold text-orange-700 hover:text-orange-900 shrink-0 underline underline-offset-2">
                View Family →
              </Link>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loadingData ? [1,2,3,4].map(i => <div key={i} className="h-28 rounded-2xl skeleton" />) : (
            <>
              <StatCard label={t("stat_reports")} value={reports.length} icon={<FileText className="w-5 h-5" />} gradient="linear-gradient(135deg,#0F766E,#06B6D4)" subtitle="uploaded total" />
              <StatCard label={t("stat_health_score")} value={healthScore ? Math.round(healthScore) : "—"} icon={<Activity className="w-5 h-5" />}
                gradient={healthScore ? (healthScore >= 80 ? "linear-gradient(135deg,#059669,#34D399)" : healthScore >= 60 ? "linear-gradient(135deg,#D97706,#FCD34D)" : "linear-gradient(135deg,#DC2626,#F87171)") : "linear-gradient(135deg,#64748B,#94A3B8)"}
                subtitle={reports[0]?.risk_level ? `${reports[0].risk_level} risk` : "upload a report"} />
              <StatCard label={t("stat_reminders")} value={remindersCount} icon={<Bell className="w-5 h-5" />} gradient="linear-gradient(135deg,#D97706,#F59E0B)" subtitle="active medicines" />
              <StatCard label={t("stat_family")} value={familyCount} icon={<Users className="w-5 h-5" />} gradient="linear-gradient(135deg,#7C3AED,#A78BFA)" subtitle="tracked members" />
            </>
          )}
        </div>

        {/* Feature 2: Daily Health Tip */}
        {dailyTip && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl overflow-hidden border border-amber-100 shadow-sm"
            style={{ background: "linear-gradient(135deg,#FFFBEB,#FEF3C7)" }}
          >
            <div className="px-5 py-3.5 flex items-center gap-3">
              <span className="text-2xl shrink-0">{dailyTip.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">
                    Today&apos;s Health Tip · {dailyTip.category}{dailyTip.personalized ? " · Personalized" : ""}
                  </span>
                </div>
                <p className="text-sm font-medium text-amber-900 leading-snug">{dailyTip.tip}</p>
              </div>
              <button onClick={() => aiApi.getDailyTip().then(r => setDailyTip(r.data)).catch(() => {})} title="Refresh tip" className="text-amber-400 hover:text-amber-600 transition-colors shrink-0 p-1">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {QUICK_LINKS.map(q => (
            <motion.div key={q.label} whileHover={{ y: -3 }} whileTap={{ scale: 0.96 }}>
              <Link href={q.href} className="bg-white rounded-2xl p-3 border border-gray-100 hover:border-teal-200 hover:shadow-md transition-all flex flex-col items-center gap-2 group">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: q.gradient }}>
                  <q.icon className="w-4 h-4 text-white" />
                </div>
                <span className="text-[10px] font-semibold text-gray-600 group-hover:text-[var(--primary)] text-center leading-tight">{q.label}</span>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Welcome hero — new users with no reports and no file selected */}
        {!loadingData && reports.length === 0 && !file && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border-2 border-dashed border-teal-200 bg-gradient-to-br from-teal-50/60 to-cyan-50/40 p-8 text-center"
          >
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: "var(--gradient-hero)" }}>
              <Upload className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-lg font-extrabold text-gray-800 mb-1">Welcome to Sahaay! 👋</h3>
            <p className="text-sm text-gray-500 mb-4 max-w-xs mx-auto">
              Upload your first blood report or lab result to get instant AI-powered health insights.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
              {[
                { icon: Sparkles, label: "AI Analysis",  color: "#0F766E" },
                { icon: Activity, label: "Risk Scoring", color: "#7C3AED" },
                { icon: MessageCircle, label: "Chat with AI", color: "#2563EB" },
              ].map(({ icon: Icon, label, color }) => (
                <span key={label}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border"
                  style={{ color, borderColor: color + "33", background: color + "0D" }}>
                  <Icon className="w-3.5 h-3.5" /> {label}
                </span>
              ))}
            </div>
            <label
              htmlFor="file-upload"
              className="cursor-pointer inline-flex items-center gap-2 text-sm font-bold text-white px-5 py-2.5 rounded-xl shadow-md transition-all hover:opacity-90"
              style={{ background: "var(--gradient-hero)" }}
            >
              <Upload className="w-4 h-4" /> Upload your first report
            </label>
            <p className="text-xs text-gray-400 mt-3">PDF, JPG, PNG · Max 10 MB</p>
          </motion.div>
        )}

        {/* Upload + Analysis */}
        {(loadingData || reports.length > 0 || !!file) && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
            <div className="px-6 pt-5 pb-4 border-b border-gray-50">
              <h2 className="font-bold text-[var(--text-primary)]">{t("upload_report")}</h2>
              <p className="text-sm text-gray-400 mt-0.5">CBC, LFT, KFT, Thyroid, Lipid & more</p>
            </div>
            <div className="p-6">
              <div onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${dragActive ? "border-[var(--primary)] bg-teal-50" : "border-gray-200 hover:border-teal-300/60 hover:bg-gray-50/80"}`}>
                {!file ? (
                  <label htmlFor="file-upload" className="cursor-pointer block">
                    <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
                      <Upload className="w-6 h-6 text-white" />
                    </div>
                    <p className="font-semibold text-gray-700 text-sm mb-1">{dragActive ? "Drop it here! 🎯" : t("upload_drag")}</p>
                    <p className="text-xs text-gray-400">or {t("upload_browse")} · {t("upload_formats")}</p>
                  </label>
                ) : (
                  <div>
                    <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
                      <FileText className="w-6 h-6 text-white" />
                    </div>
                    <p className="font-semibold text-sm text-gray-700 break-all mb-1">{file.name}</p>
                    <p className="text-xs text-gray-400 mb-3">{(file.size / 1024).toFixed(1)} KB</p>
                    <button onClick={() => { setFile(null); setAnalysis(null); setFreshRisk(null); }}
                      className="text-xs text-red-500 hover:underline flex items-center gap-1 mx-auto"><X className="w-3 h-3" /> Remove</button>
                  </div>
                )}
              </div>
              {uploadError && (
                <div className="mt-3 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />{uploadError}
                </div>
              )}
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleUploadAndAnalyze} disabled={!file || uploading || analyzing}
                className="w-full mt-4 gradient-btn py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
                {uploading ? <><Loader2 className="w-4 h-4 animate-spin" />{t("uploading")}</>
                  : analyzing ? <><Loader2 className="w-4 h-4 animate-spin" />{t("analyzing")}</>
                  : <><Sparkles className="w-4 h-4" />{t("btn_analyze")}</>}
              </motion.button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
            <div className="px-6 pt-5 pb-4 border-b border-gray-50">
              <h2 className="font-bold text-[var(--text-primary)]">{t("ai_analysis")}</h2>
              <p className="text-sm text-gray-400 mt-0.5">{t("powered_by")}</p>
            </div>
            <div className="p-6">
              {!analysis ? (
                (() => {
                  const latest = reports[0];
                  const status = latest?.approval_status;
                  if (status === "pending") {
                    return (
                      <div className="flex flex-col items-center justify-center text-center py-10 px-4">
                        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                          <Stethoscope className="w-8 h-8 text-blue-400" />
                        </div>
                        <p className="font-semibold text-gray-700 text-sm mb-1">Your report is being reviewed</p>
                        <p className="text-xs text-gray-400 leading-relaxed max-w-xs">
                          A doctor is reviewing your results before they appear here. This usually takes 24–48 hours. You&apos;ll see the full analysis once approved.
                        </p>
                        <Link href="/appointments" className="mt-4 text-xs font-semibold text-[var(--primary)] hover:underline flex items-center gap-1">
                          <CalendarCheck className="w-3.5 h-3.5" /> Book an appointment while you wait
                        </Link>
                      </div>
                    );
                  }
                  if (status === "rejected") {
                    return (
                      <div className="space-y-4">
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                          <p className="font-semibold text-orange-800 text-sm mb-2 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" /> Doctor&apos;s Feedback
                          </p>
                          <p className="text-sm text-orange-700 leading-relaxed">{latest.doctor_notes || "Please re-upload a clearer report or book an appointment for further guidance."}</p>
                        </div>
                        <Link
                          href="/appointments"
                          className="w-full gradient-btn py-2.5 rounded-xl text-xs font-semibold text-center flex items-center justify-center gap-1.5"
                        >
                          <CalendarCheck className="w-3.5 h-3.5" /> Book an Appointment
                        </Link>
                        <p className="text-xs text-gray-400 text-center">You can also upload a new report above for a fresh review.</p>
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-col items-center justify-center text-center py-14">
                      <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
                        <Sparkles className="w-8 h-8 text-gray-200" />
                      </div>
                      <p className="text-sm text-gray-400">Upload a report to see AI-powered analysis here.</p>
                    </div>
                  );
                })()
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className="flex items-center gap-3">
                    {analysis.health_score && (
                      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-100">
                        <Activity className="w-4 h-4 text-[var(--primary)]" />
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Health Score</p>
                          <p className={`text-xl font-bold ${analysis.health_score >= 80 ? "text-emerald-600" : analysis.health_score >= 60 ? "text-amber-500" : "text-red-500"}`}>
                            {analysis.health_score}<span className="text-xs font-normal text-gray-400">/100</span>
                          </p>
                        </div>
                      </div>
                    )}
                    <RiskBadge level={analysis.risk_level} />
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-3">{analysis.summary}</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {analysis.findings?.map((f, i) => (
                      <div key={i} className="border border-gray-100 rounded-xl p-3 hover:border-teal-100 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm text-gray-800">{f.parameter}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusBadge(f.status)}`}>{f.status}</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-0.5">{f.value}</p>
                        <p className="text-xs text-gray-500 leading-relaxed">{f.explanation}</p>
                      </div>
                    ))}
                  </div>
                  {analysis.recommendations.length > 0 && (
                    <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                      <h4 className="text-sm font-semibold text-emerald-800 mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> {t("recommendations")}
                      </h4>
                      <ul className="space-y-1">
                        {analysis.recommendations.slice(0, 4).map((r, i) => (
                          <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                            <span className="text-emerald-500 mt-0.5">•</span>{r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Link href="/chat" className="flex-1 gradient-btn py-2.5 rounded-xl text-xs font-semibold text-center flex items-center justify-center gap-1.5">
                      <MessageCircle className="w-3.5 h-3.5" /> Ask AI
                    </Link>
                    <Link href="/doctor" className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-xs font-semibold text-center hover:bg-gray-50 transition-all flex items-center justify-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" /> Doctor View
                    </Link>
                    <button
                      onClick={handleSecondOpinion}
                      className="flex items-center justify-center gap-1.5 border border-purple-200 text-purple-600 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all hover:bg-purple-50"
                      title="Get a second AI opinion"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> 2nd Opinion
                    </button>
                    {reports[0]?.id && (
                      <button
                        onClick={() => setWaModal({ reportId: reports[0].id, riskData: freshRisk ?? undefined })}
                        className="flex items-center justify-center gap-1.5 border px-3 py-2.5 rounded-xl text-xs font-semibold transition-all hover:bg-green-50"
                        style={{ borderColor: "#25D366", color: "#25D366" }}
                        title="Send summary to WhatsApp"
                      >
                        <Send className="w-3.5 h-3.5" /> WhatsApp
                      </button>
                    )}
                    {reports[0]?.id && (
                      <button
                        onClick={() => handleDownloadPdf(reports[0].id)}
                        disabled={pdfDownloading}
                        className="flex items-center justify-center gap-1.5 border border-[var(--primary)] text-[var(--primary)] px-3 py-2.5 rounded-xl text-xs font-semibold transition-all hover:bg-teal-50 disabled:opacity-60"
                        title="Download PDF health summary"
                      >
                        {pdfDownloading
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                          : <><Download className="w-3.5 h-3.5" /> Download PDF</>}
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* Organ risk */}
        {displayRisk && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
            <div className="px-6 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[var(--text-primary)]">Organ Risk Scores</h2>
                <p className="text-sm text-gray-400 mt-0.5">AI-calculated per system</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-extrabold gradient-text">{displayRisk.overall_score}</p>
                <p className="text-xs text-gray-400">Overall</p>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-5 bg-gray-50 rounded-xl p-3 leading-relaxed">{displayRisk.overall_explanation}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {ORGAN_KEYS.map(({ key, label }) => {
                  const r = displayRisk[key];
                  return (
                    <div key={key} className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
                      <CircleGauge score={r.score} level={r.level} />
                      <p className="text-xs font-semibold text-gray-700 mb-1">{label}</p>
                      <RiskBadge level={r.level} size="sm" />
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* Recent Reports — hidden until there are reports to show */}
        {(loadingData || reports.length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
          <div className="px-6 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-[var(--text-primary)]">{t("your_reports")}</h2>
              <p className="text-sm text-gray-400 mt-0.5">{reports.length} report{reports.length !== 1 ? "s" : ""} uploaded</p>
            </div>
            <Link href="/timeline" className="text-sm font-medium text-[var(--primary)] hover:underline flex items-center gap-1">
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="p-6">
            {loadingData ? <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl skeleton" />)}</div>
              : (
                <div className="space-y-2">
                  {reports.slice(0, 5).map(r => (
                    <motion.div key={r.id} whileHover={{ x: 2 }}
                      className="flex items-center gap-3 border border-gray-100 rounded-xl p-3.5 hover:border-teal-200 hover:bg-teal-50/20 transition-all">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-100">
                        <FileText className="w-4 h-4 text-[var(--primary)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-[var(--text-primary)] truncate">
                          {r.file_name || `Report — ${formatDate(r.created_at)}`}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-400">{formatDate(r.created_at)}</span>
                          {r.report_type && r.report_type !== "Other" && (
                            <span className="text-[10px] font-semibold text-teal-600 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded-md">{r.report_type}</span>
                          )}
                          {r.retest_due && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                              <Bell className="w-2.5 h-2.5" /> Due for retest
                            </span>
                          )}
                        </div>
                      </div>
                      {r.risk_level && <RiskBadge level={r.risk_level} size="sm" />}
                      <button
                        onClick={() => setWaModal({ reportId: r.id })}
                        className="p-1.5 rounded-lg hover:bg-green-50 transition-all shrink-0"
                        style={{ color: "#25D366" }}
                        title="Send to WhatsApp"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
          </div>
        </div>
        )}

        {/* Feature 1: Health Score History Chart */}
        {scoreHistory.length >= 2 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
            <div className="px-6 pt-5 pb-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[var(--text-primary)]">Health Score History</h2>
                <p className="text-sm text-gray-400 mt-0.5">{scoreHistory.length} data points from approved reports</p>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-gray-400 font-semibold">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Low</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Medium</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> High</span>
              </div>
            </div>
            <div className="p-6">
              <HealthScoreChart data={scoreHistory} />
            </div>
          </motion.div>
        )}

        {/* Feature 3: Retest Reminders */}
        {(() => {
          const due = reports.filter(r => r.retest_due);
          if (due.length === 0) return null;
          return (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
              <div className="h-1 w-full" style={{ background: "linear-gradient(90deg,#D97706,#F59E0B)" }} />
              <div className="px-6 pt-5 pb-4 border-b border-amber-50 flex items-center gap-3">
                <Bell className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <h2 className="font-bold text-[var(--text-primary)]">Retest Reminders</h2>
                  <p className="text-sm text-amber-600 mt-0.5">{due.length} report{due.length > 1 ? "s" : ""} may be due for repeat testing</p>
                </div>
              </div>
              <div className="p-5 space-y-2">
                {due.map(r => (
                  <div key={r.id} className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                      <FlaskConical className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800 truncate">{r.file_name}</p>
                      <p className="text-xs text-amber-700">
                        Uploaded {r.days_since_upload}d ago · recommended every {r.recommended_retest_days}d
                      </p>
                    </div>
                    <Link href="/appointments" className="text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-all shrink-0">
                      Book Test
                    </Link>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })()}

        {/* Bottom 3 links */}
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: Brain, label: "Symptom Checker", href: "/symptoms", desc: "Describe your symptoms" },
            { icon: Salad, label: "Diet Planner",     href: "/diet",     desc: "Get meal recommendations" },
            { icon: Clock, label: "Health Timeline",  href: "/timeline", desc: "See your health history" },
          ].map(item => (
            <motion.div key={item.label} whileHover={{ y: -3 }}>
              <Link href={item.href} className="bg-white rounded-2xl border border-gray-100 p-4 hover:border-teal-200 hover:shadow-md transition-all flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-100">
                  <item.icon className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-gray-700 group-hover:text-[var(--primary)] transition-colors">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-[var(--primary)] transition-colors" />
              </Link>
            </motion.div>
          ))}
        </div>
      </main>

      {/* Feature 5: Second Opinion Modal */}
      <AnimatePresence>
        {secondOpinionModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={e => { if (e.target === e.currentTarget) setSecondOpinionModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}>
                    <RotateCcw className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">Second Opinion</h3>
                    <p className="text-xs text-gray-400">Two independent AI analyses + consensus</p>
                  </div>
                </div>
                <button onClick={() => setSecondOpinionModal(false)} className="text-gray-300 hover:text-gray-500 transition-colors p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                {secondOpinionLoading ? (
                  <div className="flex flex-col items-center py-12 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                    <p className="text-sm text-gray-500">Running two independent analyses…</p>
                  </div>
                ) : secondOpinionResult ? (
                  <div className="space-y-4">
                    {/* Consensus */}
                    <div className={`rounded-2xl p-4 border ${secondOpinionResult.consensus.agreement ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {secondOpinionResult.consensus.agreement
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                        <span className="font-bold text-sm">Consensus: {secondOpinionResult.consensus.risk_level} Risk · Score {secondOpinionResult.consensus.health_score}/100</span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">{secondOpinionResult.consensus.agreement_note}</p>
                    </div>

                    {/* Two opinions side by side */}
                    <div className="grid grid-cols-2 gap-3">
                      {([["Analysis A", secondOpinionResult.opinion_a, "#7C3AED"], ["Analysis B", secondOpinionResult.opinion_b, "#0F766E"]] as const).map(([label, op, color]) => (
                        <div key={label as string} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold" style={{ color: color as string }}>{label as string}</span>
                            <span className="text-[10px] font-semibold text-gray-500">{(op as typeof secondOpinionResult.opinion_a).health_score}/100</span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600">{(op as typeof secondOpinionResult.opinion_a).risk_level}</span>
                          <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">{(op as typeof secondOpinionResult.opinion_a).summary}</p>
                          {(op as typeof secondOpinionResult.opinion_a).key_findings?.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {(op as typeof secondOpinionResult.opinion_a).key_findings.slice(0, 2).map((f, i) => (
                                <li key={i} className="text-[11px] text-gray-600 flex items-start gap-1"><span className="text-teal-500 mt-0.5">•</span>{f}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => { setSecondOpinionResult(null); handleSecondOpinion(); }}
                      className="w-full border border-purple-200 text-purple-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-purple-50 transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Run Again
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-10 gap-3">
                    <AlertTriangle className="w-8 h-8 text-gray-200" />
                    <p className="text-sm text-gray-400">Could not load results. Please close and try again.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WhatsApp number modal */}
      <AnimatePresence>
        {waModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setWaModal(null); }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#25D366" }}>
                  <Send className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">Send to WhatsApp</h3>
                  <p className="text-xs text-gray-400">Receive your health summary on WhatsApp</p>
                </div>
                <button onClick={() => setWaModal(null)} className="ml-auto text-gray-300 hover:text-gray-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                WhatsApp Number (with country code)
              </label>
              <input
                type="tel"
                value={waPhone}
                onChange={e => setWaPhone(e.target.value)}
                placeholder="+919876543210"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 focus:border-green-400 transition-all"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                E.g. +91 for India · +1 for US · +44 for UK
              </p>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setWaModal(null)}
                  className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendWhatsApp}
                  disabled={waSending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                  style={{ background: "#25D366" }}
                >
                  {waSending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                    : <><Send className="w-4 h-4" /> Send</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
