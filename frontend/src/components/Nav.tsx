import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import LanguageSwitch from "./LanguageSwitch";
import ThemeSwitch from "./ThemeSwitch";

/** The page's sections, shared with the footer. */
export const navLinks = (nav: { decoder: string; archive: string; method: string; team: string }) => [
  ["#decodor", nav.decoder],
  ["#arhiva", nav.archive],
  ["#algoritmi", nav.method],
  ["#echipa", nav.team],
];

/**
 * Desktop: wordmark, centred links, theme + language. Under 1024 px the same links and tools live in a
 * slide-in drawer from the right (ported from eCarnet's phone menu, Mihai 2026-11-05): scrim, staggered
 * swing-in of the items, the hamburger turns into a close cross. The drawer wrapper is `display: contents`
 * on desktop, so nothing is rendered twice.
 */
export default function Nav() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLAnchorElement>(null);
  const links = navLinks(t.nav);
  const [active, setActive] = useState<string | null>(null); // the section under the viewport's middle; null on the hero
  const navEl = useRef<HTMLElement>(null);
  const underline = useRef<HTMLSpanElement>(null);

  // eCarnet's sliding underline: one bar glides to the active link, follows hover and keyboard focus, then returns
  const moveTo = (href: string | null) => {
    const bar = underline.current;
    const a = href ? navEl.current?.querySelector<HTMLElement>(`a[href="${href}"]`) : null;
    if (!bar) return;
    bar.classList.toggle("is-active", !!a);
    if (!a) return;
    bar.style.width = `${a.offsetWidth - 24}px`; // the links' 12 px side padding: the bar sits under the word
    bar.style.transform = `translateX(${a.offsetLeft + 12}px)`;
  };

  // scroll spy (eCarnet): a section is active when it crosses the middle of the viewport
  useEffect(() => {
    const spy = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id === "top" ? null : `#${e.target.id}`)),
      { rootMargin: "-50% 0px -50% 0px" },
    );
    ["#top", ...navLinks(t.nav).map(([href]) => href)].forEach((href) => {
      const section = document.querySelector(href);
      if (section) spy.observe(section);
    });
    return () => spy.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only the ids are read, and they never change

  useLayoutEffect(() => {
    const place = () => {
      if (!navEl.current?.matches(":hover")) moveTo(active); // never yank the bar from under the pointer
    };
    place();
    void document.fonts?.ready.then(place);
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, [active, t]); // eslint-disable-line react-hooks/exhaustive-deps -- moveTo only reads refs

  useEffect(() => {
    document.documentElement.classList.toggle("drawer-open", open);
    if (!open) return;
    first.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    // growing past the breakpoint must never leave the page scroll-locked
    const wide = matchMedia("(min-width: 1024px)");
    const onWide = () => wide.matches && setOpen(false);
    addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <a className="wordmark" href="#top">
            APA <span>·</span> {t.nav.wordmark}
          </a>
          <div className="nav-drawer" id="nav-drawer">
            <nav aria-label={t.nav.label} ref={navEl}>
              <ul className="nav-links" onMouseLeave={() => moveTo(active)} onBlur={() => moveTo(active)}>
                {links.map(([href, label], i) => (
                  <li key={href}>
                    <a
                      href={href}
                      ref={i === 0 ? first : undefined}
                      aria-current={active === href ? "location" : undefined}
                      onClick={() => setOpen(false)}
                      onMouseEnter={() => moveTo(href)}
                      onFocus={() => moveTo(href)}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
              <span className="nav-underline" ref={underline} aria-hidden="true" />
            </nav>
            <div className="drawer-divider" aria-hidden="true" />
            <div className="drawer-lang">
              <LanguageSwitch />
            </div>
          </div>
          {/* the theme stays in the bar on phones too (Mihai); the language moves into the drawer */}
          <div className="nav-tools">
            <ThemeSwitch />
            <span className="bar-lang">
              <LanguageSwitch />
            </span>
          </div>
          <button
            ref={toggle}
            className="nav-toggle"
            type="button"
            aria-label={open ? t.nav.close : t.nav.menu}
            aria-expanded={open}
            aria-controls="nav-drawer"
            onClick={() => setOpen(!open)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>
      <div className="nav-overlay" aria-hidden="true" onClick={() => setOpen(false)} />
    </>
  );
}
