"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "../lib/cx";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { PLAY_AT_RATIO, nextCountAction } from "./count-up";
import { FACTS, STATS, type Source, type Stat } from "./market-facts-data";
import s from "./market-facts.module.css";

const COUNT_UP_MS = 1400;

const format = (n: number, decimals: number) => n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/**
 * Shows the final figure and counts up from 0 to it EVERY time it scrolls into view: it starts once the figure is mostly
 * visible, resets to 0 once it has left the screen completely, and so plays again on the way back (up or down). Partly
 * scrolling it in and out without leaving does not restart it. With reduced motion (or no IntersectionObserver) it never
 * animates. Screen readers get the final figure once, not every frame of the count.
 */
function CountUp({ stat }: { stat: Stat }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(stat.value);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof IntersectionObserver === "undefined") return;
    let raf = 0;
    let armed = true; // true while the figure is off screen: the next time it is mostly visible, it plays
    const io = new IntersectionObserver(
      ([entry]) => {
        const next = nextCountAction(armed, entry);
        armed = next.armed;
        if (next.action === "play") {
          cancelAnimationFrame(raf);
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / COUNT_UP_MS);
            setShown(stat.value * (1 - Math.pow(1 - t, 3))); // ease-out
            if (t < 1) raf = requestAnimationFrame(tick);
          };
          setShown(0);
          raf = requestAnimationFrame(tick);
        } else if (next.action === "reset") {
          // fully off screen: stop any count in progress and rewind, ready for the next time it comes into view
          cancelAnimationFrame(raf);
          setShown(0);
        }
      },
      { threshold: [0, PLAY_AT_RATIO] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [stat.value, reduced]);

  const text = (n: number) => `${stat.prefix ?? ""}${format(n, stat.decimals)}${stat.suffix ?? ""}`;
  return (
    <span ref={ref} className={cx(s.figure, stat.tone === "neg" && s.figureNeg)}>
      <span className="sr-only">{text(stat.value)}</span>
      <span aria-hidden="true" className="num">
        {text(shown)}
      </span>
    </span>
  );
}

export function SourceLink({ source }: { source: Source }) {
  return (
    <a className={s.source} href={source.url} target="_blank" rel="noopener noreferrer">
      Source: {source.name}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** "The stock market in numbers": a row of record statistics and a few facts, shown under the sign-up form only. */
export function MarketFacts() {
  return (
    <section className={s.section} aria-labelledby="market-facts-title">
      <div className={s.inner}>
        <header className={s.head}>
          <span className={s.eyebrow}>Before you start</span>
          <h2 id="market-facts-title" className={s.title}>
            The stock market in numbers
          </h2>
          <p className={s.lead}>A few things worth knowing about the markets Finova helps you follow.</p>
        </header>

        <ul className={s.stats}>
          {STATS.map((stat) => (
            <li key={stat.id} className={s.stat}>
              <CountUp stat={stat} />
              <span className={s.statLabel}>{stat.label}</span>
              <span className={s.statCaption}>{stat.caption}</span>
              <SourceLink source={stat.source} />
            </li>
          ))}
        </ul>

        <ul className={s.facts}>
          {FACTS.map((fact) => (
            <li key={fact.id} className={s.fact}>
              <span className={s.factTag}>{fact.tag}</span>
              <h3 className={s.factTitle}>{fact.title}</h3>
              <p className={s.factBody}>{fact.body}</p>
              <SourceLink source={fact.source} />
            </li>
          ))}
        </ul>

        <p className={s.note}>Figures are historical and sourced as noted. For general information only, not investment advice.</p>
      </div>
    </section>
  );
}
