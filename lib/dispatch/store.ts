import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { REGULATORY_AUDIT_RETENTION_MS } from "../regulation";
import {
  backfillEventsForJob,
  eventFromDraft,
  inboundEventDraft,
  isDispatchEventName,
  jobLifecycleEvents,
  outboundEventDraft,
  sanitizeMeta,
  sessionLifecycleEvents,
  type DispatchActorRole,
  type DispatchEvent,
  type DispatchEventDraft,
} from "./events";
import {
  DEFAULT_CHAT_LOCALE,
  type BookerSession,
  type ChatChannel,
  type ChatLocale,
  type DispatchChannel,
  type DispatchJob,
  type InboundMessage,
  type OutboundMessage,
  type StaffBinding,
} from "./types";

type DispatchStoreShape = {
  jobs: DispatchJob[];
  sessions: BookerSession[];
  staff: StaffBinding[];
  events: DispatchEvent[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "dispatch.json");

let queue: Promise<unknown> = Promise.resolve();
let supabaseClient: SupabaseClient | null | undefined;

function empty(): DispatchStoreShape {
  return { jobs: [], sessions: [], staff: [], events: [] };
}

function normalizeEvent(event: DispatchEvent): DispatchEvent | null {
  if (!isDispatchEventName(event.name)) return null;
  if (event.channel !== "telegram" && event.channel !== "whatsapp") {
    return null;
  }
  if (
    event.actorRole !== "booker" &&
    event.actorRole !== "staff" &&
    event.actorRole !== "system"
  ) {
    return null;
  }
  return {
    id: String(event.id),
    createdAt: event.createdAt,
    channel: event.channel,
    name: event.name,
    actorRole: event.actorRole,
    actorHash: event.actorHash ?? null,
    jobId: event.jobId ?? null,
    meta: sanitizeMeta(event.meta),
  };
}

export function sanitizeDispatchStore(
  store: DispatchStoreShape,
  now = Date.now(),
): DispatchStoreShape {
  const cutoff = now - REGULATORY_AUDIT_RETENTION_MS;
  return {
    jobs: store.jobs ?? [],
    sessions: store.sessions ?? [],
    staff: store.staff ?? [],
    events: (store.events ?? [])
      .map((event) => normalizeEvent(event))
      .filter((event): event is DispatchEvent => {
        if (!event) return false;
        const at = Date.parse(event.createdAt);
        return Number.isFinite(at) && at >= cutoff;
      }),
  };
}

function getSupabase(): SupabaseClient | null {
  if (supabaseClient !== undefined) return supabaseClient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    supabaseClient = null;
    return null;
  }
  supabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseClient;
}

