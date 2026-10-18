import { pageMetadata } from "@/ui/i18n/server";
import { AssistantPage } from "@/ui/assistant/AssistantPage";

export const generateMetadata = () => pageMetadata("common.meta.assistant");

export default function Page() {
  return <AssistantPage />;
}
