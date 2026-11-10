import { useLanguage } from "../i18n/LanguageContext";
import Icon from "./Icon";
import { navLinks } from "./Nav";

/** The page's closing band (Mihai 2026-11-10): the opposite tone, section links, the headline edge to edge, course details. */
export default function SiteFooter() {
  const { t } = useLanguage();
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-top">
          <nav aria-label={t.footer.nav}>
            <ul>
              {navLinks(t.nav).map(([href, label]) => (
                <li key={href}>
                  <a href={href}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <a href="#top">
            {t.footer.top} <Icon name="arrowUp" size={16} />
          </a>
        </div>
        {/* same length scaling as the hero's title (Hero.tsx --title-k), so both languages span the width */}
        <p className="site-footer-mark" style={{ "--title-k": Math.min(1, 18 / t.hero.title.length) } as React.CSSProperties}>
          {t.hero.title}
        </p>
        <div className="footer-meta">
          <span>{t.team.course}</span>
          <a href="https://github.com/CataragaMihai/APA_Course_Project">
            <Icon name="github" size={16} /> {t.team.repo}
          </a>
        </div>
      </div>
    </footer>
  );
}
