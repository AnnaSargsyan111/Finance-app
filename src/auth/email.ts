import { getEnv } from "@/lib/env";
import { APP_NAME } from "@/config/app";
import { NotConfiguredError, UpstreamError } from "@/lib/errors";
import { log } from "@/lib/log";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  name: "resend" | "console";
  /** false = messages are only logged/kept in memory, never delivered */
  delivers: boolean;
  send(message: EmailMessage): Promise<void>;
}

/** In-memory copy of messages handled by the console adapter (dev/test inspection only; capped). */
export const devOutbox: EmailMessage[] = [];

const consoleProvider: EmailProvider = {
  name: "console",
  delivers: false,
  async send(m) {
    devOutbox.push(m);
    if (devOutbox.length > 50) devOutbox.shift();
    if (process.env.NODE_ENV !== "test" || process.env.LOG_IN_TESTS) {
      // Intentionally prints the body (it contains the reset link) - development only, Resend is not configured.
      console.log(`\n[DEV EMAIL - NOT SENT: RESEND_API_KEY is not configured]\nTo: ${m.to}\nSubject: ${m.subject}\n\n${m.text}\n`);
    }
  },
};

function resendProvider(apiKey: string, from: string): EmailProvider {
  return {
    name: "resend",
    delivers: true,
    async send(m) {
      let res: Response;
      try {
        res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (e) {
        throw new UpstreamError("resend", `Resend request failed: ${e instanceof Error ? e.message : "network"}`);
      }
      if (!res.ok) throw new UpstreamError("resend", `Resend responded ${res.status}`, res.status, res.status >= 500);
    },
  };
}

export function getEmailProvider(): EmailProvider {
  const env = getEnv();
  if (env.RESEND_API_KEY && env.EMAIL_FROM) return resendProvider(env.RESEND_API_KEY, env.EMAIL_FROM);
  if (env.NODE_ENV === "production") {
    throw new NotConfiguredError("resend", "RESEND_API_KEY and EMAIL_FROM must be set in production");
  }
  return consoleProvider;
}

export function emailStatus(): { provider: "resend" | "console"; configured: boolean; delivers: boolean } {
  const env = getEnv();
  const configured = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  return { provider: configured ? "resend" : "console", configured, delivers: configured };
}

export async function sendPasswordResetEmail(to: string, firstName: string, resetUrl: string): Promise<void> {
  try {
    await getEmailProvider().send({
      to,
      subject: `Reset your ${APP_NAME} password`,
      text:
        `Hi ${firstName},\n\nSomeone asked to reset the password for your ${APP_NAME} account. ` +
        `Use the link below within 60 minutes. If this was not you, ignore this email.\n\n${resetUrl}\n`,
    });
  } catch (e) {
    // Never surface delivery problems to the caller (would leak whether the account exists).
    log.error("password reset email failed", { message: e instanceof Error ? e.message : String(e) });
  }
}
