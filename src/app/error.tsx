"use client";

import { useEffect } from "react";
import { ErrorState } from "@/ui/components/Feedback";

/** Next.js 16 passes `retry` (not `reset`) to error boundaries. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <ErrorState title="Something went wrong" message="An unexpected error occurred while showing this page." onRetry={() => retry()} />
      </div>
    </div>
  );
}
