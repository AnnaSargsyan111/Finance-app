"use client";

import { cx } from "../lib/cx";
import { IconCheck } from "../components/Icons";
import { checkPassword } from "./password-rules";
import s from "./auth.module.css";

/**
 * Live password-rule checklist. Shared by sign-up, reset-password (AuthPage.tsx) and Settings' Change Password
 * modal — one component, reused exactly, so all three surfaces turn each rule on identically.
 */
export function PasswordChecklist({ password, rules }: { password: string; rules: { id: string; label: string }[] }) {
  const { results } = checkPassword(password, rules);
  return (
    <div>
      <ul className={s.checklist} aria-label="Password requirements">
        {results.map((r) => (
          <li key={r.id} className={cx(s.rule, r.ok && s.ruleOk)}>
            <span className={s.ruleMark} aria-hidden="true">
              <IconCheck size={12} strokeWidth={3} />
            </span>
            <span>
              {r.label}
              <span className="sr-only">{r.ok ? " (met)" : " (not met yet)"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
