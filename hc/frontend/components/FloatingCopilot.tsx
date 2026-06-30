"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  HelpCircle, X, Upload, MessageCircle, Pill,
  Calendar, Users, Download, ArrowRight,
  Send, Bot, Loader2,
} from "lucide-react";
import Cookies from "js-cookie";
import { aiApi } from "@/lib/api";

// ─── Guide steps (unchanged) ──────────────────────────────────────────────────

const STEPS = [
  {
    step: 1, emoji: "📄", title: "Upload Your Report",
    desc: "Go to Dashboard → Upload your lab report (PDF/Image) → Click Analyze",
    icon: Upload, color: "#0F766E", bg: "#F0FDF9", border: "#99F6E4", href: "/dashboard",
  },
  {
    step: 2, emoji: "💬", title: "Chat with AI",
    desc: "Go to Chat → Ask questions about your report in Hindi or English",
    icon: MessageCircle, color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", href: "/chat",
  },
  {
    step: 3, emoji: "💊", title: "Check Medicine Interactions",
    desc: "Go to Med Checker → Enter medicine names → Check for interactions",
    icon: Pill, color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE", href: "/medicine-checker",
  },
  {
    step: 4, emoji: "📅", title: "Book a Doctor Appointment",
    desc: "Go to Appointments → Find doctors → Book video or in-person visit",
    icon: Calendar, color: "#059669", bg: "#ECFDF5", border: "#A7F3D0", href: "/appointments",
  },
  {
    step: 5, emoji: "👨‍👩‍👧", title: "Track Family Health",
    desc: "Go to Family → Add family members → Track everyone's health",
    icon: Users, color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", href: "/family",
  },
  {
    step: 6, emoji: "📥", title: "Download PDF Summary",
    desc: "After analysis → Click Download PDF → Share with your doctor",
    icon: Download, color: "#DB2777", bg: "#FDF2F8", border: "#FBCFE8", href: "/dashboard",
  },
] as const;

// ─── Chat types and constants ─────────────────────────────────────────────────

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const INITIAL_MSG: ChatMsg = {
  role: "assistant",
  content:
    "Hi! I'm Sahaay. I can answer questions about your health reports, symptoms, or medicines. What would you like to know?",
};

const QUICK_CHIPS = [
  "What does low Vitamin D mean?",
  "Explain my TSH result",
  "What foods increase hemoglobin?",
  "Is my HbA1c dangerous?",
];

// Passed as report_text when no specific report is loaded so the AI can answer
// general health education questions without being blocked by the "only answer
// from report data" rule in the system prompt.
const GENERAL_CONTEXT =
  "General health Q&A session — no specific lab report uploaded. " +
  "Answer general health education questions about lab parameters, symptoms, nutrition, and medicines.";

// ─── Component ────────────────────────────────────────────────────────────────

