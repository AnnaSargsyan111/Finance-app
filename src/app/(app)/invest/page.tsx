import type { Metadata } from "next";
import { InvestPage } from "@/ui/invest/InvestPage";

export const metadata: Metadata = { title: "Investment Recommendation" };

export default function Page() {
  return <InvestPage />;
}
