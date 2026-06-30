"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  BarChart3,
} from "lucide-react";
import Cookies from "js-cookie";
import { reportsApi } from "@/lib/api";
import type { TrendPoint } from "./_ParameterChart";

// ── SSR-safe chart (recharts uses browser APIs at import time) ─────────────────
const ParameterChart = dynamic(() => import("./_ParameterChart"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[300px] text-sm text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading chart…
    </div>
  ),
});

// ── Parameter catalogue ────────────────────────────────────────────────────────
// normalMin / normalMax are used for the trend-direction summary card only;
// the chart reads these values from the backend data points themselves.
interface ParamMeta {
  label:     string;
  unit:      string;
  normalMin: number | null;
  normalMax: number | null;
  description: string;
}

const PARAMS: ParamMeta[] = [
  { label: "Hemoglobin",      unit: "g/dL",   normalMin: 12,    normalMax: 17,    description: "Oxygen-carrying protein in red blood cells" },
  { label: "Vitamin D",       unit: "ng/mL",  normalMin: 30,    normalMax: 100,   description: "Fat-soluble vitamin essential for bone health" },
  { label: "TSH",             unit: "mIU/L",  normalMin: 0.34,  normalMax: 5.6,   description: "Thyroid-stimulating hormone" },
  { label: "HbA1c",           unit: "%",      normalMin: null,  normalMax: 5.7,   description: "3-month average blood glucose indicator" },
  { label: "Fasting Glucose", unit: "mg/dL",  normalMin: 70,    normalMax: 99,    description: "Blood sugar level after 8-hour fast" },
  { label: "Vitamin B12",     unit: "pg/mL",  normalMin: 200,   normalMax: 914,   description: "Essential vitamin for nerves and red blood cells" },
  { label: "Triglycerides",   unit: "mg/dL",  normalMin: null,  normalMax: 150,   description: "Type of fat found in the blood" },
  { label: "SGPT",            unit: "U/L",    normalMin: null,  normalMax: 40,    description: "Liver enzyme (alanine aminotransferase)" },
  { label: "SGOT",            unit: "U/L",    normalMin: null,  normalMax: 40,    description: "Liver enzyme (aspartate aminotransferase)" },
  { label: "Creatinine",      unit: "mg/dL",  normalMin: 0.6,   normalMax: 1.2,   description: "Kidney waste-filtration marker" },
  { label: "Cholesterol",     unit: "mg/dL",  normalMin: null,  normalMax: 200,   description: "Total blood cholesterol" },
];

const PARAM_MAP = Object.fromEntries(PARAMS.map(p => [p.label, p]));

// ── Trend analysis ─────────────────────────────────────────────────────────────
type Direction = "improving" | "worsening" | "stable";

interface TrendSummary {
  direction:    Direction;
  changePct:    number;
  latestValue:  number;
  latestInRange: boolean;
  firstInRange: boolean;
  count:        number;
  unit:         string;
}

function isInRange(v: number, min: number | null, max: number | null) {
  if (min !== null && v < min) return false;
  if (max !== null && v > max) return false;
  return true;
}

function analyzeTrend(
  points: TrendPoint[],
  meta:   ParamMeta,
): TrendSummary | null {
  if (points.length < 2) return null;

  const first   = points[0].value;
  const latest  = points[points.length - 1].value;
  const changePct = first !== 0
    ? Math.round(Math.abs((latest - first) / first) * 100)
    : 0;

  const firstInRange  = isInRange(first,  meta.normalMin, meta.normalMax);
  const latestInRange = isInRange(latest, meta.normalMin, meta.normalMax);

  let direction: Direction;

  if (changePct < 3) {
    direction = "stable";
  } else if (!firstInRange && latestInRange) {
    direction = "improving";
  } else if (firstInRange && !latestInRange) {
    direction = "worsening";
  } else if (latestInRange) {
    direction = "stable";              // both in range — fine
  } else {
    // Both outside range — is the value moving toward normal?
    const { normalMin, normalMax } = meta;
    if (normalMax !== null && normalMin === null) {
      direction = latest < first ? "improving" : "worsening";
    } else if (normalMin !== null && normalMax === null) {
      direction = latest > first ? "improving" : "worsening";
    } else if (normalMin !== null && normalMax !== null) {
      const mid = (normalMin + normalMax) / 2;
      direction = Math.abs(latest - mid) < Math.abs(first - mid)
        ? "improving"
        : "worsening";
    } else {
      direction = "stable";
    }
  }

  return {
    direction,
    changePct,
    latestValue:  latest,
    latestInRange,
    firstInRange,
    count:        points.length,
    unit:         points[0]?.unit ?? meta.unit,
  };
}

