import { Suspense } from "react";
import type { Metadata } from "next";
import { MarketPage } from "@/ui/market/MarketPage";

export const metadata: Metadata = { title: "Market & News" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MarketPage />
    </Suspense>
  );
}
