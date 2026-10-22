"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabPanel } from "../components/Display";
import { useT, type Key } from "../i18n";
import { PageHeader } from "../shell/AppShell";
import { FxSection } from "./FxSection";
import { NewsSection } from "./NewsSection";
import { IpoSection } from "./IpoSection";
import { StocksSection } from "./StocksSection";
import s from "./market.module.css";

const TABS: readonly { value: "rates" | "stocks" | "news" | "ipo"; label: Key }[] = [
  { value: "rates", label: "market.page.tabRates" },
  { value: "stocks", label: "market.page.tabStocks" },
  { value: "news", label: "market.page.tabNews" },
  { value: "ipo", label: "market.page.tabIpo" },
];
type Tab = (typeof TABS)[number]["value"];

export function MarketPage() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.some((x) => x.value === raw) ? (raw as Tab) : "rates";
  const setTab = (v: Tab) => router.replace(`/market?tab=${v}`, { scroll: false });
  return (
    <>
      <PageHeader title={t("market.page.title")} subtitle={t("market.page.subtitle")} />
      <div className={s.tabsWrap}>
        <Tabs label={t("market.page.tabsLabel")} value={tab} tabs={TABS.map((x) => ({ value: x.value, label: t(x.label) }))} onChange={setTab} idPrefix="market" />
      </div>
      <TabPanel idPrefix="market" value={tab}>
        {tab === "rates" ? <FxSection /> : null}
        {tab === "stocks" ? <StocksSection /> : null}
        {tab === "news" ? <NewsSection /> : null}
        {tab === "ipo" ? <IpoSection /> : null}
      </TabPanel>
    </>
  );
}
