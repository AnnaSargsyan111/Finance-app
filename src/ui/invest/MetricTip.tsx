"use client";

import { InfoTip } from "../components/InfoTip";
import { metricInfo, type InfoCtx } from "./metric-info";

/** the "i" next to a metric on the result: three short parts, the last one using the numbers of the result on screen. Nothing if there is no explanation for `k`. */
export function MetricTip({ k, ctx }: { k: string | null; ctx?: InfoCtx }) {
  const info = metricInfo(k, ctx);
  if (!info) return null;
  return (
    <InfoTip
      title={info.title}
      sections={[
        { label: "What it is", text: info.what },
        { label: "How to read it", text: info.read },
        ...(info.example ? [{ label: "In this result", text: info.example, highlight: true }] : []),
      ]}
    />
  );
}
