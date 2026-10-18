import { pageMetadata } from "@/ui/i18n/server";
import { InvestPage } from "@/ui/invest/InvestPage";

export const generateMetadata = () => pageMetadata("common.meta.invest");

export default function Page() {
  return <InvestPage />;
}
