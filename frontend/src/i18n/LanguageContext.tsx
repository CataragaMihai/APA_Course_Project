import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { translations, type Lang, type Messages } from "./translations";
import { prefersReducedMotion } from "../utils/a11y";

const FADE = 220; // ms, matches `html.lang-fading` in styles.css

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Messages;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readInitialLang(): Lang {
  try {
    const stored = localStorage.getItem("lang");
    if (stored === "ro" || stored === "en" || stored === "ru") return stored;
  } catch {
    // localStorage unavailable (private mode, etc.) — fall through to default
  }
  return "ro";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang);
  const fading = useRef(false);

  const apply = (next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem("lang", next);
    } catch {
      // ignore
    }
  };

  // copy fades out, swaps, fades back in; the hero listens for "lang-switch" to regroup the typewriter
  const setLang = (next: Lang) => {
    if (next === lang || fading.current) return;
    if (prefersReducedMotion()) return apply(next);
    const root = document.documentElement;
    fading.current = true;
    window.dispatchEvent(new Event("lang-switch"));
    root.classList.add("lang-fading");
    window.setTimeout(() => {
      apply(next);
      requestAnimationFrame(() => {
        root.classList.remove("lang-fading");
        fading.current = false;
      });
    }, FADE);
  };

  // screen readers pick pronunciation from <html lang>
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<LanguageContextValue>(() => ({ lang, setLang, t: translations[lang] }), [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
