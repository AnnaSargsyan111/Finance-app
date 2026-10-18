"use client";

import { useState } from "react";
import { FX_PAIRS, getFxBanks } from "../api/market";
import { errorMessage } from "../api/client";
import type { FxBank, FxRate } from "../api/types";
import { Card, Figure, Segmented } from "../components/Display";
import { ErrorState, Note, Skeleton } from "../components/Feedback";
import { useResource } from "../hooks/useResource";
import { useT } from "../i18n";
import { formatAgo, formatFx } from "../lib/format";
import { useNow } from "../hooks/useDebounce";
import { MetaLine } from "./MetaLine";
import s from "./market.module.css";

type RateType = "cash" | "noncash";

/** the bank's own rate for one currency, shown as two clearly separate numbers: Buy and Sell (banks quote 2 decimals, even RUB) */
function BankTile({ pair, bank, type, official }: { pair: string; bank: FxBank; type: RateType; official: FxRate | undefined }) {
  const t = useT();
  const rate = (type === "cash" ? bank.cash : bank.nonCash).find((r) => r.pair === pair);
  return (
    <li className={s.bankTile}>
      <span className={s.bankPair}>{pair}</span>
      {rate ? (
        <div className={s.bankCols}>
          <div className={s.bankCol}>
            <span className={s.bankColLabel}>{t("market.bank.buy")}</span>
            <Figure value={rate.buy} decimals={2} size="sm" />
            <span className={s.bankColHint}>{t("market.bank.buyHint")}</span>
          </div>
          <div className={s.bankCol}>
            <span className={s.bankColLabel}>{t("market.bank.sell")}</span>
            <Figure value={rate.sell} decimals={2} size="sm" />
            <span className={s.bankColHint}>{t("market.bank.sellHint")}</span>
          </div>
        </div>
      ) : (
        <p className={s.bankMissing}>{t(type === "cash" ? "market.bank.missingCash" : "market.bank.missingNonCash", { currency: pair.split("/")[0] })}</p>
      )}
      {official ? <span className={s.bankOfficial}>{t("market.bank.cbaOfficial", { rate: formatFx(official.rate, pair) })}</span> : null}
    </li>
  );
}

/**
 * Buy / sell rates of Ameriabank, ACBA Bank and IDBank, one bank at a time, Cash or Non-cash (Cash by default). The CBA rate above
 * is a single reference number; banks quote two (they buy low and sell high), which is why they are shown apart.
 */
export function BankRates({ official }: { official: FxRate[] | undefined }) {
  const t = useT();
  const res = useResource((signal) => getFxBanks(signal), []);
  const [bankId, setBankId] = useState<string | null>(null);
  const [rateType, setRateType] = useState<RateType>("cash");
  const now = useNow();

  const banks = res.data?.data.banks ?? [];
  const bank = banks.find((b) => b.id === bankId) ?? banks[0];
  const rateTypes = [
    { value: "cash", label: t("market.bank.cash"), title: t("market.bank.cashTitle") },
    { value: "noncash", label: t("market.bank.nonCash"), title: t("market.bank.nonCashTitle") },
  ] as const;

  return (
    <Card
      title={t("market.bank.title")}
      eyebrow={t("market.bank.eyebrow")}
      actions={
        <>
          <Segmented label={t("market.bank.rateTypeGroup")} value={rateType} onChange={setRateType} options={rateTypes} />
          {banks.length > 1 ? <Segmented label={t("market.bank.bankGroup")} value={bank.id} onChange={setBankId} options={banks.map((b) => ({ value: b.id, label: b.name }))} /> : null}
        </>
      }
    >
      {res.status === "error" && !res.data ? (
        <ErrorState title={t("market.bank.errorTitle")} message={errorMessage(res.error)} onRetry={res.reload} compact />
      ) : !res.data || !bank ? (
        <Skeleton height={190} />
      ) : (
        <>
          <ul className={s.bankGrid} aria-label={t(rateType === "cash" ? "market.bank.listCash" : "market.bank.listNonCash", { bank: bank.name })}>
            {FX_PAIRS.map((pair) => (
              <BankTile key={pair} pair={pair} bank={bank} type={rateType} official={official?.find((r) => r.pair === pair)} />
            ))}
          </ul>
          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <MetaLine meta={res.data.meta} kind="ratesRead" extra={bank.capturedAt ? t("market.bank.boardUpdated", { bank: bank.name, when: formatAgo(bank.capturedAt, now) }) : undefined} />
            <Note>
              {t("market.bank.note")} {t("market.bank.noteData")}{" "}
              <a className={s.bankLink} href={res.data.data.attribution.url} target="_blank" rel="noopener noreferrer">
                {t("market.bank.attribution")}
              </a>
              {t("market.bank.noteEnd")}
            </Note>
          </div>
        </>
      )}
    </Card>
  );
}
