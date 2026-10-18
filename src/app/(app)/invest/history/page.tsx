import { pageMetadata } from "@/ui/i18n/server";
import { HistoryPage } from "@/ui/invest/HistoryPage";

export const generateMetadata = () => pageMetadata("common.meta.history");

export default function Page() {
  return <HistoryPage />;
}
