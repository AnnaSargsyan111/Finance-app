"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { changePassword } from "../api/auth";
import { isApiError } from "../api/client";
import { PasswordChecklist } from "../auth/PasswordChecklist";
import { PASSWORD_MISMATCH_MESSAGE, passwordsMismatch, validateChangePasswordFields } from "../auth/validate";
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
 * Change Password modal (Settings only): New Password (with the live checklist) + Confirm Password, no Current
 * Password field (owner decision). Save is always clickable; a click only ever adds "This field is required." for
 * whichever of the two fields is empty — the checklist and the live "don't match" message under Confirm Password
 * are the feedback for everything else, and both keep the click blocked until they're satisfied. A successful change
 * keeps the current session valid; it never signs the user out or redirects.
 */
export function ChangePasswordModal({ open, rules, onClose, onSuccess, triggerRef }: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<{ newPassword?: string; confirmPassword?: string }>({});
  const firstRef = useRef<HTMLInputElement>(null);

  const mismatch = passwordsMismatch(newPassword, confirmPassword);
  const confirmError = fields.confirmPassword ?? (mismatch ? PASSWORD_MISMATCH_MESSAGE : undefined);

  // every time the modal opens, it starts from a clean form: nothing typed earlier is ever shown again
  useEffect(() => {
    if (open) {
      setNewPassword("");
      setConfirmPassword("");
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
    if (busy) return;
    const check = validateChangePasswordFields(newPassword, confirmPassword, rules);
    if (!check.canSubmit) {
      // only ever "required" here: an empty field. A non-empty-but-weak password or a mismatch is already visible
      // live (checklist / "Passwords don't match.") and needs no extra message — just stay blocked.
      setFields(check.fields);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await changePassword({ newPassword, confirmPassword });
      onSuccess();
    } catch (err) {
      setNewPassword("");
      setConfirmPassword("");
      if (isApiError(err) && err.code === "RATE_LIMITED") {
        setError(err.message || "Too many attempts. Please wait a few minutes and try again.");
      } else if (isApiError(err) && err.fields) {
        setFields(err.fields); // server is authoritative, e.g. a confirmPassword mismatch it caught
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
        <div>
          <PasswordField
            ref={firstRef}
            label="New Password"
            name="newPassword"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              // clear a stale "required" from an earlier click so the live checklist (and, once both fields have
              // content, the mismatch message below) shows through immediately instead of being masked by it
              if (fields.newPassword) setFields((f) => ({ ...f, newPassword: undefined }));
            }}
            error={fields.newPassword}
            required
          />
          <PasswordChecklist password={newPassword} rules={rules} />
        </div>
        <PasswordField
          label="Confirm Password"
          name="confirmPassword"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            if (fields.confirmPassword) setFields((f) => ({ ...f, confirmPassword: undefined }));
          }}
          error={confirmError}
          required
        />
        <div className={s.modalActions}>
          <Button type="button" variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
