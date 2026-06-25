"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Pill, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";
import Cookies from "js-cookie";
import { remindersApi, appointmentsApi, reportsApi } from "@/lib/api";

// ── localStorage read-state helpers ──────────────────────────────────────────

const STORAGE_KEY = "sahaay_read_notifications";

function getReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {}
}

// ── Types ─────────────────────────────────────────────────────────────────────

type NotifType = "medicine" | "appointment" | "alert" | "info";

interface Notification {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  route: string;
  urgent: boolean;
}

// Backend shapes (minimal — only fields we actually use)
interface ReminderRow {
  id: string;
  medicine_name: string;
  dosage?: string;
  taken_today?: boolean;
  active?: boolean;
}

interface AppointmentRow {
  id: string;
  doctor_name?: string;
  doctor?: { name?: string };
  appointment_date: string;
  appointment_time: string;
  status: string;
}

interface ReportRow {
  id: string;
  file_name?: string;
  report_type?: string;
  risk_level?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NotificationsCenter() {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [fetching, setFetching] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!Cookies.get("access_token")) return;
    setFetching(true);
    const notifs: Notification[] = [];

    // 1 ── Medicine reminders not yet taken today
    try {
      const res = await remindersApi.list();
      (res.data as ReminderRow[])
        .filter((r) => r.active !== false && !r.taken_today)
        .forEach((r) => {
          notifs.push({
            id: `reminder_${r.id}`,
            type: "medicine",
            title: "Medicine Reminder",
            message: `Time to take ${r.medicine_name}${r.dosage ? ` ${r.dosage}` : ""}`,
            route: "/reminders",
            urgent: false,
          });
        });
    } catch {}

    // 2 ── Appointments within the next 24 hours
    try {
      const res = await appointmentsApi.list("upcoming");
      const now = Date.now();
      const in24h = now + 24 * 60 * 60 * 1000;
      (res.data as AppointmentRow[]).forEach((a) => {
        const ts = new Date(`${a.appointment_date}T${a.appointment_time}`).getTime();
        if (ts >= now && ts <= in24h) {
          const doctorName = a.doctor_name ?? a.doctor?.name ?? "your doctor";
          const isToday =
            new Date(ts).toDateString() === new Date(now).toDateString();
          const timeStr = new Date(ts).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          });
          notifs.push({
            id: `apt_${a.id}`,
            type: "appointment",
            title: isToday ? "Appointment Today" : "Appointment Tomorrow",
            message: `Appointment with ${doctorName} ${isToday ? "TODAY" : "tomorrow"} at ${timeStr}`,
            route: "/appointments",
            urgent: isToday,
          });
        }
      });
    } catch {}

    // 3 ── High / Critical risk reports
    try {
      const res = await reportsApi.list();
      (res.data as ReportRow[])
        .filter((r) => r.risk_level === "Critical" || r.risk_level === "High")
        .forEach((r) => {
          notifs.push({
            id: `alert_${r.id}`,
            type: "alert",
            title: "Health Alert",
            message: `${r.file_name || r.report_type || "Report"} shows ${r.risk_level} risk — consult your doctor`,
            route: "/dashboard",
            urgent: r.risk_level === "Critical",
          });
        });
    } catch {}

    if (notifs.length === 0) {
      notifs.push({
        id: "welcome",
        type: "info",
        title: "Welcome to Sahaay! 🎉",
        message: "Upload your first report to get AI-powered health insights",
        route: "/dashboard",
        urgent: false,
      });
    }
    setNotifications(notifs);
    setReadIds(getReadIds());
    setFetching(false);
  }, []);

  // Load on mount + auto-refresh every 5 minutes
  useEffect(() => {
    loadNotifications();
    const iv = setInterval(loadNotifications, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [loadNotifications]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = notifications.filter((n) => !readIds.has(n.id)).length;

  const handleClick = (n: Notification) => {
    const next = new Set(readIds);
    next.add(n.id);
    persistReadIds(next);
    setReadIds(next);
    setOpen(false);
    router.push(n.route);
  };

  const markAllRead = () => {
    const next = new Set(readIds);
    notifications.forEach((n) => next.add(n.id));
    persistReadIds(next);
    setReadIds(next);
  };

  // ── Icon + colour maps ────────────────────────────────────────────────────
  const ICON: Record<NotifType, React.ReactNode> = {
    medicine:    <Pill className="w-4 h-4 text-teal-600" />,
    appointment: <Calendar className="w-4 h-4 text-blue-500" />,
    alert:       <AlertTriangle className="w-4 h-4 text-red-500" />,
    info:        <CheckCircle2 className="w-4 h-4 text-teal-500" />,
  };
  const ICON_BG: Record<NotifType, string> = {
    medicine:    "bg-teal-50",
    appointment: "bg-blue-50",
    alert:       "bg-red-50",
    info:        "bg-teal-50",
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className="relative flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white hover:border-teal-300 hover:bg-teal-50/40 transition-all"
      >
        <Bell className="w-4 h-4 text-gray-500" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-gray-100 shadow-xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[var(--primary)]" />
                <span className="font-bold text-sm text-gray-800">Notifications</span>
                {unread > 0 && (
                  <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full leading-none">
                    {unread}
                  </span>
                )}
              </div>
              <button
                onClick={markAllRead}
                className="text-[11px] font-semibold text-[var(--primary)] hover:underline"
              >
                Mark all read
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
              {fetching ? (
                <div className="py-10 flex justify-center">
                  <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-10 text-center px-4">
                  <CheckCircle2 className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 font-medium">No new notifications</p>
                  <p className="text-xs text-gray-300 mt-0.5">You&apos;re all caught up</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {notifications.map((n) => {
                    const isRead = readIds.has(n.id);
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-all hover:bg-gray-50 ${
                          !isRead ? "bg-teal-50/25" : ""
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${ICON_BG[n.type]}`}
                        >
                          {ICON[n.type]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p
                              className={`text-xs font-bold truncate ${
                                n.urgent ? "text-red-600" : "text-gray-700"
                              }`}
                            >
                              {n.title}
                            </p>
                            {!isRead && (
                              <span className="w-1.5 h-1.5 bg-teal-500 rounded-full shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                            {n.message}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
