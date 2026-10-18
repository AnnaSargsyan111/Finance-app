import type { DeepPartial } from "../translate";
import type { Dict } from "./en";
import { assistant } from "./assistant.hy";
import { auth } from "./auth.hy";
import { common } from "./common.hy";
import { errors } from "./errors.hy";
import { invest } from "./invest.hy";
import { market } from "./market.hy";
import { metrics } from "./metrics.hy";
import { pf } from "./pf.hy";
import { settings } from "./settings.hy";
import { shell } from "./shell.hy";

/** All Armenian texts. A missing text falls back to English at run time; tests/ui/i18n.test.ts requires none to be missing. */
export const HY: DeepPartial<Dict> = { common, shell, auth, pf, market, metrics, invest, settings, assistant, errors };