export default function FloatingCopilot() {
  const pathname = usePathname();
  const router = useRouter();

  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "guide">("chat");

  // Chat state
  const [messages, setMessages] = useState<ChatMsg[]>([INITIAL_MSG]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const isHospital = pathname.startsWith("/hospital");
    const isAuth = pathname.startsWith("/auth");
    const isWidget = pathname.startsWith("/widget");
    const hasToken = !!Cookies.get("access_token");
    setVisible(hasToken && !isHospital && !isAuth && !isWidget);
  }, [pathname]);

  // Scroll chat to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when the panel opens in chat mode
  useEffect(() => {
    if (open && mode === "chat") {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open, mode]);

  const handleStepClick = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setInput("");
      const userMsg: ChatMsg = { role: "user", content: trimmed };

      // Optimistically add the user message
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        // Send the last 4 messages (before this new one) as context history
        const history = messages.slice(-4).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await aiApi.chat({
          report_text: GENERAL_CONTEXT,
          message: trimmed,
          history,
          patient_name: "Patient",
          language: "en",
        });

        const reply: string =
          res.data?.reply ||
          "I'm having trouble connecting right now. Please try again in a moment.";

        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Something went wrong. Please check your connection and try again.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading],
  );

  if (!visible) return null;

  const hasUserMessages = messages.some((m) => m.role === "user");

  return (
    <>
      {/* ── Floating button ─────────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        <AnimatePresence>
          {!open && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="text-[11px] text-white font-semibold px-3 py-1.5 rounded-full shadow-lg select-none whitespace-nowrap"
              style={{ background: "var(--gradient-hero)" }}
            >
              {mode === "chat" ? "Ask Sahaay AI" : "How to use Sahaay?"}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setOpen((o) => !o)}
          title="Sahaay Copilot"
          className="relative w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center text-white"
          style={{ background: "var(--gradient-hero)" }}
        >
          <span
            className="absolute inset-0 rounded-2xl animate-ping opacity-20 pointer-events-none"
            style={{ background: "var(--gradient-hero)" }}
          />
          <AnimatePresence mode="wait">
            {open ? (
              <motion.span
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <X className="w-6 h-6" />
              </motion.span>
            ) : (
              <motion.span
                key="icon"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {mode === "chat" ? (
                  <Bot className="w-6 h-6" />
                ) : (
                  <HelpCircle className="w-6 h-6" />
                )}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* ── Panel ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
            style={{ maxHeight: 560 }}
          >
            {mode === "chat" ? (
              // ── CHAT MODE ──────────────────────────────────────────────
              <>
                {/* Header */}
                <div
                  className="px-4 py-3.5 shrink-0"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="font-extrabold text-white text-sm leading-tight">
                          Sahaay Copilot
                        </p>
                        <p className="text-white/70 text-[11px]">
                          AI Health Assistant · Online
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setOpen(false)}
                      className="text-white/60 hover:text-white transition-colors shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Messages */}
                <div
                  className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
                  style={{ minHeight: 0 }}
                >
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex items-end gap-2 ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {msg.role === "assistant" && (
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center shrink-0 mb-0.5">
                          <Bot className="w-3 h-3 text-white" />
                        </div>
                      )}
                      <div
                        className={`max-w-[78%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${
                          msg.role === "user"
                            ? "text-white rounded-br-sm"
                            : "bg-gray-100 text-gray-800 rounded-bl-sm"
                        }`}
                        style={
                          msg.role === "user"
                            ? { background: "var(--gradient-hero)" }
                            : undefined
                        }
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {loading && (
                    <div className="flex items-end gap-2 justify-start">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center shrink-0 mb-0.5">
                        <Bot className="w-3 h-3 text-white" />
                      </div>
                      <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1">
                        {[0, 150, 300].map((delay) => (
                          <span
                            key={delay}
                            className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                            style={{ animationDelay: `${delay}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Quick chips — shown only before the first user message */}
                {!hasUserMessages && (
                  <div className="px-3 pb-2 shrink-0">
                    <p className="text-[10px] text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">
                      Quick questions
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_CHIPS.map((chip) => (
                        <button
                          key={chip}
                          onClick={() => sendMessage(chip)}
                          disabled={loading}
                          className="text-[11px] px-2.5 py-1 rounded-full border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 disabled:opacity-50 transition-colors font-medium"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input */}
                <div className="px-3 pb-3 pt-2 shrink-0 border-t border-gray-100">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendMessage(input);
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask about your health..."
                      disabled={loading}
                      className="flex-1 text-[12px] px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent disabled:opacity-50 transition-all"
                    />
                    <button
                      type="submit"
                      disabled={!input.trim() || loading}
                      className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-40 transition-opacity shrink-0"
                      style={{ background: "var(--gradient-hero)" }}
                    >
                      {loading ? (
                        <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5 text-white" />
                      )}
                    </button>
                  </form>
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-gray-100 shrink-0 bg-gray-50/60 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setMode("guide")}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-teal-600 transition-colors"
                  >
                    <HelpCircle className="w-3 h-3" />
                    How to use Sahaay?
                  </button>
                  <p className="text-[10px] text-gray-400 shrink-0">
                    Powered by Gemini AI
                  </p>
                </div>
              </>
            ) : (
              // ── GUIDE MODE ─────────────────────────────────────────────
              <>
                {/* Header */}
                <div
                  className="px-5 py-4 shrink-0"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-extrabold text-white text-base leading-tight">
                        How to use Sahaay? 🏥
                      </p>
                      <p className="text-white/70 text-xs mt-0.5">
                        Your AI Healthcare Copilot
                      </p>
                    </div>
                    <button
                      onClick={() => setOpen(false)}
                      className="text-white/60 hover:text-white transition-colors mt-0.5 shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Steps */}
                <div
                  className="overflow-y-auto flex-1 px-3 py-3 space-y-2"
                  style={{ minHeight: 0 }}
                >
                  {STEPS.map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <motion.button
                        key={s.step}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        whileHover={{
                          y: -2,
                          boxShadow: "0 6px 20px rgba(0,0,0,0.10)",
                        }}
                        onClick={() => handleStepClick(s.href)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border"
                        style={{ background: s.bg, borderColor: s.border }}
                      >
                        <div className="shrink-0 flex flex-col items-center gap-1">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: s.color }}
                          >
                            <Icon className="w-4 h-4 text-white" />
                          </div>
                          <span
                            className="text-[9px] font-bold"
                            style={{ color: s.color }}
                          >
                            STEP {s.step}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-800 leading-snug">
                            {s.emoji} {s.title}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                            {s.desc}
                          </p>
                        </div>
                        <ArrowRight
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: s.color }}
                        />
                      </motion.button>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-gray-100 shrink-0 bg-gray-50/60 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setMode("chat")}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] hover:underline transition-all"
                  >
                    <Bot className="w-3 h-3" />
                    Chat with Sahaay AI
                    <ArrowRight className="w-3 h-3" />
                  </button>
                  <p className="text-[10px] text-gray-400 shrink-0">
                    Powered by Gemini AI
                  </p>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