function fail(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function parseStoredLocale(value: unknown): ChatLocale | null {
  return value === "en" || value === "fr" ? value : null;
}

export function idleBookerSession(
  channel: DispatchChannel,
  chatId: string,
  locale: ChatLocale | null = null,
): BookerSession {
  return {
    channel,
    chatId,
    step: "idle",
    locale,
    afterLang: null,
    pickup: null,
    dropoff: null,
    placePickSide: null,
    placeQuery: null,
    placeCandidates: null,
    placesToken: null,
    zoneSide: null,
    departAt: null,
    departDay: null,
    pax: null,
    passengerPhone: null,
    jobId: null,
    pendingText: null,
    draftText: null,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeJob(job: DispatchJob): DispatchJob {
  return {
    ...job,
    hold: job.hold ?? null,
    reofferAt: job.reofferAt ?? null,
    remindedAt: job.remindedAt ?? null,
    bookerLocale: parseStoredLocale(job.bookerLocale) ?? DEFAULT_CHAT_LOCALE,
  };
}

function normalizeSession(session: BookerSession): BookerSession {
  const step = String(session.step);
  const legacyWhen =
    step === "when_text" || step === "when_part" || step === "when_slot";
  return {
    ...session,
    step: legacyWhen ? "when" : session.step,
    departDay: session.departDay ?? null,
    placePickSide:
      session.placePickSide === "pickup" || session.placePickSide === "dropoff"
        ? session.placePickSide
        : null,
    placeQuery: session.placeQuery ?? null,
    placeCandidates: session.placeCandidates ?? null,
    placesToken: session.placesToken ?? null,
    locale: parseStoredLocale(session.locale),
    afterLang: session.afterLang === "book" || session.afterLang === "menu"
      ? session.afterLang
      : null,
    pendingText: session.pendingText ?? null,
    draftText: session.draftText ?? null,
  };
}

function normalizeStaff(staff: StaffBinding): StaffBinding {
  return {
    ...staff,
    lastInboundAt: staff.lastInboundAt ?? staff.boundAt,
    onDuty: staff.onDuty !== false,
    sessionNudgedAt: staff.sessionNudgedAt ?? null,
  };
}

type StaffRow = {
  channel: string;
  chat_id: string;
  kind: string;
  supplier_id: string;
  bound_at: string;
  last_inbound_at?: string | null;
  on_duty?: boolean | null;
  session_nudged_at?: string | null;
};

const STAFF_COLUMNS =
  "channel, chat_id, kind, supplier_id, bound_at, last_inbound_at, on_duty, session_nudged_at";

function staffFromRow(row: StaffRow): StaffBinding {
  return {
    channel: row.channel as StaffBinding["channel"],
    chatId: row.chat_id,
    kind: row.kind as StaffBinding["kind"],
    supplierId: row.supplier_id,
    boundAt: row.bound_at,
    lastInboundAt: row.last_inbound_at ?? row.bound_at,
    onDuty: row.on_duty !== false,
    sessionNudgedAt: row.session_nudged_at ?? null,
  };
}

function staffInsert(binding: StaffBinding) {
  const lastInboundAt = binding.lastInboundAt ?? binding.boundAt;
  return {
    channel: binding.channel,
    chat_id: binding.chatId,
    kind: binding.kind,
    supplier_id: binding.supplierId,
    bound_at: binding.boundAt,
    last_inbound_at: lastInboundAt,
    on_duty: binding.onDuty !== false,
    session_nudged_at: binding.sessionNudgedAt ?? null,
  };
}

async function readStore(): Promise<DispatchStoreShape> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as DispatchStoreShape;
    return sanitizeDispatchStore({
      jobs: (parsed.jobs ?? []).map(normalizeJob),
      sessions: (parsed.sessions ?? []).map(normalizeSession),
      staff: (parsed.staff ?? []).map(normalizeStaff),
      events: parsed.events ?? [],
    });
  } catch {
    return empty();
  }
}

async function writeStore(store: DispatchStoreShape) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, `${JSON.stringify(store, null, 2)}\n`);
}

function withStore<T>(
  fn: (store: DispatchStoreShape) => T | Promise<T>,
): Promise<T> {
  const run = queue.then(async () => {
    const store = await readStore();
    const result = await fn(store);
    await writeStore(store);
    return result;
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

type EventRow = {
  id: number | string;
  created_at: string;
  channel: string;
  name: string;
  actor_role: string;
  actor_hash: string | null;
  job_id: string | null;
  meta: unknown;
};

function eventFromRow(row: EventRow): DispatchEvent | null {
  return normalizeEvent({
    id: String(row.id),
    createdAt: row.created_at,
    channel: row.channel as DispatchEvent["channel"],
    name: row.name as DispatchEvent["name"],
    actorRole: row.actor_role as DispatchEvent["actorRole"],
    actorHash: row.actor_hash,
    jobId: row.job_id,
    meta: sanitizeMeta(row.meta),
  });
}

function eventInsert(event: DispatchEvent) {
  return {
    created_at: event.createdAt,
    channel: event.channel,
    name: event.name,
    actor_role: event.actorRole,
    actor_hash: event.actorHash,
    job_id: event.jobId,
    meta: event.meta,
  };
}

function appendEventsToStore(
  store: DispatchStoreShape,
  drafts: DispatchEventDraft[],
) {
  if (drafts.length === 0) return;
  const now = new Date().toISOString();
  const events = drafts.map((draft) => eventFromDraft(draft, crypto.randomUUID(), now));
  store.events.unshift(...events);
}

async function persistEventDrafts(drafts: DispatchEventDraft[]) {
  if (drafts.length === 0) return;
  const now = new Date().toISOString();
  const events = drafts.map((draft) => eventFromDraft(draft, crypto.randomUUID(), now));
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from("dispatch_events")
      .insert(events.map(eventInsert));
    fail(error, "recordDispatchEvent");
    return;
  }
  await withStore((store) => {
    store.events.unshift(...events);
  });
}

async function recordDispatchEvents(drafts: DispatchEventDraft[]) {
  if (drafts.length === 0) return;
  try {
    await persistEventDrafts(drafts);
  } catch (error) {
    console.error("dispatch_event_failed", { error });
  }
}

function jobFromRow(payload: unknown): DispatchJob {
  return normalizeJob(payload as DispatchJob);
}

function sessionFromRow(payload: unknown): BookerSession {
  return normalizeSession(payload as BookerSession);
}

export function jobCallbackId(jobId: string) {
  return jobId.slice(0, 8);
}

export function dispatchPersistenceMode() {
  return getSupabase() ? "supabase" : "local-file";
}

export async function getJob(id: string) {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("dispatch_jobs")
      .select("payload")
      .eq("id", id)
      .maybeSingle();
    fail(error, "getJob");
    return data ? jobFromRow(data.payload) : null;
  }
  const store = await readStore();
  return store.jobs.find((job) => job.id === id) ?? null;
}

export async function getJobByPrefix(prefix: string) {
  if (!prefix) return null;
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("dispatch_jobs")
      .select("payload")
      .eq("id_prefix", prefix.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    fail(error, "getJobByPrefix");
    return data ? jobFromRow(data.payload) : null;
  }
  const store = await readStore();
  return (
    store.jobs.find(
      (job) => job.id === prefix || job.id.startsWith(prefix),
    ) ?? null
  );
}

export async function listOpenJobs() {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("dispatch_jobs")
      .select("payload")
      .in("status", ["ring_taxis", "ring_companies", "hold"]);
    fail(error, "listOpenJobs");
    return (data ?? []).map((row) => jobFromRow(row.payload));
  }
  const store = await readStore();
  return store.jobs.filter(
    (job) =>
      job.status === "ring_taxis" ||
      job.status === "ring_companies" ||
      job.status === "hold",
  );
}

