import type { Metadata } from "next";
import { AssistantPage } from "@/ui/assistant/AssistantPage";

export const metadata: Metadata = { title: "AI Assistant" };

export default function Page() {
  return <AssistantPage />;
}
