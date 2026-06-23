"use client";

// This file is intentionally separate so it can be loaded via next/dynamic with
// ssr: false. recharts uses ResizeObserver and other browser APIs at import time
// and will throw during Next.js server rendering even inside "use client" pages.

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea,
} from "recharts";
import type { TrendPoint } from "./page";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

interface Props {
  chartData: TrendPoint[];
  selectedParam: string;
}

export default function TrendsChart({ chartData, selectedParam }: Props) {
  const refPoint  = chartData.find(d => d.reference_min !== null && d.reference_max !== null);
  const refMin    = refPoint?.reference_min ?? null;
  const refMax    = refPoint?.reference_max ?? null;
  const chartUnit = chartData[0]?.unit ?? "";

  return (
    <>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0F766E]" /> Normal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" /> Abnormal
        </span>
        {refMin !== null && refMax !== null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-2.5 rounded bg-emerald-100 border border-emerald-300" />
            Normal range ({refMin}–{refMax}{chartUnit ? ` ${chartUnit}` : ""})
          </span>
        )}
        {chartUnit && (
          <span className="ml-auto font-medium text-gray-500">Unit: {chartUnit}</span>
        )}
      </div>

      {/* Chart */}
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              axisLine={{ stroke: "#E2E8F0" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              axisLine={false}
              tickLine={false}
              width={48}
              domain={["auto", "auto"]}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = (payload[0] as { payload: TrendPoint }).payload;
                return (
                  <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-xs">
                    <p className="font-bold text-gray-800 mb-0.5">
                      {point.value} {point.unit ?? ""}
                    </p>
                    <p className="text-gray-500 mb-0.5">{formatDate(point.date)}</p>
                    <p className={`font-semibold ${point.is_abnormal ? "text-red-500" : "text-emerald-600"}`}>
                      {point.is_abnormal ? "Abnormal" : "Normal"}
                    </p>
                    {point.reference_min !== null && point.reference_max !== null && (
                      <p className="text-gray-400 mt-0.5">
                        Range: {point.reference_min}–{point.reference_max} {point.unit ?? ""}
                      </p>
                    )}
                  </div>
                );
              }}
            />
            {refMin !== null && refMax !== null && (
              <ReferenceArea
                y1={refMin} y2={refMax}
                fill="#D1FAE5" fillOpacity={0.5}
                strokeOpacity={0}
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke="#0F766E"
              strokeWidth={2.5}
              dot={(props: { cx?: number; cy?: number; index?: number; payload?: TrendPoint }) => {
                const { cx = 0, cy = 0, index = 0, payload } = props;
                if (!cx && !cy) return <g />;
                return (
                  <circle
                    cx={cx} cy={cy} r={5}
                    fill={payload?.is_abnormal ? "#EF4444" : "#0F766E"}
                    stroke="white" strokeWidth={2}
                    key={`dot-${selectedParam}-${index}`}
                  />
                );
              }}
              activeDot={(props: { cx?: number; cy?: number; index?: number; payload?: TrendPoint }) => {
                const { cx = 0, cy = 0, index = 0, payload } = props;
                return (
                  <circle
                    cx={cx} cy={cy} r={7}
                    fill={payload?.is_abnormal ? "#EF4444" : "#0F766E"}
                    stroke="white" strokeWidth={2.5}
                    key={`adot-${selectedParam}-${index}`}
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
