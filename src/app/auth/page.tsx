import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthPage } from "@/ui/auth/AuthPage";
import { Splash } from "@/ui/shell/Splash";

export const metadata: Metadata = { title: "Log in or sign up" };

export default function Page() {
  return (
    <Suspense fallback={<Splash text="Loading" />}>
      <AuthPage />
    </Suspense>
  );
}
