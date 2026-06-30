"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, FileText, CalendarCheck, Pill, Stethoscope,
  ChevronDown, Video, MapPin, Calendar, Clock3,
  Shield, Activity,
} from "lucide-react";
import Cookies from "js-cookie";
import Navbar from "@/components/Navbar";
import { ToastContainer, useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import RiskBadge from "@/components/RiskBadge";
import { patientsApi } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TimelineMeta {
  report_type?: string;
  file_url?: string;
  risk_score?: number;
  doctor_notes?: string;
  doctor_name?: string;
  doctor_specialty?: string;
  appointment_date?: string;
  appointment_time?: string;
  type?: string;
  status?: string;
  reason?: string;
  symptoms_text?: string;
  possible_conditions?: string;
  ai_response?: string;
  times?: string[];
  duration?: string;
  missed_count?: number;
  taken_today?: boolean;
  instructions?: string;
}

interface TimelineEvent {
  id: string;
  event_type: "report" | "appointment" | "symptom" | "reminder";
  event_date: string;
  title: string;
  description?: string;
  risk_level?: string;
  approval_status?: string;
  metadata?: TimelineMeta;
}

type FilterType = "all" | "report" | "appointment" | "symptom" | "reminder";
type DateRange  = "30" | "90" | "180" | "0";

// ── Static config ─────────────────────────────────────────────────────────────

const FILTER_TABS: { label: string; value: FilterType }[] = [
  { label: "All",          value: "all"         },
  { label: "Reports",      value: "report"      },
  { label: "Appointments", value: "appointment" },
  { label: "Symptoms",     value: "symptom"     },
  { label: "Medicines",    value: "reminder"    },
];

const DATE_RANGES: { label: string; value: DateRange; days: number }[] = [
  { label: "30 days",  value: "30",  days: 30  },
  { label: "3 months", value: "90",  days: 90  },
  { label: "6 months", value: "180", days: 180 },
  { label: "All time", value: "0",   days: 0   },
];

const EVENT_STYLE: Record<string, { grad: string; dot: string; label: string }> = {
  report:      { grad: "linear-gradient(135deg,#0F766E,#06B6D4)", dot: "#0F766E", label: "Report"      },
  appointment: { grad: "linear-gradient(135deg,#2563EB,#7C3AED)", dot: "#2563EB", label: "Appointment" },
  symptom:     { grad: "linear-gradient(135deg,#7C3AED,#A78BFA)", dot: "#7C3AED", label: "Symptom"     },
  reminder:    { grad: "linear-gradient(135deg,#D97706,#F59E0B)", dot: "#D97706", label: "Medicine"    },
};

function es(type: string) {
  return EVENT_STYLE[type] ?? { grad: "linear-gradient(135deg,#64748B,#94A3B8)", dot: "#64748B", label: type };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function EventIcon({ type }: { type: string }) {
  const cls = "w-4 h-4 text-white";
  if (type === "report")      return <FileText      className={cls} />;
  if (type === "appointment") return <CalendarCheck className={cls} />;
  if (type === "symptom")     return <Stethoscope   className={cls} />;
  if (type === "reminder")    return <Pill          className={cls} />;
  return <Activity className={cls} />;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function groupByDate(events: TimelineEvent[]): Record<string, TimelineEvent[]> {
  return events.reduce<Record<string, TimelineEvent[]>>((acc, ev) => {
    const d = fmtDate(ev.event_date);
    (acc[d] ??= []).push(ev);
    return acc;
  }, {});
}

// ── Expanded detail panels ─────────────────────────────────────────────────────

function ReportDetail({ m, status }: { m: TimelineMeta; status?: string }) {
  const pending  = status === "pending";
  const rejected = status === "rejected";
  return (
    <div className="space-y-3 text-sm pt-1">
      {m.report_type && m.report_type !== "Other" && (
        <Row label="Type">
          <span className="font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md text-xs">{m.report_type}</span>
        </Row>
      )}
      {m.risk_score != null && (
        <Row label="Risk Score">
          <span className="font-bold text-gray-700">{Math.round(m.risk_score)}/100</span>
        </Row>
      )}
      {pending && (
        <p className="text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs leading-relaxed">
          Awaiting doctor review — AI summary will be visible once approved.
        </p>
      )}
      {rejected && m.doctor_notes && (
        <NoteBox color="orange" label="Doctor&apos;s Notes" text={m.doctor_notes} />
      )}
      {!pending && !rejected && m.doctor_notes && (
        <NoteBox color="teal" label="Doctor&apos;s Notes" text={m.doctor_notes} />
      )}
    </div>
  );
}

function AppointmentDetail({ m }: { m: TimelineMeta }) {
  const statusColor =
    m.status === "completed" ? "bg-green-50 text-green-600 border-green-100"
    : m.status === "cancelled" ? "bg-red-50 text-red-600 border-red-100"
    : "bg-blue-50 text-blue-600 border-blue-100";

  return (
    <div className="space-y-3 text-sm pt-1">
      {m.doctor_specialty && (
        <Row label={<Stethoscope className="w-3.5 h-3.5 text-gray-300" />}>
          <span className="text-gray-600">{m.doctor_specialty}</span>
        </Row>
      )}
      <Row label={m.type === "video" ? <Video className="w-3.5 h-3.5 text-blue-400" /> : <MapPin className="w-3.5 h-3.5 text-gray-400" />}>
        <span className="text-gray-600 capitalize">{m.type} consultation</span>
      </Row>
      {m.appointment_date && (
        <Row label={<Calendar className="w-3.5 h-3.5 text-gray-300" />}>
          <span className="text-gray-600">{m.appointment_date} at {m.appointment_time}</span>
        </Row>
      )}
      <Row label="Status">
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusColor}`}>
          {m.status?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
        </span>
      </Row>
      {m.reason && <NoteBox color="blue" label="Reason for visit" text={m.reason} />}
    </div>
  );
}

function SymptomDetail({ m }: { m: TimelineMeta }) {
  let conditions: string[] = [];
  if (m.possible_conditions) {
    try { conditions = JSON.parse(m.possible_conditions); } catch { conditions = [m.possible_conditions]; }
  }
  let recs: string[] = [];
  if (m.ai_response) {
    try { recs = JSON.parse(m.ai_response).recommendations ?? []; } catch {}
  }

  return (
    <div className="space-y-3 text-sm pt-1">
      <NoteBox color="purple" label="Symptoms described" text={m.symptoms_text ?? ""} />
      {conditions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1.5">Possible conditions</p>
          <div className="flex flex-wrap gap-1.5">
            {conditions.map((c, i) => (
              <span key={i} className="text-xs bg-purple-50 text-purple-700 border border-purple-100 px-2 py-0.5 rounded-full">{c}</span>
            ))}
          </div>
        </div>
      )}
      {recs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1.5">Recommendations</p>
          <ul className="space-y-1">
            {recs.slice(0, 3).map((r, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                <span className="text-purple-400 mt-0.5 shrink-0">•</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReminderDetail({ m }: { m: TimelineMeta }) {
  return (
    <div className="space-y-3 text-sm pt-1">
      {m.times && m.times.length > 0 && (
        <Row label={<Clock3 className="w-3.5 h-3.5 text-gray-300" />}>
          <div className="flex flex-wrap gap-1.5">
            {m.times.map((t, i) => (
              <span key={i} className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">{t}</span>
            ))}
          </div>
        </Row>
      )}
      {m.duration && (
        <Row label={<Calendar className="w-3.5 h-3.5 text-gray-300" />}>
          <span className="text-gray-600">Duration: {m.duration}</span>
        </Row>
      )}
      {m.instructions && <NoteBox color="amber" label="Instructions" text={m.instructions} />}
      <div className="flex items-center gap-2 flex-wrap">
        {m.taken_today
          ? <Chip color="green">✓ Taken today</Chip>
          : <Chip color="gray">Not taken yet today</Chip>}
        {(m.missed_count ?? 0) > 0 && (
          <Chip color="red">{m.missed_count} missed</Chip>
        )}
      </div>
    </div>
  );
}

// ── Tiny sub-components ───────────────────────────────────────────────────────

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {typeof label === "string"
        ? <span className="text-gray-400 w-20 shrink-0 text-xs">{label}</span>
        : <span className="shrink-0">{label}</span>}
      {children}
    </div>
  );
}

const NOTE_COLORS: Record<string, string> = {
  teal:   "bg-teal-50   border-teal-100   text-teal-700   [&_p]:text-teal-600",
  orange: "bg-orange-50 border-orange-100 text-orange-700 [&_p]:text-orange-600",
  blue:   "bg-blue-50   border-blue-100   text-blue-700   [&_p]:text-blue-600",
  purple: "bg-purple-50 border-purple-100 text-purple-700 [&_p]:text-purple-600",
  amber:  "bg-amber-50  border-amber-100  text-amber-700  [&_p]:text-amber-600",
};

function NoteBox({ color, label, text }: { color: string; label: string; text: string }) {
  return (
    <div className={`border rounded-xl px-3 py-2 ${NOTE_COLORS[color] ?? ""}`}>
      <p className="text-xs font-semibold mb-1" dangerouslySetInnerHTML={{ __html: label }} />
      <p className="text-xs leading-relaxed">{text}</p>
    </div>
  );
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  const cls: Record<string, string> = {
    green: "bg-green-50 text-green-600",
    gray:  "bg-gray-50  text-gray-500",
    red:   "bg-red-50   text-red-500",
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls[color] ?? ""}`}>
      {children}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();

  const [events,    setEvents]    = useState<TimelineEvent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<FilterType>("all");
  const [dateRange, setDateRange] = useState<DateRange>("0");
  const [expanded,  setExpanded]  = useState<string | null>(null);

  useEffect(() => {
    if (!Cookies.get("access_token")) { router.push("/auth/login"); return; }
    patientsApi.getTimeline()
      .then(res  => setEvents(res.data))
      .catch(()  => toast("Could not load timeline.", "error"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Client-side filtering — avoids extra round-trips; volume per user is small
  const filtered = useMemo(() => {
    let ev = filter === "all" ? events : events.filter(e => e.event_type === filter);

    const rangeDays = DATE_RANGES.find(r => r.value === dateRange)?.days ?? 0;
    if (rangeDays > 0) {
      const cutoff = Date.now() - rangeDays * 86_400_000;
      ev = ev.filter(e => new Date(e.event_date).getTime() >= cutoff);
    }

    return ev;
  }, [events, filter, dateRange]);

  const grouped    = useMemo(() => groupByDate(filtered), [filtered]);
  const sortedDays = useMemo(() =>
    Object.keys(grouped).sort((a, b) => {
      const aIso = grouped[a][0]?.event_date ?? "";
      const bIso = grouped[b][0]?.event_date ?? "";
      return bIso.localeCompare(aIso);
    }),
  [grouped]);

  const toggleExpand = (id: string) =>
    setExpanded(prev => (prev === id ? null : id));

  // Event type counts for filter tab badges
  const counts = useMemo(() => {
    const rangeDays = DATE_RANGES.find(r => r.value === dateRange)?.days ?? 0;
    const base = rangeDays > 0
      ? events.filter(e => new Date(e.event_date).getTime() >= Date.now() - rangeDays * 86_400_000)
      : events;
    return Object.fromEntries(
      FILTER_TABS.map(t => [t.value, t.value === "all" ? base.length : base.filter(e => e.event_type === t.value).length])
    );
  }, [events, dateRange]);

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <Navbar />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <PageHeader
        title="Health Timeline"
        subtitle="Your complete health history — reports, appointments, symptoms and medicines."
        icon={<Clock className="w-5 h-5" />}
      />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-5">

        {/* ── Date range pills ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          {DATE_RANGES.map(dr => (
            <button
              key={dr.value}
              onClick={() => setDateRange(dr.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                dateRange === dr.value
                  ? "text-white shadow-sm"
                  : "bg-white text-gray-500 border border-gray-200 hover:border-teal-300 hover:text-[var(--primary)]"
              }`}
              style={dateRange === dr.value ? { background: "var(--gradient-hero)" } : {}}
            >
              {dr.label}
            </button>
          ))}
        </div>

        {/* ── Event type filter pills ──────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all ${
                filter === tab.value
                  ? "text-white shadow-sm"
                  : "bg-white text-gray-500 border border-gray-200 hover:border-teal-300 hover:text-[var(--primary)]"
              }`}
              style={filter === tab.value ? { background: "var(--gradient-hero)" } : {}}
            >
              {tab.label}
              {counts[tab.value] > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                  filter === tab.value ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
                }`}>
                  {counts[tab.value]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Timeline body ────────────────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-6 pt-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-3">
                <div className="h-5 w-28 rounded-full skeleton" />
                <div className="h-28 rounded-2xl skeleton" />
                <div className="h-20 rounded-2xl skeleton" />
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
              {dateRange !== "0" && " in this period"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Upload a report or book an appointment to start building your timeline.
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Gradient vertical line */}
            <div
              className="absolute left-5 top-0 bottom-0 w-0.5 rounded-full"
              style={{ background: "linear-gradient(180deg,#0F766E,#2563EB,#7C3AED,#D97706)" }}
            />

            <div className="space-y-8 pl-14">
              {sortedDays.map(date => (
                <div key={date}>
                  {/* Date header */}
                  <div className="relative -ml-14 mb-4">
                    <span className="inline-block bg-white border border-gray-100 text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest px-3 py-1.5 rounded-full shadow-sm ml-14">
                      {date}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {grouped[date].map((ev, idx) => {
                      const style  = es(ev.event_type);
                      const isOpen = expanded === ev.id;

                      return (
                        <div key={ev.id} className="relative">
                          {/* Timeline dot */}
                          <div
                            className="absolute -left-[46px] top-5 w-4 h-4 rounded-full border-2 border-white shadow-md"
                            style={{ background: style.dot }}
                          />

                          <motion.div
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.04 }}
                            className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden"
                          >
                            {/* Top accent line */}
                            <div className="h-0.5 w-full" style={{ background: style.grad }} />

                            {/* Card header — clickable */}
                            <button
                              type="button"
                              onClick={() => toggleExpand(ev.id)}
                              className="w-full text-left px-4 py-3.5 hover:bg-gray-50/60 transition-colors"
                            >
                              <div className="flex items-start gap-3">
                                {/* Icon badge */}
                                <div
                                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                  style={{ background: style.grad }}
                                >
                                  <EventIcon type={ev.event_type} />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="font-bold text-sm text-[var(--text-primary)] leading-snug">
                                      {ev.title}
                                    </p>
                                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                      <span className="text-xs text-gray-400">{fmtTime(ev.event_date)}</span>
                                      <ChevronDown
                                        className={`w-3.5 h-3.5 text-gray-300 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                                      />
                                    </div>
                                  </div>

                                  {ev.description && (
                                    <p className="text-xs text-gray-500 leading-relaxed mt-0.5 line-clamp-2">
                                      {ev.description}
                                    </p>
                                  )}

                                  {/* Badges row */}
                                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                                    <span
                                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white capitalize"
                                      style={{ background: style.grad }}
                                    >
                                      {style.label}
                                    </span>

                                    {ev.event_type === "report" && ev.metadata?.report_type && ev.metadata.report_type !== "Other" && (
                                      <span className="text-[10px] font-semibold text-teal-600 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded-md">
                                        {ev.metadata.report_type}
                                      </span>
                                    )}

                                    {ev.risk_level && <RiskBadge level={ev.risk_level} size="sm" />}

                                    {ev.event_type === "report" && ev.approval_status === "pending" && (
                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                                        Pending review
                                      </span>
                                    )}
                                    {ev.event_type === "report" && ev.approval_status === "rejected" && (
                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100">
                                        See doctor&apos;s notes
                                      </span>
                                    )}
                                    {ev.event_type === "appointment" && ev.metadata?.type === "video" && (
                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex items-center gap-1">
                                        <Video className="w-2.5 h-2.5" /> Video
                                      </span>
                                    )}
                                    {ev.event_type === "reminder" && ev.metadata?.taken_today && (
                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-100">
                                        ✓ Taken
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </button>

                            {/* Expandable detail panel */}
                            <AnimatePresence initial={false}>
                              {isOpen && ev.metadata && (
                                <motion.div
                                  key="detail"
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.22, ease: "easeInOut" }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 pb-4 border-t border-gray-50">
                                    <div className="pt-3">
                                      {ev.event_type === "report" && (
                                        <ReportDetail m={ev.metadata} status={ev.approval_status} />
                                      )}
                                      {ev.event_type === "appointment" && (
                                        <AppointmentDetail m={ev.metadata} />
                                      )}
                                      {ev.event_type === "symptom" && (
                                        <SymptomDetail m={ev.metadata} />
                                      )}
                                      {ev.event_type === "reminder" && (
                                        <ReminderDetail m={ev.metadata} />
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary footer */}
        {!loading && filtered.length > 0 && (
          <p className="text-center text-xs text-gray-400 pt-2">
            {filtered.length} event{filtered.length !== 1 ? "s" : ""}
            {dateRange !== "0" && ` in the last ${DATE_RANGES.find(r => r.value === dateRange)?.label}`}
          </p>
        )}
      </main>
    </div>
  );
}
