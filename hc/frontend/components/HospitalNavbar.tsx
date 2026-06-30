"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { LogOut, Menu, X, Building2, Users, Stethoscope, CalendarCheck, LayoutDashboard, Shield, Globe, CreditCard } from "lucide-react";
import Cookies from "js-cookie";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { Language } from "@/lib/i18n/translations";

const LANGUAGES: { code: Language; flag: string; label: string }[] = [
  { code: "en",       flag: "🇬🇧", label: "English"  },
  { code: "hi",       flag: "🇮🇳", label: "हिंदी"     },
  { code: "ar",       flag: "🇸🇦", label: "العربية"  },
  { code: "es",       flag: "🇪🇸", label: "Español"  },
  { code: "fr",       flag: "🇫🇷", label: "Français" },
];

interface HospitalNavbarProps {
  userName?: string;
  role?: string;
}

const STAFF_LINKS = [
  { href: "/hospital/dashboard", label: "Dashboard",   icon: LayoutDashboard },
  { href: "/hospital/patients",  label: "Patients",    icon: Users },
  { href: "/appointments",       label: "Appointments", icon: CalendarCheck },
];

const ADMIN_LINKS = [
  ...STAFF_LINKS.slice(0, 2),
  { href: "/hospital/doctors",   label: "Doctors",     icon: Stethoscope },
  STAFF_LINKS[2],
  { href: "/hospital/admin",     label: "Admin Panel", icon: Shield       },
  { href: "/hospital/billing",   label: "Billing",     icon: CreditCard   },
];

export default function HospitalNavbar({ userName, role }: HospitalNavbarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const { language, setLanguage } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen,   setLangOpen]   = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentLang = LANGUAGES.find(l => l.code === language) ?? LANGUAGES[0];

  const links = role === "admin" ? ADMIN_LINKS : STAFF_LINKS;

  const initials = userName
    ? userName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()
    : "H";

  const handleLogout = () => {
    Cookies.remove("access_token");
    Cookies.remove("user_name");
    Cookies.remove("user_email");
    router.push("/hospital/login");
  };

  return (
    <>
      <nav
        className="sticky top-0 z-50 bg-white border-b border-gray-100"
        style={{ height: 70, boxShadow: "0 1px 12px rgba(15,118,110,0.08)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/hospital/dashboard" className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="leading-tight">
              <span className="text-base font-extrabold gradient-text tracking-tight block">Sahaay</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider -mt-0.5 block">
                {role === "admin" ? "Admin" : "Doctor"} Portal
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-0.5 flex-1 justify-center">
            {links.map(link => {
              const active = pathname === link.href || pathname?.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? "text-[var(--primary)] font-semibold"
                      : "text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-teal-50/60"
                  }`}
                >
                  <link.icon className="w-4 h-4" />
                  {link.label}
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
            {/* Avatar */}
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold"
                style={{ background: "var(--gradient-hero)" }}
              >
                {initials}
              </div>
              <div className="hidden sm:block leading-tight">
                <p className="text-sm font-semibold text-gray-800 leading-none">{userName?.split(" ")[0]}</p>
                <p className="text-[10px] text-gray-400 capitalize">{role}</p>
              </div>
            </div>

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

            <button
              onClick={handleLogout}
              suppressHydrationWarning
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-500 hover:bg-red-50 px-3 py-2 rounded-xl transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Logout</span>
            </button>

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
            {links.map(link => {
              const active = pathname === link.href || pathname?.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    active ? "text-white font-semibold" : "text-[var(--text-secondary)] hover:bg-teal-50"
                  }`}
                  style={active ? { background: "var(--gradient-hero)" } : undefined}
                >
                  <link.icon className="w-4 h-4" />
                  {link.label}
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
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all mt-2"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      )}
    </>
  );
}
