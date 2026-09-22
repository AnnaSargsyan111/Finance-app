import type { Metadata } from "next";
import { HistoryPage } from "@/ui/invest/HistoryPage";

export const metadata: Metadata = { title: "Recommendation History" };

export default function Page() {
  return <HistoryPage />;
}
