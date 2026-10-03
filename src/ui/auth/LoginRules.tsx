import type { CSSProperties } from "react";
import { cx } from "../lib/cx";
import { Logo } from "../components/Icons";
import { RULE_GROUPS } from "./login-rules-data";
import s from "./auth.module.css";
import r from "./login-rules.module.css";

/** the faint, slowly drawing trend lines behind the rules (decorative; see login-rules.module.css for the animation) */
function TrendBackground() {
  return (
    <div className={r.bg} aria-hidden="true">
      <div className={r.grid} />
      <svg className={r.lines} viewBox="0 0 1000 1000" preserveAspectRatio="xMaxYMax slice" fill="none">
        <defs>
          <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#91F60D" stopOpacity="0.16" />
            <stop offset="1" stopColor="#91F60D" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* area under the main line */}
        <path className={r.area} d="M0 760 C 90 740, 140 800, 230 720 S 380 640, 470 690 S 640 520, 740 560 S 880 380, 1000 300 L1000 1000 L0 1000 Z" fill="url(#trend-fill)" />
        {/* the lines: each draws itself, then drifts gently */}
        <g className={r.drift}>
          <path className={cx(r.line, r.lineSilver)} pathLength="1" style={{ "--d": "0.1s" } as CSSProperties} d="M0 640 C 100 660, 180 590, 300 620 S 500 520, 620 560 S 800 460, 1000 420" />
          <path className={cx(r.line, r.lineBlue)} pathLength="1" style={{ "--d": "0.5s" } as CSSProperties} d="M0 840 C 120 800, 200 860, 320 790 S 520 740, 640 700 S 820 640, 1000 520" />
          <path className={cx(r.line, r.lineLimeDim)} pathLength="1" style={{ "--d": "0.9s" } as CSSProperties} d="M0 900 C 150 880, 250 910, 400 850 S 700 800, 1000 700" />
          <path className={cx(r.line, r.lineLime)} pathLength="1" style={{ "--d": "0.3s" } as CSSProperties} d="M0 760 C 90 740, 140 800, 230 720 S 380 640, 470 690 S 640 520, 740 560 S 880 380, 1000 300" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Left side of the LOGIN page only (the other auth screens keep their original left side). Reuses the shared aside frame
 * (logo on top, disclaimer at the bottom) and replaces the middle with two groups of rules of thumb, over a faint animated
 * trend-line background, each heading and rule fading in one after another. Unlike the decorative original it is real
 * content, so it is not hidden from screen readers (only the background is). The sources stay in login-rules-data.ts
 * (so every figure can be traced) but are not shown here: links under every rule made the text feel heavy.
 */
export function LoginRules() {
  let step = 0; // position in the reveal sequence: heading, its three rules, next heading, its three rules
  const at = (): CSSProperties => ({ "--i": step++ }) as CSSProperties;

  return (
    <aside className={s.aside} aria-labelledby="login-rules-title">
      <TrendBackground />

      <div className={cx(s.brandBig, r.layer)}>
        <Logo size={34} />
        <span>Finova</span>
      </div>

      <div className={r.body}>
        <h2 id="login-rules-title" className="sr-only">
          Money rules of thumb
        </h2>
        {RULE_GROUPS.map((group) => (
          <section key={group.id} className={r.group} aria-labelledby={`rules-${group.id}`}>
            <h3 id={`rules-${group.id}`} className={cx(r.groupTitle, r.reveal)} style={at()}>
              {group.lead}
              <span className={r.groupMuted}>then…</span>
            </h3>
            <ol className={r.rules}>
              {group.rules.map((rule, i) => (
                <li key={rule.id} className={cx(r.rule, r.reveal)} style={at()}>
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

      <p className={cx(s.foot, r.layer)}>Informational tool. Not investment advice.</p>
    </aside>
  );
}
