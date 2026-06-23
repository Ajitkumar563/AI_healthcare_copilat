"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  MessageCircle,
  History,
  Stethoscope,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Shield,
  Clock,
  Users,
  ChevronRight,
  Activity,
  Brain,
  Salad,
} from "lucide-react";

const HERO_GRADIENT = "linear-gradient(135deg, #0F766E 0%, #06B6D4 50%, #67E8F9 100%)";
const HERO_GRADIENT_DARK = "linear-gradient(135deg, #0D6961 0%, #0891B2 50%, #22D3EE 100%)";

const VITALS = [
  { label: "Vitamin D", from: 14, to: 38, unit: "ng/mL", range: "20–100", status: "Deficient → Normal" },
  { label: "Hemoglobin", from: 10.8, to: 13.2, unit: "g/dL", range: "12–17", status: "Low → Normal" },
  { label: "TSH", from: 6.4, to: 2.8, unit: "mIU/L", range: "0.4–4.0", status: "High → Normal" },
];

function VitalsCard() {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          setIndex((i) => (i + 1) % VITALS.length);
          return 0;
        }
        return p + 1.2;
      });
    }, 30);
    return () => clearInterval(tick);
  }, []);

  const v = VITALS[index];
  const value = (v.from + (v.to - v.from) * (progress / 100)).toFixed(1);
  const isImproved = progress > 60;

  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-teal-500/20 to-cyan-400/10 blur-2xl" />
      <div className="relative bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 w-full max-w-sm float-slow">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold tracking-widest uppercase text-teal-600 bg-teal-50 px-3 py-1 rounded-full">
            Live Report Reading
          </span>
          <div className="relative w-2.5 h-2.5">
            <div className="absolute inset-0 rounded-full bg-red-400 pulse-ring" />
            <div className="absolute inset-0 rounded-full bg-red-400" />
          </div>
        </div>

        <div key={index} className="count-fade">
          <div className="text-sm text-gray-500 mb-1">{v.label}</div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-5xl font-bold" style={{ background: HERO_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{value}</span>
            <span className="text-sm text-gray-400">{v.unit}</span>
          </div>

          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden mb-3">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{
                width: `${progress}%`,
                background: isImproved
                  ? HERO_GRADIENT
                  : "linear-gradient(90deg, #f97316, #ef4444)",
              }}
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Normal: {v.range}</span>
            <span className={`font-semibold flex items-center gap-1 ${isImproved ? "text-teal-600" : "text-orange-500"}`}>
              {isImproved && <CheckCircle2 className="w-4 h-4" />}
              {v.status.split(" → ")[isImproved ? 1 : 0]}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-50 flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-gray-500 leading-relaxed">
            AI explains every value in plain language — what it means, why it matters, what to do next.
          </p>
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: FileText,
    color: "bg-blue-50 text-blue-600",
    title: "Report Analyzer",
    desc: "Upload CBC, LFT, KFT, Thyroid, Vitamin panels and more. Get plain-language explanations instantly.",
    href: "/dashboard",
  },
  {
    icon: Brain,
    color: "bg-purple-50 text-purple-600",
    title: "Symptom Checker",
    desc: "Describe your symptoms. Get AI-powered analysis with possible causes and risk assessment.",
    href: "/symptoms",
  },
  {
    icon: History,
    color: "bg-teal-50 text-teal-600",
    title: "Health History",
    desc: "Every report tracked over time. See your health trends and improvements at a glance.",
    href: "/dashboard",
  },
  {
    icon: Stethoscope,
    color: "bg-green-50 text-green-600",
    title: "Doctor View",
    desc: "Your doctor sees a clean AI summary of your history, reports and risk flags — instantly.",
    href: "/doctor",
  },
  {
    icon: Salad,
    color: "bg-orange-50 text-orange-600",
    title: "Diet Planner",
    desc: "Personalized diet recommendations based on your condition, age and health goals.",
    href: "/diet",
  },
  {
    icon: Activity,
    color: "bg-red-50 text-red-600",
    title: "Clinical Notes",
    desc: "AI-generated clinical summaries for doctors — saving time and improving patient care.",
    href: "/doctor",
  },
];

