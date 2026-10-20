"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { forgotPassword, getPasswordRules, getSession, resetPassword, signIn, signUp } from "../api/auth";
import { isApiError, safeNext } from "../api/client";
import type { PasswordPolicy } from "../api/types";
import { Button } from "../components/Button";
import { Note } from "../components/Feedback";
import { PasswordField, TextField } from "../components/Fields";
import { Logo } from "../components/Icons";
import { LanguageSwitch, tg, useT } from "../i18n";
import { Splash } from "../shell/Splash";
import { GetStarted } from "./GetStarted";
import { LoginRules } from "./LoginRules";
import { MarketFacts } from "./MarketFacts";
import { SpendingPsychology } from "./SpendingPsychology";
import { PasswordChecklist } from "./PasswordChecklist";
import { DEFAULT_RULES } from "./password-rules";
import { validateForgotFields, validateLoginFields, validateResetPassword, validateSignUpFields } from "./validate";
import s from "./auth.module.css";

type Mode = "signup" | "login" | "forgot" | "reset";
const MODES: Mode[] = ["signup", "login", "forgot", "reset"];

interface FormProps {
  rules: { id: string; label: string }[];
  goto: (mode: Mode) => void;
  onAuthed: (kind: "signup" | "login") => void;
}

/** API error codes are mapped to dictionary texts; the server's own (English) message is only the fallback for any other code */
function formError(e: unknown): string {
  if (!isApiError(e)) return tg("auth.errors.generic");
  if (e.code === "NETWORK") return tg("auth.errors.network");
  if (e.code === "RATE_LIMITED") return tg("auth.errors.rateLimited");
  if (e.code === "EMAIL_TAKEN") return tg("auth.errors.emailTaken");
  if (e.code === "INVALID_CREDENTIALS") return tg("auth.errors.invalidCredentials");
  return e.message;
}