// ── Summary card ───────────────────────────────────────────────────────────────
function SummaryCard({
  summary,
  paramLabel,
}: {
  summary:    TrendSummary;
  paramLabel: string;
}) {
  const { direction, changePct, latestValue, latestInRange, count, unit } = summary;

  const dirConfig = {
    improving: {
      icon:    TrendingUp,
      color:   "text-emerald-600",
      bg:      "bg-emerald-50",
      border:  "border-emerald-200",
      badge:   "Improving",
      badgeCls:"bg-emerald-100 text-emerald-700",
    },
    worsening: {
      icon:    TrendingDown,
      color:   "text-red-500",
      bg:      "bg-red-50",
      border:  "border-red-200",
      badge:   "Needs attention",
      badgeCls:"bg-red-100 text-red-600",
    },
    stable: {
      icon:    Minus,
      color:   "text-amber-500",
      bg:      "bg-amber-50",
      border:  "border-amber-200",
      badge:   "Stable",
      badgeCls:"bg-amber-100 text-amber-700",
    },
  } as const;

  const cfg  = dirConfig[direction];
  const Icon = cfg.icon;

  const rangeLabel = latestInRange
    ? "Currently within normal range"
    : "Currently outside normal range";

  const narrative = (() => {
    const sign  = latestValue > 0 ? "" : "-";
    const delta = `${changePct}%`;

    if (direction === "improving" && changePct > 0) {
      return `${paramLabel} changed by ${delta} over ${count} report${count !== 1 ? "s" : ""} and is now within the normal range.`;
    }
    if (direction === "worsening") {
      return `${paramLabel} moved outside the normal range over ${count} report${count !== 1 ? "s" : ""}. Consider consulting your doctor.`;
    }
    return `${paramLabel} has remained ${latestInRange ? "within" : "outside"} the normal range over ${count} report${count !== 1 ? "s" : ""}.`;
  })();

  return (
    <div className={`rounded-2xl border p-5 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
            <Icon className={`w-5 h-5 ${cfg.color}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className={`font-semibold text-sm ${cfg.color}`}>Trend Analysis</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${cfg.badgeCls}`}>
                {cfg.badge}
              </span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{narrative}</p>
          </div>
        </div>

        {/* Latest value callout */}
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-gray-800 tabular-nums leading-tight">
            {latestValue}
          </p>
          <p className="text-[11px] text-gray-400">{unit} · latest</p>
        </div>
      </div>

      {/* Status row */}
      <div className="mt-3.5 pt-3 border-t border-white/60 flex items-center gap-2 text-xs">
        {latestInRange ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        )}
        <span className={latestInRange ? "text-emerald-700" : "text-amber-700"}>
          {rangeLabel}
        </span>
        <span className="ml-auto text-gray-400">{count} report{count !== 1 ? "s" : ""} analysed</span>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function TrendsPage() {
  const router = useRouter();

  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [allData,       setAllData]       = useState<Record<string, TrendPoint[]>>({});
  const [available,     setAvailable]     = useState<string[]>([]);
  const [selectedParam, setSelectedParam] = useState<string>(PARAMS[0].label);

  // ── Auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!Cookies.get("access_token")) {
      router.push("/auth/login");
    }
  }, [router]);

  // ── Fetch all parameter trends in one call ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      setLoading(true);
      setError("");
      try {
        const res = await reportsApi.getTrends();
        if (cancelled) return;
        const { parameters = {}, available_parameters = [] } = res.data;
        setAllData(parameters);
        setAvailable(available_parameters);

        // Auto-select the first available parameter if the current selection has no data
        if (
          available_parameters.length > 0 &&
          !available_parameters.includes(selectedParam)
        ) {
          setSelectedParam(available_parameters[0]);
        }
      } catch {
        if (!cancelled) setError("Could not load trends. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived data for selected parameter ─────────────────────────────────────
  const points  = useMemo(() => allData[selectedParam] ?? [], [allData, selectedParam]);
  const meta    = PARAM_MAP[selectedParam];
  const summary = useMemo(
    () => (meta ? analyzeTrend(points, meta) : null),
    [points, meta],
  );

  const hasData = available.length > 0;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--cream)]">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[var(--sage)]">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center gap-2 text-xs text-[var(--charcoal)]/50 mb-3">
            <Link href="/dashboard" className="hover:text-[var(--teal)] transition-colors">
              Dashboard
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span>Health Trends</span>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-[var(--teal)] flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold text-[var(--charcoal)] mb-1">
                Health Trends
              </h1>
              <p className="text-sm text-[var(--charcoal)]/55 max-w-xl">
                Track how your key lab values change across multiple reports. Upload and analyse at least two reports to see trends.
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-sm text-[var(--charcoal)]/50">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading your health trends…
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {!loading && error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Empty state — no analysed reports yet ───────────────────────── */}
        {!loading && !error && !hasData && (
          <div className="text-center py-24 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-[var(--sage)] flex items-center justify-center mx-auto">
              <BarChart3 className="w-7 h-7 text-[var(--teal)]" />
            </div>
            <h2 className="font-display text-xl font-semibold text-[var(--charcoal)]">
              No trends yet
            </h2>
            <p className="text-sm text-[var(--charcoal)]/55 max-w-sm mx-auto">
              Upload and analyse at least two lab reports so Sahaay can track your parameter trends over time.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 mt-2 bg-[var(--teal)] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[var(--teal-light)] transition-colors"
            >
              Upload a report <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* ── Main content ────────────────────────────────────────────────── */}
        {!loading && !error && hasData && (
          <>
            {/* ── Parameter selector ────────────────────────────────────── */}
            <div className="overflow-x-auto pb-1 -mx-1 px-1">
              <div className="flex gap-2 min-w-max">
                {PARAMS.map((p) => {
                  const isAvailable = available.includes(p.label);
                  const isActive    = selectedParam === p.label;
                  return (
                    <button
                      key={p.label}
                      onClick={() => isAvailable && setSelectedParam(p.label)}
                      title={isAvailable ? p.description : `No trend data yet for ${p.label}`}
                      className={[
                        "px-3.5 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap border",
                        isActive
                          ? "bg-[var(--teal)] text-white border-[var(--teal)] shadow-sm"
                          : isAvailable
                            ? "bg-white text-[var(--charcoal)] border-[var(--sage)] hover:border-[var(--teal)] hover:text-[var(--teal)]"
                            : "bg-[var(--cream)] text-[var(--charcoal)]/35 border-[var(--sage)] cursor-not-allowed",
                      ].join(" ")}
                    >
                      {p.label}
                      {!isAvailable && (
                        <span className="ml-1.5 text-[10px] font-normal opacity-60">—</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Chart card ────────────────────────────────────────────── */}
            <div className="bg-white rounded-3xl border border-[var(--sage)] p-6">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[var(--charcoal)]">
                    {selectedParam}
                  </h2>
                  {meta && (
                    <p className="text-xs text-[var(--charcoal)]/50 mt-0.5">
                      {meta.description}
                      {(meta.normalMin !== null || meta.normalMax !== null) && (
                        <> · Normal:{" "}
                          {meta.normalMin !== null ? meta.normalMin : "—"}
                          {" – "}
                          {meta.normalMax !== null ? meta.normalMax : "—"}
                          {" "}{meta.unit}
                        </>
                      )}
                    </p>
                  )}
                </div>

                {points.length > 0 && (
                  <span className="shrink-0 text-xs text-[var(--charcoal)]/40 bg-[var(--sage)]/50 px-2.5 py-1 rounded-full">
                    {points.length} data point{points.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* The chart itself */}
              {points.length >= 2 ? (
                <ParameterChart
                  points={points}
                  paramName={selectedParam}
                />
              ) : points.length === 1 ? (
                <div className="flex flex-col items-center justify-center h-[300px] gap-3 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--sage)] flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-[var(--teal)]" />
                  </div>
                  <p className="text-sm font-medium text-[var(--charcoal)]/70">
                    One data point found
                  </p>
                  <p className="text-xs text-[var(--charcoal)]/45 max-w-xs">
                    Upload and analyse one more report that includes {selectedParam} to see the trend line.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] gap-3 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--sage)] flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-[var(--teal)]/50" />
                  </div>
                  <p className="text-sm text-[var(--charcoal)]/50">
                    No data available for {selectedParam} yet.
                  </p>
                  <Link
                    href="/dashboard"
                    className="text-xs text-[var(--teal)] hover:underline flex items-center gap-1"
                  >
                    Upload a report that includes {selectedParam}
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>

            {/* ── Trend summary card ────────────────────────────────────── */}
            {summary && (
              <SummaryCard summary={summary} paramLabel={selectedParam} />
            )}

            {/* ── All parameters at a glance ────────────────────────────── */}
            {available.length > 1 && (
              <div className="bg-white rounded-3xl border border-[var(--sage)] p-6">
                <h3 className="font-display text-base font-semibold text-[var(--charcoal)] mb-4">
                  All tracked parameters
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {available.map((name) => {
                    const pts   = allData[name] ?? [];
                    const m     = PARAM_MAP[name];
                    if (!m || pts.length < 2) return null;

                    const s     = analyzeTrend(pts, m);
                    if (!s) return null;

                    const last  = pts[pts.length - 1];
                    const DirIcon =
                      s.direction === "improving" ? TrendingUp :
                      s.direction === "worsening" ? TrendingDown : Minus;
                    const iconCls =
                      s.direction === "improving" ? "text-emerald-500" :
                      s.direction === "worsening" ? "text-red-500"     : "text-amber-500";

                    return (
                      <button
                        key={name}
                        onClick={() => setSelectedParam(name)}
                        className={[
                          "flex items-center justify-between p-3.5 rounded-xl border transition-all text-left",
                          selectedParam === name
                            ? "border-[var(--teal)] bg-[var(--sage)]/40"
                            : "border-[var(--sage)] hover:border-[var(--teal)]/50 hover:bg-[var(--sage)]/20",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-3">
                          <DirIcon className={`w-4 h-4 ${iconCls} shrink-0`} />
                          <div>
                            <p className="text-sm font-medium text-[var(--charcoal)]">{name}</p>
                            <p className="text-xs text-[var(--charcoal)]/50">
                              {pts.length} reports · last {last.value} {last.unit ?? m.unit}
                            </p>
                          </div>
                        </div>
                        <span className={[
                          "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0",
                          s.direction === "improving" ? "bg-emerald-100 text-emerald-700" :
                          s.direction === "worsening" ? "bg-red-100 text-red-600" :
                                                        "bg-amber-100 text-amber-700",
                        ].join(" ")}>
                          {s.direction}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Disclaimer ───────────────────────────────────────────── */}
            <div className="flex items-start gap-2 text-xs text-[var(--charcoal)]/40 bg-white rounded-xl px-4 py-3.5 border border-[var(--sage)]">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Trends are based on AI-extracted values from your uploaded reports. Ranges shown are general reference values — your doctor may use different clinical reference ranges.
            </div>
          </>
        )}
      </main>
    </div>
  );
}
