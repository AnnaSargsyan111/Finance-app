"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cx } from "../lib/cx";
import { Logo } from "../components/Icons";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { FLIP_AT_RATIO, SHOW_AHEAD_PX, decideCard, flipDelays, type ScrollDirection } from "./flip-cards";
import { SourceLink } from "./MarketFacts";
import { SPENDING_IDEAS } from "./spending-psychology-data";
import s from "./market-facts.module.css";

interface CardState {
  /** face-up (text showing). The server renders every card face-up so the text is there without JavaScript. */
  flipped: boolean;
  /** change without animating (rewinding off screen, or showing a card the visitor scrolled UP into) */
  instant: boolean;
  /** seconds to wait before flipping, so cards arriving together flip one after another */
  delay: number;
}

const FACE_UP: CardState = { flipped: true, instant: true, delay: 0 };

/**
 * "The psychology of spending": four well-known money habits explained, shown under the market numbers on sign-up only.
 * The cards start face-down (a Finova back) and flip over one by one when the visitor scrolls DOWN into them; scrolling up
 * into them shows them already face-up. The rules live in flip-cards.ts. With reduced motion they are simply face-up.
 */
export function SpendingPsychology() {
  const reduced = useReducedMotion();
  const cardEls = useRef<(HTMLLIElement | null)[]>([]);
  const direction = useRef<ScrollDirection>("down");
  const [cards, setCards] = useState<CardState[]>(() => SPENDING_IDEAS.map(() => FACE_UP));

  // which way the visitor is scrolling
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > last) direction.current = "down";
      else if (y < last) direction.current = "up";
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (reduced || typeof IntersectionObserver === "undefined") {
      setCards(SPENDING_IDEAS.map(() => FACE_UP));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const dir = direction.current;
        setCards((prev) => {
          const next = prev.map((c) => ({ ...c }));
          const flips: number[] = [];
          for (const entry of entries) {
            const i = cardEls.current.indexOf(entry.target as HTMLLIElement);
            if (i < 0) continue;
            const view = {
              intersectionRatio: entry.intersectionRatio,
              isIntersecting: entry.isIntersecting,
              top: entry.boundingClientRect.top,
              viewportHeight: window.innerHeight, // the real screen, not the observer's extended area
            };
            const action = decideCard(next[i].flipped, view, dir);            if (action === "flip") flips.push(i);
            else if (action === "show") next[i] = FACE_UP;
            else if (action === "reset") next[i] = { flipped: false, instant: true, delay: 0 };
          }
          // cards arriving together flip in order, one after another
          const delays = flipDelays(flips.length);
          flips.sort((a, b) => a - b).forEach((i, k) => (next[i] = { flipped: true, instant: false, delay: delays[k] }));
          return next;
        });
      },
      { threshold: [0, FLIP_AT_RATIO], rootMargin: `${SHOW_AHEAD_PX}px 0px 0px 0px` },
    );
    cardEls.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [reduced]);

  return (
    <section className={cx(s.section, s.sectionAlt)} aria-labelledby="spending-psychology-title">
      <div className={s.inner}>
        <header className={s.head}>
          <span className={s.eyebrow}>Know your habits</span>
          <h2 id="spending-psychology-title" className={s.title}>
            The psychology of spending
          </h2>
          <p className={s.lead}>Four ideas from behavioural economics that explain why money so often leaves our hands faster than we planned.</p>
        </header>

        <ul className={s.facts}>
          {SPENDING_IDEAS.map((idea, i) => (
            <li
              key={idea.id}
              ref={(el) => {
                cardEls.current[i] = el;
              }}
              className={s.flipCard}
              data-flipped={cards[i].flipped}
              data-instant={cards[i].instant}
              style={{ "--flip-delay": `${cards[i].delay}s` } as CSSProperties}
            >
              <div className={s.flipInner}>
                <div className={cx(s.fact, s.flipFace)}>
                  <span className={s.factTag}>{idea.tag}</span>
                  <h3 className={s.factTitle}>{idea.title}</h3>
                  <p className={s.factBody}>{idea.body}</p>
                  <p className={s.example}>
                    <span className={s.exampleLabel}>{idea.example.label}</span>
                    {idea.example.text}
                  </p>
                  <span className={s.sources}>
                    {idea.sources.map((source) => (
                      <SourceLink key={source.url} source={source} />
                    ))}
                  </span>
                </div>
                <div className={cx(s.flipBack, s.flipFace)} aria-hidden="true">
                  <Logo size={52} />
                  <span className={s.flipBackName}>Finova</span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <p className={s.note}>Summaries of published research and popular ideas, with sources. Some, like the Latte Factor, are debated. For general information only, not financial advice.</p>
      </div>
    </section>
  );
}