/* ------------------------------------------------------------------ sign up */
function SignUpForm({ rules, goto, onAuthed }: FormProps) {
  const t = useT();
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const check = validateSignUpFields({ firstName, lastName, email, password }, rules);
    if (!check.canSubmit) {
      setFields(check.fields as Record<string, string>);
      setError(null);
      return;
    }
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
        <TextField label={t("auth.fields.firstName")} name="firstName" autoComplete="given-name" value={firstName} onChange={(e) => setFirst(e.target.value)} error={fields.firstName} maxLength={60} required />
        <TextField label={t("auth.fields.lastName")} name="lastName" autoComplete="family-name" value={lastName} onChange={(e) => setLast(e.target.value)} error={fields.lastName} maxLength={60} required />
      </div>
      <TextField label={t("auth.fields.email")} name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} maxLength={254} required />
      <PasswordField label={t("auth.fields.password")} name="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} required />
      <PasswordChecklist password={password} rules={rules} />
      <Button type="submit" variant="primary" block loading={busy}>
        {t("auth.signup.submit")}
      </Button>
      <p className={s.switch}>
        {t("auth.signup.haveAccount")}{" "}
        <button type="button" className={s.linkBtn} onClick={() => goto("login")}>
          {t("auth.signup.logIn")}
        </button>
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ log in */
function LoginForm({ goto, onAuthed }: FormProps) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<{ email?: string; password?: string }>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const check = validateLoginFields(email, password);
    if (!check.canSubmit) {
      setFields(check.fields);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await signIn({ email: email.trim(), password });
      onAuthed("login");
    } catch (err) {
      setPassword("");
      // one generic message for wrong credentials (no account enumeration)
      setError(formError(err));
      setBusy(false);
    }
  }

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      {error ? <Note tone="error">{error}</Note> : null}
      <TextField label={t("auth.fields.emailAddress")} name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} required />
      <PasswordField label={t("auth.fields.password")} name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} required />
      <div className={s.between}>
        <span />
        <button type="button" className={s.linkBtn} onClick={() => goto("forgot")}>
          {t("auth.login.forgot")}
        </button>
      </div>
      <Button type="submit" variant="primary" block loading={busy}>
        {t("auth.login.submit")}
      </Button>
      <p className={s.switch}>
        {t("auth.login.noAccount")}{" "}
        <button type="button" className={s.linkBtn} onClick={() => goto("signup")}>
          {t("auth.login.signUp")}
        </button>
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ forgot */
function ForgotForm({ goto }: FormProps) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<{ email?: string }>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const check = validateForgotFields(email);
    if (!check.canSubmit) {
      setFields(check.fields);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
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
        <Note>{t("auth.forgot.sent")}</Note>
        <Button variant="secondary" block onClick={() => goto("login")}>
          {t("auth.forgot.backToLogin")}
        </Button>
      </div>
    );

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      {error ? <Note tone="error">{error}</Note> : null}
      <TextField label={t("auth.fields.emailAddress")} name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} required />
      <Button type="submit" variant="primary" block loading={busy}>
        {t("auth.forgot.submit")}
      </Button>
      <p className={s.switch}>
        <button type="button" className={s.linkBtn} onClick={() => goto("login")}>
          {t("auth.forgot.backToLogin")}
        </button>
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ reset */
function ResetForm({ rules, goto, token }: FormProps & { token: string }) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(false); // the error is "invalid or expired link": offers a button to request a new one
  const [fieldErr, setFieldErr] = useState<string | undefined>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const check = validateResetPassword(password, rules);
    if (!check.canSubmit) {
      setFieldErr(check.fields.newPassword);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    setLinkInvalid(false);
    setFieldErr(undefined);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setPassword("");
      if (isApiError(err) && err.code === "TOKEN_INVALID_OR_EXPIRED") {
        setError(tg("auth.reset.linkInvalid"));
        setLinkInvalid(true);
      }
      else if (isApiError(err) && err.fields?.newPassword) setFieldErr(err.fields.newPassword);
      else setError(formError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token)
    return (
      <div className={s.success}>
        <Note tone="warn">{t("auth.reset.tokenMissing")}</Note>
        <Button variant="secondary" block onClick={() => goto("forgot")}>
          {t("auth.reset.requestNew")}
        </Button>
      </div>
    );

  if (done)
    return (
      <div className={s.success} role="status">
        <Note>{t("auth.reset.done")}</Note>
        <Button variant="primary" block onClick={() => goto("login")}>
          {t("auth.reset.logIn")}
        </Button>
      </div>
    );

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      {error ? (
        <Note
          tone="error"
          action={
            linkInvalid ? (
              <button type="button" className={s.linkBtn} onClick={() => goto("forgot")}>
                {t("auth.reset.newLink")}
              </button>
            ) : null
          }
        >
          {error}
        </Note>
      ) : null}
      <PasswordField label={t("auth.fields.newPassword")} name="newPassword" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErr} required />
      <PasswordChecklist password={password} rules={rules} />
      <Button type="submit" variant="primary" block loading={busy}>
        {t("auth.reset.submit")}
      </Button>
      <p className={s.switch}>
        <button type="button" className={s.linkBtn} onClick={() => goto("login")}>
          {t("auth.reset.backToLogin")}
        </button>
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ page */
export function AuthPage() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("mode");
  const mode: Mode = MODES.includes(raw as Mode) ? (raw as Mode) : "signup";
  const token = params.get("token") ?? "";
  const next = safeNext(params.get("next"));
  const [rules, setRules] = useState<{ id: string; label: string }[]>(DEFAULT_RULES);
  const [transition, setTransition] = useState<"signup" | "login" | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // QA-003: someone who is already logged in has no use for the sign-up / log-in form - send them into the app.
  // The reset-password link is the exception: it must keep working whatever the current session is.
  useEffect(() => {
    if (mode === "reset") return;
    const ctrl = new AbortController();
    getSession(ctrl.signal)
      .then(() => {
        if (!ctrl.signal.aborted) router.replace(next ?? "/personal-finance");
      })
      .catch(() => undefined); // 401 (logged out) or a network problem: just stay on the form
    return () => ctrl.abort();
    // only on arrival: switching between the modes of this page must not re-check
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // sign-up auto-logs the user in and opens Personal Finance at once (no waiting screen); log-in keeps a short loading transition
      if (kind === "signup") router.replace("/personal-finance");
      else window.setTimeout(() => router.replace(next ?? "/personal-finance"), 500);
    },
    [router, next],
  );

  if (transition) return <Splash text={transition === "signup" ? t("auth.transition.signup") : t("auth.transition.login")} />;

  const props: FormProps = { rules, goto, onAuthed };

  return (
    <>
      <div className={s.page}>
        {mode === "login" ? (
          <LoginRules />
        ) : (
          <aside className={s.aside} aria-hidden="true">
            <div className={s.brandBig}>
              <Logo size={34} />
              <span>Finova</span>
            </div>
            <div>
              <p className={s.hero}>
                {t("auth.aside.heroLead")}<span className={s.heroMuted}>{t("auth.aside.heroMuted")}</span>
              </p>
              <ul className={s.points}>
                <li>
                  <span className={s.pointDot} />
                  <span>{t("auth.aside.point1")}</span>
                </li>
                <li>
                  <span className={s.pointDot} />
                  <span>{t("auth.aside.point2")}</span>
                </li>
                <li>
                  <span className={s.pointDot} />
                  <span>{t("auth.aside.point3")}</span>
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
            <p className={s.foot}>{t("auth.aside.disclaimer")}</p>
          </aside>
        )}

        <main className={s.panel} id="content">
          <div className={s.langBar}>
            <LanguageSwitch />
          </div>
          <div className={s.mobileBrand}>
            <Logo size={30} />
            <span>Finova</span>
          </div>
          <div className={s.card}>
            <h1 className={s.title} tabIndex={-1} ref={headingRef} style={{ outline: "none" }}>
              {t(`auth.mode.${mode}.title`)}
            </h1>
            <p className={s.lead}>{t(`auth.mode.${mode}.lead`)}</p>
            {/* key = mode: switching between the states of this one page starts each form fresh */}
            {mode === "signup" ? <SignUpForm key="signup" {...props} /> : null}
            {mode === "login" ? <LoginForm key="login" {...props} /> : null}
            {mode === "forgot" ? <ForgotForm key="forgot" {...props} /> : null}
            {mode === "reset" ? <ResetForm key="reset" {...props} token={token} /> : null}
          </div>
        </main>
      </div>
      {mode === "signup" ? (
        <>
          <MarketFacts />
          <SpendingPsychology />
          <GetStarted />
        </>
      ) : null}
    </>
  );
}
