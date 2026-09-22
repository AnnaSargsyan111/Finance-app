import type { Metadata } from "next";
import { PersonalFinancePage } from "@/ui/pf/PersonalFinancePage";

export const metadata: Metadata = { title: "Personal Finance" };

export default function Page() {
  return <PersonalFinancePage />;
}
