import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import type { Lang } from "../i18n/translations";

/**
 * RO | EN with a lime thumb that is magnetic (Mihai, 2026-11-04): hovering a language snaps the thumb onto it,
 * leaving snaps it back to the active one, and only a click changes the language. Never an in-between state.
 * Touch and keyboard switch directly.
 */
export default function LanguageSwitch() {
  const { lang, setLang, t } = useLanguage();
  const [hover, setHover] = useState<Lang | null>(null);
  return (
    <div className="lang-switch" role="group" aria-label={t.nav.langLabel} data-thumb={hover ?? lang} onPointerLeave={() => setHover(null)}>
      {(["ro", "en", "ru"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onPointerEnter={(e) => e.pointerType === "mouse" && setHover(l)}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
