import { pageMetadata } from "@/ui/i18n/server";
import { SettingsPage } from "@/ui/settings/SettingsPage";

export const generateMetadata = () => pageMetadata("common.meta.settings");

export default function Page() {
  return <SettingsPage />;
}
