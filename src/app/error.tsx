"use client";

import { useEffect } from "react";
import { ErrorState } from "@/ui/components/Feedback";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Next.js 16 passes `retry` (not `reset`) to error boundaries. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <ErrorState title={t("shell.error.title")} message={t("shell.error.message")} onRetry={() => retry()} />
      </div>
    </div>
  );
}
