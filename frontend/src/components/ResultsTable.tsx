import type { AlgorithmId, AlgorithmRunState } from "../types";
import { useLanguage } from "../i18n/LanguageContext";
import { format, num } from "../i18n/translations";
import { downloadCsv } from "../utils/csv";
import { isCracked } from "../utils/verdict";
import Icon from "./Icon";

interface Props {
  states: Record<AlgorithmId, AlgorithmRunState>;
  missionTitle: string;
}

const ALGORITHMS: AlgorithmId[] = ["brute-force", "dictionary", "frequency"];

export default function ResultsTable({ states, missionTitle }: Props) {
  const { t, lang } = useLanguage();
  const done = ALGORITHMS.filter((a) => states[a].result);
  if (done.length === 0) return null;

  const h = t.results.headers;

  function handleExport() {
    const headers = [h.algorithm, h.attempts, h.complexity, h.time, h.success, h.key, h.decoded];
    const rows = done.map((a) => {
      const r = states[a].result!;
      const yesNo = (v: boolean) => (v ? t.common.yes : t.common.no);
      return [
        t.algorithms.names[a], r.attempts, t.algorithms.complexity[a], r.elapsed_ms.toFixed(2), yesNo(isCracked(r)),
        r.recovered_key, r.recovered_plaintext,
      ];
    });
    downloadCsv(`${missionTitle.replace(/\s+/g, "_")}_results.csv`, headers, rows);
  }

  return (
    <section className="panel panel-stack" aria-labelledby="results-h">
      <div className="head">
        <h3 id="results-h">{t.results.heading}</h3>
        <button className="btn small ghost" type="button" onClick={handleExport}>
          {t.results.export}
        </button>
      </div>
      <div className="table-wrap">
      <table className="stack-on-mobile">
        <thead>
          <tr>
            <th>{h.algorithm}</th>
            <th className="num">{h.attempts}</th>
            <th>{h.complexity}</th>
            <th className="num">{h.time}</th>
            <th>{h.success}</th>
            <th>{h.key}</th>
          </tr>
        </thead>
        <tbody>
          {done.map((a) => {
            const r = states[a].result!;
            return (
              <tr key={a}>
                <td data-label={h.algorithm}>{t.algorithms.names[a]}</td>
                <td data-label={h.attempts} className="num">{num(r.attempts, lang)}</td>
                <td data-label={h.complexity} className="type">{t.algorithms.complexity[a]}</td>
                <td data-label={h.time} className="num">{r.elapsed_ms.toFixed(1)}</td>
                <td data-label={h.success} className={isCracked(r) ? "v-ok" : "v-bad"}>
                  <Icon name={isCracked(r) ? "check" : "close"} size={14} /> {isCracked(r) ? t.results.ok : t.results.fail}
                </td>
                <td data-label={h.key} className="key">{r.recovered_key || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <p className="hint">{t.results.verifiedNote}</p>
    </section>
  );
}
