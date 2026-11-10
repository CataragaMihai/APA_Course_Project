import { LOCALE, type Lang } from "../i18n/translations";

// Shown in the skeleton's machine box when the load runs long (Mihai 2026-11-10). Built from the attack cards'
// parts: a card, a stencil title, the site's thin progress bar (`.bar`, the sliding `.scan` when the size is
// unknown) and the number-with-label of `.attempts`, fed by the real download progress of the 3D model.
export default function SlowLoad({ text, label, progress, lang }: { text: string; label: string; progress: number | null; lang: Lang }) {
  const f = progress === null ? null : Math.min(1, progress);
  return (
    <span className="slow-load">
      <span className="slow-card">
        <span className="slow-title">{text}</span>
        <span className={`bar ${f === null ? "scan" : ""}`}>
          <i style={f === null ? undefined : { transform: `scaleX(${f})` }} />
        </span>
        {f !== null && (
          <span className="attempts">
            <strong className="num">{f.toLocaleString(LOCALE[lang], { style: "percent" })}</strong>
            <span>{label}</span>
          </span>
        )}
      </span>
    </span>
  );
}
