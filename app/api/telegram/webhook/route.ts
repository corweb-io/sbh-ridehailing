import { noStoreJson, rateLimit } from "@/lib/api";
import { serveInbound } from "@/lib/chat/inbound";
import { isTelegramConfigured, telegramChannel } from "@/lib/chat/telegram";
import {
  inboundFromTelegram,
  type TelegramUpdate,
} from "@/lib/chat/telegram-update";

function authorized(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) return process.env.NODE_ENV !== "production";
  return (
    request.headers.get("x-telegram-bot-api-secret-token") === expected ||
    request.headers.get("x-telegram-secret") === expected
  );
}

export async function POST(request: Request) {
  if (!isTelegramConfigured()) {
    return noStoreJson({ error: "Telegram is not configured." }, { status: 503 });
  }
  if (!authorized(request)) {
    return noStoreJson({ error: "Unauthorized." }, { status: 401 });
  }
  const limited = rateLimit(request, "telegram:webhook", 120, 60_000);
  if (limited) return limited;

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return noStoreJson({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    await serveInbound(telegramChannel(), inboundFromTelegram(update));
  } catch (error) {
    console.error(error);
    return noStoreJson({ error: "Handler failed." }, { status: 500 });
  }
  return noStoreJson({ ok: true });
}
