"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft, Star, Stethoscope, Users, CalendarCheck,
  Briefcase, Loader2, AlertCircle,
} from "lucide-react";
import Cookies from "js-cookie";
import { hospitalApi } from "@/lib/api";

const AnalyticsChart = dynamic(() => import("./_AnalyticsChart"), { ssr: false });

interface MonthlyPoint {
  month: string;
  count: number;
}

interface RecentAppointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  patient_id: string;
}

interface DoctorAnalytics {
  doctor: {
    id: string;
    name: string;
    specialty: string;
    qualification: string;
    rating: number;
    experience_years: number;
  };
  total_appointments: number;
  total_patients: number;
  monthly_breakdown: MonthlyPoint[];
  recent_appointments: RecentAppointment[];
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className="w-4 h-4"
          fill={i <= Math.round(rating) ? "#F59E0B" : "none"}
          stroke={i <= Math.round(rating) ? "#F59E0B" : "#CBD5E1"}
        />
      ))}
      <span className="text-sm font-semibold text-amber-600 ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

function statusColor(status: string) {
  switch (status) {
    case "completed": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "cancelled": return "bg-red-50 text-red-700 border-red-200";
    default: return "bg-blue-50 text-blue-700 border-blue-200";
  }
}

export default function DoctorAnalyticsPage() {
  const router = useRouter();
  const params = useParams();
  const doctorId = params?.id as string;

  const [data, setData] = useState<DoctorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) { router.push("/hospital/login"); return; }

    hospitalApi.doctorAnalytics(doctorId)
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load doctor analytics. You may not have permission."))
      .finally(() => setLoading(false));
  }, [doctorId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm text-gray-500">{error || "Doctor not found."}</p>
        <Link href="/hospital/dashboard" className="text-sm text-teal-600 hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const { doctor, total_appointments, total_patients, monthly_breakdown, recent_appointments } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link
            href="/hospital/dashboard"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-teal-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Doctor identity card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shrink-0">
              <Stethoscope className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900">Dr. {doctor.name}</h1>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200 uppercase tracking-wide">
                  {doctor.specialty}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-3">{doctor.qualification}</p>
              <div className="flex flex-wrap gap-4 items-center">
                <StarRating rating={doctor.rating} />
                <span className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Briefcase className="w-4 h-4 text-gray-400" />
                  {doctor.experience_years} yrs experience
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
                <CalendarCheck className="w-4 h-4 text-teal-600" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Appointments</p>
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-2">{total_appointments}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
                <Users className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Patients Seen</p>
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-2">{total_patients}</p>
          </div>
        </div>

        {/* Monthly chart */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-4">Appointments per Month</h2>
          <AnalyticsChart data={monthly_breakdown} />
        </div>

        {/* Recent appointments */}
        {recent_appointments.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-bold text-gray-900 mb-4">Recent Appointments</h2>
            <div className="divide-y divide-gray-50">
              {recent_appointments.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {a.appointment_date} · {a.appointment_time}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Patient ID: {a.patient_id.slice(0, 8)}…</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border capitalize ${statusColor(a.status)}`}>
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
