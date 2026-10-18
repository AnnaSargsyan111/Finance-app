import { pageMetadata } from "@/ui/i18n/server";
import { PersonalFinancePage } from "@/ui/pf/PersonalFinancePage";

export const generateMetadata = () => pageMetadata("common.meta.personalFinance");

export default function Page() {
  return <PersonalFinancePage />;
}
