"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CreditCard, CheckCircle2, AlertTriangle, TrendingUp, Loader2,
  Mail, Calendar, Users, Stethoscope, Sparkles,
} from "lucide-react";
import Cookies from "js-cookie";
import HospitalNavbar from "@/components/HospitalNavbar";
import { ToastContainer, useToast } from "@/components/Toast";
import { authApi, billingApi } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type PlanId = "free" | "pro" | "enterprise";

interface Subscription {
  id: string;
  plan: PlanId;
  plan_name: string;
  status: "active" | "expired";
  start_date: string | null;
  end_date: string | null;
  max_doctors: number | null;
  max_patients: number | null;
  price_inr: number | null;
}

interface Usage {
  doctors: number;
  patients: number;
}

interface PlanDef {
  name: string;
  price_inr: number | null;
  billing_cycle_days: number | null;
  max_doctors: number | null;
  max_patients: number | null;
  features: string[];
}

interface BillingData {
  subscription: Subscription;
  usage: Usage;
  plans: Record<PlanId, PlanDef>;
}

const PLAN_ORDER: PlanId[] = ["free", "pro", "enterprise"];

const PLAN_STYLE: Record<PlanId, { gradient: string; textColor: string }> = {
  free:       { gradient: "linear-gradient(135deg,#E2E8F0,#CBD5E1)", textColor: "#475569" },
  pro:        { gradient: "var(--gradient-hero)",                     textColor: "#fff"    },
  enterprise: { gradient: "linear-gradient(135deg,#7C3AED,#A78BFA)",  textColor: "#fff"    },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatPrice(inr: number | null): string {
  if (inr === null) return "Custom";
  if (inr === 0) return "Free";
  return `₹${inr.toLocaleString("en-IN")}/mo`;
}

// ── Usage meter ───────────────────────────────────────────────────────────────

function UsageMeter({
  label, icon: Icon, used, limit, color,
}: {
  label: string; icon: typeof Users; used: number; limit: number | null; color: string;
}) {
  const unlimited = limit === null;
  const pct = unlimited ? 0 : Math.min(Math.round((used / limit) * 100), 100);
  const warn = !unlimited && pct >= 80;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-gray-400" /> {label}
        </p>
        <p className={`text-xs font-semibold ${warn ? "text-red-500" : "text-gray-500"}`}>
          {unlimited ? `${used} / Unlimited` : `${used} / ${limit}`}
          {warn && <AlertTriangle className="w-3.5 h-3.5 inline ml-1" />}
        </p>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          className="h-2 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: unlimited ? "100%" : `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ background: unlimited ? "#10B981" : warn ? "#EF4444" : color }}
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();

  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BillingData | null>(null);
  const [changingPlan, setChangingPlan] = useState<PlanId | null>(null);

  const loadBilling = useCallback(async () => {
    try {
      const res = await billingApi.getCurrent();
      setData(res.data);
    } catch {
      toast("Could not load billing details.", "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) { router.push("/hospital/login"); return; }
    const init = async () => {
      try {
        const me = await authApi.me();
        if (me.data.role !== "admin") { router.push("/hospital/dashboard"); return; }
        setUserName(me.data.name || "");
        await loadBilling();
      } catch {
        router.push("/hospital/login");
      } finally {
        setLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleUpgrade(planId: PlanId) {
    if (planId === "enterprise") {
      toast("Thanks for your interest! Our sales team will reach out within 24 hours.", "success");
      return;
    }
    setChangingPlan(planId);
    try {
      const res = await billingApi.upgrade(planId);
      setData((prev) => prev ? { ...prev, subscription: res.data.subscription, usage: res.data.usage } : prev);
      toast(res.data.message || "Plan updated", "success");
    } catch {
      toast("Failed to change plan. Please try again.", "error");
    } finally {
      setChangingPlan(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--gray-50)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[var(--gray-50)]">
        <HospitalNavbar userName={userName} role="admin" />
        <div className="max-w-3xl mx-auto px-6 py-16 text-center text-sm text-gray-400">
          Could not load billing details. Please refresh the page.
        </div>
      </div>
    );
  }

  const { subscription, usage, plans } = data;
  const expired = subscription.status === "expired";

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <HospitalNavbar userName={userName} role="admin" />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-[var(--primary)]" /> Subscription & Billing
          </h1>
          <p className="text-sm text-gray-400 mt-1">Manage your hospital&apos;s plan and usage.</p>
        </div>

        {expired && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Your plan has expired. Renew or upgrade below to restore full access.
          </div>
        )}

        {/* Current plan */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="h-1 w-full" style={{ background: PLAN_STYLE[subscription.plan].gradient }} />
          <div className="p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-100">
                    CURRENT PLAN
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                    expired ? "bg-red-50 text-red-600 border-red-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                  }`}>
                    {expired ? "Expired" : "Active"}
                  </span>
                </div>
                <h2 className="text-2xl font-extrabold text-gray-900">{subscription.plan_name}</h2>
                <p className="text-gray-400 text-sm mt-0.5">
                  {formatPrice(subscription.price_inr)}
                  {subscription.plan === "free" && " · No credit card required"}
                </p>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Started {formatDate(subscription.start_date)}
                  </span>
                  {subscription.end_date && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Renews {formatDate(subscription.end_date)}
                    </span>
                  )}
                </div>
              </div>
              {subscription.plan !== "enterprise" && (
                <button
                  onClick={() => handleUpgrade(subscription.plan === "free" ? "pro" : "enterprise")}
                  disabled={changingPlan !== null}
                  className="gradient-btn px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-60"
                >
                  <TrendingUp className="w-4 h-4" />
                  {subscription.plan === "free" ? "Upgrade to Growth" : "Contact Sales"}
                </button>
              )}
            </div>

            {/* Usage meters */}
            <div className="mt-6 space-y-4">
              <UsageMeter label="Doctors" icon={Stethoscope} used={usage.doctors} limit={subscription.max_doctors} color="#0F766E" />
              <UsageMeter label="Patients" icon={Users} used={usage.patients} limit={subscription.max_patients} color="#7C3AED" />
            </div>
          </div>
        </div>

        {/* Plan comparison */}
        <div className="grid sm:grid-cols-3 gap-4">
          {PLAN_ORDER.map((planId) => {
            const plan = plans[planId];
            const isCurrent = subscription.plan === planId;
            const style = PLAN_STYLE[planId];
            return (
              <div
                key={planId}
                className={`rounded-2xl overflow-hidden border ${isCurrent ? "border-teal-200" : "border-gray-100"} shadow-[var(--shadow-sm)]`}
              >
                <div className="h-1.5" style={{ background: style.gradient }} />
                <div className="p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-gray-900">{plan.name}</h3>
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-extrabold text-gray-900 mb-4">{formatPrice(plan.price_inr)}</p>
                  <ul className="space-y-2 mb-5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-gray-600">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleUpgrade(planId)}
                    disabled={isCurrent || changingPlan !== null}
                    className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                      isCurrent ? "bg-gray-100 text-gray-400 cursor-default" : "text-white hover:opacity-90"
                    }`}
                    style={isCurrent ? undefined : { background: style.gradient }}
                  >
                    {changingPlan === planId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isCurrent ? (
                      "Current plan"
                    ) : planId === "enterprise" ? (
                      <><Mail className="w-3.5 h-3.5" /> Contact Sales</>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5" /> Switch to {plan.name}</>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-2 text-xs text-gray-400 bg-white rounded-xl px-4 py-3.5 border border-gray-100">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          This is a demo billing flow — plan changes are mocked and no payment is processed yet.
        </div>
      </main>
    </div>
  );
}
