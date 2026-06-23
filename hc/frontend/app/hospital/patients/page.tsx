"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Users, Search, Eye, Loader2, ShieldAlert,
} from "lucide-react";
import Cookies from "js-cookie";
import HospitalNavbar from "@/components/HospitalNavbar";
import RiskBadge from "@/components/RiskBadge";
import { ToastContainer, useToast } from "@/components/Toast";
import { hospitalApi, authApi } from "@/lib/api";

interface Patient {
  id: string; name: string; email: string; age: number | null;
  last_visit: string | null; risk_level: string | null; risk_score: number | null;
}

export default function HospitalPatientsPage() {
  const router = useRouter();
  const { toasts, removeToast } = useToast();

  const [userName, setUserName] = useState("");
  const [role, setRole] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("");

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) { router.push("/hospital/login"); return; }

    const init = async () => {
      try {
        const me = await authApi.me();
        const u = me.data;
        if (u.role !== "admin" && u.role !== "doctor") { router.push("/dashboard"); return; }
        setUserName(u.name || "");
        setRole(u.role || "");

        const res = await hospitalApi.patients();
        setPatients(res.data);
      } catch { router.push("/hospital/login"); }
      finally { setLoading(false); }
    };
    init();
  }, [router]);

  const filtered = patients.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase());
    const matchRisk = !riskFilter || (p.risk_level || "").toLowerCase() === riskFilter.toLowerCase();
    return matchSearch && matchRisk;
  });

  const highRisk = patients.filter(p =>
    p.risk_level?.toLowerCase() === "high" || p.risk_level?.toLowerCase() === "critical"
  ).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--gray-50)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <HospitalNavbar userName={userName} role={role} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/10" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white">Patients</h1>
                <p className="text-white/70 text-sm">{patients.length} total · {highRisk} high risk</p>
              </div>
            </div>
          </motion.div>
        </div>
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 24" fill="none" preserveAspectRatio="none">
          <path d="M0 24L1440 0V24H0Z" fill="#F8FAFC" />
        </svg>
        <div className="h-6" />
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />

          {/* Toolbar */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-50 flex flex-wrap items-center gap-3 justify-between">
            <p className="text-sm text-gray-400 font-medium">{filtered.length} of {patients.length} patients</p>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[var(--primary)] w-56 transition-all"
                />
              </div>
              <select
                value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[var(--primary)]"
              >
                <option value="">All risk levels</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-20">
                <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">
                  {patients.length === 0
                    ? "No patients yet. They appear here once they book an appointment."
                    : "No patients match your search."}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Patient</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Age</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Last Visit</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Risk</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Score</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((p, i) => (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      whileHover={{ backgroundColor: "#F8FAFC" }}
                      className="transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
                            style={{ background: "var(--gradient-hero)" }}
                          >
                            {p.name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-gray-800">{p.name}</p>
                              {(p.risk_level?.toLowerCase() === "high" || p.risk_level?.toLowerCase() === "critical") && (
                                <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-gray-400">{p.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-500 text-sm">{p.age ?? "—"}</td>
                      <td className="px-4 py-4 text-gray-500 text-sm">
                        {p.last_visit
                          ? new Date(p.last_visit).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                          : "—"}
                      </td>
                      <td className="px-4 py-4">
                        {p.risk_level ? <RiskBadge level={p.risk_level} size="sm" /> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-4">
                        {p.risk_score != null
                          ? <span className={`font-bold text-sm ${p.risk_score >= 80 ? "text-emerald-600" : p.risk_score >= 60 ? "text-amber-500" : "text-red-500"}`}>
                              {Math.round(p.risk_score)}
                            </span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          href={`/hospital/patients/${p.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </Link>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