export async function listAssignedJobs() {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("dispatch_jobs")
      .select("payload")
      .in("status", ["assigned", "en_route", "arrived"]);
    fail(error, "listAssignedJobs");
    return (data ?? []).map((row) => jobFromRow(row.payload));
  }
  const store = await readStore();
  return store.jobs.filter(
    (job) =>
      job.status === "assigned" ||
      job.status === "en_route" ||
      job.status === "arrived",
  );
}

const BOOKER_LIST_STATUSES = [
  "ring_taxis",
  "ring_companies",
  "hold",
  "assigned",
  "en_route",
  "arrived",
] as const;

export async function listBookerJobs(channel: string, chatId: string) {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("dispatch_jobs")
      .select("payload")
      .eq("channel", channel)
      .eq("booker_chat_id", chatId)
      .in("status", [...BOOKER_LIST_STATUSES]);
    fail(error, "listBookerJobs");
    return (data ?? []).map((row) => jobFromRow(row.payload));
  }
  const store = await readStore();
  return store.jobs.filter(
    (job) =>
      job.channel === channel &&
      job.bookerChatId === chatId &&
      (BOOKER_LIST_STATUSES as readonly string[]).includes(job.status),
  );
}

export async function saveJob(job: DispatchJob) {
  const live = normalizeJob(job);
  const supabase = getSupabase();
  if (supabase) {
    const previous = await getJob(live.id);
    const { error } = await supabase.from("dispatch_jobs").upsert({
      id: live.id,
      id_prefix: jobCallbackId(live.id),
      channel: live.channel,
      booker_chat_id: live.bookerChatId,
      status: live.status,
      ring_ends_at: live.ringEndsAt,
      reoffer_at: live.reofferAt,
      created_at: live.createdAt,
      payload: live,
    });
    fail(error, "saveJob");
    await recordDispatchEvents(jobLifecycleEvents(previous, live));
    return live;
  }
  return withStore((store) => {
    const index = store.jobs.findIndex((item) => item.id === live.id);
    const previous = index >= 0 ? store.jobs[index] : null;
    if (index >= 0) store.jobs[index] = live;
    else store.jobs.unshift(live);
    appendEventsToStore(store, jobLifecycleEvents(previous, live));
    return live;
  });
}

export async function getSession(channel: string, chatId: string) {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("dispatch_sessions")
      .select("payload")
      .eq("channel", channel)
      .eq("chat_id", chatId)
      .maybeSingle();
    fail(error, "getSession");
    return data ? sessionFromRow(data.payload) : null;
  }
  const store = await readStore();
  return (
    store.sessions.find(
      (session) => session.channel === channel && session.chatId === chatId,
    ) ?? null
  );
}

