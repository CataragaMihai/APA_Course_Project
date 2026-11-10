// The site's icon set: one 2 px stroke on a 24 grid, currentColor, decorative only.
// Replaces the text glyphs (↓ → ✕ ✓ ✗ ▶ ⏸ ▾), which rendered differently on every system.
const PATHS = {
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  // the classic GitHub mark (Octicons, 16 grid): a filled logo, so it opts out of the set's stroke
  github: <path transform="scale(1.5)" fill="currentColor" stroke="none" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="M5 12.5 9.5 17 19 7" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  spinner: <path d="M12 3a9 9 0 1 0 9 9" />,
  // typing: a keyboard with a row of keys and the space bar
  type: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      {/* separate keys so they can be struck one after another (styles.css: .icon-type .key) */}
      {[6.5, 10, 13.5, 17.5].map((x, i) => (
        <path key={x} className="key" style={{ "--k": i } as React.CSSProperties} d={`M${x} 10h.01`} />
      ))}
      <path className="key space" style={{ "--k": 4 } as React.CSSProperties} d="M8 14h8" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 16, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`icon icon-${name} ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
