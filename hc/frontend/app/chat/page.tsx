"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Loader2, Bot, User, ChevronDown, MessageCircle,
  FileText, RotateCcw, Upload, AlertCircle,
  Mic, MicOff, Volume2, VolumeX,
} from "lucide-react";
import Cookies from "js-cookie";
import Navbar from "@/components/Navbar";
import { ToastContainer, useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { reportsApi, aiApi } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Report { id: string; report_type: string; file_name: string; created_at: string; raw_text?: string; }
interface Message { role: "user" | "assistant"; content: string; timestamp: Date; }
interface ApiError { response?: { status?: number; data?: { message?: string; detail?: string } } }

type VoiceState = "idle" | "listening" | "processing" | "speaking";

import { VOICE_LANG_MAP } from "@/hooks/useVoice";

function getVoiceLang(lang: string): string {
  return VOICE_LANG_MAP[lang] ?? "en-IN";
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function classifyError(err: ApiError): string {
  const status = err.response?.status;
  const msg = (err.response?.data?.message || err.response?.data?.detail || "").toLowerCase();
  if (status === 400) return "Please select a report first before sending a message.";
  if (status === 401) return "Session expired. Please log in again.";
  if (msg.includes("credit") || msg.includes("unavailable") || msg.includes("billing") || status === 402)
    return "AI service is temporarily unavailable due to credit limits. Non-AI features still work.";
  return "Something went wrong. Please try again.";
}

export default function ChatPage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();
  const { t, language } = useLanguage();

  const SUGGESTIONS = [
    t("suggestion_1"), t("suggestion_2"), t("suggestion_3"),
    t("suggestion_4"), t("suggestion_5"),
  ];

  // ── Core state ──
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingReports, setLoadingReports] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);

  // ── Voice state ──
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [speakingMsgIdx, setSpeakingMsgIdx] = useState<number | null>(null);

  // ── Refs ──
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Stable refs to avoid stale closures in async callbacks
  const messagesRef = useRef<Message[]>([]);
  const selectedReportRef = useRef<Report | null>(null);
  const autoSpeakRef = useRef(true);
  const voiceStateRef = useRef<VoiceState>("idle");
  const loadingRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { selectedReportRef.current = selectedReport; }, [selectedReport]);
  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);

  // ── Init: check voice support, load localStorage preference ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported =
      "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
    setVoiceSupported(supported);
    const stored = localStorage.getItem("sahaay_autospeak");
    const val = stored !== null ? stored === "true" : true;
    setAutoSpeak(val);
    autoSpeakRef.current = val;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("sahaay_autospeak", String(autoSpeak));
    autoSpeakRef.current = autoSpeak;
  }, [autoSpeak]);

  // ── Load reports ──
  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) { router.push("/auth/login"); return; }
    const fetchReports = async () => {
      setLoadingReports(true);
      try {
        const res = await reportsApi.list();
        const reps: Report[] = res.data;
        setReports(reps);
        if (reps.length > 0) setSelectedReport(reps[0]);
      } catch { toast("Could not load reports.", "error"); }
      finally { setLoadingReports(false); }
    };
    fetchReports();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  // ── TTS helpers ──
  const speakText = (text: string, msgIdx?: number) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (msgIdx !== undefined) setSpeakingMsgIdx(msgIdx);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getVoiceLang(language);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.onend = () => { setVoiceState("idle"); setSpeakingMsgIdx(null); };
    utterance.onerror = () => { setVoiceState("idle"); setSpeakingMsgIdx(null); };
    setVoiceState("speaking");
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setVoiceState("idle");
    setSpeakingMsgIdx(null);
  };

  // ── Send message ──
  const canSend = !!selectedReport && !loading;

  const handleSend = async (question?: string, fromVoice = false) => {
    const q = (question !== undefined ? question : input).trim();
    if (!q) return;
    if (loadingRef.current) return;
    const rep = selectedReportRef.current;
    if (!rep) return;

    if (fromVoice) setVoiceState("processing");
    setInput("");
    const userMsg: Message = { role: "user", content: q, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    loadingRef.current = true;
    setLoading(true);

    try {
      const history = messagesRef.current.map(m => ({ role: m.role, content: m.content }));
      const reportContext = rep.raw_text
        || `Report: ${rep.report_type || rep.file_name || "health report"}`;

      const res = await aiApi.chat({
        message: q,
        report_text: reportContext,
        history,
        patient_name: Cookies.get("user_name") || "Patient",
        language,
      });

      const reply = res.data?.reply || res.data?.answer;
      if (reply) {
        const newMsg: Message = { role: "assistant", content: reply, timestamp: new Date() };
        setMessages(prev => {
          const updated = [...prev, newMsg];
          if (autoSpeakRef.current) {
            const idx = updated.length - 1;
            setTimeout(() => speakText(reply, idx), 100);
          } else {
            setVoiceState("idle");
          }
          return updated;
        });
      }
    } catch (err) {
      const errMsg = classifyError(err as ApiError);
      setMessages(prev => {
        const updated = [...prev, { role: "assistant" as const, content: errMsg, timestamp: new Date() }];
        if (autoSpeakRef.current) {
          const idx = updated.length - 1;
          setTimeout(() => speakText(errMsg, idx), 100);
        } else {
          setVoiceState("idle");
        }
        return updated;
      });
    } finally {
      loadingRef.current = false;
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  // ── Speech recognition ──
  const startListening = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    window.speechSynthesis?.cancel();
    setSpeakingMsgIdx(null);

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = getVoiceLang(language);
    recognitionRef.current = recognition;

    recognition.onstart = () => setVoiceState("listening");

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join("");
      setInput(transcript);
      if (event.results[event.results.length - 1].isFinal) {
        recognition.stop();
        handleSend(transcript, true);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setVoiceState("idle");
      if (event.error === "not-allowed") {
        toast(
          "Microphone access denied. Please allow microphone in browser settings.",
          "error"
        );
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (voiceStateRef.current === "listening") setVoiceState("idle");
    };

    try { recognition.start(); }
    catch { setVoiceState("idle"); }
  };

  const handleMicClick = () => {
    if (voiceState === "speaking") { stopSpeaking(); return; }
    if (voiceState === "listening") { recognitionRef.current?.stop(); setVoiceState("idle"); return; }
    if (voiceState === "processing") return;
    startListening();
  };

  const handleSpeakMessage = (text: string, idx: number) => {
    if (speakingMsgIdx === idx) { stopSpeaking(); return; }
    speakText(text, idx);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Derived display values ──
  const reportLabel = loadingReports
    ? "Loading reports…"
    : selectedReport
      ? (selectedReport.file_name || `Report — ${new Date(selectedReport.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`)
      : reports.length > 0 ? "No report selected" : "No reports uploaded yet";

  const micIcon =
    voiceState === "listening" ? <MicOff className="w-4 h-4" /> :
    voiceState === "speaking"  ? <Volume2 className="w-4 h-4" /> :
    voiceState === "processing"? <Loader2 className="w-4 h-4 animate-spin" /> :
    <Mic className="w-4 h-4" />;

  const micCls =
    voiceState === "listening"  ? "bg-red-500 text-white hover:bg-red-600" :
    voiceState === "speaking"   ? "bg-teal-50 text-teal-600 border border-teal-200 hover:bg-teal-100" :
    voiceState === "processing" ? "bg-gray-100 text-gray-400 opacity-50 cursor-not-allowed" :
    "bg-gray-100 text-gray-600 hover:bg-gray-200";

  return (
    <div className="min-h-screen bg-[var(--gray-50)] flex flex-col">
      <Navbar />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <PageHeader title={t("chat_title")} subtitle={t("chat_subtitle")}
        icon={<MessageCircle className="w-5 h-5" />} />

      <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 pb-4 flex flex-col flex-1"
        style={{ minHeight: "calc(100vh - 200px)" }}>

        {/* ── Report selector bar ── */}
        <div className={`bg-white rounded-2xl border shadow-[var(--shadow-sm)] p-4 mb-4 transition-colors ${
          !selectedReport && !loadingReports && reports.length > 0
            ? "border-amber-300 bg-amber-50/30" : "border-gray-100"
        }`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                selectedReport ? "" : "bg-gray-100"
              }`} style={selectedReport ? { background: "var(--gradient-hero)" } : {}}>
                <FileText className={`w-5 h-5 ${selectedReport ? "text-white" : "text-gray-400"}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-0.5">
                  Active Report
                </p>
                <p className={`font-semibold text-sm truncate ${
                  selectedReport ? "text-[var(--text-primary)]" : "text-amber-600"
                }`}>
                  {reportLabel}
                </p>
              </div>
            </div>

            {!loadingReports && reports.length > 0 && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                    !selectedReport
                      ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      : "border-gray-200 text-gray-600 hover:border-teal-300 hover:bg-teal-50/40"
                  }`}>
                  {selectedReport ? t("change_report") : t("select_report")}
                  <ChevronDown className={`w-4 h-4 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {showDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                        className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-md)] z-20 overflow-hidden">
                        <div className="p-2 space-y-0.5 max-h-64 overflow-y-auto">
                          {reports.map(r => (
                            <button key={r.id}
                              onClick={() => { setSelectedReport(r); setShowDropdown(false); }}
                              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-2 ${
                                selectedReport?.id === r.id ? "text-white font-semibold" : "hover:bg-gray-50 text-gray-700"
                              }`}
                              style={selectedReport?.id === r.id ? { background: "var(--gradient-hero)" } : {}}>
                              <FileText className="w-4 h-4 shrink-0" />
                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  {r.file_name || `Report — ${new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
                                </p>
                                <p className={`text-xs ${selectedReport?.id === r.id ? "text-white/70" : "text-gray-400"}`}>
                                  {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                  {r.report_type && r.report_type !== "Other" ? ` · ${r.report_type}` : ""}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* ── Messages pane ── */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden flex flex-col"
          style={{ minHeight: 400 }}>
          <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />

          {/* Pane header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Conversation</p>
            <div className="flex items-center gap-2">
              {/* Auto-speak toggle — only on supported browsers */}
              {voiceSupported && (
                <button
                  onClick={() => setAutoSpeak(v => !v)}
                  title={autoSpeak ? "Auto-speak ON — click to turn off" : "Auto-speak OFF — click to turn on"}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-all ${
                    autoSpeak
                      ? "bg-teal-50 border-teal-200 text-teal-700"
                      : "bg-gray-50 border-gray-200 text-gray-400"
                  }`}>
                  {autoSpeak ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                  <span className="hidden sm:inline">Auto-speak</span>
                </button>
              )}
              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); stopSpeaking(); }}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[var(--primary)] transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>
          </div>

          {/* ── Message list / empty states ── */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {loadingReports ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-8 h-8 text-gray-300 animate-spin" />
                <p className="text-sm text-gray-400">Loading your reports…</p>
              </div>

            ) : reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center px-4">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4 border border-gray-100">
                  <Upload className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="font-bold text-[var(--text-primary)] mb-1">No reports uploaded yet</h3>
                <p className="text-sm text-gray-400 max-w-xs mb-5">
                  Upload a lab report first so the AI can answer questions about your health data.
                </p>
                <Link href="/dashboard"
                  className="gradient-btn px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Go to Dashboard to upload
                </Link>
              </div>

            ) : !selectedReport ? (
              <div className="flex flex-col items-center justify-center py-14 text-center px-4">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8 text-amber-400" />
                </div>
                <h3 className="font-bold text-[var(--text-primary)] mb-1">{t("no_report_selected")}</h3>
                <p className="text-sm text-gray-400 max-w-xs mb-5">
                  Choose one of your uploaded reports from the dropdown above so the AI can answer questions about it.
                </p>
                <button
                  onClick={() => setShowDropdown(true)}
                  className="gradient-btn px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Select a report
                </button>
              </div>

            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: "var(--gradient-hero)" }}>
                  <Bot className="w-8 h-8 text-white" />
                </div>
                <h3 className="font-bold text-[var(--text-primary)] mb-1">AI Health Assistant</h3>
                <p className="text-sm text-gray-400 max-w-xs mb-2">
                  Ask me anything about your{" "}
                  <span className="font-semibold text-[var(--primary)]">
                    {selectedReport.report_type || selectedReport.file_name}
                  </span>.
                </p>
                {voiceSupported && (
                  <p className="text-xs text-teal-600 mb-5 flex items-center justify-center gap-1.5">
                    <Mic className="w-3.5 h-3.5" /> Tap the mic to speak your question
                  </p>
                )}
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => handleSend(s)}
                      className="text-xs bg-gray-50 border border-gray-200 hover:border-teal-300 hover:bg-teal-50 text-gray-600 hover:text-[var(--primary)] px-3 py-2 rounded-full transition-all text-left">
                      {s}
                    </button>
                  ))}
                </div>
              </div>

            ) : (
              <>
                {messages.map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 relative ${
                      msg.role === "user" ? "bg-gray-100" : ""
                    }`} style={msg.role === "assistant" ? { background: "var(--gradient-hero)" } : {}}>
                      {msg.role === "assistant"
                        ? <Bot className="w-4 h-4 text-white" />
                        : <User className="w-4 h-4 text-gray-600" />}
                      {/* Pulsing ring on the AI avatar while that message is being spoken */}
                      {msg.role === "assistant" && speakingMsgIdx === i && (
                        <span className="absolute inset-0 rounded-xl animate-ping opacity-40"
                          style={{ background: "var(--gradient-hero)" }} />
                      )}
                    </div>

                    {/* Bubble + meta row */}
                    <div className={`max-w-[80%] flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                      <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "text-white rounded-tr-sm"
                          : "bg-gray-50 text-[var(--text-primary)] border border-gray-100 rounded-tl-sm"
                      }`} style={msg.role === "user" ? { background: "var(--gradient-hero)" } : {}}>
                        {msg.content}
                      </div>
                      <div className={`flex items-center gap-2 px-1 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                        <span className="text-[10px] text-gray-400">{formatTime(msg.timestamp)}</span>
                        {/* Per-message speaker button on AI bubbles */}
                        {msg.role === "assistant" && voiceSupported && (
                          <button
                            onClick={() => handleSpeakMessage(msg.content, i)}
                            title={speakingMsgIdx === i ? "Stop speaking" : "Read aloud"}
                            className={`p-1 rounded-full transition-all ${
                              speakingMsgIdx === i
                                ? "text-teal-600 bg-teal-50"
                                : "text-gray-300 hover:text-teal-500 hover:bg-teal-50"
                            }`}>
                            <Volume2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}

                {/* Typing indicator */}
                {loading && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "var(--gradient-hero)" }}>
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-2">
                      {[0, 1, 2].map(i => (
                        <motion.span key={i} className="w-2 h-2 rounded-full bg-gray-300"
                          animate={{ y: [0, -5, 0] }}
                          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
                      ))}
                      <span className="text-xs text-gray-400 ml-1">Sahaay AI is thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* ── Input area ── */}
          <div className="border-t border-gray-100 p-4">
            {/* Listening indicator */}
            {voiceState === "listening" && (
              <div className="flex items-center gap-2 mb-3 text-xs text-red-500 font-medium">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-ping shrink-0" />
                Listening… speak your question
              </div>
            )}

            {/* Quick suggestion chips */}
            {selectedReport && messages.length > 0 && messages.length < 4 && voiceState === "idle" && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                {SUGGESTIONS.slice(0, 3).map(s => (
                  <button key={s} onClick={() => handleSend(s)} disabled={!canSend}
                    className="text-xs bg-gray-50 border border-gray-200 hover:border-teal-300 hover:bg-teal-50 text-gray-500 hover:text-[var(--primary)] px-3 py-1.5 rounded-full transition-all whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!selectedReport || voiceState === "listening"}
                placeholder={
                  voiceState === "listening" ? "Listening…" :
                  !selectedReport
                    ? reports.length === 0 ? "Upload a report first…" : t("no_report_selected")
                    : t("chat_placeholder")
                }
                rows={1}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/10 text-sm transition-all resize-none disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                style={{ minHeight: 46, maxHeight: 120 }}
                suppressHydrationWarning
                onInput={e => {
                  const ta = e.currentTarget;
                  ta.style.height = "auto";
                  ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
                }}
              />

              {/* Mic button — hidden on unsupported browsers */}
              {voiceSupported && (
                <motion.button
                  whileTap={voiceState !== "processing" ? { scale: 0.9 } : {}}
                  onClick={handleMicClick}
                  disabled={voiceState === "processing"}
                  title={
                    voiceState === "listening"  ? "Stop listening" :
                    voiceState === "speaking"   ? "Stop speaking" :
                    voiceState === "processing" ? "Processing…" :
                    "Speak your question"
                  }
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all ${micCls}`}>
                  {micIcon}
                </motion.button>
              )}

              {/* Send button */}
              <motion.button
                whileTap={canSend && !!input.trim() ? { scale: 0.95 } : {}}
                onClick={() => handleSend()}
                disabled={!input.trim() || !canSend}
                className="gradient-btn w-11 h-11 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </motion.button>
            </div>

            <p className="text-[10px] text-gray-400 mt-2 text-center">
              AI responses are informational only. Always consult a doctor.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
