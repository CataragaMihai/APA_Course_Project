import { useEffect, useRef, useState } from "react";
import { encryptMessage, revealMessage } from "../api";
import type { RevealResponse } from "../types";
import type { Mission } from "../App";
import { useLanguage } from "../i18n/LanguageContext";
import { format } from "../i18n/translations";
import Icon from "./Icon";
import More from "./More";

type Difficulty = "short" | "medium";
const DIFFICULTY_RANGES: Record<Difficulty, [number, number]> = { short: [3, 4], medium: [5, 7] };

function randomKey(difficulty: Difficulty): string {
  const [min, max] = DIFFICULTY_RANGES[difficulty];
  const len = min + Math.floor(Math.random() * (max - min + 1));
  let out = "";
  for (let i = 0; i < len; i++) out += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return out;
}

// Mirrors backend/app/cipher.py: accents fold to base letters, everything but A-Z is dropped
function lettersOnly(text: string): string {
  return text.normalize("NFKD").toUpperCase().replace(/[^A-Z]/g, "");
}

interface Props {
  mode: "archive" | "custom";
  mission: Mission | null;
  missionTitle: string;
  truth: RevealResponse | null;
  onTruthChange: (r: RevealResponse | null) => void;
  onCustomEncrypted: (ciphertext: string, key: string, plaintext: string) => void;
  maxKeyLength: number;
  onMaxKeyLengthChange: (n: number) => void;
  running: boolean;
  onRunAll: () => void;
}

