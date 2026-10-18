import { Suspense } from "react";
import { pageMetadata } from "@/ui/i18n/server";
import { MarketPage } from "@/ui/market/MarketPage";

export const generateMetadata = () => pageMetadata("common.meta.market");

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MarketPage />
    </Suspense>
  );
}
