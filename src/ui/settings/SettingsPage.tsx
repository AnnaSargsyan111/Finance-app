"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getPasswordRules, updateProfile } from "../api/auth";
import { errorMessage, isApiError } from "../api/client";
import { DEFAULT_RULES } from "../auth/password-rules";
import { Button } from "../components/Button";
import { Card } from "../components/Display";
import { Note } from "../components/Feedback";
import { TextField } from "../components/Fields";
import { IconLogout } from "../components/Icons";
import { ToastViewport, useToasts } from "../components/Toast";
import { PageHeader } from "../shell/AppShell";
import { useSession } from "../shell/Session";
import { ChangePasswordModal } from "./ChangePasswordModal";
import s from "./settings.module.css";

/** Profile: First Name and Last Name are editable; Email is fixed (shown with a tooltip explaining why). */
export function SettingsPage() {
  const { user, signOut, updateUser } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();

  const [rules, setRules] = useState<{ id: string; label: string }[]>(DEFAULT_RULES);
  useEffect(() => {
    const ctrl = new AbortController();
    getPasswordRules(ctrl.signal)
      .then((p) => {
        if (p.rules?.length) setRules(p.rules);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  // ---- editable name fields -------------------------------------------------------------------
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [savedFirstName, setSavedFirstName] = useState(user.firstName);
  const [savedLastName, setSavedLastName] = useState(user.lastName);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; lastName?: string }>({});

  const dirty = firstName.trim() !== savedFirstName || lastName.trim() !== savedLastName;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    // per spec: clicking Save while nothing changed must be a no-op (the button is also disabled while clean)
    if (!dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    setFieldErrors({});
    try {
      const { user: updated } = await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() });
      updateUser(updated); // refreshes the top-bar initials and greeting immediately, no reload needed
      setFirstName(updated.firstName);
      setLastName(updated.lastName);
      setSavedFirstName(updated.firstName);
      setSavedLastName(updated.lastName);
      pushToast("Your changes have been saved.");
    } catch (err) {
      if (isApiError(err) && err.fields) setFieldErrors(err.fields);
      else setSaveError(errorMessage(err, "We couldn't save your changes. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  // ---- change password modal -------------------------------------------------------------------
  const [pwOpen, setPwOpen] = useState(false);
  // captured via e.currentTarget on click (not document.activeElement): some browsers, e.g. Safari, never focus a
  // button on a mouse click, so this is the only reliable way to know what to return focus to when the modal closes
  const pwTriggerRef = useRef<HTMLButtonElement | null>(null);

  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() || "F";

  return (
    <>
      <PageHeader title="Settings / Profile" subtitle="The details you gave when you created your account." greet={false} />
      <div className={s.grid}>
        <Card title="Profile" eyebrow="Account details">
          <div className={s.identity}>
            <span className={s.avatar} aria-hidden="true">
              {initials}
            </span>
            <div>
              <p className={s.name}>
                {user.firstName} {user.lastName}
              </p>
              <p className={s.mail}>{user.email}</p>
            </div>
          </div>

          <form className={s.editForm} onSubmit={saveProfile} noValidate>
            {saveError ? <Note tone="error">{saveError}</Note> : null}
            <div className={s.editGrid}>
              <TextField
                label="First Name"
                name="firstName"
                autoComplete="given-name"
                maxLength={60}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                error={fieldErrors.firstName}
                required
              />
              <TextField
                label="Last Name"
                name="lastName"
                autoComplete="family-name"
                maxLength={60}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                error={fieldErrors.lastName}
                required
              />
            </div>
            <TextField
              label="Email"
              name="email"
              type="email"
              value={user.email}
              readOnly
              title="Email address cannot be changed."
              hint="Email address cannot be changed."
            />
            <div className={s.saveRow}>
              <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
                Save changes
              </Button>
            </div>
          </form>
        </Card>

        <Card title="Security" eyebrow="Password & session">
          <div className={s.securityActions}>
            <div>
              <p className={s.sessionText}>Change the password you use to log in. This won&apos;t sign you out of this device.</p>
              <Button
                variant="secondary"
                onClick={(e) => {
                  pwTriggerRef.current = e.currentTarget;
                  setPwOpen(true);
                }}
              >
                Change Password
              </Button>
            </div>

            <hr className={s.divider} style={{ width: "100%" }} />

            <div>
              <p className={s.sessionText}>Signing out ends your session on this device. You&apos;ll need to log in again to see your data.</p>
              <Button
                variant="secondary"
                loading={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  await signOut();
                }}
              >
                <IconLogout size={16} />
                Sign out
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <ChangePasswordModal
        open={pwOpen}
        rules={rules}
        onClose={() => setPwOpen(false)}
        onSuccess={() => {
          setPwOpen(false);
          pushToast("Password changed. Your other sessions have been signed out.");
        }}
        triggerRef={pwTriggerRef}
      />

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
