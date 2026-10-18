import Link from "next/link";
import { EmptyState } from "@/ui/components/Feedback";
import { getLocale } from "@/ui/i18n/server";
import { translate } from "@/ui/i18n/translate";

export default async function NotFound() {
  const locale = await getLocale();
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <EmptyState
          title={translate(locale, "shell.notFound.title")}
          message={translate(locale, "shell.notFound.message")}
          action={
            <Link href="/" style={{ color: "var(--accent)", fontWeight: 600 }}>
              {translate(locale, "shell.notFound.action")}
            </Link>
          }
        />
      </div>
    </div>
  );
}
