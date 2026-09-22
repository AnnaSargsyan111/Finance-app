"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "../api/auth";
import { Splash } from "./Splash";

export function RootRedirect() {
  const router = useRouter();
  useEffect(() => {
    const ctrl = new AbortController();
    getSession(ctrl.signal)
      .then(() => router.replace("/personal-finance"))
      .catch(() => {
        if (!ctrl.signal.aborted) router.replace("/auth");
      });
    return () => ctrl.abort();
  }, [router]);
  return <Splash text="Loading" />;
}
