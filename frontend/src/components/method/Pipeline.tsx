import { useLanguage } from "../../i18n/LanguageContext";

/**
 * The steps every try goes through. While the attack runs, a highlight walks the chain on a fixed slow beat
 * (CSS, whatever the speed of the sweep, so it never flickers); at the end every step reads as done.
 */
export default function Pipeline({ steps, state }: { steps: string[]; state: "run" | "done" }) {
  const { t } = useLanguage();
  return (
    <ol className={`mx-pipe is-${state}`} aria-label={t.method.pipe.label}>
      {steps.map((s, i) => (
        <li key={s} style={{ "--i": i } as React.CSSProperties}>
          <span className="mx-pipe-i num" aria-hidden="true">
            {i + 1}
          </span>
          {s}
        </li>
      ))}
    </ol>
  );
}
