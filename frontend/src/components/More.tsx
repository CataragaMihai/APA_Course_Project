import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLanguage } from "../i18n/LanguageContext";

/**
 * Long text, clamped (8 lines on desktop, 5 on phones: Mihai 2026-11-05, "is a student really gonna read all
 * of this?") with a "show all" toggle that appears only when the text actually overflows.
 */
export default function More({ children, className = "", id, label }: { children: ReactNode; className?: string; id: string; label?: string }) {
  const { t } = useLanguage();
  const box = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setOver(open || el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, children]);
  return (
    <>
      <p ref={box} className={`${className} more ${open ? "" : "clamped"}`} id={id} aria-label={label}>
        {children}
      </p>
      {over && (
        <div>
          <button className="btn quiet small more-toggle" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
            {open ? t.composer.showLess : t.composer.showAll}
          </button>
        </div>
      )}
    </>
  );
}
