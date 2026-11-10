import { useEffect, useRef } from "react";
import type { MessageSummary } from "../types";
import { useLanguage } from "../i18n/LanguageContext";
import { format, num } from "../i18n/translations";
import Icon from "./Icon";

// colour = key length (legend above the grid); the hues live in styles.css as --k3 .. --k8
const accent = (n: number) => `var(--k${Math.max(3, Math.min(8, n))})`;

interface Props {
  messages: MessageSummary[];
  selectedId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}

/** Every archive message as a card grid across the decoder width (Mihai: like the previous site). Inline, not a modal. */
export default function AllMessages({ messages, selectedId, onPick, onClose }: Props) {
  const { t, lang } = useLanguage();
  const root = useRef<HTMLElement>(null);
  const featured = messages.filter((m) => m.featured);
  const rest = messages.filter((m) => !m.featured);
  const longest = Math.max(1, ...messages.map((m) => m.length));
  const keyLengths = [...new Set(messages.map((m) => m.key_length))].sort((a, b) => a - b);

  useEffect(() => {
    document.querySelector("#decodor")?.scrollIntoView({ block: "start" }); // keep the intro line in view
    root.current?.querySelector<HTMLButtonElement>(".all-card")?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      ref={root}
      className="all-msgs panel"
      aria-labelledby="all-msgs-h"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="all-head">
        <div>
          <h3 id="all-msgs-h">
            {t.decoder.allHeading} <span className="all-count num">{messages.length}</span>
          </h3>
          <p className="hint">{t.decoder.allNote}</p>
        </div>
        <button className="btn small ghost" type="button" onClick={onClose}>
          {t.decoder.close} <Icon name="close" size={14} />
        </button>
      </div>
      <div className="all-legend" aria-hidden="true">
        <span>{t.decoder.legendKey}</span>
        {keyLengths.map((n) => (
          <span key={n} className="all-swatch" style={{ "--acc": accent(n) } as React.CSSProperties}>
            {n}
          </span>
        ))}
      </div>
      {[featured, rest].map((group, gi) => (
        <ul key={gi} className={`all-grid ${gi === 0 ? "featured" : ""}`}>
          {group.map((m, i) => (
            <li key={m.id} style={{ "--i": i + gi * featured.length } as React.CSSProperties}>
              <button
                type="button"
                className="all-card"
                aria-current={m.id === selectedId}
                onClick={() => onPick(m.id)}
                style={{ "--acc": accent(m.key_length) } as React.CSSProperties}
              >
                <span className="all-top">
                  <span className="all-no num" aria-hidden="true">
                    {m.id.slice(-2)}
                  </span>
                  {m.featured && <span className="all-badge">{t.decoder.cases[m.case].label}</span>}
                  {m.id === selectedId && (
                    <span className="rail-mark" aria-hidden="true">
                      <span className="dot" />
                    </span>
                  )}
                </span>
                <span className="all-title">{m.title}</span>
                {m.featured && t.decoder.cases[m.case].hint && <span className="all-hint">{t.decoder.cases[m.case].hint}</span>}
                <span className="all-stat">
                  <span className="all-keyslots" aria-hidden="true">
                    {Array.from({ length: m.key_length }, (_, k) => (
                      <i key={k} />
                    ))}
                  </span>
                  <span className="num">{format(t.decoder.keyHint, { n: m.key_length })}</span>
                </span>
                <span className="all-stat">
                  <span className="all-bar" aria-hidden="true">
                    <i style={{ transform: `scaleX(${m.length / longest})` }} />
                  </span>
                  <span className="num">{format(t.decoder.letters, { n: num(m.length, lang) })}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}
