# RIDE · St. Barts

Mobile-first taxi apps for Saint-Barthélemy: a **passenger app** (`/ride`), a **driver app** (`/driver`), and a **concierge desk** (`/concierge`) for hotels and agencies booking licensed taxis for their guests. Each organization has its own board (`/concierge/eden-rock`, `/concierge/john-taylor`, …). Pickup, destination, official forfait fare, then a licensed taxi accepts the trip. The UI is frontend-only and uses mock data in the browser — no backend required for the demo.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Passenger: `/ride`. Driver: `/driver`. Concierge: `/concierge`. A chauffeur uses an ADS number or phone (e.g. `12`) and receives a server-signed, ADS-bound session. Set `DRIVER_ACCESS_CODE` and `DRIVER_SESSION_SECRET`; local development alone falls back to the demo driver code `ride`. Concierge access is still frontend-only demo authentication.

Copy `.env.example` to `.env.local` for persistence, admin, and an optional concierge WhatsApp number.

## Chat dispatch (Telegram now, WhatsApp next)

Booking, quotes, and rings are channel-agnostic (`lib/chat/inbound.ts`, `lib/dispatch/*`). Telegram and WhatsApp are adapters that map to the same `InboundMessage` / `ChatChannel` types.

**Telegram (live stand-in)**

