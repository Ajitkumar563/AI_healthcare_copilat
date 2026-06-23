"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  gradient: string;
  trend?: { value: number; label: string };
  subtitle?: string;
}

export default function StatCard({ label, value, icon, gradient, trend, subtitle }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, boxShadow: "0 8px 30px rgba(15,118,110,0.14)" }}
      transition={{ duration: 0.2 }}
      className="bg-white rounded-2xl p-5 shadow-[var(--shadow-sm)] border border-gray-100"
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white"
          style={{ background: gradient }}
        >
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-xs font-semibold ${trend.value >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {trend.value >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-[var(--text-primary)] mb-0.5">{value}</p>
      <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{label}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </motion.div>
  );
}
