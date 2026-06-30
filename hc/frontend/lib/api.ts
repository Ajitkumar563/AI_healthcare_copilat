import axios from "axios";
import Cookies from "js-cookie";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = Cookies.get("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove("access_token");
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  sendOtp: (email: string, name?: string, role?: string) =>
    api.post("/api/auth/send-otp", { email, name, role }),

  verifyOtp: (email: string, otp_code: string) =>
    api.post("/api/auth/verify-otp", { email, otp_code }),

  me: () => api.get("/api/auth/me"),

  updateMe: (data: Record<string, unknown>) => api.put("/api/auth/me", data),
};

// ─── Reports ─────────────────────────────────────────────────────────────────

export const reportsApi = {
  upload: (file: File, familyMemberId?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (familyMemberId) form.append("family_member_id", familyMemberId);
    return api.post("/api/reports/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  list: () => api.get("/api/reports/"),

  get: (id: string) => api.get(`/api/reports/${id}`),

  saveAnalysis: (id: string, data: Record<string, unknown>) =>
    api.put(`/api/reports/${id}/analysis`, data),

  getTrends: () => api.get("/api/reports/trends"),

  delete: (id: string) => api.delete(`/api/reports/${id}`),

  importUploads: () => api.post("/api/reports/import-uploads"),

  sendWhatsApp: (reportId: string, phoneNumber: string, riskData?: object) =>
    api.post(`/api/reports/${reportId}/send-whatsapp`, { phone_number: phoneNumber, risk_data: riskData ?? null }),

  downloadPdf: (reportId: string) =>
    api.get(`/api/reports/${reportId}/download-pdf`, { responseType: "blob" }),
};

// ─── AI ──────────────────────────────────────────────────────────────────────

export const aiApi = {
  analyze: (data: Record<string, unknown>) => api.post("/api/ai/analyze", data),

  chat: (data: Record<string, unknown>) => api.post("/api/ai/chat", data),

  riskScore: (data: Record<string, unknown>) => api.post("/api/ai/risk-score", data),

  compare: (data: Record<string, unknown>) => api.post("/api/ai/compare", data),

  doctorSummary: (data: Record<string, unknown>) =>
    api.post("/api/ai/doctor-summary", data),

  soapNotes: (data: Record<string, unknown>) => api.post("/api/ai/soap-notes", data),

  prescription: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/api/ai/prescription", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  symptoms: (data: Record<string, unknown>) => api.post("/api/ai/symptoms", data),

  dietPlan: (data: Record<string, unknown>) => api.post("/api/ai/diet-plan", data),

  checkMedicineInteractions: (medicines: string[]) =>
    api.post("/api/ai/medicine-interaction", { medicines }),

  getDailyTip: () => api.get("/api/ai/daily-tip"),

  secondOpinion: (data: Record<string, unknown>) => api.post("/api/ai/second-opinion", data),

  insuranceHelper: (data: Record<string, unknown>) => api.post("/api/ai/insurance-helper", data),
};

// ─── Reminders ────────────────────────────────────────────────────────────────

export const remindersApi = {
  list: () => api.get("/api/reminders/"),

  create: (data: {
    medicine_name: string;
    dosage?: string;
    frequency?: string;
    times?: string[];
    duration?: string;
    instructions?: string;
  }) => api.post("/api/reminders/", data),

  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/api/reminders/${id}`, data),

  markTaken: (id: string) => api.post(`/api/reminders/${id}/mark-taken`),

  markMissed: (id: string) => api.post(`/api/reminders/${id}/mark-missed`),

  delete: (id: string) => api.delete(`/api/reminders/${id}`),

  resetDaily: () => api.post("/api/reminders/reset-daily"),
};

// ─── Family ──────────────────────────────────────────────────────────────────

export const familyApi = {
  list: () => api.get("/api/family/"),

  add: (data: {
    name: string;
    relationship_type?: string;
    age?: number;
    gender?: string;
    conditions?: string;
    medicines?: string;
    risk_level?: string;
    last_checkup?: string;
  }) => api.post("/api/family/", data),

  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/api/family/${id}`, data),

  delete: (id: string) => api.delete(`/api/family/${id}`),

  getComparison: () => api.get("/api/family/comparison"),

  getSummary: (id: string) => api.get(`/api/family/${id}/summary`),

  getReports: (id: string) => api.get(`/api/family/${id}/reports`),
};

// ─── Doctors & Appointments ──────────────────────────────────────────────────

export const doctorsApi = {
  list: (params?: { specialty?: string; location?: string; language?: string; search?: string }) =>
    api.get("/api/doctors/", { params }),

  get: (id: string) => api.get(`/api/doctors/${id}`),

  getSlots: (id: string, date: string) =>
    api.get(`/api/doctors/${id}/slots`, { params: { date } }),
};

export const appointmentsApi = {
  create: (data: {
    doctor_id: string;
    appointment_date: string;
    appointment_time: string;
    type: string;
    reason?: string;
  }) => api.post("/api/appointments/", data),

  list: (status?: string) =>
    api.get("/api/appointments/", { params: status ? { status } : undefined }),

  get: (id: string) => api.get(`/api/appointments/${id}`),

  cancel: (id: string) => api.put(`/api/appointments/${id}/cancel`),

  getVideoLink: (id: string) => api.get(`/api/appointments/${id}/video-link`),
};

// ─── Hospital / Admin ────────────────────────────────────────────────────────

export const hospitalApi = {
  register: (data: Record<string, unknown>) =>
    api.post("/api/hospital/register", data),

  login: (email: string, password: string) =>
    api.post("/api/hospital/login", { email, password }),

  stats: () =>
    api.get("/api/hospital/dashboard/stats"),

  doctorStats: () =>
    api.get("/api/hospital/dashboard/doctor-stats"),

  patientTrends: (id: string) =>
    api.get(`/api/hospital/patients/${id}/trends`),

  sendFollowup: (patientId: string, message: string) =>
    api.post(`/api/hospital/patients/${patientId}/followup`, { message }),

  patients: (params?: { search?: string; risk_level?: string }) =>
    api.get("/api/hospital/patients", { params }),

  patient: (id: string) =>
    api.get(`/api/hospital/patients/${id}`),

  doctors: () =>
    api.get("/api/hospital/doctors"),

  doctorAnalytics: (id: string) =>
    api.get(`/api/hospital/doctors/${id}/analytics`),

  inviteDoctor: (data: Record<string, unknown>) =>
    api.post("/api/hospital/doctors/invite", data),

  getPendingReports: () =>
    api.get("/api/hospital/reports/pending"),

  approveReport: (reportId: string, doctorNotes: string = "") =>
    api.put(`/api/hospital/reports/${reportId}/approve`, { doctor_notes: doctorNotes }),

  rejectReport: (reportId: string, doctorNotes: string) =>
    api.put(`/api/hospital/reports/${reportId}/reject`, { doctor_notes: doctorNotes }),

  bulkAnalyze: (reportIds: string[]) =>
    api.post("/api/hospital/reports/bulk-analyze", { report_ids: reportIds }),

  analytics: () =>
    api.get("/api/hospital/analytics"),

  departments: () =>
    api.get("/api/hospital/departments"),

  removeDoctor: (id: string) =>
    api.delete(`/api/hospital/doctors/${id}`),

  auditLogs: () =>
    api.get("/api/hospital/audit-logs"),
};

// ─── Patients ────────────────────────────────────────────────────────────────

export const patientsApi = {
  getProfile: () => api.get("/api/patients/me"),

  updateProfile: (data: Record<string, unknown>) => api.put("/api/patients/me", data),

  getTimeline: () => api.get("/api/patients/timeline"),

  getStats: () => api.get("/api/patients/stats"),

  getHealthScoreHistory: () => api.get("/api/patients/health-score-history"),
};

// ─── Doctor Copilot ──────────────────────────────────────────────────────────

export const copilotApi = {
  preConsultation: (patientId: string, language = "en") =>
    api.post("/api/doctor-copilot/pre-consultation", { patient_id: patientId, language }),

  suggestDiagnosis: (data: { patient_id: string; symptoms: string; report_text?: string; language?: string }) =>
    api.post("/api/doctor-copilot/suggest-diagnosis", data),

  draftPrescription: (data: { patient_id: string; diagnosis: string; symptoms?: string; language?: string }) =>
    api.post("/api/doctor-copilot/draft-prescription", data),
};

// ─── Predictive Disease Risk ──────────────────────────────────────────────────

export const predictiveApi = {
  riskForecast: () => api.post("/api/predictive/risk-forecast"),
};

// ─── Billing & Subscription ───────────────────────────────────────────────────

export const billingApi = {
  getCurrent: () => api.get("/api/billing/current"),

  upgrade: (plan: "free" | "pro" | "enterprise") =>
    api.post("/api/billing/upgrade", { plan }),
};