export async function saveSession(session: BookerSession) {
  const live = normalizeSession({
    ...session,
    updatedAt: new Date().toISOString(),
  });
  const supabase = getSupabase();
  if (supabase) {
    const previous = await getSession(live.channel, live.chatId);
    const { error } = await supabase.from("dispatch_sessions").upsert(
      {
        channel: live.channel,
        chat_id: live.chatId,
        job_id: live.jobId,
        updated_at: live.updatedAt,
        payload: live,
      },
      { onConflict: "channel,chat_id" },
    );
    fail(error, "saveSession");
    await recordDispatchEvents(sessionLifecycleEvents(previous, live));
    return live;
  }
  return withStore((store) => {
    const index = store.sessions.findIndex(
      (item) =>
        item.channel === live.channel && item.chatId === live.chatId,
    );
    const previous = index >= 0 ? store.sessions[index] : null;
    if (index >= 0) store.sessions[index] = live;
    else store.sessions.push(live);
    appendEventsToStore(store, sessionLifecycleEvents(previous, live));
    return live;
  });
}

async function deleteSession(channel: string, chatId: string) {
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from("dispatch_sessions")
      .delete()
      .eq("channel", channel)
      .eq("chat_id", chatId);
    fail(error, "clearSession");
    return;
  }
  return withStore((store) => {
    store.sessions = store.sessions.filter(
      (session) =>
        !(session.channel === channel && session.chatId === chatId),
    );
  });
}

export async function rememberLocale(
  channel: DispatchChannel,
  chatId: string,
  locale: ChatLocale,
) {
  const existing = await getSession(channel, chatId);
  if (existing) {
    if (existing.locale === locale && existing.step !== "lang") return existing;
    return saveSession({
      ...existing,
      locale,
      step: existing.step === "lang" ? "idle" : existing.step,
      afterLang: existing.step === "lang" ? null : existing.afterLang,
    });
  }
  return saveSession(idleBookerSession(channel, chatId, locale));
}

export async function localeForChat(channel: string, chatId: string) {
  const session = await getSession(channel, chatId);
  return session?.locale ?? DEFAULT_CHAT_LOCALE;
}

export async function clearSession(channel: string, chatId: string) {
  const existing = await getSession(channel, chatId);
  if (existing?.locale) {
    await saveSession(
      idleBookerSession(
        existing.channel,
        existing.chatId,
        existing.locale,
      ),
    );
    return;
  }
  await deleteSession(channel, chatId);
}

export async function clearSessionIfJob(
  channel: string,
  chatId: string,
  jobId: string,
) {
  const existing = await getSession(channel, chatId);
  if (!existing || existing.jobId !== jobId) return;
  if (existing.locale) {
    await saveSession(
      idleBookerSession(existing.channel, existing.chatId, existing.locale),
    );
    return;
  }
  await deleteSession(channel, chatId);
}

export async function lastJobForChat(channel: string, chatId: string) {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("dispatch_jobs")
      .select("payload")
      .eq("channel", channel)
      .eq("booker_chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    fail(error, "lastJobForChat");
    return data ? jobFromRow(data.payload) : null;
  }
  const store = await readStore();
  return (
    store.jobs.find(
      (job) => job.channel === channel && job.bookerChatId === chatId,
    ) ?? null
  );
}

export async function listStaff() {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("dispatch_staff")
      .select(STAFF_COLUMNS);
    fail(error, "listStaff");
    return (data ?? []).map((row) => staffFromRow(row as StaffRow));
  }
  const store = await readStore();
  return store.staff;
}

export async function bindStaff(binding: StaffBinding) {
  const supabase = getSupabase();
  const bound = {
    name: "staff_bound" as const,
    channel: binding.channel,
    actorRole: "staff" as const,
    chatId: binding.chatId,
    meta: { supplierKind: binding.kind, supplierId: binding.supplierId },
  };
  if (supabase) {
    const dropChat = await supabase
      .from("dispatch_staff")
      .delete()
      .eq("channel", binding.channel)
      .eq("chat_id", binding.chatId);
    fail(dropChat.error, "bindStaff");
    const dropSupplier = await supabase
      .from("dispatch_staff")
      .delete()
      .eq("kind", binding.kind)
      .eq("supplier_id", binding.supplierId);
    fail(dropSupplier.error, "bindStaff");
    const saved = normalizeStaff(binding);
    const { error } = await supabase.from("dispatch_staff").insert(staffInsert(saved));
    fail(error, "bindStaff");
    await recordDispatchEvents([bound]);
    return saved;
  }
  return withStore((store) => {
    const saved = normalizeStaff(binding);
    store.staff = store.staff.filter(
      (item) =>
        !(
          (item.channel === binding.channel && item.chatId === binding.chatId) ||
          (item.kind === binding.kind && item.supplierId === binding.supplierId)
        ),
    );
    store.staff.push(saved);
    appendEventsToStore(store, [bound]);
    return saved;
  });
}

