import { Suspense } from "react";
import { pageMetadata } from "@/ui/i18n/server";
import { AuthPage } from "@/ui/auth/AuthPage";
import { Splash } from "@/ui/shell/Splash";

export const generateMetadata = () => pageMetadata("common.meta.auth");

export default function Page() {
  return (
    <Suspense fallback={<Splash text="Loading" />}>
      <AuthPage />
    </Suspense>
  );
}
