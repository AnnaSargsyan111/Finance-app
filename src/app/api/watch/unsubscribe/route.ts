import { route } from "@/lib/route";
import { stopWatchById } from "@/watch/repo";
import { verifyUnsubscribeToken } from "@/watch/token";
import { APP_NAME } from "@/config/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const page = (heading: string, text: string, status: number) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${APP_NAME}</title></head>` +
      `<body style="margin:0;background:#020203;color:#C0C2C3;font-family:Manrope,'Segoe UI',Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px">` +
      `<div style="max-width:420px"><h1 style="color:#fff;font-size:22px;margin:0 0 12px">${heading}</h1><p style="line-height:1.6;margin:0">${text}</p></div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

/** GET /api/watch/unsubscribe?t=<signed token> -> the "Stop these emails" link in every notification (no sign-in; turns off that one watch) */
export const GET = route({ auth: false, csrf: false }, async ({ req }) => {
  const watchId = verifyUnsubscribeToken(req.nextUrl.searchParams.get("t") ?? "");
  if (!watchId) return page("This link is not valid", "The link may be incomplete. You can switch notifications off on the Recommendation History page.", 400);
  await stopWatchById(watchId);
  return page("You will not get these emails anymore", "Notifications for this recommendation are switched off. You can turn them on again any time on the Recommendation History page.", 200);
});
