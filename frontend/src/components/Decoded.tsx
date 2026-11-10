import type { AlgorithmId, AlgorithmRunState } from "../types";
import { useLanguage } from "../i18n/LanguageContext";
import { isCracked } from "../utils/verdict";
import More from "./More";

const ALGORITHMS: AlgorithmId[] = ["brute-force", "dictionary", "frequency"];

/** The fastest attack that cracked the message, else the fastest that finished. */
export function defaultPick(states: Record<AlgorithmId, AlgorithmRunState>): AlgorithmId | null {
  const done = ALGORITHMS.filter((a) => states[a].result).sort((a, b) => states[a].result!.elapsed_ms - states[b].result!.elapsed_ms);
  return done.find((a) => isCracked(states[a].result!)) ?? done[0] ?? null;
}

/** The decrypted text of the attack picked on its station card (App holds the pick); a failed attack shows its
 *  unreadable text, which explains the failure. */
export default function Decoded({ states, shown }: { states: Record<AlgorithmId, AlgorithmRunState>; shown: AlgorithmId | null }) {
  const { t } = useLanguage();
  if (!shown || !states[shown].result) return null;
  const r = states[shown].result!;
  const cracked = isCracked(r);

  return (
    <section className="panel panel-stack decoded" aria-labelledby="decoded-h">
      <div className="head">
        <h3 id="decoded-h">{t.decoded.heading}</h3>
        <p className="decoded-by">
          {t.decoded.pick} <strong>{t.algorithms.names[shown]}</strong>
        </p>
      </div>
      <p className="decoded-key">
        <span className="label">{t.decoded.key}</span> <span className={`type ${cracked ? "v-ok" : "v-bad"}`}>{r.recovered_key || "—"}</span>
      </p>
      <More className={`cipher-text decoded-text ${cracked ? "" : "bad"}`} id="decoded-text" label={t.decoded.heading}>
        {r.recovered_plaintext}
      </More>
      {!cracked && <p className="hint">{t.decoded.wrong}</p>}
    </section>
  );
}
