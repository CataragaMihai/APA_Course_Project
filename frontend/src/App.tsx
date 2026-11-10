import { lazy, Suspense, useEffect, useRef, useState } from "react";
import Nav from "./components/Nav";
import Hero from "./hero/Hero";
import Rail, { type Selection } from "./components/Rail";
import Composer from "./components/Composer";
import AllMessages from "./components/AllMessages";
import Stations from "./components/Stations";
import ResultsTable from "./components/ResultsTable";
import Decoded, { defaultPick } from "./components/Decoded";
import Method from "./components/Method";
import Team from "./components/Team";
import SiteFooter from "./components/SiteFooter";
import { fetchMessages, streamCrack } from "./api";
import { LanguageProvider, useLanguage } from "./i18n/LanguageContext";
import { format } from "./i18n/translations";
import { isCracked } from "./utils/verdict";
import type { AlgorithmId, AlgorithmRunState, MessageSummary, RevealResponse } from "./types";
import Icon from "./components/Icon";

// Charts pull in recharts (+ d3), the bulk of the bundle: loaded only when needed.
import Near from "./components/Near";
const ComparisonChart = lazy(() => import("./components/ComparisonChart"));
const ArchiveMode = lazy(() => import("./components/ArchiveMode"));

export const ALGORITHMS: AlgorithmId[] = ["brute-force", "dictionary", "frequency"];

function idleState(): AlgorithmRunState {
  return { status: "idle", progressMessage: "", attempts: 0, total: null, liveKey: "", keyLength: null, result: null };
}

function initialStates(): Record<AlgorithmId, AlgorithmRunState> {
  return { "brute-force": idleState(), dictionary: idleState(), frequency: idleState() };
}

export interface Mission {
  title: string;
  ciphertext: string;
  archiveId: string | null;
  summary: MessageSummary | null;
}