const STATS = [
  { value: "8+", label: "Report Types Supported" },
  { value: "AI", label: "Powered Analysis" },
  { value: "100%", label: "Private & Secure" },
  { value: "Free", label: "To Get Started" },
];

const TRUST = [
  { icon: Shield, title: "Private & Secure", desc: "Your health data never leaves your session without your permission." },
  { icon: Clock, title: "Instant Results", desc: "Upload a report and get AI analysis in seconds — not hours." },
  { icon: Users, title: "For Patients & Doctors", desc: "Separate views for patients and healthcare providers." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Announcement bar */}
      <div className="text-white text-center text-xs py-2 px-4 font-medium" style={{ background: HERO_GRADIENT }}>
        ✨ AI Healthcare Copilot — Understand your health reports instantly. No medical degree required.
      </div>

      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: HERO_GRADIENT }}>
              <span className="text-white font-bold text-lg">+</span>
            </div>
            <div>
              <span className="font-bold text-xl" style={{ background: HERO_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Sahaay</span>
              <span className="text-xs text-gray-400 block leading-none">AI Healthcare Copilot</span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <Link href="/dashboard" className="hover:text-teal-600 transition-colors">Report Analyzer</Link>
            <Link href="/symptoms" className="hover:text-teal-600 transition-colors">Symptom Checker</Link>
            <Link href="/diet" className="hover:text-teal-600 transition-colors">Diet Plans</Link>
            <Link href="/hospital/login" className="hover:text-teal-600 transition-colors">For Doctors</Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="text-sm font-medium text-gray-600 hover:text-teal-600 transition-colors px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              Login / Signup
            </Link>
            <Link
              href="/auth/login"
              className="text-sm font-semibold text-white px-5 py-2.5 rounded-xl shadow-sm hover:opacity-90 transition-opacity"
              style={{ background: HERO_GRADIENT }}
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-white" style={{ background: HERO_GRADIENT }}>
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur text-white text-xs font-semibold px-4 py-2 rounded-full mb-6 border border-white/25">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              AI-Powered Medical Report Analysis
            </div>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
              Know Your Health.
              <br />
              <span className="text-amber-300">Before It Becomes</span>
              <br />
              A Problem.
            </h1>
            <p className="text-lg text-white/80 mb-8 max-w-md leading-relaxed">
              Upload any lab report — CBC, LFT, Thyroid, Vitamins and more. Sahaay reads it, analyzes every value, and explains what it means in simple language.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 bg-white px-7 py-3.5 rounded-xl font-bold hover:bg-amber-50 transition-all shadow-lg hover:shadow-xl group"
                style={{ color: "#0F766E" }}
              >
                Upload Your Report Free
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/hospital/login"
                className="inline-flex items-center gap-2 border border-white/30 bg-white/10 text-white px-6 py-3.5 rounded-xl font-medium hover:bg-white/20 transition-all"
              >
                For Doctors
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-8">
              {["CBC", "LFT", "KFT", "Thyroid", "Vitamin D", "Lipid Profile"].map((t) => (
                <span key={t} className="text-xs text-white bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">{t}</span>
              ))}
            </div>
          </div>
          <div className="flex justify-center md:justify-end">
            <VitalsCard />
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div
                className="text-3xl font-bold mb-1"
                style={{ background: HERO_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
              >
                {s.value}
              </div>
              <div className="text-sm text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <span className="text-xs font-semibold tracking-widest uppercase text-teal-600 bg-teal-50 px-4 py-2 rounded-full">
            Our Features
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mt-4 mb-3 text-gray-900">
            Everything You Need To Stay Informed
          </h2>
          <p className="text-gray-500 max-w-lg mx-auto">
            Six powerful tools, one goal — helping you and your doctor understand your health better.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-teal-200 hover:shadow-xl transition-all hover:-translate-y-1 group"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${f.color}`}>
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-2 text-gray-900 group-hover:text-teal-600 transition-colors">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              <div className="mt-4 flex items-center gap-1 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "#0F766E" }}>
                Try now <ArrowRight className="w-4 h-4" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-teal-50/60 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold tracking-widest uppercase text-teal-600 bg-teal-100 px-4 py-2 rounded-full">
              How It Works
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mt-4 mb-3 text-gray-900">
              Simple. Fast. Accurate.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Upload Your Report", desc: "Upload any lab report — PDF or image. We support CBC, LFT, KFT, Thyroid, Vitamin D, B12 and more.", icon: FileText },
              { step: "02", title: "AI Reads & Analyzes", desc: "Our AI engine reads every value, compares with normal ranges, and generates a detailed health summary.", icon: Brain },
              { step: "03", title: "Understand & Act", desc: "Get plain-language explanations, risk levels, diet recommendations and when to see a doctor.", icon: CheckCircle2 },
            ].map((s) => (
              <div key={s.step} className="bg-white rounded-2xl p-8 border border-teal-100 shadow-sm relative">
                <div className="absolute -top-4 left-6 text-white text-sm font-bold px-3 py-1 rounded-full shadow-sm" style={{ background: HERO_GRADIENT }}>
                  Step {s.step}
                </div>
                <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center mb-4 mt-2">
                  <s.icon className="w-6 h-6 text-teal-600" />
                </div>
                <h3 className="font-bold text-lg mb-2 text-gray-900">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Why Choose Sahaay?</h2>
          <p className="text-gray-500">Built with your privacy and health in mind.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {TRUST.map((t) => (
            <div key={t.title} className="text-center p-8 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%)" }}>
                <t.icon className="w-7 h-7 text-teal-600" />
              </div>
              <h3 className="font-bold text-lg mb-2 text-gray-900">{t.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20" style={{ background: HERO_GRADIENT }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Your Next Report Doesn&apos;t Have To Be Confusing.
          </h2>
          <p className="text-white/80 mb-8 max-w-lg mx-auto text-lg">
            Upload it now and let Sahaay break it down for you — in minutes, for free.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 bg-white px-8 py-4 rounded-xl font-bold hover:bg-amber-50 transition-all shadow-lg text-lg"
              style={{ color: "#0F766E" }}
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/hospital/login"
              className="inline-flex items-center gap-2 border-2 border-white/40 bg-white/10 text-white px-8 py-4 rounded-xl font-medium hover:bg-white/20 transition-all text-lg"
            >
              Doctor Login
              <ChevronRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: HERO_GRADIENT }}>
                  <span className="text-white font-bold">+</span>
                </div>
                <span className="font-bold text-white text-lg">Sahaay</span>
              </div>
              <p className="text-sm leading-relaxed">AI-powered healthcare copilot for patients and doctors.</p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Features</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/dashboard" className="hover:text-white transition-colors">Report Analyzer</Link></li>
                <li><Link href="/symptoms" className="hover:text-white transition-colors">Symptom Checker</Link></li>
                <li><Link href="/diet" className="hover:text-white transition-colors">Diet Planner</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">For Healthcare Providers</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/hospital/login" className="hover:text-white transition-colors">Staff Login</Link></li>
                <li><Link href="/hospital/login" className="hover:text-white transition-colors">Doctor Dashboard</Link></li>
                <li><Link href="/hospital/login" className="hover:text-white transition-colors">Patient Reports</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Quick Access</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/auth/login" className="hover:text-white transition-colors">Login / Signup</Link></li>
                <li><Link href="/profile" className="hover:text-white transition-colors">My Profile</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
            <span>© 2026 Sahaay. AI Healthcare Copilot.</span>
            <span>⚠️ Not a substitute for professional medical advice.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
