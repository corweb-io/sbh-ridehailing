#!/usr/bin/env node

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const origin = (
  process.argv[2] ||
  process.env.TELEGRAM_WEBHOOK_URL ||
  ""
).replace(/\/$/, "");

if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN in .env.local");
  process.exit(1);
}
if (!secret) {
  console.error("Set TELEGRAM_WEBHOOK_SECRET in .env.local");
  process.exit(1);
}
if (!origin) {
  console.error(
    "Pass the production origin, e.g. npm run telegram:webhook -- https://example.vercel.app",
  );
  process.exit(1);
}

const url = `${origin}/api/telegram/webhook`;
const api = `https://api.telegram.org/bot${token}`;

const set = await fetch(`${api}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  }),
});
const json = await set.json();
if (!json.ok) {
  console.error(json.description ?? json);
  process.exit(1);
}

const info = await fetch(`${api}/getWebhookInfo`).then((response) =>
  response.json(),
);
console.log(`Telegram webhook → ${info.result?.url ?? url}`);
if (info.result?.last_error_message) {
  console.error("last error:", info.result.last_error_message);
}
