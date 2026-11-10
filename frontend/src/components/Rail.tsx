import type { MessageSummary } from "../types";
import { useLanguage } from "../i18n/LanguageContext";
import { format } from "../i18n/translations";
import Icon from "./Icon";

export type Selection = { kind: "archive"; id: string } | { kind: "custom" } | null;

interface Props {
  messages: MessageSummary[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  onBrowseAll: () => void;
}

/** Message list: a sticky left rail on desktop, a disclosure ("sheet") above the composer below 1024 px. */
export default function Rail({ messages, selection, onSelect, onBrowseAll }: Props) {
  const { t } = useLanguage();
  const selectedId = selection?.kind === "archive" ? selection.id : null;
  const current = messages.find((m) => m.id === selectedId);
  // a message picked from the full list stays visible in the rail
  const featured = messages.filter((m) => m.featured || m.id === selectedId);

  function item(m: MessageSummary, close?: () => void) {
    const on = m.id === selectedId;
    return (
      <li key={m.id}>
        <button
          type="button"
          className="rail-item"
          aria-current={on}
          onClick={() => {
            onSelect({ kind: "archive", id: m.id });
            close?.();
          }}
        >
          <span className="rail-title">{m.title}</span>
          <span className="rail-mark" aria-hidden="true">
            {on && <span className="dot" />}
          </span>
          <span className="rail-meta">
            {m.featured && <span className="rail-badge">{t.decoder.cases[m.case].label}</span>}
            {format(t.decoder.letters, { n: m.length })} · {format(t.decoder.keyHint, { n: m.key_length })}
          </span>
        </button>
      </li>
    );
  }

  function list(close?: () => void) {
    return (
      <>
        <span className="label">{t.decoder.featured}</span>
        <ul className="rail-group" aria-busy={!messages.length}>
          {messages.length
            ? featured.map((m) => item(m, close))
            : [0, 1, 2, 3].map((i) => (
                <li key={i} className="skel-row" aria-hidden="true">
                  <i />
                  <i />
                </li>
              ))}
        </ul>
        {messages.length > featured.length && (
          <button
            type="button"
            className="btn quiet small rail-all"
            onClick={() => {
              close?.();
              onBrowseAll();
            }}
          >
            {t.decoder.all} ({messages.length}) <Icon name="arrowRight" />
          </button>
        )}
        <ul className="rail-group">
          <li>
            <button
              type="button"
              className="rail-item rail-custom"
              aria-current={selection?.kind === "custom"}
              onClick={() => {
                onSelect({ kind: "custom" });
                close?.();
              }}
            >
              <span className="rail-title">
                <Icon name="type" size={18} />
                {t.decoder.custom}
              </span>
              <span className="rail-mark" aria-hidden="true">
                {selection?.kind === "custom" && <span className="dot" />}
              </span>
            </button>
          </li>
        </ul>
        <div className="rail-divider" />
        <a className="rail-link" href="#arhiva">
          {t.decoder.archiveLink} <Icon name="arrowRight" />
        </a>
      </>
    );
  }

  return (
    <>
      <nav className="rail" aria-label={t.decoder.railLabel}>
        {list()}
      </nav>
      <details className="rail-picker panel">
        <summary className="btn ghost" style={{ width: "100%", justifyContent: "space-between" }}>
          <span>{selection?.kind === "custom" ? t.decoder.custom : current?.title ?? t.decoder.chooseMessage}</span>
          <Icon name="chevronDown" className="chev" />
        </summary>
        <div className="rail" style={{ display: "grid", position: "static", maxHeight: "none", marginTop: 12 }}>
          {list(() => document.querySelector<HTMLDetailsElement>(".rail-picker")?.removeAttribute("open"))}
        </div>
      </details>
    </>
  );
}
