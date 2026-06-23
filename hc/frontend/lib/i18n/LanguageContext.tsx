"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { translations, type Language, type TranslationKey } from "./translations";
import { authApi } from "@/lib/api";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => {},
  t: (key) => translations.en[key],
});

function applyDir(lang: Language) {
  if (typeof document === "undefined") return;
  document.documentElement.dir  = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = lang;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLang] = useState<Language>("en");

  // On mount: read the user's saved preference from the backend (if logged in)
  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) return;
    authApi
      .me()
      .then((res) => {
        const pref = res.data?.language_preference as Language | undefined;
        if (pref && pref in translations) {
          setLang(pref);
          applyDir(pref);
        }
      })
      .catch(() => {});
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLang(lang);
    applyDir(lang);
    // Persist to backend when logged in
    if (Cookies.get("access_token")) {
      authApi.updateMe({ language_preference: lang }).catch(() => {});
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey): string =>
      (translations[language] as Record<TranslationKey, string>)[key] ??
      translations.en[key],
    [language],
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