1. [@BotFather](https://t.me/BotFather): `/newbot`, set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`.
2. Local: `npm run dev` and `npm run telegram` (polls Telegram into `/api/telegram/webhook`).
3. Production: point Telegram `setWebhook` at `https://<host>/api/telegram/webhook` with the same secret. Do not run the local poller at the same time — it deletes the webhook.
4. `/start` to book. `/driver 12` or `/company prestige` to take offers.

**WhatsApp Cloud API**

Same FSM. Set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_VERIFY_TOKEN`, then attach Meta’s webhook to `/api/whatsapp/webhook`. Buttons and lists are converted from the same outbound payload (≤3 choices → reply buttons, more → list). Meta Business Manager is still the blocker, not the product.

Optional: `DISPATCH_RING_MS=15000` for 15-second rings while testing.

Set the server-only `GOOGLE_MAPS_API_KEY` to enable Google Places API (New)
autocomplete. Restrict the key to the Places API in Google Cloud. Without it,
the demo falls back to its local Saint-Barth catalog and OpenStreetMap search.

## Installable app

RIDE ships with a web app manifest and branded icons. On supported browsers,
“Installer l’app RIDE” opens the native installation prompt. Safari on iPhone
shows the Add to Home Screen steps, and unsupported desktop browsers receive a
bookmark fallback.

Installation requires HTTPS outside localhost. The app remains online-first so
quotes and routes are never served from a stale offline cache.

## Official fares

Taxis on the island use a Collectivité **forfait by neighborhood**, not a meter
and not €/km. `lib/fares.ts` encodes the full 21×21 daytime grid from the
2024-052 CT annex (Airport, Gustavia, La Pointe / Shell Beach, Saint-Jean,
Lorient, Vitet, Dévet, Marigot, Pointe Milou, Grand / Petit Cul-de-Sac, Toiny,
Grand Fond, Salines, Public, Corossol, Lurin, Gouverneur, Flamands,
Anse des Cayes / Lézards, Colombier, Ti-Morne / View Point). Same-quartier
trips are 25 €. The passenger or concierge must select the fare quartier for an
unresolved custom location before dispatch.

- Day: 6:00–18:30 (St. Barth time) — grid as printed
- Evening 18:30–midnight, Sunday, or public holiday: +5 €
- Night midnight–6:00: +10 € (takes precedence over Sunday/holiday)
- Quotes are in euros; dollars are cash at the day's rate, not a second grid
- Standard taxi: 1–4 passengers. Vans and standby are arranged with the driver.

Driving distance/time uses a Saint-Barts road estimate for the map and duration only.

Resolved GPS and search results are assigned to fare neighborhoods
automatically. If a client enters a location that cannot be resolved, they can
submit it as a custom location and select its fare neighborhood.

## Booking (frontend mock)

After the quote, **Demander un taxi** creates a mock request shared through
`localStorage` / `BroadcastChannel`. Only the eligible taxi with a fresh
position that is nearest to pickup receives the 90-second offer. Timeout or a
statutory refusal advances to the next taxi. Explicit PMR/electric requirements
only match authoritative `true` capabilities; the demo roster intentionally
keeps unknown capabilities as `null`. Pickup within 150 m of a provisional
station head guides the client to that station instead of digital dispatch.

The driver projection contains pickup and destination quartier, never the
destination name, address, coordinates, route, or map pin. There is no in-app
payment: the passenger pays the licensed taxi at the official fare.

## Database schema

Primary table: `smoke_test_rides`

| Column | Purpose |
| --- | --- |
| `id`, `session_id`, `created_at` | Identity |
| `pickup_*` | Pickup (precise coordinates removed after two months) |
| `destination_*` | Legacy columns constrained to `NULL`; only `fare_zone_to` is retained |
| `distance_km`, `estimated_duration_minutes` | Route |
| `quoted_price`, `fare_zone_from`, `fare_zone_to`, `fare_band` | Official quote |
| `status` | `started`, `quote_viewed`, `requested`, plus legacy smoke-test statuses |
| `requested_at` | Taxi request |
| `acquisition_source` | `?src=` or `?utm_source=` |
| `events` | JSON funnel events on the ride |

SQL lives in `supabase/migrations/`. Apply the latest migration before using Supabase.

## Persistence

- **Local default:** JSON files at `.data/rides.json` and `.data/dispatch.json`.
- **Supabase:** set `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, then run the migrations. The Next.js API writes with a server-only secret; RLS stays on and there are no public policies. Dispatch jobs, booker sessions, staff bindings, and the dispatch activity log use the same keys (`dispatch_jobs`, `dispatch_sessions`, `dispatch_staff`, `dispatch_events`). The privacy migration configures daily `pg_cron` cleanup: precise geolocation after two months and audit records after one year. Dispatch also schedules a minute `pg_cron` job that GETs `/api/dispatch/tick` (Vault secrets `dispatch_tick_url` and `dispatch_tick_secret`). After switching dispatch to Supabase, staff must `/driver` or `/company` again — the laptop JSON file is not imported.

## How to view collected demand data

1. Open [http://localhost:3000/admin](http://localhost:3000/admin) or [http://localhost:3000/admin/dispatch](http://localhost:3000/admin/dispatch)
2. Enter `ADMIN_SECRET` once (minimum 24 characters; there is no insecure default). That password unlocks every `/admin` view for the tab.
3. Demand: totals, quote → request conversion, average fare/distance, origins/destination quartiers, and recent requests
4. Dispatch: messages, unique bookers, booking funnel, fill rate, activity over 7/30/90 days, live rings, and recent jobs (no passenger phone)

The demand payload is at `GET /api/admin/stats` with header `x-admin-key`. Dispatch stats are at `GET /api/admin/dispatch?range=30d&channel=whatsapp`. The shared unlock check is `GET /api/admin/session`.

## Production safeguards

- Production requires a real GPS position on Saint-Barthélemy or a manually selected pickup. Simulated pickup remains a development convenience and is disabled unless `NEXT_PUBLIC_ALLOW_SIMULATED_LOCATION=true`.
- Ride mutations are bound to the browser session, validated server-side, and restricted to valid status transitions.
- Quote distance, duration, and fare are persisted by the server rather than trusted from the browser.
- Public APIs have per-instance burst limits, request-size limits, external-service timeouts, and graceful route/geocoding fallbacks.
- Internal tests can use `/?internal=1`; those sessions are excluded from admin aggregates.

Before deployment, set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_SECRET`,
`DRIVER_ACCESS_CODE`, `DRIVER_SESSION_SECRET`, and optionally
`NEXT_PUBLIC_TAXI_WHATSAPP`. Never expose server secrets through a
`NEXT_PUBLIC_` variable.

The hardcoded roster and station-head coordinates are an explicit demo adapter,
not the official availability register. Production remains blocked on the
Collectivité API and CGU, verified station-head coordinates, authoritative
ADS/capability data, and Collectivité approval.

## Out of scope

No in-app payments, customer accounts, official register integration, or
occasional-transport companies. Fulfillment is limited to licensed taxis.