export async function touchStaffInbound(
  channel: string,
  chatId: string,
  at: Date = new Date(),
) {
  const iso = at.toISOString();
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from("dispatch_staff")
      .update({ last_inbound_at: iso, session_nudged_at: null })
      .eq("channel", channel)
      .eq("chat_id", chatId);
    fail(error, "touchStaffInbound");
    return;
  }
  return withStore((store) => {
    const staff = store.staff.find(
      (item) => item.channel === channel && item.chatId === chatId,
    );
    if (staff) {
      staff.lastInboundAt = iso;
      staff.sessionNudgedAt = null;
    }
  });
}

export async function setStaffDuty(
  channel: string,
  chatId: string,
  onDuty: boolean,
) {
  const draft = {
    name: (onDuty ? "duty_on" : "duty_off") as "duty_on" | "duty_off",
    channel: channel as DispatchChannel,
    actorRole: "staff" as const,
    chatId,
  };
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("dispatch_staff")
      .update({ on_duty: onDuty })
      .eq("channel", channel)
      .eq("chat_id", chatId)
      .select(STAFF_COLUMNS)
      .maybeSingle();
    fail(error, "setStaffDuty");
    const saved = data ? staffFromRow(data as StaffRow) : null;
    if (saved) await recordDispatchEvents([draft]);
    return saved;
  }
  return withStore((store) => {
    const staff = store.staff.find(
      (item) => item.channel === channel && item.chatId === chatId,
    );
    if (!staff) return null;
    staff.onDuty = onDuty;
    appendEventsToStore(store, [draft]);
    return { ...staff };
  });
}

export async function markStaffSessionNudged(
  channel: string,
  chatId: string,
  at: Date = new Date(),
) {
  const iso = at.toISOString();
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from("dispatch_staff")
      .update({ session_nudged_at: iso })
      .eq("channel", channel)
      .eq("chat_id", chatId);
    fail(error, "markStaffSessionNudged");
    return;
  }
  return withStore((store) => {
    const staff = store.staff.find(
      (item) => item.channel === channel && item.chatId === chatId,
    );
    if (staff) staff.sessionNudgedAt = iso;
  });
}

export async function unbindStaff(channel: string, chatId: string) {
  const existing = await staffForChat(channel, chatId);
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from("dispatch_staff")
      .delete()
      .eq("channel", channel)
      .eq("chat_id", chatId);
    fail(error, "unbindStaff");
    if (existing) {
      await recordDispatchEvents([
        {
          name: "staff_unbound",
          channel: existing.channel,
          actorRole: "staff",
          chatId: existing.chatId,
          meta: {
            supplierKind: existing.kind,
            supplierId: existing.supplierId,
          },
        },
      ]);
    }
    return;
  }
  return withStore((store) => {
    const staff = store.staff.find(
      (item) => item.channel === channel && item.chatId === chatId,
    );
    store.staff = store.staff.filter(
      (item) => !(item.channel === channel && item.chatId === chatId),
    );
    if (staff) {
      appendEventsToStore(store, [
        {
          name: "staff_unbound",
          channel: staff.channel,
          actorRole: "staff",
          chatId: staff.chatId,
          meta: { supplierKind: staff.kind, supplierId: staff.supplierId },
        },
      ]);
    }
  });
}

export async function staffForChat(channel: string, chatId: string) {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("dispatch_staff")
      .select(STAFF_COLUMNS)
      .eq("channel", channel)
      .eq("chat_id", chatId)
      .maybeSingle();
    fail(error, "staffForChat");
    if (!data) return null;
    return staffFromRow(data as StaffRow);
  }
  const store = await readStore();
  return (
    store.staff.find(
      (item) => item.channel === channel && item.chatId === chatId,
    ) ?? null
  );
}

