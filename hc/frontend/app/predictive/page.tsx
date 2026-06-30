"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radar, TrendingUp, TrendingDown, Minus, ChevronDown,
  AlertTriangle, Loader2, RefreshCw, Lightbulb, ChevronRight,
} from "lucide-react";
import Cookies from "js-cookie";
import Navbar from "@/components/Navbar";
import { ToastContainer, useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { predictiveApi } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type Trajectory = "increasing" | "stable" | "decreasing";
type Probability = "High" | "Medium" | "Low";

interface PredictedCondition {
  condition: string;
  trajectory: Trajectory;
  probability: Probability;
  reasoning: string;
  contributing_parameters: string[];
}

interface RiskForecastResponse {
  predicted_conditions: PredictedCondition[];
  trend_summary: string;
  recommended_action: string;
  disclaimer: string;
  generated_at: string;
}

// ── Style config ──────────────────────────────────────────────────────────────

const TRAJECTORY_STYLE: Record<Trajectory, {
  icon: typeof TrendingUp;
  color: string;
  bg: string;
  border: string;
  badge: string;
  badgeCls: string;
}> = {
  increasing: {
    icon: TrendingUp,
    color: "text-red-500",
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "Risk increasing",
    badgeCls: "bg-red-100 text-red-600",
  },
  stable: {
    icon: Minus,
    color: "text-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "Stable",
    badgeCls: "bg-amber-100 text-amber-700",
  },
  decreasing: {
    icon: TrendingDown,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    badge: "Risk decreasing",
    badgeCls: "bg-emerald-100 text-emerald-700",
  },
};

const PROB_STYLE: Record<Probability, string> = {
  High: "bg-red-100 text-red-700 border-red-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
  Low: "bg-blue-100 text-blue-700 border-blue-200",
};

// ── Forecast card ─────────────────────────────────────────────────────────────

function ForecastCard({ item }: { item: PredictedCondition }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TRAJECTORY_STYLE[item.trajectory];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-2xl border ${cfg.bg} ${cfg.border} overflow-hidden`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-white`}>
              <Icon className={`w-5 h-5 ${cfg.color}`} />
            </div>
            <div>
              <p className="font-display font-semibold text-[var(--charcoal)]">{item.condition}</p>
              <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${cfg.badgeCls}`}>
                {cfg.badge}
              </span>
            </div>
          </div>
          <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${PROB_STYLE[item.probability]}`}>
            {item.probability}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.contributing_parameters.map((p) => (
            <span key={p} className="text-[11px] bg-white/70 text-[var(--charcoal)]/60 px-2 py-0.5 rounded-full border border-white">
              {p}
            </span>
          ))}
        </div>

        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3.5 pt-3 border-t border-white/60 w-full flex items-center justify-between text-xs font-medium text-[var(--charcoal)]/60 hover:text-[var(--charcoal)] transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" /> Why this prediction
          </span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="pt-3 text-sm text-[var(--charcoal)]/70 leading-relaxed">
                {item.reasoning}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PredictivePage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<RiskForecastResponse | null>(null);

  useEffect(() => {
    if (!Cookies.get("access_token")) router.push("/auth/login");
  }, [router]);

  async function fetchForecast(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const res = await predictiveApi.riskForecast();
      setData(res.data);
    } catch {
      setError("Could not load your risk forecast. Please try again.");
      if (isRefresh) toast("Failed to refresh forecast", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchForecast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasConditions = (data?.predicted_conditions.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <PageHeader
        title="Predictive Disease Risk"
        subtitle="AI forecast of how your key health markers may trend over the next 3–6 months"
        icon={<Radar className="w-5 h-5" />}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Loading ─────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-sm text-[var(--charcoal)]/50">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Analysing your report history…
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────── */}
        {!loading && error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
            <button onClick={() => fetchForecast()} className="ml-auto text-xs font-medium underline shrink-0">
              Retry
            </button>
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────── */}
        {!loading && !error && data && !hasConditions && (
          <div className="text-center py-24 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-[var(--sage)] flex items-center justify-center mx-auto">
              <Radar className="w-7 h-7 text-[var(--teal)]" />
            </div>
            <h2 className="font-display text-xl font-semibold text-[var(--charcoal)]">
              Not enough data yet
            </h2>
            <p className="text-sm text-[var(--charcoal)]/55 max-w-sm mx-auto">
              {data.trend_summary}
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 mt-2 bg-[var(--teal)] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[var(--teal-light)] transition-colors"
            >
              Upload a report <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* ── Main content ────────────────────────────────────────────── */}
        {!loading && !error && data && hasConditions && (
          <>
            {/* Trend summary banner */}
            <div className="bg-white rounded-2xl border border-[var(--sage)] p-5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[var(--sage)] flex items-center justify-center shrink-0">
                  <Radar className="w-4 h-4 text-[var(--teal)]" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-[var(--charcoal)] mb-1">Overview</p>
                  <p className="text-sm text-[var(--charcoal)]/65 leading-relaxed">{data.trend_summary}</p>
                </div>
              </div>
              <button
                onClick={() => fetchForecast(true)}
                disabled={refreshing}
                title="Refresh forecast"
                className="shrink-0 p-2 rounded-xl text-[var(--charcoal)]/40 hover:text-[var(--teal)] hover:bg-[var(--sage)]/40 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Forecast cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.predicted_conditions.map((item) => (
                <ForecastCard key={item.condition} item={item} />
              ))}
            </div>

            {/* Recommended action */}
            <div className="rounded-2xl border border-[var(--gold)]/30 bg-[var(--gold)]/10 p-5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0">
                <Lightbulb className="w-4 h-4 text-[var(--gold)]" />
              </div>
              <div>
                <p className="font-semibold text-sm text-[var(--charcoal)] mb-1">Recommended action</p>
                <p className="text-sm text-[var(--charcoal)]/65 leading-relaxed">{data.recommended_action}</p>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="flex items-start gap-2 text-xs text-[var(--charcoal)]/40 bg-white rounded-xl px-4 py-3.5 border border-[var(--sage)]">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {data.disclaimer}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
