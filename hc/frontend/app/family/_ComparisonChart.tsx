"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

export interface ChartMember {
  name: string;
  risk_score: number;
  risk_level: string;
}

const RISK_COLORS: Record<string, string> = {
  Low:      "#10B981",
  Medium:   "#F59E0B",
  High:     "#F97316",
  Critical: "#EF4444",
};

export default function ComparisonChart({ data }: { data: ChartMember[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-gray-400">
        No data available
      </div>
    );
  }

  const chartData = data.map(m => ({
    name: m.name.split(" ")[0],
    score: m.risk_score,
    level: m.risk_level,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "#94A3B8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: "#94A3B8" }}
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
          formatter={(value) => [`${value}`, "Health Score"]}
          labelFormatter={(label) => `${label}`}
        />
        <Bar dataKey="score" radius={[6, 6, 0, 0]} maxBarSize={56}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={RISK_COLORS[entry.level] ?? "#94A3B8"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
