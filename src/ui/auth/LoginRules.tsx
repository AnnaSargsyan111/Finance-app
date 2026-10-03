import { Logo } from "../components/Icons";
import { RULE_GROUPS } from "./login-rules-data";
import s from "./auth.module.css";
import r from "./login-rules.module.css";

/**
 * Left side of the LOGIN page only (the other auth screens keep their original left side). Reuses the shared aside frame
 * (logo on top, disclaimer at the bottom) and replaces the middle with two groups of rules of thumb. Unlike the
 * decorative original it is real content, so it is not hidden from screen readers. The sources stay in login-rules-data.ts
 * (so every figure can be traced) but are not shown here: links under every rule made the text feel heavy.
 */
export function LoginRules() {
  return (
    <aside className={s.aside} aria-labelledby="login-rules-title">
      <div className={s.brandBig}>
        <Logo size={34} />
        <span>Finova</span>
      </div>

      <div className={r.body}>
        <h2 id="login-rules-title" className="sr-only">
          Money rules of thumb
        </h2>
        {RULE_GROUPS.map((group) => (
          <section key={group.id} className={r.group} aria-labelledby={`rules-${group.id}`}>
            <h3 id={`rules-${group.id}`} className={r.groupTitle}>
              {group.lead}
              <span className={r.groupMuted}>then…</span>
            </h3>
            <ol className={r.rules}>
              {group.rules.map((rule, i) => (
                <li key={rule.id} className={r.rule}>
                  <span className={r.num} aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <p className={r.ruleTitle}>{rule.title}</p>
                    <p className={r.ruleBody}>{rule.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <p className={s.foot}>Informational tool. Not investment advice.</p>
    </aside>
  );
}
