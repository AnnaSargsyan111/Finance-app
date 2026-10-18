"use client";

import { InfoTip } from "../components/InfoTip";
import { useT } from "../i18n";
import { metricInfo, type InfoCtx } from "./metric-info";

/** the "i" next to a metric on the result: three short parts, the last one using the numbers of the result on screen. Nothing if there is no explanation for `k`. */
export function MetricTip({ k, ctx }: { k: string | null; ctx?: InfoCtx }) {
  const t = useT(); // also makes the explanation re-render when the language changes
  const info = metricInfo(k, ctx);
  if (!info) return null;
  return (
    <InfoTip
      title={info.title}
      sections={[
        { label: t("metrics.tip.whatItIs"), text: info.what },
        { label: t("metrics.tip.howToRead"), text: info.read },
        ...(info.example ? [{ label: t("metrics.tip.inThisResult"), text: info.example, highlight: true }] : []),
      ]}
    />
  );
}
