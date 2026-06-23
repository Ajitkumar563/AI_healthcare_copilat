"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Dot,
} from "recharts";

export interface HealthScorePoint {
  date: string;
  risk_score: number;
  risk_level: string;
  report_name: string;
}

const LEVEL_COLORS: Record<string, string> = {
  Low:      "#10B981",
  Medium:   "#F59E0B",
  High:     "#F97316",
  Critical: "#EF4444",
};

function levelColor(level: string) {
  return LEVEL_COLORS[level] ?? "#06B6D4";
}

function CustomDot(props: {
  cx?: number; cy?: number; payload?: HealthScorePoint;
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  return (
    <Dot
      cx={cx} cy={cy} r={5}
      fill={levelColor(payload.risk_level)}
      stroke="#fff"
      strokeWidth={2}
    />
  );
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function HealthScoreChart({ data }: { data: HealthScorePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-gray-400">
        No approved reports with scores yet
      </div>
    );
  }

  const chartData = data.map(d => ({
    ...d,
    label: shortDate(d.date),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0F766E" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#94A3B8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: "#94A3B8" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: "1px solid #E2E8F0",
            fontSize: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
          formatter={(value, _name, item) => {
            const level = (item.payload as HealthScorePoint).risk_level;
            return [`${value}/100 · ${level} risk`, "Health Score"];
          }}
          labelFormatter={(label, payload) => {
            const name = (payload?.[0]?.payload as HealthScorePoint)?.report_name ?? label;
            return name.length > 30 ? name.slice(0, 30) + "…" : name;
          }}
        />
        <ReferenceLine y={70} stroke="#10B981" strokeDasharray="4 3" strokeWidth={1} label={{ value: "Good", position: "right", fontSize: 9, fill: "#10B981" }} />
        <ReferenceLine y={50} stroke="#F59E0B" strokeDasharray="4 3" strokeWidth={1} label={{ value: "Watch", position: "right", fontSize: 9, fill: "#F59E0B" }} />
        <Line
          type="monotone"
          dataKey="risk_score"
          stroke="url(#scoreGrad)"
          strokeWidth={2.5}
          dot={<CustomDot />}
          activeDot={{ r: 7, strokeWidth: 2, stroke: "#fff" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
