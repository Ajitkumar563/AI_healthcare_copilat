"use client";

import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MonthPoint { month: string; count?: number; amount?: number; }
export interface SpecialtyPoint { specialty: string; count: number; }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

const SPECIALTY_COLORS = [
  "#0F766E", "#7C3AED", "#DC2626", "#D97706",
  "#059669", "#0369A1", "#BE185D", "#6D28D9",
];

const tip = {
  contentStyle: {
    background: "#fff", border: "1px solid #E2E8F0",
    borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
    fontSize: 12, padding: "8px 12px",
  },
  labelStyle: { fontWeight: 700, color: "#1E293B" },
};

// ─── Appointments Line Chart ──────────────────────────────────────────────────
export function AppointmentsChart({ data }: { data: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <Tooltip {...tip} formatter={(v) => [Number(v ?? 0), "Appointments"]} labelFormatter={(m) => fmtMonth(String(m ?? ""))} />
        <Line type="monotone" dataKey="count" stroke="#0F766E" strokeWidth={2.5}
          dot={{ fill: "#0F766E", r: 4, strokeWidth: 0 }}
          activeDot={{ r: 6, fill: "#0F766E", stroke: "#fff", strokeWidth: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Revenue Area Chart ───────────────────────────────────────────────────────
export function RevenueChart({ data }: { data: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false}
          tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
        <Tooltip {...tip} formatter={(v) => [`₹${Number(v ?? 0).toLocaleString("en-IN")}`, "Revenue"]} labelFormatter={(m) => fmtMonth(String(m ?? ""))} />
        <Area type="monotone" dataKey="amount" stroke="#7C3AED" strokeWidth={2.5} fill="url(#revGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Specialty Bar Chart ──────────────────────────────────────────────────────
export function SpecialtyChart({ data }: { data: SpecialtyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="specialty" tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} width={110} />
        <Tooltip {...tip} formatter={(v) => [Number(v ?? 0), "Appointments"]} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={SPECIALTY_COLORS[i % SPECIALTY_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── AI Usage Line Chart ──────────────────────────────────────────────────────
export function AIUsageChart({ data }: { data: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id="aiGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0369A1" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#0369A1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <Tooltip {...tip} formatter={(v) => [Number(v ?? 0), "AI Calls"]} labelFormatter={(m) => fmtMonth(String(m ?? ""))} />
        <Area type="monotone" dataKey="count" stroke="#0369A1" strokeWidth={2.5} fill="url(#aiGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Patients Line Chart ──────────────────────────────────────────────────────
export function PatientsChart({ data }: { data: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id="ptGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#059669" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#059669" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <Tooltip {...tip} formatter={(v) => [Number(v ?? 0), "Active Patients"]} labelFormatter={(m) => fmtMonth(String(m ?? ""))} />
        <Area type="monotone" dataKey="count" stroke="#059669" strokeWidth={2.5} fill="url(#ptGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
