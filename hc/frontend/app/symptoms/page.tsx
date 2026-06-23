"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Send,
  LogOut,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { aiApi } from "@/lib/api";
import Cookies from "js-cookie";
import { useLanguage } from "@/lib/i18n/LanguageContext";


interface Condition {
  condition: string;
  probability: string;
  description: string;
}

interface Result {
  possible_conditions: Condition[];
  risk_level: string;
  risk_explanation: string;
  follow_up_questions: string[];
  recommendations: string[];
  emergency: boolean;
  emergency_message: string;
}

export default function SymptomsPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const [userName, setUserName] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [age, setAge] = useState("25");
  const [gender, setGender] = useState("not specified");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) {
      router.push("/auth/login");
      return;
    }
    setUserName(Cookies.get("user_name") || "there");
  }, [router]);

  const handleLogout = () => {
    Cookies.remove("access_token");
    Cookies.remove("user_name");
    Cookies.remove("user_email");
    router.push("/");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symptoms.trim()) return;
    setError("");
    setLoading(true);
    setResult(null);

    try {
      const res = await aiApi.symptoms({
        symptoms,
        age: parseInt(age) || 25,
        gender,
        language,
      });
      setResult(res.data.result);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getRiskStyle = (risk: string) => {
    switch (risk?.toLowerCase()) {
      case "high":
        return { bg: "bg-[var(--coral)]/10", text: "text-[var(--coral)]", icon: ShieldAlert };
      case "medium":
        return { bg: "bg-[var(--gold)]/10", text: "text-[var(--gold)]", icon: AlertTriangle };
      default:
        return { bg: "bg-[var(--sage)]", text: "text-[var(--teal)]", icon: CheckCircle2 };
    }
  };

  const getProbabilityStyle = (prob: string) => {
    switch (prob?.toLowerCase()) {
      case "high":
        return "bg-[var(--coral)]/10 text-[var(--coral)]";
      case "medium":
        return "bg-[var(--gold)]/10 text-[var(--gold)]";
      default:
        return "bg-[var(--sage)] text-[var(--teal)]";
    }
  };

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      {/* Nav */}
      <nav className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
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

      <main className="max-w-4xl mx-auto px-6 pb-16">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-semibold mb-2">
            How are you feeling, {userName}?
          </h1>
          <p className="text-[var(--charcoal)]/55">
            Describe your symptoms in your own words. We&apos;ll help you understand what might be going on.
          </p>
        </div>

        {/* Input form */}
        <div className="bg-white rounded-3xl border border-[var(--sage)] p-6 mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--charcoal)]/70 mb-1.5">
                What&apos;s going on?
              </label>
              <textarea
                required
                rows={4}
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="e.g. I have had a fever and cough for 3 days, with body ache and mild headache..."
                className="w-full px-4 py-3 rounded-xl border border-[var(--sage)] focus:border-[var(--teal)] focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/10 transition-all text-sm resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                  className="w-full px-4 py-3 rounded-xl border border-[var(--sage)] focus:border-[var(--teal)] focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/10 transition-all text-sm"
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
            </div>

            {error && (
              <p className="text-sm text-[var(--coral)] bg-[var(--coral)]/10 px-4 py-2.5 rounded-xl">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !symptoms.trim()}
              className="w-full bg-[var(--teal)] text-[var(--cream)] py-3.5 rounded-xl font-medium hover:bg-[var(--teal-light)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Check symptoms
                </>
              )}
            </button>
          </form>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {result.emergency && (
              <div className="bg-[var(--coral)] text-white rounded-2xl p-5 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold mb-1">This may need urgent attention</p>
                  <p className="text-sm text-white/90">{result.emergency_message}</p>
                </div>
              </div>
            )}

            {/* Risk level */}
            {(() => {
              const style = getRiskStyle(result.risk_level);
              const Icon = style.icon;
              return (
                <div className={`rounded-2xl p-5 ${style.bg}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-5 h-5 ${style.text}`} />
                    <span className={`font-semibold ${style.text}`}>
                      Risk level: {result.risk_level?.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--charcoal)]/70">{result.risk_explanation}</p>
                </div>
              );
            })()}

            {/* Possible conditions */}
            <div className="bg-white rounded-3xl border border-[var(--sage)] p-6">
              <h3 className="font-display text-lg font-semibold mb-4">Possible causes</h3>
              <div className="space-y-3">
                {result.possible_conditions?.map((c, i) => (
                  <div key={i} className="border border-[var(--sage)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-medium text-sm">{c.condition}</span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getProbabilityStyle(c.probability)}`}>
                        {c.probability} likelihood
                      </span>
                    </div>
                    <p className="text-sm text-[var(--charcoal)]/65 leading-relaxed">{c.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Follow-up questions */}
            {result.follow_up_questions?.length > 0 && (
              <div className="bg-white rounded-3xl border border-[var(--sage)] p-6">
                <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-[var(--teal)]" />
                  Questions a doctor might ask
                </h3>
                <ul className="space-y-2">
                  {result.follow_up_questions.map((q, i) => (
                    <li key={i} className="text-sm text-[var(--charcoal)]/70 flex items-start gap-2">
                      <span className="text-[var(--teal)] mt-0.5">•</span>
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            <div className="bg-[var(--sage)]/40 rounded-2xl p-6">
              <h3 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[var(--teal)]" />
                What you can do
              </h3>
              <ul className="space-y-2">
                {result.recommendations?.map((r, i) => (
                  <li key={i} className="text-sm text-[var(--charcoal)]/70 flex items-start gap-2">
                    <span className="text-[var(--teal)] mt-0.5">•</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-start gap-2 text-xs text-[var(--charcoal)]/40 bg-white rounded-xl p-4 border border-[var(--sage)]">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              This is AI-generated guidance based on the information you provided. It is not a medical diagnosis. Please consult a doctor for proper evaluation.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}