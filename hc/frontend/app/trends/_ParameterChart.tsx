"use client";

// Loaded via next/dynamic with ssr:false — recharts touches browser APIs
// (ResizeObserver, SVG) at import time and will SSR-crash without this guard.

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";

// ── Shared type ────────────────────────────────────────────────────────────────
// Exported here so page.tsx (which dynamically imports this file) can import the
// type directly without creating a circular runtime dependency.
export interface TrendPoint {
  date:          string;
  value:         number;
  unit:          string | null;
  is_abnormal:   boolean;
  reference_min: number | null;
  reference_max: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}
function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short",
  });
}

// ── Dot colours ───────────────────────────────────────────────────────────────
const DOT_NORMAL   = "#0F766E";
const DOT_ABNORMAL = "#EF4444";
const LINE_COLOR   = "#0F766E";
const BAND_FILL    = "#D1FAE5";

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  points:    TrendPoint[];
  paramName: string;
}

export default function ParameterChart({ points, paramName }: Props) {
  if (!points.length) return null;

  // Derive reference bounds from the data itself (backend stores them per-point)
  const withRef   = points.find(p => p.reference_min !== null || p.reference_max !== null);
  const refMin    = withRef?.reference_min ?? null;
  const refMax    = withRef?.reference_max ?? null;
  const unit      = points[0]?.unit ?? "";

  // Y-axis domain — give 20 % headroom above/below the data + ref-range bounds
  const values    = points.map(p => p.value);
  const allY      = [...values, ...(refMin != null ? [refMin] : []), ...(refMax != null ? [refMax] : [])];
  const yMin      = Math.min(...allY);
  const yMax      = Math.max(...allY);
  const padding   = (yMax - yMin) * 0.2 || 1;
  const domainMin = Math.max(0, yMin - padding);
  const domainMax = yMax + padding;

  return (
    <>
      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-5 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: DOT_NORMAL }} />
          Normal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: DOT_ABNORMAL }} />
          Abnormal
        </span>
        {refMin !== null && refMax !== null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-2.5 rounded border border-emerald-300 bg-emerald-100" />
            Normal range ({refMin}–{refMax}{unit ? ` ${unit}` : ""})
          </span>
        )}
        {refMax !== null && refMin === null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-2.5 rounded border border-emerald-300 bg-emerald-100" />
            Upper limit: {refMax}{unit ? ` ${unit}` : ""}
          </span>
        )}
        {unit && (
          <span className="ml-auto font-medium text-gray-500">Unit: {unit}</span>
        )}
      </div>

      {/* ── Chart ───────────────────────────────────────────────────────── */}
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 8, right: 20, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#F1F5F9"
              vertical={false}
            />

            <XAxis
              dataKey="date"
              tickFormatter={fmtShort}
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              axisLine={{ stroke: "#E2E8F0" }}
              tickLine={false}
            />
            <YAxis
              domain={[domainMin, domainMax]}
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={(v: number) => v % 1 === 0 ? String(v) : v.toFixed(1)}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const pt = (payload[0] as { payload: TrendPoint }).payload;
                const inRange =
                  (refMin == null || pt.value >= refMin) &&
                  (refMax == null || pt.value <= refMax);
                return (
                  <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3.5 py-2.5 text-xs min-w-[140px]">
                    <p className="font-bold text-gray-800 text-sm mb-0.5">
                      {pt.value} {pt.unit ?? ""}
                    </p>
                    <p className="text-gray-400 mb-1">{fmtDate(pt.date)}</p>
                    <p className={`font-semibold ${inRange ? "text-emerald-600" : "text-red-500"}`}>
                      {inRange ? "Within normal range" : "Outside normal range"}
                    </p>
                    {(refMin !== null || refMax !== null) && (
                      <p className="text-gray-400 mt-0.5">
                        Range:{" "}
                        {refMin !== null ? refMin : "—"}
                        {" – "}
                        {refMax !== null ? refMax : "—"}
                        {unit ? ` ${unit}` : ""}
                      </p>
                    )}
                  </div>
                );
              }}
            />

            {/* Green shaded normal-range band */}
            {refMin !== null && refMax !== null && (
              <ReferenceArea
                y1={refMin}
                y2={refMax}
                fill={BAND_FILL}
                fillOpacity={0.45}
                strokeOpacity={0}
              />
            )}
            {/* Upper-bound only (e.g. HbA1c, Triglycerides, SGPT/SGOT) */}
            {refMax !== null && refMin === null && (
              <ReferenceArea
                y1={domainMin}
                y2={refMax}
                fill={BAND_FILL}
                fillOpacity={0.45}
                strokeOpacity={0}
              />
            )}
            {/* Upper limit dashed reference line */}
            {refMax !== null && (
              <ReferenceLine
                y={refMax}
                stroke="#34D399"
                strokeDasharray="4 3"
                strokeWidth={1.2}
              />
            )}
            {refMin !== null && (
              <ReferenceLine
                y={refMin}
                stroke="#34D399"
                strokeDasharray="4 3"
                strokeWidth={1.2}
              />
            )}

            <Line
              type="monotone"
              dataKey="value"
              stroke={LINE_COLOR}
              strokeWidth={2.5}
              dot={(props: {
                cx?: number; cy?: number;
                index?: number; payload?: TrendPoint;
              }) => {
                const { cx = 0, cy = 0, index = 0, payload } = props;
                if (!cx && !cy) return <g key={`dot-empty-${index}`} />;
                return (
                  <circle
                    key={`dot-${paramName}-${index}`}
                    cx={cx} cy={cy} r={5}
                    fill={payload?.is_abnormal ? DOT_ABNORMAL : DOT_NORMAL}
                    stroke="white"
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={(props: {
                cx?: number; cy?: number;
                index?: number; payload?: TrendPoint;
              }) => {
                const { cx = 0, cy = 0, index = 0, payload } = props;
                return (
                  <circle
                    key={`adot-${paramName}-${index}`}
                    cx={cx} cy={cy} r={7}
                    fill={payload?.is_abnormal ? DOT_ABNORMAL : DOT_NORMAL}
                    stroke="white"
                    strokeWidth={2.5}
                  />
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
