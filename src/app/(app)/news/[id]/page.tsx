import { pageMetadata } from "@/ui/i18n/server";
import { NewsDetailPage } from "@/ui/market/NewsDetailPage";

export const generateMetadata = () => pageMetadata("common.meta.news");

export default function Page() {
  return <NewsDetailPage />;
}
