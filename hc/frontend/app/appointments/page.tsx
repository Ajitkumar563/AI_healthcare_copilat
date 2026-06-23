"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Star, MapPin, Globe, Clock, IndianRupee, Calendar,
  Video, Building2, ChevronLeft, ChevronRight, CheckCircle2,
  Loader2, X, AlertTriangle, ExternalLink, XCircle,
  Stethoscope, CalendarCheck,
} from "lucide-react";
import Cookies from "js-cookie";
import Navbar from "@/components/Navbar";
import { ToastContainer, useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { doctorsApi, appointmentsApi } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  qualification: string;
  experience_years: number;
  rating: number;
  consultation_fee: number;
  languages: string;
  location: string;
  avatar_seed: string;
  bio?: string;
  available_days: string;
  slot_duration_minutes: number;
  start_time: string;
  end_time: string;
}

interface Slot {
  time: string;
  available: boolean;
}

interface Appointment {
  id: string;
  doctor_id: string;
  doctor?: Doctor;
  appointment_date: string;
  appointment_time: string;
  type: string;
  status: string;
  reason?: string;
  video_room_id?: string;
  video_url?: string;
  created_at: string;
}

const SPECIALTIES = [
  "All",
  "General Physician",
  "Cardiologist",
  "Endocrinologist",
  "Hepatologist",
  "Dermatologist",
  "Pediatrician",
  "Gynecologist",
  "Orthopedic",
  "Neurologist",
  "Pulmonologist",
];

const APPT_STATUS_TABS = [
  { value: "upcoming",  label: "Upcoming"  },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDisplayDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function getNext14Days(): Date[] {
  const days: Date[] = [];
  const today = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0]; // "YYYY-MM-DD"
}

function isDayAvailable(d: Date, availableDays: string) {
  const dayName = d.toLocaleDateString("en-US", { weekday: "short" }); // "Mon", "Tue"…
  return availableDays.split(",").map(s => s.trim()).includes(dayName);
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`w-3 h-3 ${i <= Math.round(rating) ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}`}
        />
      ))}
      <span className="text-xs text-gray-500 ml-1">{rating.toFixed(1)}</span>
    </span>
  );
}

