#!/usr/bin/env node

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const target =
  process.env.TELEGRAM_POLL_TARGET?.trim() ||
  "http://127.0.0.1:3000/api/telegram/webhook";
const tickUrl =
  process.env.DISPATCH_TICK_TARGET?.trim() ||
  "http://127.0.0.1:3000/api/dispatch/tick";
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN in .env.local");
  process.exit(1);
}

const api = `https://api.telegram.org/bot${token}`;
let offset = 0;
let ticking = false;

async function dropWebhook() {
  await fetch(`${api}/deleteWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drop_pending_updates: false }),
  });
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await fetch(tickUrl, {
      method: "POST",
      headers: secret ? { "x-dispatch-tick-secret": secret } : {},
    });
  } catch {
    // Dev server may not be up yet.
  } finally {
    ticking = false;
  }
}

async function loop() {
  await dropWebhook();
  console.log(`Polling Telegram → ${target}`);
  setInterval(tick, 1_000);
  for (;;) {
    try {
      const response = await fetch(`${api}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offset,
          timeout: 25,
          allowed_updates: ["message", "callback_query"],
        }),
      });
      const json = await response.json();
      if (!json.ok) {
        console.error(json.description ?? json);
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        continue;
      }
      for (const update of json.result ?? []) {
        offset = update.update_id + 1;
        const forwarded = await fetch(target, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(secret
              ? { "x-telegram-bot-api-secret-token": secret }
              : {}),
          },
          body: JSON.stringify(update),
        });
        if (!forwarded.ok) {
          console.error("webhook", forwarded.status, await forwarded.text());
        }
      }
    } catch (error) {
      console.error(error);
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }
}

loop();
