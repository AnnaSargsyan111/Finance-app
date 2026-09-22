"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabPanel } from "../components/Display";
import { PageHeader } from "../shell/AppShell";
import { FxSection } from "./FxSection";
import { NewsSection } from "./NewsSection";
import { StocksSection } from "./StocksSection";
import s from "./market.module.css";

const TABS = [
  { value: "rates", label: "Exchange Rates" },
  { value: "stocks", label: "Stocks" },
  { value: "news", label: "News" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export function MarketPage() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : "rates";
  const setTab = (t: Tab) => router.replace(`/market?tab=${t}`, { scroll: false });
  return (
    <>
      <PageHeader title="Market & News" subtitle="Official exchange rates, delayed stock prices and headlines from trusted sources. Information only." />
      <div className={s.tabsWrap}>
        <Tabs label="Market sections" value={tab} tabs={TABS} onChange={setTab} idPrefix="market" />
      </div>
      <TabPanel idPrefix="market" value={tab}>
        {tab === "rates" ? <FxSection /> : null}
        {tab === "stocks" ? <StocksSection /> : null}
        {tab === "news" ? <NewsSection /> : null}
      </TabPanel>
    </>
  );
}
