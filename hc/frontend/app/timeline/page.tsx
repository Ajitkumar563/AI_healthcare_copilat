"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Clock, FileText, AlertTriangle, CheckCircle2, Activity, Filter as FilterIcon } from "lucide-react";
import Cookies from "js-cookie";
import Navbar from "@/components/Navbar";
import { ToastContainer, useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import RiskBadge from "@/components/RiskBadge";
import { patientsApi } from "@/lib/api";

interface TimelineEvent {
  id: string; event_type: string; event_date: string; title: string; description?: string;
  risk_level?: string; report_type?: string | null; severity?: string; approval_status?: string;
}

type FilterType = "all" | "report" | "reminder" | "symptom";

const FILTER_TABS: { label: string; value: FilterType }[] = [
  { label: "All", value: "all" },
  { label: "Reports", value: "report" },
  { label: "Reminders", value: "reminder" },
  { label: "Symptoms", value: "symptom" },
];

function eventGradient(type: string) {
  switch (type) {
    case "report":   return "linear-gradient(135deg,#0F766E,#06B6D4)";
    case "reminder": return "linear-gradient(135deg,#D97706,#F59E0B)";
    case "symptom":  return "linear-gradient(135deg,#7C3AED,#A78BFA)";
    default:         return "linear-gradient(135deg,#64748B,#94A3B8)";
  }
}

function eventDotColor(type: string) {
  switch (type) {
    case "report":   return "#0F766E";
    case "reminder": return "#D97706";
    case "symptom":  return "#7C3AED";
    default:         return "#64748B";
  }
}

function eventIcon(type: string) {
  switch (type) {
    case "report":   return <FileText className="w-4 h-4 text-white" />;
    case "reminder": return <CheckCircle2 className="w-4 h-4 text-white" />;
    case "symptom":  return <AlertTriangle className="w-4 h-4 text-white" />;
    default:         return <Activity className="w-4 h-4 text-white" />;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function groupByDate(events: TimelineEvent[]): Record<string, TimelineEvent[]> {
  return events.reduce((acc, ev) => {
    const d = formatDate(ev.event_date);
    if (!acc[d]) acc[d] = [];
    acc[d].push(ev);
    return acc;
  }, {} as Record<string, TimelineEvent[]>);
}

export default function TimelinePage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) { router.push("/auth/login"); return; }
    const fetchTimeline = async () => {
      setLoading(true);
      try { const res = await patientsApi.getTimeline(); setEvents(res.data); }
      catch { toast("Could not load timeline.", "error"); }
      finally { setLoading(false); }
    };
    fetchTimeline();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const filtered = filter === "all" ? events : events.filter(e => e.event_type === filter);
  const grouped = groupByDate(filtered);
  // Sort group headers by the first event's ISO date (not the formatted string,
  // which is unreliable as input to new Date()).
  const sortedDates = Object.keys(grouped).sort((a, b) => {
    const aIso = grouped[a][0]?.event_date ?? "";
    const bIso = grouped[b][0]?.event_date ?? "";
    return bIso.localeCompare(aIso);
  });

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <Navbar />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <PageHeader title="Health Timeline" subtitle="Your complete health history in chronological order."
        icon={<Clock className="w-5 h-5" />} />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-6">
        {/* Filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <FilterIcon className="w-4 h-4 text-gray-400 shrink-0" />
          {FILTER_TABS.map(tab => (
            <button key={tab.value} onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${filter === tab.value ? "text-white shadow-sm" : "bg-white text-gray-500 border border-gray-200 hover:border-teal-300 hover:text-[var(--primary)]"}`}
              style={filter === tab.value ? { background: "var(--gradient-hero)" } : {}}>
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-6">
            {[1,2,3].map(i => (
              <div key={i} className="space-y-3">
                <div className="h-5 w-24 rounded-full skeleton" />
                <div className="h-24 rounded-2xl skeleton" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)]">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-gray-200" />
            </div>
            <p className="text-sm font-semibold text-gray-500">
              {filter === "all" ? "No health events yet" : `No ${filter} events`}
            </p>
            <p className="text-xs text-gray-400 mt-1">Upload a report to start building your health timeline.</p>
          </div>
        ) : (
          <div className="relative">
            {/* Gradient vertical line */}
            <div className="absolute left-5 top-0 bottom-0 w-0.5 rounded-full"
              style={{ background: "linear-gradient(180deg,#0F766E,#06B6D4,#7C3AED,#D97706)" }} />

            <div className="space-y-8 pl-14">
              {sortedDates.map(date => (
                <div key={date}>
                  <div className="relative -ml-14 mb-4">
                    <span className="inline-block bg-white border border-gray-100 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest px-3 py-1.5 rounded-full shadow-sm ml-14">
                      {date}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {grouped[date].map((ev, idx) => (
                      <div key={ev.id} className="relative">
                        {/* Dot */}
                        <div className="absolute -left-[46px] top-4 w-4 h-4 rounded-full border-2 border-white shadow-md"
                          style={{ background: eventDotColor(ev.event_type) }} />
                        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          whileHover={{ x: 4, boxShadow: "0 8px 24px rgba(15,118,110,0.12)" }}
                          className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden">
                          <div className="h-1 w-full" style={{ background: eventGradient(ev.event_type) }} />
                          <div className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                style={{ background: eventGradient(ev.event_type) }}>
                                {eventIcon(ev.event_type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                                  <p className="font-bold text-sm text-[var(--text-primary)]">{ev.title}</p>
                                  <span className="text-xs text-gray-400 shrink-0">{formatTime(ev.event_date)}</span>
                                </div>
                                {ev.description && <p className="text-sm text-gray-500 leading-relaxed mb-2">{ev.description}</p>}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white capitalize"
                                    style={{ background: eventGradient(ev.event_type) }}>{ev.event_type}</span>
                                  {ev.event_type === "report" && ev.report_type && ev.report_type !== "Other" && (
                                    <span className="text-[10px] font-semibold text-teal-600 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded-md">{ev.report_type}</span>
                                  )}
                                  {ev.risk_level && <RiskBadge level={ev.risk_level} size="sm" />}
                                  {ev.event_type === "report" && ev.approval_status === "pending" && (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                                      Pending review
                                    </span>
                                  )}
                                  {ev.event_type === "report" && ev.approval_status === "rejected" && (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                                      See doctor&apos;s notes
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
