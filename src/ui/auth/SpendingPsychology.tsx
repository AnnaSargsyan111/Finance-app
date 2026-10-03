"use client";

import { cx } from "../lib/cx";
import { SourceLink } from "./MarketFacts";
import { SPENDING_IDEAS } from "./spending-psychology-data";
import s from "./market-facts.module.css";

/** "The psychology of spending": four well-known money habits explained, shown under the market numbers on sign-up only. */
export function SpendingPsychology() {
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
          {SPENDING_IDEAS.map((idea) => (
            <li key={idea.id} className={s.fact}>
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
            </li>
          ))}
        </ul>

        <p className={s.note}>Summaries of published research and popular ideas, with sources. Some, like the Latte Factor, are debated. For general information only, not financial advice.</p>
      </div>
    </section>
  );
}
