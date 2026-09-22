import type { Metadata } from "next";
import { NewsDetailPage } from "@/ui/market/NewsDetailPage";

export const metadata: Metadata = { title: "News" };

export default function Page() {
  return <NewsDetailPage />;
}
