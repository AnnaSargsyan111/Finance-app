"use client";

import { useState } from "react";
import { FX_PAIRS, getFxBanks } from "../api/market";
import { errorMessage } from "../api/client";
import type { FxBank, FxRate } from "../api/types";
import { Card, Figure, Segmented } from "../components/Display";
import { ErrorState, Note, Skeleton } from "../components/Feedback";
import { useResource } from "../hooks/useResource";
import { formatAgo, formatFx } from "../lib/format";
import { useNow } from "../hooks/useDebounce";
import { MetaLine } from "./MetaLine";
import s from "./market.module.css";

type RateType = "cash" | "noncash";
const RATE_TYPES = [
  { value: "cash", label: "Cash", title: "Banknotes exchanged at the bank counter" },
  { value: "noncash", label: "Non-cash", title: "Card and bank-transfer rates" },
] as const;

/** the bank's own rate for one currency, shown as two clearly separate numbers: Buy and Sell (banks quote 2 decimals, even RUB) */
function BankTile({ pair, bank, type, official }: { pair: string; bank: FxBank; type: RateType; official: FxRate | undefined }) {
  const rate = (type === "cash" ? bank.cash : bank.nonCash).find((r) => r.pair === pair);
  return (
    <li className={s.bankTile}>
      <span className={s.bankPair}>{pair}</span>
      {rate ? (
        <div className={s.bankCols}>
          <div className={s.bankCol}>
            <span className={s.bankColLabel}>Buy</span>
            <Figure value={rate.buy} decimals={2} size="sm" />
            <span className={s.bankColHint}>Bank pays you</span>
          </div>
          <div className={s.bankCol}>
            <span className={s.bankColLabel}>Sell</span>
            <Figure value={rate.sell} decimals={2} size="sm" />
            <span className={s.bankColHint}>You pay the bank</span>
          </div>
        </div>
      ) : (
        <p className={s.bankMissing}>
          This bank does not publish a {pair.split("/")[0]} {type === "cash" ? "cash" : "non-cash"} rate.
        </p>
      )}
      {official ? <span className={s.bankOfficial}>CBA official: {formatFx(official.rate, pair)} AMD</span> : null}
    </li>
  );
}

/**
 * Buy / sell rates of Ameriabank, ACBA Bank and IDBank, one bank at a time, Cash or Non-cash (Cash by default). The CBA rate above
 * is a single reference number; banks quote two (they buy low and sell high), which is why they are shown apart.
 */
export function BankRates({ official }: { official: FxRate[] | undefined }) {
  const res = useResource((signal) => getFxBanks(signal), []);
  const [bankId, setBankId] = useState<string | null>(null);
  const [rateType, setRateType] = useState<RateType>("cash");
  const now = useNow();

  const banks = res.data?.data.banks ?? [];
  const bank = banks.find((b) => b.id === bankId) ?? banks[0];

  return (
    <Card
      title="Bank buy and sell rates"
      eyebrow="Exchange at a bank"
      actions={
        <>
          <Segmented label="Rate type" value={rateType} onChange={setRateType} options={RATE_TYPES} />
          {banks.length > 1 ? <Segmented label="Bank" value={bank.id} onChange={setBankId} options={banks.map((b) => ({ value: b.id, label: b.name }))} /> : null}
        </>
      }
    >
      {res.status === "error" && !res.data ? (
        <ErrorState title="We couldn't load bank rates" message={errorMessage(res.error)} onRetry={res.reload} compact />
      ) : !res.data || !bank ? (
        <Skeleton height={190} />
      ) : (
        <>
          <ul className={s.bankGrid} aria-label={`${bank.name} ${rateType === "cash" ? "cash" : "non-cash"} rates`}>
            {FX_PAIRS.map((pair) => (
              <BankTile key={pair} pair={pair} bank={bank} type={rateType} official={official?.find((r) => r.pair === pair)} />
            ))}
          </ul>
          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <MetaLine meta={res.data.meta} label="Rates read" extra={bank.capturedAt ? `${bank.name} board updated ${formatAgo(bank.capturedAt, now)}` : undefined} />
            <Note>
              Buy is what the bank pays you when you sell it foreign currency; Sell is what you pay when you buy foreign currency from it. Cash is for banknotes at the counter;
              Non-cash is for card and bank-transfer exchange. Rates are indicative and change during the day, so confirm with the bank before you exchange. Data:{" "}
              <a className={s.bankLink} href={res.data.data.attribution.url} target="_blank" rel="noopener noreferrer">
                {res.data.data.attribution.name}
              </a>
              .
            </Note>
          </div>
        </>
      )}
    </Card>
  );
}
