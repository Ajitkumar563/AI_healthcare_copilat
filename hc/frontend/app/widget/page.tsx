"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Loader2, AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { aiApi } from "@/lib/api";

interface Condition { condition: string; probability: string; description: string; }
interface SymptomResult {
  risk_level: string;
  risk_explanation: string;
  possible_conditions: Condition[];
  recommendations: string[];
  emergency: boolean;
  emergency_message: string;
}

const RISK_BADGE: Record<string, string> = {
  LOW:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  MODERATE: "bg-amber-50 text-amber-700 border-amber-200",
  HIGH:     "bg-red-50 text-red-700 border-red-200",
};

function WidgetContent() {
  const params = useSearchParams();
  const theme = params.get("theme") === "dark" ? "dark" : "light";
  const lang  = params.get("lang") || "en";

  const [symptoms, setSymptoms] = useState("");
  const [age, setAge] = useState("25");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SymptomResult | null>(null);
  const [error, setError] = useState("");

  const isDark = theme === "dark";
  const bg      = isDark ? "#1E2435" : "#FFFFFF";
  const surface = isDark ? "#2A3347" : "#F8FAFC";
  const text     = isDark ? "#E2E8F0" : "#1E293B";
  const subtext  = isDark ? "#94A3B8" : "#64748B";
  const border   = isDark ? "#3A4760" : "#E2E8F0";

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symptoms.trim()) return;
    setLoading(true); setResult(null); setError("");
    try {
      const res = await aiApi.symptoms({ symptoms, age: parseInt(age) || 25, gender: "not specified", language: lang });
      if (res.data?.result) setResult(res.data.result);
      else setError("Could not analyze symptoms. Please try again.");
    } catch {
      setError("Service unavailable. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: bg, color: text, minHeight: "100vh", padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#0F766E,#06B6D4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Brain style={{ width: 18, height: 18, color: "#fff" }} />
        </div>
        <div>
          <p style={{ fontWeight: 800, fontSize: 15, margin: 0 }}>Sahaay Symptom Checker</p>
          <p style={{ fontSize: 11, color: subtext, margin: 0 }}>Powered by AI — not a medical diagnosis</p>
        </div>
      </div>

      {/* Form */}
      {!result && (
        <form onSubmit={handleCheck} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: subtext, display: "block", marginBottom: 4 }}>Describe your symptoms</label>
            <textarea
              value={symptoms}
              onChange={e => setSymptoms(e.target.value)}
              placeholder="e.g. fever, headache, fatigue for 2 days…"
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 12,
                border: `1px solid ${border}`, background: surface, color: text, fontSize: 13,
                outline: "none", resize: "vertical",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: subtext, display: "block", marginBottom: 4 }}>Age</label>
            <input
              type="number" min={1} max={120} value={age} onChange={e => setAge(e.target.value)}
              style={{
                width: "80px", padding: "8px 12px", borderRadius: 10, border: `1px solid ${border}`,
                background: surface, color: text, fontSize: 13, outline: "none",
              }}
            />
          </div>
          {error && <p style={{ fontSize: 12, color: "#EF4444" }}>{error}</p>}
          <button
            type="submit" disabled={loading || !symptoms.trim()}
            style={{
              background: "linear-gradient(135deg,#0F766E,#06B6D4)", color: "#fff",
              border: "none", borderRadius: 12, padding: "11px 0", fontWeight: 700, fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {loading ? "Analyzing…" : "Check Symptoms"}
          </button>
        </form>
      )}

      {/* Result */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {result.emergency && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: 12 }}>
              <p style={{ color: "#DC2626", fontWeight: 700, fontSize: 13, margin: "0 0 4px 0" }}>⚠️ Seek Immediate Help</p>
              <p style={{ color: "#7F1D1D", fontSize: 12, margin: 0 }}>{result.emergency_message}</p>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Risk Level:</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
              background: result.risk_level === "LOW" ? "#D1FAE5" : result.risk_level === "HIGH" ? "#FEE2E2" : "#FEF3C7",
              color: result.risk_level === "LOW" ? "#065F46" : result.risk_level === "HIGH" ? "#7F1D1D" : "#92400E",
            }}>
              {result.risk_level}
            </span>
          </div>

          <p style={{ fontSize: 12, color: subtext, margin: 0, lineHeight: 1.5 }}>{result.risk_explanation}</p>

          {result.possible_conditions?.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, margin: "0 0 6px 0" }}>Possible Conditions</p>
              {result.possible_conditions.slice(0, 3).map((c, i) => (
                <div key={i} style={{ background: surface, border: `1px solid ${border}`, borderRadius: 10, padding: 10, marginBottom: 6 }}>
                  <p style={{ fontWeight: 600, fontSize: 12, margin: "0 0 2px 0" }}>{c.condition}</p>
                  <p style={{ fontSize: 11, color: subtext, margin: 0 }}>{c.description}</p>
                </div>
              ))}
            </div>
          )}

          {result.recommendations?.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 6px 0" }}>Recommendations</p>
              {result.recommendations.slice(0, 3).map((r, i) => (
                <p key={i} style={{ fontSize: 12, color: subtext, margin: "0 0 4px 0" }}>• {r}</p>
              ))}
            </div>
          )}

          <button
            onClick={() => { setResult(null); setSymptoms(""); }}
            style={{
              background: "transparent", border: `1px solid ${border}`, borderRadius: 10, padding: "9px 0",
              color: text, fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}
          >
            Check Again
          </button>

          <p style={{ fontSize: 10, color: subtext, margin: 0, lineHeight: 1.4 }}>
            This is not a medical diagnosis. Consult a doctor for professional advice.
          </p>
        </div>
      )}

      <div style={{ marginTop: 20, textAlign: "center" }}>
        <a href="/" style={{ fontSize: 10, color: subtext, textDecoration: "none" }}>
          Powered by Sahaay AI
        </a>
      </div>
    </div>
  );
}

export default function WidgetPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20 }}>Loading…</div>}>
      <WidgetContent />
    </Suspense>
  );
}
