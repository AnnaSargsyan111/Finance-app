import type { Metadata } from "next";
import { SettingsPage } from "@/ui/settings/SettingsPage";

export const metadata: Metadata = { title: "Settings / Profile" };

export default function Page() {
  return <SettingsPage />;
}
