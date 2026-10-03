"use client";

import { Button } from "../components/Button";
import { IconArrowUp } from "../components/Icons";
import { useReducedMotion } from "../hooks/useReducedMotion";
import s from "./market-facts.module.css";

/**
 * Closing call to action at the very bottom of the sign-up page: takes the visitor back up to the sign-up form and puts
 * the cursor in its first field. It only scrolls and focuses; it does not touch the form or its state.
 */
export function GetStarted() {
  const reduced = useReducedMotion();

  function goToForm() {
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    // preventScroll: the smooth scroll above is already on its way, a second jump would fight it
    document.querySelector<HTMLInputElement>('input[name="firstName"]')?.focus({ preventScroll: true });
  }

  return (
    <section className={s.cta} aria-labelledby="get-started-title">
      <div className={s.ctaInner}>
        <h2 id="get-started-title" className={s.ctaTitle}>
          Ready to start?
        </h2>
        <p className={s.lead}>Create your account and start tracking your money and the markets in one calm place.</p>
        <Button variant="primary" className={s.ctaButton} onClick={goToForm}>
          Get started
          <IconArrowUp size={18} />
          <span className="sr-only"> (goes to the sign-up form)</span>
        </Button>
      </div>
    </section>
  );
}
