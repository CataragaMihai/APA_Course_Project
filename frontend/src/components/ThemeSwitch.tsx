import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";

type Theme = "dark" | "light";

// The theme lives on <html data-theme> (set before first paint in index.html); this only flips and saves it.
export default function ThemeSwitch() {
  const { t } = useLanguage();
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === "light" ? "light" : "dark"));

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    if (next === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", next === "light" ? "#f4f3ee" : "#0b0c0b");
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore
    }
  }

  return (
    <button className="theme-switch" type="button" aria-pressed={theme === "light"} aria-label={t.nav.lightMode} title={t.nav.lightMode} onClick={toggle}>
      {theme === "light" ? (
        // moon: switch back to dark
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path className="moon" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" />
        </svg>
      ) : (
        // sun: switch to light
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle className="sun-core" cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
          <path className="sun-rays" d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}