function Page() {
  const { t, lang } = useLanguage();
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // a sleeping free-tier backend takes 20-60 s to answer: say so instead of leaving skeleton rows with no explanation
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    if (messages.length || loadError) return setWaking(false);
    const id = setTimeout(() => setWaking(true), 4000);
    return () => clearTimeout(id);
  }, [messages.length, loadError]);
  const [selection, setSelection] = useState<Selection>(null);
  const [browsing, setBrowsing] = useState(false); // the full message list replaces the workspace
  const [mission, setMission] = useState<Mission | null>(null);
  const [states, setStates] = useState(initialStates);
  const [maxKeyLength, setMaxKeyLength] = useState(4);
  // Ground truth for checking each verdict: the revealed archive key, or the key the user typed
  const [truth, setTruth] = useState<RevealResponse | null>(null);
  // whose decoded text shows: picked on a station card (hover, click, tap, Enter), reset per mission
  const [picked, setPicked] = useState<AlgorithmId | null>(null);
  // One controller per mission: switching messages aborts runs still streaming for the old one
  const runs = useRef(new AbortController());
  useEffect(
    () => () => {
      runs.current.abort();
      runs.current = new AbortController(); // StrictMode remounts in dev; leave a live controller
    },
    [],
  );

  function load() {
    setLoadError(null);
    fetchMessages()
      .then((list) => {
        setMessages(list);
        // the demo needs one click: the first featured message is preselected
        const first = list.find((m) => m.featured) ?? list[0];
        if (first) setSelection((s) => s ?? { kind: "archive", id: first.id });
        if (first) setMission((m) => m ?? { title: first.title, ciphertext: first.ciphertext, archiveId: first.id, summary: first });
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, []);

  useEffect(() => {
    document.title = t.meta.pageTitle;
  }, [t]);

  function startMission(next: Mission | null, nextTruth: RevealResponse | null) {
    runs.current.abort();
    runs.current = new AbortController();
    setMission(next);
    setStates(initialStates());
    setTruth(nextTruth);
    setPicked(null);
  }

  function select(next: Selection) {
    setSelection(next);
    if (next?.kind === "archive") {
      const m = messages.find((x) => x.id === next.id);
      if (m) startMission({ title: m.title, ciphertext: m.ciphertext, archiveId: m.id, summary: m }, null);
    } else {
      startMission(null, null); // custom: the composer shows the form until something is encrypted
    }
  }

  function closeBrowse(focusSelector: string) {
    setBrowsing(false);
    requestAnimationFrame(() => {
      document.querySelector("#decodor")?.scrollIntoView({ block: "start" });
      // the rail or (below 1024 px) the picker, whichever is visible
      [...document.querySelectorAll<HTMLElement>(focusSelector)].find((el) => el.offsetParent)?.focus({ preventScroll: true });
    });
  }

  function customEncrypted(ciphertext: string, key: string, plaintext: string) {
    startMission({ title: "", ciphertext, archiveId: null, summary: null }, { id: "custom", key, plaintext });
  }

  async function runAlgorithm(id: AlgorithmId) {
    if (!mission) return;
    const { signal } = runs.current;
    setStates((prev) => ({ ...prev, [id]: { ...idleState(), status: "running", progressMessage: "…" } }));
    try {
      await streamCrack(
        id,
        mission.ciphertext,
        id === "brute-force" ? maxKeyLength : undefined,
        (event) => {
          if (signal.aborted) return;
          if (event.type === "progress") {
            setStates((prev) => {
              const p = prev[id];
              return {
                ...prev,
                [id]: {
                  ...p,
                  status: "running",
                  progressMessage: event.message,
                  attempts: event.attempts,
                  total: event.total ?? p.total,
                  liveKey: event.candidate_key ?? event.partial_key ?? p.liveKey,
                  keyLength: event.key_length ?? p.keyLength,
                },
              };
            });
          } else {
            // keep the last progress line: for a failure it says what was tried
            setStates((prev) => ({ ...prev, [id]: { ...prev[id], status: "done", attempts: event.attempts, result: event } }));
          }
        },
        signal,
        lang === "ru" ? "en" : lang, // the server has no Russian progress lines yet: English ones show
        // the server checks each verdict against the true key, which stays hidden until revealed
        mission.archiveId ? { message_id: mission.archiveId } : truth ? { true_key: truth.key } : {},
      );
    } catch (e) {
      if (signal.aborted) return;
      setStates((prev) => ({ ...prev, [id]: { ...idleState(), status: "error", error: e instanceof Error ? e.message : String(e) } }));
    }
  }

  function runAll() {
    for (const id of ALGORITHMS) void runAlgorithm(id);
  }

  // the custom title follows the language switch
  const missionTitle = mission ? (mission.archiveId ? mission.title : t.composer.customTitle) : "";
  const anyResult = ALGORITHMS.some((a) => states[a].result);
  const shown = picked && states[picked].result ? picked : defaultPick(states);
  const chartData = ALGORITHMS.filter((a) => states[a].result).map((a) => ({
    name: t.algorithms.names[a],
    short: t.algorithms.names[a],
    time: states[a].result!.elapsed_ms,
    attempts: states[a].result!.attempts,
    success: isCracked(states[a].result!),
  }));

  return (
    <>
      <a className="skip-link" href="#decodor">
        {t.nav.skip}
      </a>
      <Nav />
      <main>
        <Hero />

        <section className="section decoder" id="decodor" aria-labelledby="decoder-h">
          <h2 id="decoder-h" className="sr-only">
            {t.decoder.heading}
          </h2>
          {loadError && (
            <div className="error-box" role="alert" style={{ marginBottom: 24 }}>
              <strong>{format(t.common.loadError, { msg: loadError })}</strong>
              <div>
                <button className="btn small" type="button" onClick={load}>
                  {t.common.retry}
                </button>
              </div>
            </div>
          )}
          {waking && (
            <p className="hint" role="status" style={{ marginBottom: 16 }}>
              {t.common.waking}
            </p>
          )}
          <p className="ws-intro">
            <span className="ws-intro-mark">
              <Icon name="arrowDown" size={15} />
            </span>
            {t.decoder.intro}
          </p>
          {browsing ? (
            <AllMessages
              messages={messages}
              selectedId={selection?.kind === "archive" ? selection.id : null}
              onPick={(id) => {
                select({ kind: "archive", id });
                closeBrowse('.rail [aria-current="true"], .rail-picker > summary');
              }}
              onClose={() => closeBrowse(".rail .rail-all, .rail-picker > summary")}
            />
          ) : (
          <div className="ws">
            <Rail messages={messages} selection={selection} onSelect={select} onBrowseAll={() => setBrowsing(true)} />
            <div className="ws-main">
              <Composer
                key={selection?.kind === "custom" ? "custom" : mission?.archiveId ?? "none"} // custom keeps its form; archive resets per message
                mode={selection?.kind === "custom" ? "custom" : "archive"}
                mission={mission}
                missionTitle={missionTitle}
                truth={truth}
                onTruthChange={setTruth}
                onCustomEncrypted={customEncrypted}
                maxKeyLength={maxKeyLength}
                onMaxKeyLengthChange={setMaxKeyLength}
                running={ALGORITHMS.some((a) => states[a].status === "running")}
                onRunAll={runAll}
              />
              <Stations states={states} maxKeyLength={maxKeyLength} disabled={!mission} onRun={runAlgorithm} shown={shown} onPick={setPicked} />
              <Decoded states={states} shown={shown} />
              {anyResult && (
                <Suspense fallback={<div className="loading-line" aria-busy="true" />}>
                  <ComparisonChart data={chartData} />
                </Suspense>
              )}
              <ResultsTable states={states} missionTitle={missionTitle} />
            </div>
          </div>
          )}
        </section>

        <section className="section" id="arhiva" aria-labelledby="archive-h">
          <Near minHeight={320}>
            <ArchiveMode maxKeyLength={maxKeyLength} />
          </Near>
        </section>

        <Method mission={mission} missionTitle={missionTitle} truth={truth} maxKeyLength={maxKeyLength} />
      </main>
      <Team />
      <SiteFooter />
    </>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <Page />
    </LanguageProvider>
  );
}
