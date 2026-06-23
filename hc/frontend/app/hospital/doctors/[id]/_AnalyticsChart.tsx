"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface MonthlyPoint {
  month: string;
  count: number;
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

export default function AnalyticsChart({ data }: { data: MonthlyPoint[] }) {
  const chartData = data.map((d) => ({ ...d, label: formatMonth(d.month) }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        No appointment data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#94A3B8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
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
          formatter={(value) => [`${value ?? ""}`, "Appointments"]}
          labelFormatter={(label) => `Month: ${label}`}
        />
        <Bar dataKey="count" fill="#0F766E" radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
