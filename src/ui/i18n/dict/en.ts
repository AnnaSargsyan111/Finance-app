import { assistant } from "./assistant.en";
import { auth } from "./auth.en";
import { common } from "./common.en";
import { errors } from "./errors.en";
import { invest } from "./invest.en";
import { market } from "./market.en";
import { metrics } from "./metrics.en";
import { pf } from "./pf.en";
import { settings } from "./settings.en";
import { shell } from "./shell.en";

/** All English texts. English is the default language and the source of truth for every key. */
export const EN = { common, shell, auth, pf, market, metrics, invest, settings, assistant, errors } as const;
export type Dict = typeof EN;
