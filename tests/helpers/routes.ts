/** Route handlers imported once, so tests read like HTTP calls without booting Next. */
import * as signUp from "@/app/api/auth/sign-up/route";
import * as signIn from "@/app/api/auth/sign-in/route";
import * as signOut from "@/app/api/auth/sign-out/route";
import * as forgot from "@/app/api/auth/forgot-password/route";
import * as reset from "@/app/api/auth/reset-password/route";
import * as session from "@/app/api/auth/session/route";
import * as pfPeriods from "@/app/api/pf/periods/route";
import * as pfPeriod from "@/app/api/pf/period/route";
import { call, Jar, freshIp, type CallResult } from "./api";

export const R = { signUp, signIn, signOut, forgot, reset, session, pfPeriods, pfPeriod };

export const VALID_PASSWORD = "Str0ng!Passw0rd";

export interface TestUser {
  jar: Jar;
  id: string;
  email: string;
  ip: string;
}

let n = 0;
export async function registerUser(prefix = "user", password = VALID_PASSWORD): Promise<TestUser> {
  const email = `${prefix}${++n}-${Date.now()}@example.com`;
  const jar = new Jar();
  const ip = freshIp();
  const res: CallResult = await call(R.signUp.POST, "POST", "/api/auth/sign-up", {
    json: { firstName: "Test", lastName: "User", email, password },
    jar,
    ip,
  });
  if (res.status !== 201) throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { jar, id: res.body.user.id, email, ip };
}

import * as recommendationRoute from "@/app/api/invest/recommendation/route";
import * as comparisonRoute from "@/app/api/invest/comparison/route";
import * as historyListRoute from "@/app/api/invest/history/route";
import * as historyItemRoute from "@/app/api/invest/history/[id]/route";
export const I = { recommendationRoute, comparisonRoute, historyListRoute, historyItemRoute };