function Avatar({ seed, size = "md" }: { seed: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-9 h-9 text-sm", md: "w-12 h-12 text-base", lg: "w-16 h-16 text-xl" };
  return (
    <div
      className={`${sizes[size]} rounded-2xl flex items-center justify-center text-white font-bold shrink-0`}
      style={{ background: "var(--gradient-hero)" }}
    >
      {seed}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    upcoming:  "bg-teal-50  text-teal-700  border-teal-200",
    completed: "bg-blue-50  text-blue-700  border-blue-200",
    cancelled: "bg-red-50   text-red-600   border-red-200",
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${styles[status] ?? styles.upcoming}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return type === "video"
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200"><Video className="w-3 h-3" />Video</span>
    : <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200"><Building2 className="w-3 h-3" />In-Person</span>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();

  // Tab
  const [activeTab, setActiveTab] = useState<"find" | "mine">("find");

  // Doctor list
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSpecialty, setFilterSpecialty] = useState("All");

  // Booking drawer
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [consultType, setConsultType] = useState<"video" | "in-person">("video");
  const [reason, setReason] = useState("");
  const [booking, setBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<Appointment | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null); // appointment id

  // My appointments
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [apptStatus, setApptStatus] = useState<"upcoming" | "completed" | "cancelled">("upcoming");

  // Auth guard
  useEffect(() => {
    if (!Cookies.get("access_token")) router.push("/auth/login");
  }, [router]);

  // Load doctors
  const fetchDoctors = useCallback(async () => {
    setLoadingDoctors(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterSpecialty !== "All") params.specialty = filterSpecialty;
      const res = await doctorsApi.list(params);
      setDoctors(res.data || []);
    } catch {
      toast("Could not load doctors.", "error");
    } finally {
      setLoadingDoctors(false);
    }
  }, [search, filterSpecialty]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchDoctors(); }, [fetchDoctors]);

  // Load my appointments when tab is active
  const fetchMyAppointments = useCallback(async () => {
    setLoadingMine(true);
    try {
      const res = await appointmentsApi.list(apptStatus);
      setMyAppointments(res.data || []);
    } catch {
      toast("Could not load appointments.", "error");
    } finally {
      setLoadingMine(false);
    }
  }, [apptStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === "mine") fetchMyAppointments();
  }, [activeTab, fetchMyAppointments]);

  // Fetch slots when date changes in booking drawer
  useEffect(() => {
    if (!selectedDoctor || !selectedDate) return;
    const fetch = async () => {
      setLoadingSlots(true);
      setSlots([]);
      setSelectedSlot("");
      try {
        const res = await doctorsApi.getSlots(selectedDoctor.id, selectedDate);
        setSlots(res.data?.slots || []);
      } catch {
        toast("Could not load slots.", "error");
      } finally {
        setLoadingSlots(false);
      }
    };
    fetch();
  }, [selectedDoctor, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const openBooking = (doctor: Doctor) => {
    setSelectedDoctor(doctor);
    setSelectedDate("");
    setSlots([]);
    setSelectedSlot("");
    setConsultType("video");
    setReason("");
    setBookingSuccess(null);
    setShowBooking(true);
  };

  const closeBooking = () => {
    setShowBooking(false);
    setTimeout(() => { setSelectedDoctor(null); setBookingSuccess(null); }, 300);
  };

  const handleBook = async () => {
    if (!selectedDoctor || !selectedDate || !selectedSlot) return;
    setBooking(true);
    try {
      const res = await appointmentsApi.create({
        doctor_id: selectedDoctor.id,
        appointment_date: selectedDate,
        appointment_time: selectedSlot,
        type: consultType,
        reason: reason.trim() || undefined,
      });
      setBookingSuccess(res.data);
      toast("Appointment booked successfully!", "success");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast(e.response?.data?.detail || "Booking failed. Please try again.", "error");
    } finally {
      setBooking(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await appointmentsApi.cancel(id);
      toast("Appointment cancelled.", "success");
      setConfirmCancel(null);
      fetchMyAppointments();
    } catch {
      toast("Could not cancel appointment.", "error");
    }
  };

  const next14 = getNext14Days();

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <Navbar />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <PageHeader
        title="Book Appointment"
        subtitle="Find doctors by specialty, check availability, and book instantly."
        icon={<CalendarCheck className="w-5 h-5" />}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-20">

        {/* Tab bar */}
        <div className="flex gap-1 bg-white border border-gray-100 rounded-2xl p-1 shadow-[var(--shadow-sm)] mb-6 w-fit">
          {[
            { value: "find", label: "Find a Doctor" },
            { value: "mine", label: "My Appointments" },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value as "find" | "mine")}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.value
                  ? "text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              style={activeTab === tab.value ? { background: "var(--gradient-hero)" } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── Tab: Find a Doctor ── */}
          {activeTab === "find" && (
            <motion.div key="find" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* Search + filter */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] p-4 mb-6">
                <div className="flex gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search by doctor name…"
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                    />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {SPECIALTIES.map(s => (
                    <button
                      key={s}
                      onClick={() => setFilterSpecialty(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        filterSpecialty === s
                          ? "border-transparent text-white"
                          : "border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-600"
                      }`}
                      style={filterSpecialty === s ? { background: "var(--gradient-hero)" } : {}}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Doctor grid */}
              {loadingDoctors ? (
                <div className="flex justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
                </div>
              ) : doctors.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                  <Stethoscope className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No doctors found</p>
                  <p className="text-sm text-gray-400 mt-1">Try a different specialty or search term</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {doctors.map((doctor, i) => (
                    <motion.div
                      key={doctor.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
                    >
                      <div className="h-1 w-full" style={{ background: "var(--gradient-hero)" }} />
                      <div className="p-5">
                        <div className="flex items-start gap-3 mb-3">
                          <Avatar seed={doctor.avatar_seed} size="md" />
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-[var(--text-primary)] text-sm leading-tight">{doctor.name}</h3>
                            <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-1 text-white"
                              style={{ background: "var(--gradient-hero)" }}>
                              {doctor.specialty}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-gray-500 mb-2">{doctor.qualification}</p>
                        <StarRating rating={doctor.rating} />

                        <div className="mt-3 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Clock className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                            {doctor.experience_years} years experience
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <MapPin className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                            {doctor.location}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Globe className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                            {doctor.languages}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700">
                            <IndianRupee className="w-3.5 h-3.5 shrink-0" />
                            ₹{doctor.consultation_fee} per consultation
                          </div>
                        </div>

                        {doctor.bio && (
                          <p className="text-xs text-gray-400 mt-3 leading-relaxed line-clamp-2">{doctor.bio}</p>
                        )}

                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => openBooking(doctor)}
                          className="w-full gradient-btn py-2.5 rounded-xl font-semibold text-sm mt-4 flex items-center justify-center gap-2"
                        >
                          <Calendar className="w-4 h-4" />
                          Book Appointment
                        </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Tab: My Appointments ── */}
          {activeTab === "mine" && (
            <motion.div key="mine" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* Status filter */}
              <div className="flex gap-1 bg-white border border-gray-100 rounded-2xl p-1 shadow-[var(--shadow-sm)] mb-6 w-fit">
                {APPT_STATUS_TABS.map(tab => (
                  <button
                    key={tab.value}
                    onClick={() => setApptStatus(tab.value)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      apptStatus === tab.value
                        ? "text-white shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                    style={apptStatus === tab.value ? { background: "var(--gradient-hero)" } : {}}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {loadingMine ? (
                <div className="flex justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
                </div>
              ) : myAppointments.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                  <CalendarCheck className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No {apptStatus} appointments</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {apptStatus === "upcoming"
                      ? "Book an appointment from the Find a Doctor tab."
                      : "Nothing to show here yet."}
                  </p>
                  {apptStatus === "upcoming" && (
                    <button
                      onClick={() => setActiveTab("find")}
                      className="mt-4 gradient-btn px-5 py-2.5 rounded-xl text-sm font-semibold"
                    >
                      Find a Doctor
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {myAppointments.map((appt, i) => (
                    <motion.div
                      key={appt.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="bg-white rounded-2xl border border-gray-100 shadow-[var(--shadow-sm)] p-5"
                    >
                      <div className="flex items-start gap-4">
                        {appt.doctor && <Avatar seed={appt.doctor.avatar_seed} size="md" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                              <h3 className="font-bold text-[var(--text-primary)]">
                                {appt.doctor?.name ?? "Doctor"}
                              </h3>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {appt.doctor?.specialty}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <TypeBadge type={appt.type} />
                              <StatusBadge status={appt.status} />
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-teal-500" />
                              {formatDisplayDate(appt.appointment_date)}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-teal-500" />
                              {appt.appointment_time}
                            </span>
                          </div>

                          {appt.reason && (
                            <p className="mt-2 text-xs text-gray-400 italic">&quot;{appt.reason}&quot;</p>
                          )}

                          {appt.status === "upcoming" && (
                            <div className="mt-4 flex gap-2 flex-wrap">
                              {appt.type === "video" && appt.video_url && (
                                <a
                                  href={appt.video_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 gradient-btn px-4 py-2 rounded-xl text-xs font-semibold"
                                >
                                  <Video className="w-3.5 h-3.5" />
                                  Join Video Call
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                              <button
                                onClick={() => setConfirmCancel(appt.id)}
                                className="inline-flex items-center gap-1.5 border border-red-200 text-red-500 hover:bg-red-50 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Booking Drawer ── */}
      <AnimatePresence>
        {showBooking && selectedDoctor && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={closeBooking}
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 shadow-2xl overflow-y-auto"
            >
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 z-10">
                <button onClick={closeBooking} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
                  <ChevronLeft className="w-5 h-5 text-gray-500" />
                </button>
                <h2 className="font-bold text-[var(--text-primary)]">
                  {bookingSuccess ? "Booking Confirmed!" : "Book Appointment"}
                </h2>
              </div>

              <div className="p-5 space-y-6">

                {/* Success state */}
                {bookingSuccess ? (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
                    <div className="text-center py-6">
                      <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
                        <CheckCircle2 className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1">Appointment Booked!</h3>
                      <p className="text-sm text-gray-500">Your appointment has been confirmed.</p>
                    </div>

                    <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <Avatar seed={selectedDoctor.avatar_seed} size="sm" />
                        <div>
                          <p className="font-bold text-sm text-[var(--text-primary)]">{selectedDoctor.name}</p>
                          <p className="text-xs text-gray-500">{selectedDoctor.specialty}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-teal-500" />{formatDisplayDate(bookingSuccess.appointment_date)}</span>
                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-teal-500" />{bookingSuccess.appointment_time}</span>
                      </div>
                      <div className="flex gap-2">
                        <TypeBadge type={bookingSuccess.type} />
                        <StatusBadge status={bookingSuccess.status} />
                      </div>
                    </div>

                    {bookingSuccess.video_url && (
                      <a
                        href={bookingSuccess.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 gradient-btn py-3 rounded-xl font-semibold text-sm w-full"
                      >
                        <Video className="w-4 h-4" /> Join Video Call <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}

                    <button
                      onClick={() => { setActiveTab("mine"); closeBooking(); }}
                      className="w-full border border-gray-200 text-gray-600 hover:bg-gray-50 py-3 rounded-xl font-semibold text-sm transition-all"
                    >
                      View My Appointments
                    </button>
                  </motion.div>
                ) : (
                  <>
                    {/* Doctor summary */}
                    <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-3 border border-gray-100">
                      <Avatar seed={selectedDoctor.avatar_seed} size="md" />
                      <div>
                        <p className="font-bold text-[var(--text-primary)]">{selectedDoctor.name}</p>
                        <p className="text-sm text-gray-500">{selectedDoctor.specialty}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <StarRating rating={selectedDoctor.rating} />
                          <span className="text-xs text-teal-600 font-semibold">₹{selectedDoctor.consultation_fee}</span>
                        </div>
                      </div>
                    </div>

                    {/* Consultation type */}
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Consultation Type</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(["video", "in-person"] as const).map(type => (
                          <button
                            key={type}
                            onClick={() => setConsultType(type)}
                            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                              consultType === type
                                ? "border-transparent text-white"
                                : "border-gray-200 text-gray-600 hover:border-teal-300"
                            }`}
                            style={consultType === type ? { background: "var(--gradient-hero)" } : {}}
                          >
                            {type === "video" ? <Video className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                            {type === "video" ? "Video Call" : "In-Person"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Date picker */}
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Select Date</p>
                      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                        {next14.map(d => {
                          const dateStr = toDateStr(d);
                          const available = isDayAvailable(d, selectedDoctor.available_days);
                          const selected = dateStr === selectedDate;
                          return (
                            <button
                              key={dateStr}
                              disabled={!available}
                              onClick={() => setSelectedDate(dateStr)}
                              className={`flex flex-col items-center px-3 py-2.5 rounded-xl border shrink-0 text-xs font-semibold transition-all ${
                                !available
                                  ? "border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed"
                                  : selected
                                  ? "border-transparent text-white"
                                  : "border-gray-200 text-gray-600 hover:border-teal-300 hover:bg-teal-50/40"
                              }`}
                              style={selected && available ? { background: "var(--gradient-hero)" } : {}}
                            >
                              <span className="text-[10px] uppercase tracking-wide opacity-70">
                                {d.toLocaleDateString("en-US", { weekday: "short" })}
                              </span>
                              <span className="text-base font-bold leading-tight">{d.getDate()}</span>
                              <span className="text-[10px] opacity-70">
                                {d.toLocaleDateString("en-US", { month: "short" })}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {selectedDate && (
                        <p className="text-xs text-gray-400 mt-1">
                          Available days: {selectedDoctor.available_days}
                        </p>
                      )}
                    </div>

                    {/* Slot picker */}
                    {selectedDate && (
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Select Time Slot</p>
                        {loadingSlots ? (
                          <div className="flex justify-center py-6">
                            <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                          </div>
                        ) : slots.length === 0 ? (
                          <div className="text-center py-6 bg-gray-50 rounded-xl border border-gray-100">
                            <p className="text-sm text-gray-500">No slots available on this date.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {slots.map(slot => (
                              <button
                                key={slot.time}
                                disabled={!slot.available}
                                onClick={() => setSelectedSlot(slot.time)}
                                className={`py-2 rounded-xl border text-xs font-semibold transition-all ${
                                  !slot.available
                                    ? "border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed line-through"
                                    : selectedSlot === slot.time
                                    ? "border-transparent text-white"
                                    : "border-gray-200 text-gray-600 hover:border-teal-300 hover:bg-teal-50/40"
                                }`}
                                style={selectedSlot === slot.time && slot.available ? { background: "var(--gradient-hero)" } : {}}
                              >
                                {slot.time}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reason */}
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                        Reason for Visit <span className="normal-case font-normal text-gray-400">(optional)</span>
                      </p>
                      <textarea
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="Briefly describe your symptoms or reason for visit…"
                        rows={3}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                      />
                    </div>

                    {/* Confirm button */}
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleBook}
                      disabled={!selectedDate || !selectedSlot || booking}
                      className="w-full gradient-btn py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {booking
                        ? <><Loader2 className="w-4 h-4 animate-spin" />Booking…</>
                        : <><CalendarCheck className="w-4 h-4" />Confirm Booking</>
                      }
                    </motion.button>

                    {(!selectedDate || !selectedSlot) && (
                      <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {!selectedDate ? "Select a date to see available slots" : "Select a time slot to continue"}
                      </p>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Cancel Confirm Dialog ── */}
      <AnimatePresence>
        {confirmCancel && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50"
              onClick={() => setConfirmCancel(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--text-primary)]">Cancel Appointment?</h3>
                  <p className="text-sm text-gray-500 mt-1">This action cannot be undone. The slot will be released.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmCancel(null)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-all"
                >
                  Keep Appointment
                </button>
                <button
                  onClick={() => handleCancel(confirmCancel)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-1.5"
                >
                  <X className="w-4 h-4" /> Yes, Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
