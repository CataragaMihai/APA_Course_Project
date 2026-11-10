import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { HttpError, streamArchive } from "../api";
import type { AlgorithmResult, ArchiveMessageResult, AlgorithmId } from "../types";
import { useLanguage } from "../i18n/LanguageContext";
import { format } from "../i18n/translations";
import { downloadCsv } from "../utils/csv";
import { AXIS_STYLE, CHART, TOOLTIP_CURSOR, TOOLTIP_STYLE } from "../chartTheme";
import Icon from "./Icon";

const ALGORITHMS: AlgorithmId[] = ["brute-force", "dictionary", "frequency"];
const REPEATS = 3;


interface AggregateRow {
  name: string;
  avg: number;
  min: number;
  max: number;
  successRate: number;
}

type Phase = "idle" | "connecting" | "running" | "done" | "stopped" | "error";

interface Progress {
  done: number;
  total: number;
  messageIndex: number;
  messageTitle: string;
  algorithm: AlgorithmId;
  repeat: number;
}

export default function ArchiveMode({ maxKeyLength }: { maxKeyLength: number }) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<Phase>("idle");
  const [allRows, setAllRows] = useState(false);
  const [messages, setMessages] = useState<ArchiveMessageResult[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Leaving the tab mid-run shouldn't keep the server busy.
  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = phase === "connecting" || phase === "running";

  async function handleRun() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase("connecting");
    setMessages([]);
    setProgress(null);
    setError(null);

    let finished = false;
    let received = 0;
    let expected = 0;

    try {
      await streamArchive(
        maxKeyLength,
        REPEATS,
        (event) => {
          switch (event.type) {
            case "start":
              expected = event.messages;
              setMessageCount(event.messages);
              setProgress({ done: 0, total: event.total, messageIndex: 0, messageTitle: "", algorithm: "brute-force", repeat: 1 });
              setPhase("running");
              break;
            case "progress":
              setProgress({
                done: event.done,
                total: event.total,
                messageIndex: event.message_index,
                messageTitle: event.message_title,
                algorithm: event.algorithm,
                repeat: event.repeat,
              });
              break;
            case "message":
              received += 1;
              setMessages((prev) => [...prev, event.result]);
              setProgress((p) => (p ? { ...p, done: event.done } : p));
              break;
            case "done":
              finished = true;
              setProgress((p) => (p ? { ...p, done: event.total } : p));
              setPhase("done");
              break;
            case "error":
              finished = true;
              setError(format(t.archive.errorServer, { detail: event.detail }));
              setPhase("error");
              break;
          }
        },
        controller.signal,
      );
      if (!finished) {
        setError(format(t.archive.errorDropped, { msgs: received, n: expected || "?" }));
        setPhase("error");
      }
    } catch (e) {
      if (controller.signal.aborted) {
        setPhase("stopped");
        return;
      }
      // A 5xx with no explanation from our API comes from a proxy/gateway
      // (dev proxy, or Render while the service is waking up): unreachable.
      const unreachable = e instanceof HttpError && e.status >= 500 && e.message.startsWith("HTTP ");
      if (e instanceof HttpError && !unreachable) {
        setError(format(t.archive.errorServer, { detail: e.message }));
      } else if (received > 0) {
        setError(format(t.archive.errorDropped, { msgs: received, n: expected || "?" }));
      } else {
        setError(t.archive.errorNetwork);
      }
      setPhase("error");
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function aggregate(rows: ArchiveMessageResult[]): AggregateRow[] {
    return ALGORITHMS.map((algo) => {
      const pairs = rows
        .map((m) => ({ m, r: m.results.find((r) => r.algorithm === algo.replace("-", "_")) }))
        .filter((p): p is { m: ArchiveMessageResult; r: AlgorithmResult } => !!p.r);
      const results = pairs.map((p) => p.r);
      const times = results.map((r) => r.elapsed_ms);
      // judged against the true key, like every verdict on the page
      const successes = pairs.filter((p) => p.r.recovered_key === p.m.true_key).length;
      return {
        name: t.algorithms.names[algo],
        avg: times.reduce((a, b) => a + b, 0) / (times.length || 1),
        min: times.length ? Math.min(...times) : 0,
        max: times.length ? Math.max(...times) : 0,
        successRate: results.length ? (successes / results.length) * 100 : 0,
      };
    });
  }

  function handleExport() {
    const headers = [
      t.archive.message, t.archive.trueKey, t.results.headers.algorithm,
      t.results.headers.time, t.results.headers.attempts, t.results.headers.success, t.results.headers.key,
    ];
    const rows: (string | number)[][] = [];
    for (const m of messages) {
      for (const r of m.results) {
        rows.push([m.title, m.true_key, r.algorithm, r.elapsed_ms.toFixed(2), r.attempts, r.recovered_key === m.true_key ? t.common.yes : t.common.no, r.recovered_key]);
      }
    }
    downloadCsv("full_archive_results.csv", headers, rows);
  }

  const fraction = progress && progress.total > 0 ? progress.done / progress.total : 0;
  const aggRows = messages.length ? aggregate(messages) : [];
  const partial = messages.length > 0 && messages.length < messageCount;

  return (
    <>
      <div className="section-head">
        <h2 id="archive-h">{t.archive.heading}</h2>
        <p>{t.archive.description}</p>
      </div>
    <div className="panel panel-stack">
      <div className="btn-row">
        {busy ? (
          <button type="button" className="btn ghost" onClick={handleStop}>
            {t.archive.stop}
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={handleRun}>
            {phase === "error" ? t.archive.retry : t.archive.run}
          </button>
        )}
        {messages.length > 0 && !busy && (
          <>
            <button className="btn ghost" type="button" onClick={() => setShowKeys((s) => !s)}>
              {showKeys ? t.archive.hideKeys : t.archive.showKeys}
            </button>
            <button className="btn ghost" type="button" onClick={handleExport}>
              {t.archive.export}
            </button>
          </>
        )}
      </div>

      {phase !== "idle" && (
        <div className="archive-status" aria-live="polite">
          <div
            className={`bar ${phase === "connecting" ? "scan" : ""}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={phase === "connecting" ? undefined : Math.round(fraction * 100)}
          >
            <i style={phase === "connecting" ? undefined : { transform: `scaleX(${fraction})` }} />
          </div>

          {phase === "connecting" && <div className="progress-line">{t.archive.connecting}</div>}

          {phase === "running" && progress && (
            <>
              <div className="progress-line">
                {progress.messageTitle
                  ? format(t.archive.progressLine, {
                      i: progress.messageIndex + 1,
                      n: messageCount,
                      title: progress.messageTitle,
                      algo: t.algorithms.names[progress.algorithm],
                      r: progress.repeat,
                      reps: REPEATS,
                    })
                  : "…"}
              </div>
              <div className="hint num">
                {format(t.archive.progressCount, { done: progress.done, total: progress.total, msgs: messages.length, n: messageCount })}
              </div>
            </>
          )}

          {phase === "done" && progress && (
            <div className="v-ok">{format(t.archive.finished, { total: progress.total, n: messageCount })}</div>
          )}
          {phase === "stopped" && (
            <div className="hint">{format(t.archive.stopped, { msgs: messages.length, n: messageCount || "?" })}</div>
          )}
          {phase === "error" && (
            <div className="error-box" role="alert">
              <strong>{t.archive.errorTitle}</strong>
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {messages.length > 0 && (
        <>
          <div className="chart-box">
            <span className="label">
              {format(t.archive.aggChart, { n: messages.length })}
              {partial && <> &middot; {format(t.archive.partialNote, { msgs: messages.length, n: messageCount })}</>}
            </span>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={aggRows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="name" tick={AXIS_STYLE} />
                <YAxis tick={AXIS_STYLE} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} />
                <Legend wrapperStyle={{ fontFamily: "Hanken Grotesk, system-ui", fontSize: 13, color: CHART.ink }} />
                <Bar dataKey="min" fill={CHART.faint} name={t.archive.aggHeaders.min} radius={[4, 4, 0, 0]} isAnimationActive={!busy} />
                <Bar dataKey="avg" fill={CHART.ink} name={t.archive.aggHeaders.avg} radius={[4, 4, 0, 0]} isAnimationActive={!busy} />
                <Bar dataKey="max" fill={CHART.mid} name={t.archive.aggHeaders.max} radius={[4, 4, 0, 0]} isAnimationActive={!busy} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.archive.aggHeaders.algorithm}</th>
                <th>{t.archive.aggHeaders.avg}</th>
                <th>{t.archive.aggHeaders.min}</th>
                <th>{t.archive.aggHeaders.max}</th>
                <th>{t.archive.aggHeaders.successRate}</th>
              </tr>
            </thead>
            <tbody>
              {aggRows.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td className="num">{row.avg.toFixed(1)}</td>
                  <td className="num">{row.min.toFixed(1)}</td>
                  <td className="num">{row.max.toFixed(1)}</td>
                  <td className="num">{row.successRate.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          </div>
          <h3>{t.archive.perMessage}</h3>
          <p className="hint">
            {format(t.archive.stdNote, { n: REPEATS })}
          </p>
          {/* phones: the first rows, the rest behind "show all" (Mihai 2026-11-05) */}
          <div className={`table-wrap per-msg ${allRows ? "open" : ""}`}>
          <table>
            <thead>
              <tr>
                <th>{t.archive.message}</th>
                {showKeys && <th>{t.archive.trueKey}</th>}
                {ALGORITHMS.map((a) => (
                  <th key={a}>{t.algorithms.names[a]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id} className="row-in">
                  <td>{m.title}</td>
                  {showKeys && <td className="key">{m.true_key}</td>}
                  {ALGORITHMS.map((a) => {
                    const r = m.results.find((res) => res.algorithm === a.replace("-", "_"));
                    if (!r) return <td key={a}>&mdash;</td>;
                    return (
                      <td key={a} className={r.recovered_key === m.true_key ? "v-ok" : "v-bad"}>
                        <Icon name={r.recovered_key === m.true_key ? "check" : "close"} size={14} /> {r.recovered_key === m.true_key ? t.results.ok : t.results.fail} &middot; {r.elapsed_ms.toFixed(1)}
                        {r.elapsed_std_ms !== undefined && r.elapsed_std_ms > 0 && <span className="std"> &plusmn;{r.elapsed_std_ms.toFixed(1)}</span>} ms
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {messages.length > 3 && (
            <div className="phone-only">
              <button className="btn quiet small" type="button" aria-expanded={allRows} onClick={() => setAllRows(!allRows)}>
                {allRows ? t.composer.showLess : t.composer.showAll}
              </button>
            </div>
          )}
        </>
      )}
    </div>
    </>
  );
}
