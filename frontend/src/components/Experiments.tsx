import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { runKeyLengthExperiment, runTextLengthExperiment } from "../api";
import type { Mission } from "../App";
import type { KeyLengthExperiment, RevealResponse, TextLengthExperiment } from "../types";
import { useLanguage } from "../i18n/LanguageContext";
import { format, num } from "../i18n/translations";
import { AXIS_STYLE, CHART, TOOLTIP_CURSOR, TOOLTIP_STYLE } from "../chartTheme";

/** The two scaling experiments from /api/experiments, run on the decoder's current message. */
export default function Experiments({ mission, missionTitle, truth }: { mission: Mission | null; missionTitle: string; truth: RevealResponse | null }) {
  const { t, lang } = useLanguage();
  const e = t.method.experiments;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyLen, setKeyLen] = useState<KeyLengthExperiment | null>(null);
  const [textLen, setTextLen] = useState<TextLengthExperiment | null>(null);
  const run = useRef(0);

  // results belong to one message: clear them when the decoder switches
  useEffect(() => {
    run.current++;
    setKeyLen(null);
    setTextLen(null);
    setError(null);
    setBusy(false);
  }, [mission?.ciphertext]);

  async function start() {
    if (!mission) return;
    const id = ++run.current;
    const truthArg = mission.archiveId ? { message_id: mission.archiveId } : { true_key: truth?.key ?? null };
    setBusy(true);
    setError(null);
    try {
      // cap 5 brute force takes seconds; text-length is fast, so it comes back first
      const tl = runTextLengthExperiment(mission.ciphertext, truthArg).then((r) => id === run.current && setTextLen(r));
      const kl = runKeyLengthExperiment(mission.ciphertext, truthArg, 5).then((r) => id === run.current && setKeyLen(r));
      await Promise.all([tl, kl]);
    } catch (err) {
      if (id === run.current) setError(format(e.error, { msg: err instanceof Error ? err.message : String(err) }));
    } finally {
      if (id === run.current) setBusy(false);
    }
  }

  const color = (correct: boolean | null, success: boolean) => (correct === null ? (success ? CHART.ink : CHART.faint) : correct ? CHART.lime : CHART.fail);
  const verdict = (correct: boolean | null) => (correct === null ? e.unknown : correct ? `✓ ${e.correct}` : `✗ ${e.wrong}`);

  return (
    <div className="panel panel-stack experiments" aria-labelledby="exp-h">
      <div className="head">
        <div>
          <h3 id="exp-h">{e.heading}</h3>
          <p className="hint">{mission ? format(e.intro, { title: missionTitle }) : e.noMessage}</p>
        </div>
        <button className="btn primary" type="button" onClick={start} disabled={!mission || busy}>
          {busy ? e.running : e.run}
        </button>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {(keyLen || textLen || busy) && (
        <div className="charts" aria-busy={busy}>
          <div className="chart-box">
            <span className="label">{e.keyLength}</span>
            {keyLen ? (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={keyLen.points} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid vertical={false} stroke={CHART.grid} />
                    <XAxis dataKey="max_key_length" tick={AXIS_STYLE} tickFormatter={(v) => `L=${v}`} interval={0} />
                    <YAxis scale="log" domain={[10, "auto"]} allowDataOverflow tick={AXIS_STYLE} tickFormatter={(v) => num(v, lang)} width={80} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      cursor={TOOLTIP_CURSOR}
                      labelFormatter={(v) => `L = ${v}`}
                      formatter={(v: number, _n, item) => [`${num(v, lang)} ${e.attempts} · ${item.payload.elapsed_ms.toFixed(0)} ${e.ms} · ${item.payload.recovered_key} ${verdict(item.payload.correct)}`, ""]}
                    />
                    <Bar dataKey="attempts" radius={[4, 4, 0, 0]} maxBarSize={56}>
                      {keyLen.points.map((p) => (
                        <Cell key={p.max_key_length} fill={color(p.correct, p.success)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <table className="stack-on-mobile">
                  <thead>
                    <tr>
                      <th>L</th>
                      <th className="num">{e.attempts}</th>
                      <th className="num">{e.ms}</th>
                      <th>{t.results.headers.key}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keyLen.points.map((p) => (
                      <tr key={p.max_key_length}>
                        <td data-label="L">{p.max_key_length}</td>
                        <td data-label={e.attempts} className="num">{num(p.attempts, lang)}</td>
                        <td data-label={e.ms} className="num">{p.elapsed_ms.toFixed(1)}</td>
                        <td data-label={t.results.headers.key} className={`key ${p.correct ? "v-ok" : p.correct === false ? "v-bad" : ""}`}>
                          {p.recovered_key} {p.correct === null ? "" : p.correct ? "✓" : "✗"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {keyLen.true_key_length && <p className="hint">{format(e.keyLengthNote, { n: keyLen.true_key_length })}</p>}
              </>
            ) : (
              <div className="bar scan" aria-hidden="true"><i /></div>
            )}
          </div>
          <div className="chart-box">
            <span className="label">{e.textLength}</span>
            {textLen ? (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={textLen.points} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid vertical={false} stroke={CHART.grid} />
                    <XAxis dataKey="letters" tick={AXIS_STYLE} interval="preserveStartEnd" />
                    <YAxis dataKey="estimated_key_length" allowDecimals={false} tick={AXIS_STYLE} width={32} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      cursor={TOOLTIP_CURSOR}
                      labelFormatter={(v) => `${v} ${e.letters}`}
                      formatter={(_v, _n, item) => [`L=${item.payload.estimated_key_length} · ${item.payload.recovered_key} ${verdict(item.payload.correct)}`, ""]}
                    />
                    <Bar dataKey="estimated_key_length" radius={[4, 4, 0, 0]} maxBarSize={40}>
                      {textLen.points.map((p) => (
                        <Cell key={p.letters} fill={color(p.correct, p.success)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="hint">{e.textLengthNote}</p>
                <p className="hint num">
                  {textLen.points.map((p) => `${p.letters}: ${p.recovered_key || "—"}${p.correct === null ? "" : p.correct ? " ✓" : " ✗"}`).join(" · ")}
                </p>
              </>
            ) : (
              <div className="bar scan" aria-hidden="true"><i /></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
