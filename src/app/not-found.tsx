import Link from "next/link";
import { EmptyState } from "@/ui/components/Feedback";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <EmptyState
          title="This page doesn't exist"
          message="The link may be broken or the page may have moved."
          action={
            <Link href="/" style={{ color: "var(--accent)", fontWeight: 600 }}>
              Go to Finova
            </Link>
          }
        />
      </div>
    </div>
  );
}
