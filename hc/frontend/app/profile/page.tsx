"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LogOut,
  Save,
  User,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import Cookies from "js-cookie";
import { authApi } from "@/lib/api";

export default function ProfilePage() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Profile fields
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("not specified");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [phone, setPhone] = useState("");
  const [medicalHistory, setMedicalHistory] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medicines, setMedicines] = useState("");

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) {
      router.push("/auth/login");
      return;
    }
    setUserName(Cookies.get("user_name") || "there");

    // Load profile from database
    authApi.me()
      .then((res) => {
        const u = res.data;
        setAge(u.age != null ? String(u.age) : "");
        setGender(u.gender || "not specified");
        setHeight(u.height != null ? String(u.height) : "");
        setWeight(u.weight != null ? String(u.weight) : "");
        setPhone(u.phone || "");
        setMedicalHistory(u.medical_history || "");
        setAllergies(u.allergies || "");
        setMedicines(u.current_medicines || "");
      })
      .catch(() => {
        // Fallback: try the old cookie if the API is unreachable
        const saved = Cookies.get("patient_profile");
        if (saved) {
          try {
            const p = JSON.parse(saved);
            setAge(p.age || "");
            setGender(p.gender || "not specified");
            setHeight(p.height || "");
            setWeight(p.weight || "");
            setPhone(p.phone || "");
            setMedicalHistory(p.medicalHistory || "");
            setAllergies(p.allergies || "");
            setMedicines(p.medicines || "");
          } catch {}
        }
      })
      .finally(() => setLoadingProfile(false));
  }, [router]);

  const handleLogout = () => {
    Cookies.remove("access_token");
    Cookies.remove("user_name");
    Cookies.remove("user_email");
    router.push("/");
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authApi.updateMe({
        age: age ? parseInt(age) : null,
        gender: gender || null,
        height: height ? parseFloat(height) : null,
        weight: weight ? parseFloat(weight) : null,
        phone: phone || null,
        medical_history: medicalHistory || null,
        allergies: allergies || null,
        current_medicines: medicines || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // Fallback: save to cookie so data isn't lost if API is unreachable
      Cookies.set(
        "patient_profile",
        JSON.stringify({ age, gender, height, weight, phone, medicalHistory, allergies, medicines }),
        { expires: 30 }
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      {/* Nav */}
      <nav className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--teal)] flex items-center justify-center">
            <span className="text-[var(--cream)] font-display font-semibold text-sm">+</span>
          </div>
          <span className="font-display font-semibold text-lg text-[var(--teal)]">Sahaay</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-sm text-[var(--charcoal)]/60 hover:text-[var(--teal)] transition-colors px-3 py-2"
          >
            Dashboard
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-[var(--charcoal)]/60 hover:text-[var(--coral)] transition-colors px-3 py-2 rounded-lg hover:bg-[var(--coral)]/5"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 pb-16">
        <div className="mb-8 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[var(--sage)] flex items-center justify-center">
            <User className="w-6 h-6 text-[var(--teal)]" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-semibold">
              {userName}&apos;s health profile
            </h1>
            <p className="text-[var(--charcoal)]/55">
              This helps us personalize your reports and recommendations.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className={`bg-white rounded-3xl border border-[var(--sage)] p-6 space-y-5 transition-opacity ${loadingProfile ? "opacity-60 pointer-events-none" : ""}`}>
          {/* Basic info */}
          <div>
            <h3 className="font-display text-lg font-semibold mb-3">Basic information</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--charcoal)]/70 mb-1.5">
                  Age
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 28"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--sage)] focus:border-[var(--teal)] focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/10 transition-all text-sm"
                  suppressHydrationWarning
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--charcoal)]/70 mb-1.5">
                  Gender
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--sage)] focus:border-[var(--teal)] focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/10 transition-all text-sm bg-white"
                >
                  <option value="not specified">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--charcoal)]/70 mb-1.5">
                  Height (cm)
                </label>
                <input
                  type="number"
                  min="0"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="e.g. 165"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--sage)] focus:border-[var(--teal)] focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/10 transition-all text-sm"
                  suppressHydrationWarning
                />
              </div>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--charcoal)]/70 mb-1.5">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  min="0"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="e.g. 60"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--sage)] focus:border-[var(--teal)] focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/10 transition-all text-sm"
                  suppressHydrationWarning
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--charcoal)]/70 mb-1.5">
                  Phone Number (for WhatsApp alerts)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91XXXXXXXXXX"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--sage)] focus:border-[var(--teal)] focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/10 transition-all text-sm"
                  suppressHydrationWarning
                />
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--sage)] pt-5">
            <h3 className="font-display text-lg font-semibold mb-3">Medical background</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--charcoal)]/70 mb-1.5">
                  Existing conditions / medical history
                </label>
                <textarea
                  rows={3}
                  value={medicalHistory}
                  onChange={(e) => setMedicalHistory(e.target.value)}
                  placeholder="e.g. Hypothyroidism diagnosed in 2022, mild asthma"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--sage)] focus:border-[var(--teal)] focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/10 transition-all text-sm resize-none"
                  suppressHydrationWarning
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--charcoal)]/70 mb-1.5">
                  Allergies
                </label>
                <input
                  type="text"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="e.g. Penicillin, peanuts"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--sage)] focus:border-[var(--teal)] focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/10 transition-all text-sm"
                  suppressHydrationWarning
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--charcoal)]/70 mb-1.5">
                  Current medicines
                </label>
                <input
                  type="text"
                  value={medicines}
                  onChange={(e) => setMedicines(e.target.value)}
                  placeholder="e.g. Thyroxine 50mcg daily"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--sage)] focus:border-[var(--teal)] focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/10 transition-all text-sm"
                  suppressHydrationWarning
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[var(--teal)] text-[var(--cream)] py-3.5 rounded-xl font-medium hover:bg-[var(--teal-light)] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : saved ? (
              <><CheckCircle2 className="w-4 h-4" /> Saved!</>
            ) : (
              <><Save className="w-4 h-4" /> Save profile</>
            )}
          </button>
        </form>
      </main>
    </div>
  );
}