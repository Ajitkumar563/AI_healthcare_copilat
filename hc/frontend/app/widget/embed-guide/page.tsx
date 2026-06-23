"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Code2, Palette, Globe, Eye } from "lucide-react";
import Navbar from "@/components/Navbar";

const BASE = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative rounded-xl bg-gray-900 text-gray-100 overflow-hidden">
      <button
        onClick={copy}
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
        title="Copy"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <pre className="p-4 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function EmbedGuidePage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [lang, setLang] = useState("en");
  const [height, setHeight] = useState("520");

  const widgetUrl = `/widget?theme=${theme}&lang=${lang}`;
  const iframeCode = `<iframe
  src="${BASE}${widgetUrl}"
  width="360"
  height="${height}"
  frameborder="0"
  style="border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.12);"
  allow="clipboard-write"
  title="Sahaay Symptom Checker"
></iframe>`;

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold gradient-text">Embeddable AI Widget</h1>
              <p className="text-sm text-gray-500">Add the Sahaay symptom checker to any website in 30 seconds</p>
            </div>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Config panel */}
          <div className="space-y-5">
            {/* Options */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-bold text-sm text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <Palette className="w-4 h-4 text-[var(--primary)]" /> Customize
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Theme</label>
                  <div className="flex gap-2">
                    {(["light", "dark"] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${theme === t ? "text-white border-transparent" : "text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                        style={theme === t ? { background: "var(--gradient-hero)" } : {}}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                    <Globe className="w-3 h-3" /> Language
                  </label>
                  <select
                    value={lang}
                    onChange={e => setLang(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                  >
                    <option value="en">English</option>
                    <option value="hi">हिंदी</option>
                    <option value="hinglish">Hinglish</option>
                    <option value="ar">العربية</option>
                    <option value="fr">Français</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Height (px)</label>
                  <input
                    type="number" min={400} max={900} value={height}
                    onChange={e => setHeight(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                  />
                </div>
              </div>
            </div>

            {/* Embed code */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-bold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[var(--primary)]" /> Embed Code
              </h2>
              <CodeBlock code={iframeCode} />
              <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                Paste this snippet anywhere in your HTML. The widget is fully self-contained — no API keys or configuration needed on your end.
              </p>
            </div>

            {/* URL parameters */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-bold text-sm text-[var(--text-primary)] mb-3">URL Parameters</h2>
              <div className="space-y-2">
                {[
                  { param: "theme", values: "light | dark", desc: "Widget color scheme" },
                  { param: "lang", values: "en | hi | hinglish | ar | fr", desc: "Response language" },
                ].map(p => (
                  <div key={p.param} className="flex items-start gap-3 p-2.5 bg-gray-50 rounded-xl">
                    <code className="text-xs font-mono font-bold text-[var(--primary)] bg-teal-50 px-2 py-0.5 rounded-md shrink-0">{p.param}</code>
                    <div>
                      <p className="text-xs font-semibold text-gray-700">{p.desc}</p>
                      <p className="text-xs text-gray-400 font-mono">{p.values}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-[var(--primary)]" />
              <span className="text-sm font-bold text-[var(--text-primary)]">Live Preview</span>
            </div>
            <div className="bg-gray-200 rounded-2xl p-3 flex justify-center">
              <iframe
                key={widgetUrl}
                src={widgetUrl}
                width="360"
                height={parseInt(height) || 520}
                className="rounded-2xl shadow-xl border-0"
                title="Widget Preview"
              />
            </div>
            <p className="text-xs text-center text-gray-400">
              This is how your embedded widget will look
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
