import { noStoreJson } from "@/lib/api";
import { runDispatchTick } from "@/lib/chat/inbound";
import { isChannelConfigured } from "@/lib/chat/channels";

function authorized(request: Request) {
  const secret =
    process.env.CRON_SECRET?.trim() ||
    process.env.DISPATCH_TICK_SECRET?.trim() ||
    process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
    process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  return (
    bearer === secret ||
    request.headers.get("x-dispatch-tick-secret") === secret
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return noStoreJson({ error: "Unauthorized." }, { status: 401 });
  }
  const anyChannel =
    isChannelConfigured("telegram") || isChannelConfigured("whatsapp");
  if (!anyChannel && process.env.NODE_ENV === "production") {
    return noStoreJson({ ok: true, skipped: true });
  }
  try {
    await runDispatchTick({ followup: false });
  } catch (error) {
    console.error(error);
    return noStoreJson({ error: "Tick failed." }, { status: 500 });
  }
  return noStoreJson({ ok: true });
}

export async function POST(request: Request) {
  return GET(request);
}