/** Keyed by mission in App, so the revealed key and the expanded text reset per message. */
export default function Composer(props: Props) {
  const { mode, mission, missionTitle, truth, onTruthChange, maxKeyLength, onMaxKeyLengthChange, running, onRunAll } = props;
  const { t } = useLanguage();
  const [revealing, setRevealing] = useState(false);
  // a reveal answer arriving after a switch belongs to the old message
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true; // re-set after StrictMode's dev-only remount
    return () => {
      mounted.current = false;
    };
  }, []);

  async function reveal() {
    if (!mission?.archiveId) return;
    setRevealing(true);
    try {
      const r = await revealMessage(mission.archiveId);
      if (mounted.current) onTruthChange(r);
    } finally {
      if (mounted.current) setRevealing(false);
    }
  }

  const isCustom = mode === "custom";

  return (
    <section className="composer" aria-labelledby="composer-h">
      <div className="composer-head">
        <div>
          {!isCustom && <span className="label">{t.composer.kicker}</span>}
          <h3 id="composer-h">{mission ? missionTitle : isCustom ? t.composer.customTitle : t.decoder.chooseMessage}</h3>
        </div>
        {mission?.summary && (
          <div className="chips">
            <span className="chip num">{format(t.decoder.letters, { n: mission.summary.length })}</span>
            <span className="chip num">{format(t.decoder.keyHint, { n: mission.summary.key_length })}</span>
          </div>
        )}
      </div>

      {isCustom && <CustomForm onEncrypted={props.onCustomEncrypted} />}

      {!mission && !isCustom && <p className="composer-empty">{t.composer.empty}</p>}

      {mission && (
        <>
          <More className="cipher-text" id="cipher-text">
            {mission.ciphertext}
          </More>

          {truth && (
            <div className="reveal-box">
              <span className="label">{t.composer.trueKey}</span>
              <span className="reveal-key">{truth.key}</span>
              <span className="label" style={{ marginTop: 8 }}>
                {t.composer.plaintext}
              </span>
              <More className="type reveal-plain" id="reveal-plain">
                {truth.plaintext}
              </More>
            </div>
          )}
          {!mission.archiveId && <p className="hint">{t.composer.customReady}</p>}

          <div className="composer-foot">
            <div className="chips">
              {mission.archiveId &&
                (truth ? (
                  <button className="chip" type="button" onClick={() => onTruthChange(null)}>
                    {t.composer.hide}
                  </button>
                ) : (
                  <button className="chip" type="button" onClick={reveal} disabled={revealing}>
                    {revealing ? t.composer.revealing : t.composer.reveal}
                  </button>
                ))}
              <details className="advanced">
                <summary className="chip">
                  {t.composer.advanced} <Icon name="chevronDown" size={14} className="chev" />
                </summary>
                <div className="advanced-body">
                  <label className="field">
                    <span>{t.composer.maxKeyLength}</span>
                    <select value={maxKeyLength} onChange={(e) => onMaxKeyLengthChange(Number(e.target.value))}>
                      {[3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {t.composer.maxKeyOptions[n]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
            </div>
            <button className="btn primary" type="button" onClick={onRunAll} disabled={running} aria-busy={running}>
              {running && <Icon name="spinner" className="spin" />}
              {running ? t.composer.running : t.composer.runAll}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function CustomForm({ onEncrypted }: { onEncrypted: Props["onCustomEncrypted"] }) {
  const { t } = useLanguage();
  const [plaintext, setPlaintext] = useState("");
  const [key, setKey] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errField, setErrField] = useState<"text" | "key" | null>(null);
  const [encryptedAs, setEncryptedAs] = useState<string | null>(null);
  // the hero's typewriter flies down onto this stage and types what is written here (hero/engine.ts dock);
  // double-clicking it opens the big overlay, clicking its keys types them
  const stage = useRef<HTMLDivElement>(null);
  const bigEl = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const [big, setBig] = useState(false);
  const [coarse] = useState(() => matchMedia("(pointer: coarse)").matches);
  // phones (Mihai 2026-11-05): plain fields, no docked typewriter and no big view
  const [phone] = useState(() => matchMedia("(max-width: 767px)").matches);
  const plainRef = useRef(plaintext);
  plainRef.current = plaintext;
  const typeOn = (text: string, ch?: string) => window.dispatchEvent(new CustomEvent("hero-type", { detail: { text, ch } }));
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("hero-dock", { detail: { stage: stage.current, big: big ? bigEl.current : null } }));
    if (big) field.current?.focus({ preventScroll: true }); // the physical keyboard keeps typing into the field
  }, [big]);
  useEffect(() => {
    const onBig = () => setBig((b) => !b);
    const onKey = (e: Event) => {
      const ch = (e as CustomEvent<string>).detail;
      const next = (plainRef.current + ch).slice(0, 20000);
      plainRef.current = next;
      setPlaintext(next);
      typeOn(next, ch);
    };
    window.addEventListener("hero-big", onBig);
    window.addEventListener("hero-key", onKey);
    return () => {
      window.removeEventListener("hero-big", onBig);
      window.removeEventListener("hero-key", onKey);
      window.dispatchEvent(new CustomEvent("hero-dock", { detail: { stage: null, big: null } }));
    };
  }, []);

  async function encrypt() {
    setError(null);
    setErrField(null);
    const fail = (field: "text" | "key", msg: string) => {
      setErrField(field);
      setError(msg);
    };
    if (!plaintext.trim()) return fail("text", t.composer.errorEmptyMessage);
    if (!key.trim()) return fail("key", t.composer.errorEmptyKey);
    if (!lettersOnly(plaintext)) return fail("text", t.composer.errorMessageNoLetters);
    if (!lettersOnly(key)) return fail("key", t.composer.errorKeyNoLetters);
    setBusy(true);
    try {
      const res = await encryptMessage(plaintext, key);
      setEncryptedAs(res.normalized_plaintext);
      onEncrypted(res.ciphertext, lettersOnly(key), res.normalized_plaintext);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="custom-split">
    {phone ? null : (
    <div className="dock-stage" ref={stage} title={t.composer.dockHint}>
      {/* touch has no reliable double-tap: a visible way into the big view (shown on coarse pointers only) */}
      <button className="btn small dock-big-open" type="button" onClick={() => setBig(true)}>
        {t.composer.bigOpen}
      </button>
    </div>
    )}
    {big && !phone && (
      <div className="dock-big" ref={bigEl}>
        <p className="dock-big-hint">{coarse ? t.composer.bigHintTouch : t.composer.bigHint}</p>
        <button className="btn small ghost dock-big-close" type="button" onClick={() => setBig(false)}>
          {t.decoder.close} <Icon name="close" size={14} />
        </button>
      </div>
    )}
    <div className="panel-stack">
      <label className="field">
        <span>{t.composer.plaintextLabel}</span>
        <textarea
          ref={field}
          onKeyDown={(e) => {
            if (e.key === "Escape" && big) setBig(false);
          }}
          value={plaintext}
          maxLength={20000}
          onChange={(e) => {
            setPlaintext(e.target.value);
            const ie = e.nativeEvent as InputEvent;
            typeOn(e.target.value, ie.inputType === "insertText" && ie.data?.length === 1 ? ie.data : undefined);
          }}
          placeholder={t.composer.plaintextPlaceholder}
          aria-invalid={errField === "text"}
          aria-describedby={error ? "custom-error" : undefined}
        />
      </label>
      <div className="custom-grid">
        <label className="field">
          <span>{t.composer.keyLabel}</span>
          <input
            id="custom-key"
            type="text"
            value={key}
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            aria-invalid={errField === "key"}
            aria-describedby={errField === "key" ? "custom-error" : undefined}
            placeholder={t.composer.keyPlaceholder}
          />
        </label>
        <label className="field">
          <span>{t.composer.difficultyLabel}</span>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            <option value="short">{t.composer.difficultyShort}</option>
            <option value="medium">{t.composer.difficultyMedium}</option>
          </select>
        </label>
      </div>
      <div className="btn-row">
        <button className="btn ghost" type="button" onClick={() => setKey(randomKey(difficulty))}>
          {t.composer.randomKey}
        </button>
        <button className="btn primary" type="button" onClick={encrypt} disabled={busy}>
          {busy && <Icon name="spinner" className="spin" />}
          {busy ? t.composer.encrypting : t.composer.encrypt}
        </button>
      </div>
      {error && (
        <p className="error-text" id="custom-error" role="alert">
          {error}
        </p>
      )}
      {!error && encryptedAs && <p className="hint type">{format(t.composer.encryptedAs, { text: encryptedAs })}</p>}
    </div>
    </div>
  );
}
