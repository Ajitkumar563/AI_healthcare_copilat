"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  HelpCircle, X, Upload, MessageCircle, Pill,
  Calendar, Users, Download, ArrowRight,
} from "lucide-react";
import Cookies from "js-cookie";

const STEPS = [
  {
    step: 1,
    emoji: "📄",
    title: "Upload Your Report",
    desc: "Go to Dashboard → Upload your lab report (PDF/Image) → Click Analyze",
    icon: Upload,
    color: "#0F766E",
    bg: "#F0FDF9",
    border: "#99F6E4",
    href: "/dashboard",
  },
  {
    step: 2,
    emoji: "💬",
    title: "Chat with AI",
    desc: "Go to Chat → Ask questions about your report in Hindi or English",
    icon: MessageCircle,
    color: "#2563EB",
    bg: "#EFF6FF",
    border: "#BFDBFE",
    href: "/chat",
  },
  {
    step: 3,
    emoji: "💊",
    title: "Check Medicine Interactions",
    desc: "Go to Med Checker → Enter medicine names → Check for interactions",
    icon: Pill,
    color: "#7C3AED",
    bg: "#F5F3FF",
    border: "#DDD6FE",
    href: "/medicine-checker",
  },
  {
    step: 4,
    emoji: "📅",
    title: "Book a Doctor Appointment",
    desc: "Go to Appointments → Find doctors → Book video or in-person visit",
    icon: Calendar,
    color: "#059669",
    bg: "#ECFDF5",
    border: "#A7F3D0",
    href: "/appointments",
  },
  {
    step: 5,
    emoji: "👨‍👩‍👧",
    title: "Track Family Health",
    desc: "Go to Family → Add family members → Track everyone's health",
    icon: Users,
    color: "#D97706",
    bg: "#FFFBEB",
    border: "#FDE68A",
    href: "/family",
  },
  {
    step: 6,
    emoji: "📥",
    title: "Download PDF Summary",
    desc: "After analysis → Click Download PDF → Share with your doctor",
    icon: Download,
    color: "#DB2777",
    bg: "#FDF2F8",
    border: "#FBCFE8",
    href: "/dashboard",
  },
] as const;

export default function FloatingCopilot() {
  const pathname = usePathname();
  const router = useRouter();

  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const isHospital = pathname.startsWith("/hospital");
    const isAuth = pathname.startsWith("/auth");
    const isWidget = pathname.startsWith("/widget");
    const hasToken = !!Cookies.get("access_token");
    setVisible(hasToken && !isHospital && !isAuth && !isWidget);
  }, [pathname]);

  const handleStepClick = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  if (!visible) return null;

  return (
    <>
      {/* Floating button */}
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
              How to use Sahaay?
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setOpen((o) => !o)}
          title="How to use Sahaay?"
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
                key="help"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <HelpCircle className="w-6 h-6" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Guide panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
            style={{ maxHeight: 540 }}
          >
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
                  <p className="text-white/70 text-xs mt-0.5">Your AI Healthcare Copilot</p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-white/60 hover:text-white transition-colors mt-0.5 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Steps list */}
            <div className="overflow-y-auto flex-1 px-3 py-3 space-y-2" style={{ minHeight: 0 }}>
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.button
                    key={s.step}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ y: -2, boxShadow: "0 6px 20px rgba(0,0,0,0.10)" }}
                    onClick={() => handleStepClick(s.href)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border"
                    style={{ background: s.bg, borderColor: s.border }}
                  >
                    {/* Step number + icon */}
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

                    {/* Text */}
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
                onClick={() => handleStepClick("/chat")}
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] hover:underline transition-all"
              >
                Need help? Chat with AI
                <ArrowRight className="w-3 h-3" />
              </button>
              <p className="text-[10px] text-gray-400 shrink-0">Powered by Gemini AI</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