type EventListFilter = {
  channel?: DispatchChannel | "all";
  since?: string;
  until?: string;
};

function matchesEventFilter(event: DispatchEvent, filter?: EventListFilter) {
  if (!filter) return true;
  if (filter.channel && filter.channel !== "all" && event.channel !== filter.channel) {
    return false;
  }
  const at = Date.parse(event.createdAt);
  if (filter.since && at < Date.parse(filter.since)) return false;
  if (filter.until && at > Date.parse(filter.until)) return false;
  return true;
}

export async function listJobs() {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("dispatch_jobs")
      .select("payload")
      .order("created_at", { ascending: false })
      .limit(5_000);
    fail(error, "listJobs");
    return (data ?? []).map((row) => jobFromRow(row.payload));
  }
  const store = await readStore();
  return store.jobs;
}

export async function listSessions() {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("dispatch_sessions")
      .select("payload")
      .limit(5_000);
    fail(error, "listSessions");
    return (data ?? []).map((row) => sessionFromRow(row.payload));
  }
  const store = await readStore();
  return store.sessions;
}

export async function listDispatchEvents(filter?: EventListFilter) {
  const supabase = getSupabase();
  if (supabase) {
    let query = supabase
      .from("dispatch_events")
      .select("id, created_at, channel, name, actor_role, actor_hash, job_id, meta")
      .order("created_at", { ascending: false })
      .limit(10_000);
    if (filter?.channel && filter.channel !== "all") {
      query = query.eq("channel", filter.channel);
    }
    if (filter?.since) query = query.gte("created_at", filter.since);
    if (filter?.until) query = query.lte("created_at", filter.until);
    const { data, error } = await query;
    fail(error, "listDispatchEvents");
    return (data ?? [])
      .map((row) => eventFromRow(row as EventRow))
      .filter((event): event is DispatchEvent => event != null);
  }
  const store = await readStore();
  return store.events.filter((event) => matchesEventFilter(event, filter));
}

export async function earliestLiveDispatchEventAt(
  channel: DispatchChannel | "all",
) {
  const supabase = getSupabase();
  if (supabase) {
    let query = supabase
      .from("dispatch_events")
      .select("created_at")
      .not("meta->>backfill", "eq", "true")
      .order("created_at", { ascending: true })
      .limit(1);
    if (channel !== "all") query = query.eq("channel", channel);
    const { data, error } = await query;
    fail(error, "earliestLiveDispatchEventAt");
    return data?.[0]?.created_at ?? null;
  }
  const store = await readStore();
  const live = store.events.filter(
    (event) =>
      event.meta.backfill !== true &&
      (channel === "all" || event.channel === channel),
  );
  if (live.length === 0) return null;
  return live.reduce(
    (earliest, event) =>
      event.createdAt < earliest ? event.createdAt : earliest,
    live[0].createdAt,
  );
}

let backfillGate: Promise<void> | null = null;

export async function ensureJobEventBackfill() {
  if (!backfillGate) {
    backfillGate = (async () => {
      const jobs = await listJobs();
      const existing = new Set(
        (await listDispatchEvents())
          .filter((event) => event.name === "job_created" && event.jobId)
          .map((event) => event.jobId as string),
      );
      const drafts = jobs
        .filter((job) => !existing.has(job.id))
        .flatMap((job) => backfillEventsForJob(job));
      await recordDispatchEvents(drafts);
    })().catch((error) => {
      backfillGate = null;
      console.error("dispatch_event_backfill_failed", { error });
    });
  }
  await backfillGate;
}

export async function recordInboundEvent(inbound: InboundMessage) {
  try {
    const staff = await staffForChat(inbound.channel, inbound.chatId);
    const role: DispatchActorRole = staff ? "staff" : "booker";
    await recordDispatchEvents([inboundEventDraft(inbound, role)]);
  } catch (error) {
    console.error("dispatch_event_failed", { error });
  }
}

export function withDispatchAnalytics(channel: ChatChannel): ChatChannel {
  return {
    name: channel.name,
    ack: channel.ack,
    async send(message: OutboundMessage) {
      await channel.send(message);
      try {
        const staff = await staffForChat(channel.name, message.chatId);
        const role: DispatchActorRole = staff ? "staff" : "booker";
        await recordDispatchEvents([
          outboundEventDraft(channel.name, message, role),
        ]);
      } catch (error) {
        console.error("dispatch_event_failed", { error });
      }
    },
  };
}
