import type { ReactNode } from "react";
import { AppShell } from "@/ui/shell/AppShell";

/** Every screen inside the app: session guard + top bar. Public screens (/auth) live outside this group. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
