"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Users, X, AlertTriangle, CheckCircle2, AlertCircle,
  Loader2, Heart, RefreshCw, BarChart2, ShieldAlert,
} from "lucide-react";
import Cookies from "js-cookie";
import Navbar from "@/components/Navbar";
import { ToastContainer, useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import RiskBadge from "@/components/RiskBadge";
import { familyApi } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { ChartMember } from "./_ComparisonChart";

const ComparisonChart = dynamic(() => import("./_ComparisonChart"), { ssr: false });

interface FamilyMember {
  id: string; name: string; relationship_type: string; age?: number;
  gender?: string; conditions?: string; risk_level: string; last_checkup?: string;
}

interface ComparisonMember {
  id: string; name: string; relationship: string; age: number | null;
  risk_level: string; risk_score: number; conditions: string | null; last_checkup: string | null;
}

interface ComparisonData { members: ComparisonMember[]; }

const RISK_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

const RISK_ROW: Record<string, string> = {
  Critical: "bg-red-50 border-red-100",
  High:     "bg-orange-50 border-orange-100",
  Medium:   "bg-amber-50 border-amber-100",
  Low:      "bg-emerald-50 border-emerald-100",
};

const RISK_BADGE: Record<string, string> = {
  Critical: "bg-red-100 text-red-700 border-red-200",
  High:     "bg-orange-100 text-orange-700 border-orange-200",
  Medium:   "bg-amber-100 text-amber-700 border-amber-200",
  Low:      "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const RELATIONSHIPS = ["Spouse","Father","Mother","Son","Daughter","Brother","Sister","Grandparent","Other"];

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#0F766E,#06B6D4)",
  "linear-gradient(135deg,#7C3AED,#A78BFA)",
  "linear-gradient(135deg,#D97706,#FCD34D)",
  "linear-gradient(135deg,#059669,#34D399)",
  "linear-gradient(135deg,#DC2626,#F87171)",
  "linear-gradient(135deg,#0369A1,#38BDF8)",
];

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
}

