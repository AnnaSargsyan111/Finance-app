"use client";

import { useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Display";
import { Note } from "../components/Feedback";
import { IconLogout } from "../components/Icons";
import { PageHeader } from "../shell/AppShell";
import { useSession } from "../shell/Session";
import s from "./settings.module.css";

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className={s.field}>
      <dt className={s.label}>{label}</dt>
      <dd className={s.value}>{value || "-"}</dd>
    </div>
  );
}

/** Read-only profile (v1): the details collected at registration, plus sign-out. */
export function SettingsPage() {
  const { user, signOut } = useSession();
  const [busy, setBusy] = useState(false);
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
          <dl className={s.fields}>
            <ReadOnlyField label="First Name" value={user.firstName} />
            <ReadOnlyField label="Last Name" value={user.lastName} />
            <ReadOnlyField label="Email" value={user.email} />
          </dl>
          <div style={{ marginTop: 24 }}>
            <Note>Profile details are read-only for now. Editing your profile and changing your password aren&apos;t available in this version.</Note>
          </div>
        </Card>
        <Card title="Session" eyebrow="Security">
          <p className={s.sessionText}>Signing out ends your session on this device. You&apos;ll need to log in again to see your data.</p>
          <Button
            variant="secondary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await signOut();
            }}
          >
            <IconLogout size={16} />
            Sign out
          </Button>
        </Card>
      </div>
    </>
  );
}
