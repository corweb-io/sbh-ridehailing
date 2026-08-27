import { noStoreJson, rateLimit } from "@/lib/api";
import { serveInbound } from "@/lib/chat/inbound";
import { isWhatsAppConfigured, whatsappChannel } from "@/lib/chat/whatsapp";
import {
  inboundsFromWhatsApp,
  type WhatsAppWebhook,
} from "@/lib/chat/whatsapp-update";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return noStoreJson({ error: "Unauthorized." }, { status: 403 });
}

export async function POST(request: Request) {
  if (!isWhatsAppConfigured()) {
    return noStoreJson({ error: "WhatsApp is not configured." }, { status: 503 });
  }
  const limited = rateLimit(request, "whatsapp:webhook", 120, 60_000);
  if (limited) return limited;

  let body: WhatsAppWebhook;
  try {
    body = (await request.json()) as WhatsAppWebhook;
  } catch {
    return noStoreJson({ error: "Invalid JSON." }, { status: 400 });
  }

  const channel = whatsappChannel();
  try {
    for (const inbound of inboundsFromWhatsApp(body)) {
      await serveInbound(channel, inbound);
    }
  } catch (error) {
    console.error(error);
    return noStoreJson({ error: "Handler failed." }, { status: 500 });
  }
  return noStoreJson({ ok: true });
}
