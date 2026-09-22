"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "../lib/cx";
import { greeting } from "../lib/format";
import { IconClose, IconMenu, Logo } from "../components/Icons";
import { SessionGate, useSession } from "./Session";
import s from "./shell.module.css";

/** Main navigation. Labels are fixed by the spec. The news detail page is NOT an item; it highlights its parent section. */
export const NAV_ITEMS = [
  { href: "/personal-finance", label: "Personal Finance", section: ["/personal-finance"] },
  { href: "/market", label: "Market & News", section: ["/market", "/news"] },
  { href: "/invest", label: "Investment Recommendation", section: ["/invest"] },
  { href: "/settings", label: "Settings / Profile", section: ["/settings"] },
] as const;

const inSection = (pathname: string, prefixes: readonly string[]) => prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

function Topbar() {
  const pathname = usePathname();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() || "F";

  const currentAttr = (item: (typeof NAV_ITEMS)[number]) => (pathname === item.href ? "page" : inSection(pathname, item.section) ? "true" : undefined);

  return (
    <header className={s.topbar}>
      <div className={s.topbarInner}>
        <Link href="/personal-finance" className={s.brand} aria-label="Finova home">
          <Logo />
          <span>Finova</span>
        </Link>
        <nav className={s.nav} aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={cx(s.navLink, inSection(pathname, item.section) && s.navActive)} aria-current={currentAttr(item)}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={s.topRight}>
          <button type="button" className={s.menuBtn} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((v) => !v)}>
            {open ? <IconClose /> : <IconMenu />}
          </button>
          <Link href="/settings" className={s.avatar} aria-label={`Profile: ${user.firstName} ${user.lastName}`} title={`${user.firstName} ${user.lastName}`}>
            {initials}
          </Link>
        </div>
      </div>
      {open ? (
        <nav id="mobile-nav" className={s.sheet} aria-label="Main">
          <div className={s.sheetInner}>
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className={cx(s.sheetLink, inSection(pathname, item.section) && s.sheetActive)} aria-current={currentAttr(item)}>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  );
}

export function PageHeader({ title, subtitle, actions, greet = true }: { title: string; subtitle?: ReactNode; actions?: ReactNode; greet?: boolean }) {
  const { user } = useSession();
  const [g, setG] = useState("");
  useEffect(() => setG(greeting()), []);
  return (
    <div className={s.pageHead}>
      <div>
        {greet ? (
          <span className={s.greet} suppressHydrationWarning>
            {g ? `${g}, ${user.firstName}` : `Hello, ${user.firstName}`}
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
  return (
    <>
      <a href="#content" className="sr-only" style={{ position: "absolute" }}>
        Skip to content
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