export default function FamilyPage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();
  const { t } = useLanguage();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPanel, setShowPanel] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<FamilyMember | null>(null);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("Spouse");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("not specified");
  const [conditions, setConditions] = useState("");
  const [riskLevel, setRiskLevel] = useState("Low");

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) { router.push("/auth/login"); return; }
    fetchMembers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchMembers = async () => {
    setLoading(true);
    try { const res = await familyApi.list(); setMembers(res.data); }
    catch { toast("Could not load family members.", "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (members.length >= 2) {
      setLoadingComparison(true);
      familyApi.getComparison()
        .then(res => setComparison(res.data))
        .catch(() => {})
        .finally(() => setLoadingComparison(false));
    } else {
      setComparison(null);
    }
  }, [members.length]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) return; setSubmitting(true);
    try {
      const res = await familyApi.add({ name, relationship_type: relationship, age: age ? parseInt(age) : undefined, gender: gender !== "not specified" ? gender : undefined, conditions, risk_level: riskLevel });
      setMembers(prev => [...prev, res.data]);
      setName(""); setRelationship("Spouse"); setAge(""); setGender("not specified"); setConditions(""); setRiskLevel("Low");
      setShowPanel(false); toast(`${name} added!`, "success");
    } catch { toast("Failed to add member.", "error"); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string, memberName: string) => {
    try { await familyApi.delete(id); setMembers(prev => prev.filter(m => m.id !== id)); if (selected?.id === id) setSelected(null); toast(`${memberName} removed.`, "info"); }
    catch { toast("Failed to remove.", "error"); }
  };

  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  const highRisk = members.filter(m => ["High","Critical"].includes(m.risk_level));
  const needAttention = members.filter(m => m.risk_level === "Medium");

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <Navbar />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <PageHeader title={t("family_title")} subtitle={t("family_subtitle")}
        icon={<Users className="w-5 h-5" />} />

      {/* Slide-in panel */}
      <AnimatePresence>
        {showPanel && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setShowPanel(false)} />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 shadow-2xl overflow-y-auto">
              <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                <h2 className="font-bold text-[var(--text-primary)]">{t("add_family_member")}</h2>
                <button onClick={() => setShowPanel(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAdd} className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">{t("member_name")} *</label>
                  <input required type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ramesh Kumar"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none text-sm transition-all" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">{t("relationship")}</label>
                    <select value={relationship} onChange={e => setRelationship(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none text-sm bg-white">
                      {RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">{t("age_label")}</label>
                    <input type="number" min="0" max="120" value={age} onChange={e => setAge(e.target.value)} placeholder="55"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none text-sm transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">{t("gender_label")}</label>
                    <select value={gender} onChange={e => setGender(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none text-sm bg-white">
                      <option value="not specified">Not specified</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">{t("risk_level")}</label>
                    <select value={riskLevel} onChange={e => setRiskLevel(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none text-sm bg-white">
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">{t("conditions_label")}</label>
                  <input type="text" value={conditions} onChange={e => setConditions(e.target.value)} placeholder="e.g. Diabetes, Hypertension"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[var(--primary)] focus:outline-none text-sm transition-all" />
                </div>
                <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={submitting}
                  className="w-full gradient-btn py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                  {submitting ? t("adding") : t("add_to_family")}
                </motion.button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-16">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-[var(--text-secondary)]">{members.length} members tracked</p>
          <div className="flex items-center gap-2">
            <button onClick={fetchMembers} className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-400 transition-all"><RefreshCw className="w-4 h-4" /></button>
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowPanel(true)}
              className="flex items-center gap-2 gradient-btn px-4 py-2.5 rounded-xl text-sm font-semibold">
              <Plus className="w-4 h-4" /> {t("add_member")}
            </motion.button>
          </div>
        </div>

        {/* Stats */}
        {!loading && members.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] p-4 text-center">
              <Users className="w-6 h-6 text-[var(--primary)] mx-auto mb-2" />
              <div className="text-2xl font-extrabold gradient-text">{members.length}</div>
              <div className="text-xs text-gray-400">{t("total_members")}</div>
            </div>
            <div className={`rounded-2xl border p-4 text-center shadow-[var(--shadow-sm)] ${highRisk.length > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-100"}`}>
              <AlertTriangle className={`w-6 h-6 mx-auto mb-2 ${highRisk.length > 0 ? "text-red-500" : "text-gray-300"}`} />
              <div className={`text-2xl font-extrabold ${highRisk.length > 0 ? "text-red-600" : "text-gray-300"}`}>{highRisk.length}</div>
              <div className="text-xs text-gray-400">{t("high_risk")}</div>
            </div>
            <div className={`rounded-2xl border p-4 text-center shadow-[var(--shadow-sm)] ${needAttention.length > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100"}`}>
              <Heart className={`w-6 h-6 mx-auto mb-2 ${needAttention.length > 0 ? "text-amber-500" : "text-gray-300"}`} />
              <div className={`text-2xl font-extrabold ${needAttention.length > 0 ? "text-amber-600" : "text-gray-300"}`}>{needAttention.length}</div>
              <div className="text-xs text-gray-400">{t("need_attention")}</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-56 rounded-2xl skeleton" />)}</div>
        ) : members.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)]">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4"><Users className="w-8 h-8 text-gray-200" /></div>
            <p className="text-sm font-semibold text-gray-500">{t("no_family")}</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">Add your family members to track their health.</p>
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowPanel(true)} className="gradient-btn px-5 py-2.5 rounded-xl text-sm font-semibold">Add first member</motion.button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map((m, idx) => (
              <motion.div key={m.id} whileHover={{ y: -4, boxShadow: "0 8px 30px rgba(15,118,110,0.14)" }}
                onClick={() => setSelected(selected?.id === m.id ? null : m)}
                className={`bg-white rounded-2xl overflow-hidden cursor-pointer transition-all border ${selected?.id === m.id ? "border-[var(--primary)] shadow-[var(--shadow-md)]" : "border-gray-100 shadow-[var(--shadow-sm)]"}`}>
                {/* Gradient top band with avatar */}
                <div className="relative h-20 flex items-center justify-center" style={{ background: AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length] }}>
                  <button onClick={e => { e.stopPropagation(); handleDelete(m.id, m.name); }}
                    className="absolute top-3 right-3 w-6 h-6 rounded-lg bg-white/20 hover:bg-white/40 flex items-center justify-center text-white transition-all">
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-14 h-14 rounded-2xl bg-white/25 flex items-center justify-center">
                    <span className="text-white text-xl font-extrabold">{initials(m.name)}</span>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-[var(--text-primary)] text-sm mb-0.5">{m.name}</h3>
                  <p className="text-xs text-gray-400 mb-3">{m.relationship_type}{m.age ? ` · ${m.age}y` : ""}</p>
                  {m.conditions && <p className="text-xs text-gray-500 mb-3 line-clamp-1">{m.conditions}</p>}
                  <RiskBadge level={m.risk_level} size="sm" />
                </div>
              </motion.div>
            ))}
            {/* Add card */}
            <button onClick={() => setShowPanel(true)}
              className="bg-white rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3 hover:border-[var(--primary)] hover:bg-teal-50/30 transition-all min-h-[200px] shadow-[var(--shadow-sm)]">
              <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center"><Plus className="w-5 h-5 text-gray-400" /></div>
              <span className="text-sm font-semibold text-gray-400">Add member</span>
            </button>
          </div>
        )}

        {/* Selected detail */}
        <AnimatePresence>
          {selected && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
              className="mt-6 bg-white rounded-2xl border border-teal-200 shadow-[var(--shadow-md)] overflow-hidden">
              <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-[var(--text-primary)]">{selected.name}&apos;s Health Summary</h3>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  {[
                    { label: "Relationship", value: selected.relationship_type },
                    { label: "Age", value: selected.age ? `${selected.age} years` : "Not set" },
                    { label: "Risk Level", value: selected.risk_level },
                  ].map(item => (
                    <div key={item.label} className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
                      <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                      <p className="font-bold text-sm text-[var(--text-primary)]">{item.value}</p>
                    </div>
                  ))}
                </div>
                {selected.conditions && (
                  <div className="mt-4 bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Known Conditions</p>
                    <p className="text-sm text-gray-700">{selected.conditions}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* ── Health Comparison Section ── */}
        {!loading && (
          <div className="mt-10">
            {/* Section header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "var(--gradient-hero)" }}>
                <BarChart2 className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Family Health Comparison</h2>
            </div>

            {members.length < 2 ? (
              /* Empty state */
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 shadow-[var(--shadow-sm)] flex flex-col items-center justify-center py-12 text-center px-4">
                <Users className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-sm font-semibold text-gray-500">Add at least 2 family members to compare</p>
                <p className="text-xs text-gray-400 mt-1">Side-by-side health comparison will appear here.</p>
              </div>

            ) : loadingComparison ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
              </div>

            ) : comparison && (() => {
              const sorted = [...comparison.members].sort(
                (a, b) => (RISK_ORDER[a.risk_level] ?? 4) - (RISK_ORDER[b.risk_level] ?? 4)
              );
              const avgScore = Math.round(
                comparison.members.reduce((s, m) => s + m.risk_score, 0) / comparison.members.length
              );
              const overallHealth = avgScore >= 75 ? "Good" : avgScore >= 50 ? "Fair" : "Poor";
              const overallColor  = avgScore >= 75 ? "text-emerald-600" : avgScore >= 50 ? "text-amber-600" : "text-red-600";
              const criticalCount = comparison.members.filter(m => ["Critical","High"].includes(m.risk_level)).length;
              const chartData: ChartMember[] = comparison.members.map(m => ({
                name: m.name, risk_score: m.risk_score, risk_level: m.risk_level,
              }));

              return (
                <div className="space-y-4">
                  {/* Summary card */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] p-5">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-extrabold gradient-text">{comparison.members.length}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Members tracked</p>
                      </div>
                      <div className={`text-center ${criticalCount > 0 ? "" : ""}`}>
                        <p className={`text-2xl font-extrabold ${criticalCount > 0 ? "text-red-600" : "text-gray-300"}`}>
                          {criticalCount}
                        </p>
                        <div className="flex items-center justify-center gap-1 mt-0.5">
                          {criticalCount > 0 && <ShieldAlert className="w-3 h-3 text-red-500" />}
                          <p className="text-xs text-gray-400">At high/critical risk</p>
                        </div>
                      </div>
                      <div className="text-center">
                        <p className={`text-2xl font-extrabold ${overallColor}`}>{overallHealth}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Overall family health</p>
                      </div>
                    </div>
                  </div>

                  {/* Bar chart */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] p-5">
                    <p className="text-sm font-bold text-[var(--text-primary)] mb-4">Health Score by Member</p>
                    <ComparisonChart data={chartData} />
                    <div className="flex flex-wrap items-center gap-4 mt-3 justify-center">
                      {[
                        { label: "Low",      color: "bg-emerald-500" },
                        { label: "Medium",   color: "bg-amber-500" },
                        { label: "High",     color: "bg-orange-500" },
                        { label: "Critical", color: "bg-red-500" },
                      ].map(({ label, color }) => (
                        <span key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
                          <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Comparison table */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-50">
                      <p className="text-sm font-bold text-[var(--text-primary)]">Side-by-Side Comparison</p>
                    </div>
                    {/* Table header */}
                    <div className="hidden sm:grid grid-cols-5 gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-100">
                      {["Member","Age","Risk Level","Conditions","Last Checkup"].map(col => (
                        <p key={col} className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{col}</p>
                      ))}
                    </div>
                    {/* Rows */}
                    <div className="divide-y divide-gray-50">
                      {sorted.map((m) => (
                        <div key={m.id}
                          className={`px-5 py-3.5 grid grid-cols-2 sm:grid-cols-5 gap-3 items-center border-l-4 ${RISK_ROW[m.risk_level] ?? "bg-white border-gray-100"}`}>
                          {/* Name + relationship */}
                          <div>
                            <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">{m.name}</p>
                            <p className="text-xs text-gray-400">{m.relationship}</p>
                          </div>
                          {/* Age */}
                          <p className="text-sm text-gray-600">{m.age ? `${m.age}y` : "—"}</p>
                          {/* Risk badge */}
                          <div>
                            <span className={`inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full border ${RISK_BADGE[m.risk_level] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                              {m.risk_level}
                            </span>
                          </div>
                          {/* Conditions */}
                          <p className="text-xs text-gray-500 line-clamp-1 col-span-2 sm:col-span-1">
                            {m.conditions || <span className="text-gray-300">None noted</span>}
                          </p>
                          {/* Last checkup */}
                          <p className="text-xs text-gray-500 hidden sm:block">
                            {m.last_checkup || <span className="text-gray-300">Not set</span>}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}
