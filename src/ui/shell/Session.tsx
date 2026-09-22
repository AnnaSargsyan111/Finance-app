"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSession, signOut as apiSignOut } from "../api/auth";
import { ErrorState } from "../components/Feedback";
import { isApiError, redirectToLogin } from "../api/client";
import type { User } from "../api/types";
import { Splash } from "./Splash";

interface SessionCtx {
  user: User;
  signOut: () => Promise<void>;
  /** Updates the cached user everywhere it's shown (top-bar initials, greeting, Settings) without a reload. */
  updateUser: (user: User) => void;
}

const Ctx = createContext<SessionCtx | null>(null);

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside <SessionGate>");
  return v;
}

/**
 * Guards the whole app: no session -> /auth?mode=login&next=<route>. While the session is being confirmed the
 * normal loading transition (Splash) is shown, the same one shown after sign-up.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; user: User | null; error?: unknown }>({ status: "loading", user: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    getSession(ctrl.signal)
      .then((r) => setState({ status: "ready", user: r.user }))
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        if (isApiError(e) && e.status === 401) {
          redirectToLogin();
          return;
        }
        setState({ status: "error", user: null, error: e });
      });
    return () => ctrl.abort();
  }, [nonce]);

  const signOut = useCallback(async () => {
    try {
      await apiSignOut();
    } finally {
      router.replace("/auth?mode=login");
    }
  }, [router]);

  const updateUser = useCallback((user: User) => setState((s) => (s.user ? { ...s, user } : s)), []);

  const value = useMemo(() => (state.user ? { user: state.user, signOut, updateUser } : null), [state.user, signOut, updateUser]);

  if (state.status === "error") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 480, width: "100%" }}>
          <ErrorState title="We couldn't load your session" message="Check your connection and try again." onRetry={() => { setState({ status: "loading", user: null }); setNonce((n) => n + 1); }} />
        </div>
      </div>
    );
  }
  if (state.status !== "ready" || !value) return <Splash text="Preparing your workspace" />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
