"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { forgotPassword, getPasswordRules, resetPassword, signIn, signUp } from "../api/auth";
import { isApiError, safeNext } from "../api/client";
import type { PasswordPolicy } from "../api/types";
import { Button } from "../components/Button";
import { Note } from "../components/Feedback";
import { PasswordField, TextField } from "../components/Fields";
import { IconCheck, Logo } from "../components/Icons";
import { Splash } from "../shell/Splash";
import { cx } from "../lib/cx";
import { checkPassword, DEFAULT_RULES, EMAIL_RE } from "./password-rules";
import s from "./auth.module.css";

type Mode = "signup" | "login" | "forgot" | "reset";
const MODES: Mode[] = ["signup", "login", "forgot", "reset"];

function PasswordChecklist({ password, rules }: { password: string; rules: { id: string; label: string }[] }) {
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

interface FormProps {
  rules: { id: string; label: string }[];
  goto: (mode: Mode) => void;
  onAuthed: (kind: "signup" | "login") => void;
}

function formError(e: unknown): string {
  if (!isApiError(e)) return "Something went wrong. Please try again.";
  if (e.code === "NETWORK") return "Can't reach Finova. Check your connection and try again.";
  if (e.code === "RATE_LIMITED") return e.message || "Too many attempts. Please wait a few minutes and try again.";
  return e.message;
}

/* ------------------------------------------------------------------ sign up */
function SignUpForm({ rules, goto, onAuthed }: FormProps) {
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const pw = checkPassword(password, rules);
  const valid = firstName.trim().length > 0 && lastName.trim().length > 0 && EMAIL_RE.test(email.trim()) && pw.valid;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await signUp({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password });
      onAuthed("signup");
    } catch (err) {
      // keep everything except the password
      setPassword("");
      if (isApiError(err) && err.fields && Object.keys(err.fields).length) {
        setFields(err.fields);
        if (!err.fields.password) setError(null);
      } else setError(formError(err));
      setBusy(false);
    }
  }

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      {error ? <Note tone="error">{error}</Note> : null}
      <div className={s.row}>
        <TextField label="First Name" name="firstName" autoComplete="given-name" value={firstName} onChange={(e) => setFirst(e.target.value)} error={fields.firstName} maxLength={60} required />
        <TextField label="Last Name" name="lastName" autoComplete="family-name" value={lastName} onChange={(e) => setLast(e.target.value)} error={fields.lastName} maxLength={60} required />
      </div>
      <TextField label="Email" name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} maxLength={254} required />
      <PasswordField label="Password" name="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} required />
      <PasswordChecklist password={password} rules={rules} />
      <Button type="submit" variant="primary" block loading={busy} disabled={!valid}>
        Create account
      </Button>
      <p className={s.switch}>
        Already have an account?{" "}
        <button type="button" className={s.linkBtn} onClick={() => goto("login")}>
          Log in
        </button>
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ log in */
function LoginForm({ goto, onAuthed }: FormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = EMAIL_RE.test(email.trim()) && password.length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn({ email: email.trim(), password });
      onAuthed("login");
    } catch (err) {
      setPassword("");
      // one generic message for wrong credentials (no account enumeration)
      setError(isApiError(err) && err.code === "INVALID_CREDENTIALS" ? "Email or password is incorrect." : formError(err));
      setBusy(false);
    }
  }

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      {error ? <Note tone="error">{error}</Note> : null}
      <TextField label="Email address" name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <PasswordField label="Password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <div className={s.between}>
        <span />
        <button type="button" className={s.linkBtn} onClick={() => goto("forgot")}>
          Forgot password?
        </button>
      </div>
      <Button type="submit" variant="primary" block loading={busy} disabled={!valid}>
        Log in
      </Button>
      <p className={s.switch}>
        Don&apos;t have an account yet?{" "}
        <button type="button" className={s.linkBtn} onClick={() => goto("signup")}>
          Sign up
        </button>
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ forgot */
function ForgotForm({ goto }: FormProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = EMAIL_RE.test(email.trim());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(formError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <div className={s.success} role="status">
        <Note>If an account exists, we&apos;ve sent an email with a link to reset your password.</Note>
        <Button variant="secondary" block onClick={() => goto("login")}>
          Back to log in
        </Button>
      </div>
    );

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      {error ? <Note tone="error">{error}</Note> : null}
      <TextField label="Email address" name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Button type="submit" variant="primary" block loading={busy} disabled={!valid}>
        Send reset link
      </Button>
      <p className={s.switch}>
        <button type="button" className={s.linkBtn} onClick={() => goto("login")}>
          Back to log in
        </button>
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ reset */
function ResetForm({ rules, goto, token }: FormProps & { token: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<string | undefined>();
  const pw = checkPassword(password, rules);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pw.valid || busy) return;
    setBusy(true);
    setError(null);
    setFieldErr(undefined);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setPassword("");
      if (isApiError(err) && err.code === "TOKEN_INVALID_OR_EXPIRED") setError("This reset link is invalid or has expired. Request a new one.");
      else if (isApiError(err) && err.fields?.newPassword) setFieldErr(err.fields.newPassword);
      else setError(formError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token)
    return (
      <div className={s.success}>
        <Note tone="warn">This reset link is missing its token. Request a new link to continue.</Note>
        <Button variant="secondary" block onClick={() => goto("forgot")}>
          Request a new link
        </Button>
      </div>
    );

  if (done)
    return (
      <div className={s.success} role="status">
        <Note>Your password has been changed. You can log in with the new password.</Note>
        <Button variant="primary" block onClick={() => goto("login")}>
          Log in
        </Button>
      </div>
    );

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      {error ? (
        <Note
          tone="error"
          action={
            error.includes("Request a new one") ? (
              <button type="button" className={s.linkBtn} onClick={() => goto("forgot")}>
                New link
              </button>
            ) : null
          }
        >
          {error}
        </Note>
      ) : null}
      <PasswordField label="New password" name="newPassword" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErr} required />
      <PasswordChecklist password={password} rules={rules} />
      <Button type="submit" variant="primary" block loading={busy} disabled={!pw.valid}>
        Reset password
      </Button>
      <p className={s.switch}>
        <button type="button" className={s.linkBtn} onClick={() => goto("login")}>
          Back to log in
        </button>
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ page */
const COPY: Record<Mode, { title: string; lead: string }> = {
  signup: { title: "Create your account", lead: "Start tracking your money and the markets in one calm place." },
  login: { title: "Welcome back", lead: "Log in to continue to Finova." },
  forgot: { title: "Forgot your password?", lead: "Enter your email and we'll send you a link to reset it." },
  reset: { title: "Choose a new password", lead: "Pick a strong password you haven't used before." },
};

export function AuthPage() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("mode");
  const mode: Mode = MODES.includes(raw as Mode) ? (raw as Mode) : "signup";
  const token = params.get("token") ?? "";
  const next = safeNext(params.get("next"));
  const [rules, setRules] = useState<{ id: string; label: string }[]>(DEFAULT_RULES);
  const [transition, setTransition] = useState<"signup" | "login" | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    getPasswordRules(ctrl.signal)
      .then((p: PasswordPolicy) => {
        if (p.rules?.length) setRules(p.rules);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  const goto = useCallback(
    (m: Mode) => {
      const q = new URLSearchParams({ mode: m });
      if (next) q.set("next", next);
      router.replace(`/auth?${q.toString()}`);
    },
    [router, next],
  );

  // move focus to the heading when the mode changes (screen-reader and keyboard friendly)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [mode]);

  const onAuthed = useCallback(
    (kind: "signup" | "login") => {
      setTransition(kind);
      // normal loading transition before the main application (sign-up auto-logs the user in)
      window.setTimeout(() => router.replace(next ?? "/personal-finance"), kind === "signup" ? 1100 : 500);
    },
    [router, next],
  );

  if (transition) return <Splash text={transition === "signup" ? "Setting up your account" : "Signing you in"} />;

  const copy = COPY[mode];
  const props: FormProps = { rules, goto, onAuthed };

  return (
    <div className={s.page}>
      <aside className={s.aside} aria-hidden="true">
        <div className={s.brandBig}>
          <Logo size={34} />
          <span>Finova</span>
        </div>
        <div>
          <p className={s.hero}>
            Your money, <span className={s.heroMuted}>in one clear view.</span>
          </p>
          <ul className={s.points}>
            <li>
              <span className={s.pointDot} />
              <span>Plan income and expenses period by period, with charts that follow your numbers.</span>
            </li>
            <li>
              <span className={s.pointDot} />
              <span>Follow exchange rates, big-tech stocks and trusted financial news.</span>
            </li>
            <li>
              <span className={s.pointDot} />
              <span>Explore informational investment ideas that match your risk and horizon.</span>
            </li>
          </ul>
        </div>
        <svg className={s.spark} viewBox="0 0 520 120" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#91F60D" stopOpacity="0.22" />
              <stop offset="1" stopColor="#91F60D" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 96 C40 90 60 70 100 74 S170 100 210 70 280 30 330 46 400 80 440 40 500 20 520 14 V120 H0 Z" fill="url(#sparkfill)" />
          <path d="M0 96 C40 90 60 70 100 74 S170 100 210 70 280 30 330 46 400 80 440 40 500 20 520 14" stroke="#91F60D" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <p className={s.foot}>Informational tool. Not investment advice.</p>
      </aside>

      <main className={s.panel} id="content">
        <div className={s.mobileBrand}>
          <Logo size={30} />
          <span>Finova</span>
        </div>
        <div className={s.card}>
          <h1 className={s.title} tabIndex={-1} ref={headingRef} style={{ outline: "none" }}>
            {copy.title}
          </h1>
          <p className={s.lead}>{copy.lead}</p>
          {/* key = mode: switching between the states of this one page starts each form fresh */}
          {mode === "signup" ? <SignUpForm key="signup" {...props} /> : null}
          {mode === "login" ? <LoginForm key="login" {...props} /> : null}
          {mode === "forgot" ? <ForgotForm key="forgot" {...props} /> : null}
          {mode === "reset" ? <ResetForm key="reset" {...props} token={token} /> : null}
        </div>
      </main>
    </div>
  );
}
