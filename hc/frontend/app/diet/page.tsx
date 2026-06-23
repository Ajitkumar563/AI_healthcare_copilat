"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Salad,
  LogOut,
  Loader2,
  Droplets,
  Activity,
  XCircle,
  Sun,
  Sandwich,
  Moon,
  Apple,
} from "lucide-react";
import { aiApi } from "@/lib/api";
import Cookies from "js-cookie";
import { useLanguage } from "@/lib/i18n/LanguageContext";


interface DietPlan {
  summary: string;
  breakfast: string[];
  lunch: string[];
  dinner: string[];
  snacks: string[];
  water_intake: string;
  exercise: string;
  foods_to_avoid: string[];
}

const CONDITIONS = [
  "Vitamin D Deficiency",
  "Anemia",
  "Diabetes",
  "Thyroid (Hypothyroidism)",
  "High Cholesterol",
  "Fatty Liver",
  "Obesity / Weight Management",
];

export default function DietPlanPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const [userName, setUserName] = useState("");
  const [condition, setCondition] = useState(CONDITIONS[0]);
  const [age, setAge] = useState("25");
  const [weight, setWeight] = useState("60");
  const [activity, setActivity] = useState("moderate");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<DietPlan | null>(null);
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
    setError("");
    setLoading(true);
    setPlan(null);
    try {
      const res = await aiApi.dietPlan({
        condition,
        age: parseInt(age) || 25,
        weight: parseFloat(weight) || 60,
        activity_level: activity,
        language,
      });
      setPlan(res.data.plan);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const MealCard = ({
    icon: Icon,
    title,
    items,
  }: {
    icon: typeof Sun;
    title: string;
    items: string[];
  }) => (
    <div className="border border-[var(--sage)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--sage)] flex items-center justify-center">
          <Icon className="w-4 h-4 text-[var(--teal)]" />
        </div>
        <h4 className="font-medium text-sm">{title}</h4>
      </div>
      <ul className="space-y-1.5">
        {items?.map((item, i) => (
          <li key={i} className="text-sm text-[var(--charcoal)]/65 flex items-start gap-2">
            <span className="text-[var(--teal)] mt-0.5">•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );

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
            Diet & lifestyle plan, {userName}
          </h1>
          <p className="text-[var(--charcoal)]/55">
            Tell us a bit about your condition and we&apos;ll suggest a simple daily plan.
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-3xl border border-[var(--sage)] p-6 mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--charcoal)]/70 mb-1.5">
                Condition / focus area
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[var(--sage)] focus:border-[var(--teal)] focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/10 transition-all text-sm bg-white"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-4">
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
                  Weight (kg)
                </label>
                <input
                  type="number"
                  min="0"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--sage)] focus:border-[var(--teal)] focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/10 transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--charcoal)]/70 mb-1.5">
                  Activity level
                </label>
                <select
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--sage)] focus:border-[var(--teal)] focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/10 transition-all text-sm bg-white"
                >
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
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
              disabled={loading}
              className="w-full bg-[var(--teal)] text-[var(--cream)] py-3.5 rounded-xl font-medium hover:bg-[var(--teal-light)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating plan...
                </>
              ) : (
                <>
                  <Salad className="w-4 h-4" /> Get my diet plan
                </>
              )}
            </button>
          </form>
        </div>

        {/* Results */}
        {plan && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--charcoal)]/70 leading-relaxed bg-[var(--sage)]/40 rounded-2xl p-5">
              {plan.summary}
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              <MealCard icon={Sun} title="Breakfast" items={plan.breakfast} />
              <MealCard icon={Sandwich} title="Lunch" items={plan.lunch} />
              <MealCard icon={Moon} title="Dinner" items={plan.dinner} />
              <MealCard icon={Apple} title="Snacks" items={plan.snacks} />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-[var(--sage)] p-5 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--sage)] flex items-center justify-center shrink-0">
                  <Droplets className="w-5 h-5 text-[var(--teal)]" />
                </div>
                <div>
                  <h4 className="font-medium text-sm mb-1">Water intake</h4>
                  <p className="text-sm text-[var(--charcoal)]/65">{plan.water_intake}</p>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-[var(--sage)] p-5 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--sage)] flex items-center justify-center shrink-0">
                  <Activity className="w-5 h-5 text-[var(--teal)]" />
                </div>
                <div>
                  <h4 className="font-medium text-sm mb-1">Exercise</h4>
                  <p className="text-sm text-[var(--charcoal)]/65">{plan.exercise}</p>
                </div>
              </div>
            </div>

            <div className="bg-[var(--coral)]/5 rounded-2xl p-5">
              <h4 className="font-medium text-sm mb-3 flex items-center gap-2 text-[var(--coral)]">
                <XCircle className="w-4 h-4" />
                Foods to limit or avoid
              </h4>
              <div className="flex flex-wrap gap-2">
                {plan.foods_to_avoid?.map((f, i) => (
                  <span
                    key={i}
                    className="text-sm bg-white px-3 py-1.5 rounded-full text-[var(--charcoal)]/70 border border-[var(--sage)]"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}