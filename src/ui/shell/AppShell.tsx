"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../lib/cx";
import { greeting } from "../lib/format";
import { Spinner } from "../components/Feedback";
import { IconClose, IconLogout, IconMenu, Logo } from "../components/Icons";
import { LanguageSwitch } from "../i18n/LanguageSwitch";
import { useLocale, useT } from "../i18n/LocaleProvider";
import type { Key } from "../i18n/translate";
import { SessionGate, useSession } from "./Session";
import s from "./shell.module.css";

/**
 * Main navigation. Labels are fixed by the spec (English here; `labelKey` is the dictionary text shown in the chosen language).
 * The news detail page is NOT an item; it highlights its parent section.
 */
export const NAV_ITEMS = [
  { href: "/personal-finance", label: "Personal Finance", labelKey: "shell.nav.personalFinance", section: ["/personal-finance"] },
  { href: "/market", label: "Market & News", labelKey: "shell.nav.market", section: ["/market", "/news"] },
  { href: "/invest", label: "Investment Recommendation", labelKey: "shell.nav.invest", section: ["/invest"] },
  { href: "/assistant", label: "AI Assistant", labelKey: "shell.nav.assistant", section: ["/assistant"] },
  { href: "/settings", label: "Settings / Profile", labelKey: "shell.nav.settings", section: ["/settings"] },
] as const satisfies readonly { href: string; label: string; labelKey: Key; section: readonly string[] }[];

const inSection = (pathname: string, prefixes: readonly string[]) => prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

function Topbar() {
  const t = useT();
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setOpen(false);
    setMenuOpen(false);
  }, [pathname]);
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() || "F";

  const currentAttr = (item: (typeof NAV_ITEMS)[number]) => (pathname === item.href ? "page" : inSection(pathname, item.section) ? "true" : undefined);

  // Profile menu: close on an outside click or Escape (focus returns to the avatar button, same as the Modal pattern).
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || avatarRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      avatarRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  async function handleLogOut() {
    setMenuOpen(false);
    setSigningOut(true);
    await signOut(); // clears the session server-side and redirects to /auth; a fresh SessionGate mount there re-checks
    // the session on any later Back navigation into the app, so a stale authenticated screen cannot be reached (verified).
  }

  return (
    <header className={s.topbar}>
      <div className={s.topbarInner}>
        <Link href="/personal-finance" className={s.brand} aria-label={t("shell.topbar.home")}>
          <Logo />
          <span>Finova</span>
        </Link>
        <nav className={s.nav} aria-label={t("shell.topbar.mainNav")}>
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={cx(s.navLink, inSection(pathname, item.section) && s.navActive)} aria-current={currentAttr(item)}>
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>
        <div className={s.topRight}>
          <LanguageSwitch className={s.langSwitch} />
          <button type="button" className={s.menuBtn} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? t("shell.topbar.closeMenu") : t("shell.topbar.openMenu")} onClick={() => setOpen((v) => !v)}>
            {open ? <IconClose /> : <IconMenu />}
          </button>
          <div className={s.profileWrap}>
            <button
              type="button"
              ref={avatarRef}
              className={s.avatar}
              aria-label={t("shell.topbar.profileMenu", { name: `${user.firstName} ${user.lastName}` })}
              title={`${user.firstName} ${user.lastName}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {initials}
            </button>
            <div ref={menuRef} role="menu" aria-label={t("shell.topbar.profile")} className={cx(s.profileMenu, menuOpen && s.profileMenuOpen)}>
              <button type="button" role="menuitem" className={s.profileMenuItem} disabled={signingOut} onClick={handleLogOut}>
                {signingOut ? <Spinner /> : <IconLogout size={16} />}
                <span>{t("shell.topbar.logOut")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      {open ? (
        <nav id="mobile-nav" className={s.sheet} aria-label={t("shell.topbar.mainNav")}>
          <div className={s.sheetInner}>
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className={cx(s.sheetLink, inSection(pathname, item.section) && s.sheetActive)} aria-current={currentAttr(item)}>
                {t(item.labelKey)}
              </Link>
            ))}
            <div className={s.sheetLang}>
              <LanguageSwitch />
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

export function PageHeader({ title, subtitle, actions, greet = true }: { title: string; subtitle?: ReactNode; actions?: ReactNode; greet?: boolean }) {
  const { user } = useSession();
  const t = useT();
  const { locale } = useLocale();
  const [g, setG] = useState("");
  // the greeting depends on the time of day and on the language
  useEffect(() => setG(greeting()), [locale]);
  return (
    <div className={s.pageHead}>
      <div>
        {greet ? (
          <span className={s.greet} suppressHydrationWarning>
            {g ? t("shell.topbar.greetLine", { greeting: g, name: user.firstName }) : t("shell.topbar.hello", { name: user.firstName })}
          </span>
        ) : null}
        <h1 className={s.pageTitle}>{title}</h1>
        {subtitle ? <p className={s.pageSub}>{subtitle}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return <p className={s.disclaimer}>{children}</p>;
}

function Frame({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <>
      <a href="#content" className="sr-only" style={{ position: "absolute" }}>
        {t("shell.topbar.skip")}
      </a>
      <Topbar />
      <main id="content" className={s.main}>
        {children}
      </main>
    </>
  );
}

/** Session guard + top bar + content frame for every logged-in screen. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      <Frame>{children}</Frame>
    </SessionGate>
  );
}
