"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { changePassword } from "../api/auth";
import { isApiError } from "../api/client";
import { PasswordChecklist } from "../auth/PasswordChecklist";
import { checkPassword } from "../auth/password-rules";
import { Button } from "../components/Button";
import { Note } from "../components/Feedback";
import { PasswordField } from "../components/Fields";
import { Modal } from "../components/Modal";
import s from "./settings.module.css";

interface Props {
  open: boolean;
  rules: { id: string; label: string }[];
  onClose: () => void;
  onSuccess: () => void;
  /** the button that opened the modal, so focus can return to it reliably on close (see Modal.tsx) */
  triggerRef?: RefObject<HTMLElement | null>;
}

function errorText(e: unknown): string {
  if (!isApiError(e)) return "Something went wrong. Please try again.";
  if (e.code === "NETWORK") return "Can't reach Finova. Check your connection and try again.";
  return e.message;
}

/**
 * Change Password modal (Settings only). Same field components and live checklist as sign-up/reset (AuthPage.tsx /
 * PasswordChecklist.tsx) — no Confirm Password field, consistent with the rest of the app. A successful change keeps
 * the current session valid; it never signs the user out or redirects.
 */
export function ChangePasswordModal({ open, rules, onClose, onSuccess, triggerRef }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<{ currentPassword?: string; newPassword?: string }>({});
  const firstRef = useRef<HTMLInputElement>(null);
  const pw = checkPassword(newPassword, rules);
  const valid = currentPassword.length > 0 && pw.valid;

  // every time the modal opens, it starts from a clean form: nothing typed earlier is ever shown again
  useEffect(() => {
    if (open) {
      setCurrentPassword("");
      setNewPassword("");
      setError(null);
      setFields({});
      setBusy(false);
    }
  }, [open]);

  function close() {
    if (busy) return; // let an in-flight save finish rather than abandoning it silently
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await changePassword({ currentPassword, newPassword });
      onSuccess();
    } catch (err) {
      setCurrentPassword("");
      if (isApiError(err) && err.code === "RATE_LIMITED") {
        setError(err.message || "Too many attempts. Please wait a few minutes and try again.");
      } else if (isApiError(err) && (err.fields?.currentPassword || err.code === "INVALID_CREDENTIALS")) {
        setFields({ currentPassword: err.fields?.currentPassword ?? "Current password is incorrect." });
      } else if (isApiError(err) && err.fields) {
        setFields(err.fields);
      } else {
        setError(errorText(err));
      }
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Change password" onClose={close} initialFocusRef={firstRef} restoreFocusRef={triggerRef}>
      <form className={s.modalForm} onSubmit={submit} noValidate>
        {error ? <Note tone="error">{error}</Note> : null}
        <PasswordField
          ref={firstRef}
          label="Current Password"
          name="currentPassword"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          error={fields.currentPassword}
          required
        />
        <div>
          <PasswordField
            label="New Password"
            name="newPassword"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={fields.newPassword}
            required
          />
          <PasswordChecklist password={newPassword} rules={rules} />
        </div>
        <div className={s.modalActions}>
          <Button type="button" variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!valid}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
