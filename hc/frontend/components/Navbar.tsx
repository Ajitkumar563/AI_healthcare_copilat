"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { LogOut, Menu, X, Globe } from "lucide-react";
import Cookies from "js-cookie";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { Language, TranslationKey } from "@/lib/i18n/translations";
import NotificationsCenter from "@/components/NotificationsCenter";

const NAV_LINKS: { href: string; tkey: TranslationKey }[] = [
  { href: "/dashboard",         tkey: "nav_dashboard"        },
  { href: "/chat",              tkey: "nav_chat"             },
  { href: "/compare",           tkey: "nav_compare"          },
  { href: "/trends",            tkey: "nav_trends"           },
  { href: "/appointments",      tkey: "nav_appointments"     },
  { href: "/reminders",         tkey: "nav_reminders"        },
  { href: "/medicine-checker",  tkey: "nav_medicine_checker" },
  { href: "/timeline",          tkey: "nav_timeline"         },
  { href: "/predictive",        tkey: "nav_predictive"       },
  { href: "/family",            tkey: "nav_family"           },
  { href: "/doctor",            tkey: "nav_doctorView"       },
  { href: "/insurance",         tkey: "nav_insurance"        },
];

const LANGUAGES: { code: Language; flag: string; label: string }[] = [
  { code: "en",       flag: "🇬🇧", label: "English"  },
  { code: "hi",       flag: "🇮🇳", label: "हिंदी"     },
  { code: "hinglish", flag: "🇮🇳", label: "Hinglish" },
  { code: "ar",       flag: "🇸🇦", label: "العربية"  },
  { code: "es",       flag: "🇪🇸", label: "Español"  },
  { code: "fr",       flag: "🇫🇷", label: "Français" },
];

export default function Navbar({ userName }: { userName?: string }) {
  const pathname  = usePathname();
  const router    = useRouter();
  const { t, language, setLanguage } = useLanguage();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen,   setLangOpen]   = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  // Name — cookie-safe: hydrate after mount to avoid SSR mismatch
  const [name, setName] = useState(userName || "");
  useEffect(() => {
    if (!userName) setName(Cookies.get("user_name") || "");
  }, [userName]);

  // Close language dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = name
    ? name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()
    : "U";

  const handleLogout = () => {
    Cookies.remove("access_token");
    Cookies.remove("user_name");
    Cookies.remove("user_email");
    router.push("/");
  };

  const currentLang = LANGUAGES.find(l => l.code === language) ?? LANGUAGES[0];

  return (
    <>
      <nav
        className="sticky top-0 z-50 bg-white border-b border-gray-100"
        style={{ height: 70, boxShadow: "0 1px 12px rgba(15,118,110,0.08)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "var(--gradient-hero)" }}
            >
              <span className="text-white font-bold text-lg leading-none">+</span>
            </div>
            <span className="text-xl font-extrabold gradient-text tracking-tight">Sahaay</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-0.5 flex-1 justify-center">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? "text-[var(--primary)] font-semibold"
                      : "text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-teal-50/60"
                  }`}
                >
                  {t(link.tkey)}
                  {active && (
                    <span
                      className="absolute bottom-0 left-3.5 right-3.5 h-0.5 rounded-full"
                      style={{ background: "var(--gradient-hero)" }}
                    />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Language switcher */}
            <div ref={langRef} className="relative">
              <button
                onClick={() => setLangOpen(o => !o)}
                title="Change language"
                suppressHydrationWarning
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-gray-200 bg-white hover:border-teal-300 hover:bg-teal-50/40 text-sm font-medium text-gray-600 transition-all"
              >
                <Globe className="w-3.5 h-3.5 text-gray-400" />
                <span className="hidden sm:inline">{currentLang.flag}</span>
                <span className="hidden md:inline text-xs">{currentLang.label}</span>
              </button>

              {langOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-2xl border border-gray-100 shadow-xl z-50 overflow-hidden py-1">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => { setLanguage(lang.code); setLangOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all ${
                        language === lang.code
                          ? "text-white font-semibold"
                          : "text-gray-700 hover:bg-teal-50"
                      }`}
                      style={language === lang.code ? { background: "var(--gradient-hero)" } : {}}
                    >
                      <span className="text-base">{lang.flag}</span>
                      <span>{lang.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Notifications */}
            <NotificationsCenter />

            {/* User avatar */}
            {name && (
              <Link href="/profile" className="flex items-center gap-2 group">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  {initials}
                </div>
                <span className="hidden sm:block text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors">
                  {name.split(" ")[0]}
                </span>
              </Link>
            )}

            <button
              onClick={handleLogout}
              suppressHydrationWarning
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-500 hover:bg-red-50 px-3 py-2 rounded-xl transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">{t("nav_logout")}</span>
            </button>

            <Link
              href="/hospital/login"
              className="hidden lg:block text-[11px] text-gray-300 hover:text-gray-500 transition-colors px-1 whitespace-nowrap"
              title="Hospital staff portal"
            >
              Staff Login
            </Link>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              suppressHydrationWarning
              className="lg:hidden p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-all"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 top-[70px] bg-white border-t border-gray-100 shadow-xl overflow-y-auto">
          <div className="p-4 space-y-1">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    active ? "text-white font-semibold" : "text-[var(--text-secondary)] hover:bg-teal-50"
                  }`}
                  style={active ? { background: "var(--gradient-hero)" } : undefined}
                >
                  {t(link.tkey)}
                </Link>
              );
            })}

            {/* Mobile language picker */}
            <div className="pt-2 pb-1 px-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Language</p>
              <div className="grid grid-cols-2 gap-1.5">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => { setLanguage(lang.code); setMobileOpen(false); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-all ${
                      language === lang.code
                        ? "text-white border-transparent"
                        : "text-gray-600 border-gray-200 hover:bg-teal-50"
                    }`}
                    style={language === lang.code ? { background: "var(--gradient-hero)" } : {}}
                  >
                    <span>{lang.flag}</span>
                    <span className="font-medium">{lang.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all mt-2"
            >
              <LogOut className="w-4 h-4" /> {t("nav_logout")}
            </button>

            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <Link href="/hospital/login" onClick={() => setMobileOpen(false)}
                className="text-xs text-gray-400 hover:text-[var(--primary)] transition-colors">
                Healthcare Provider? <span className="font-medium">Login here</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function NavbarSkeleton() {
  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-100" style={{ height: 70 }}>
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl" style={{ background: "var(--gradient-hero)" }} />
          <span className="text-xl font-extrabold gradient-text">Sahaay</span>
        </div>
        <div className="h-4 w-64 rounded-full skeleton" />
      </div>
    </nav>
  );
}

export function useLogout() {
  const router = useRouter();
  return () => {
    Cookies.remove("access_token");
    Cookies.remove("user_name");
    Cookies.remove("user_email");
    router.push("/");
  };
}

export function useUser() {
  const [user, setUser] = useState({ name: "", email: "", token: "" });
  useEffect(() => {
    setUser({
      name:  Cookies.get("user_name")    || "",
      email: Cookies.get("user_email")   || "",
      token: Cookies.get("access_token") || "",
    });
  }, []);
  return user;
}
