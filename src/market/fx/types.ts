/** Internal FX provider contract: routes/services never see a provider's wire format. */
export type FxIso = "USD" | "EUR" | "GBP" | "RUB";

/** Per-unit rate in AMD (already divided by the published Amount). Decimal STRING, never a float. */
export interface FxObservation {
  iso: string;
  /** the date the rate is valid for (CBA working day, Asia/Yerevan calendar date) */
  date: string;
  rate: string;
  /** change vs the previous working day when the provider publishes it */
  diff: string | null;
}

export interface FxLatestResult {
  /** CBA "CurrentDate": the latest published working day - NOT the calendar today */
  currentDate: string;
  observations: FxObservation[];
}

export interface FxProvider {
  readonly name: "CBA" | "Frankfurter" | "fawazahmed0";
  latest(isos: readonly string[]): Promise<FxLatestResult>;
  /** working-day observations in [from, to] (inclusive). Providers that cannot do ranges omit this. */
  range?(from: string, to: string, isos: readonly string[]): Promise<FxObservation[]>;
}
