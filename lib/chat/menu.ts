import { coursesButton, supplierLabel } from "../dispatch/copy";
import { isStaffOnDuty } from "../dispatch/staff-session";
import { getSession } from "../dispatch/store";
import type {
  BookerSession,
  ChatButton,
  ChatChannel,
  ChatLocale,
  DispatchChannel,
  InboundMessage,
  StaffBinding,
} from "../dispatch/types";
import { t } from "./messages";

export const DUTY_ON_ID = "duty:on";
export const DUTY_OFF_ID = "duty:off";
export const MENU_LANG_ID = "menu:lang";

export function chatCommand(text?: string | null) {
  const raw = text?.trim() ?? "";
  const match = raw.match(/^\/([a-z]+)(?:@[\w_]+)?$/i);
  return match ? match[1].toLowerCase() : null;
}

export function isActiveBooking(session: BookerSession | null | undefined) {
  return Boolean(
    session && session.step !== "idle" && session.step !== "lang",
  );
}

const KNOWN_COMMANDS = new Set([
  "aide",
  "help",
  "menu",
  "start",
  "taxi",
  "lang",
  "language",
  "en",
  "fr",
  "driver",
  "company",
  "off",
  "on",
  "courses",
  "rides",
  "cancel",
  "annuler",
]);

export function isUnknownSlashCommand(inbound: InboundMessage) {
  const command = chatCommand(inbound.text);
  return Boolean(command && !KNOWN_COMMANDS.has(command));
}

export function isMenuIntent(inbound: InboundMessage) {
  if (inbound.buttonId === "menu") return true;
  const command = chatCommand(inbound.text);
  if (command === "aide" || command === "help" || command === "menu" || command === "start") {
    return true;
  }
  const text = inbound.text?.trim() ?? "";
  return /^(aide|help|menu)$/i.test(text);
}

export function menuText(
  locale: ChatLocale,
  options: {
    channel: DispatchChannel;
    staff: StaffBinding | null;
    booking: boolean;
  },
) {
  const copy = t(locale);
  const header = options.staff
    ? copy.staffHome(
        supplierLabel(options.staff.kind, options.staff.supplierId),
        isStaffOnDuty(options.staff),
      )
    : copy.welcome(options.channel);
  const lines = [header, "", copy.menuIntro];
  if (options.booking) lines.push("", copy.menuBookingHint);
  return lines.join("\n");
}

export function menuButtons(
  locale: ChatLocale,
  options: {
    staff: StaffBinding | null;
    booking: boolean;
  },
): ChatButton[][] {
  const copy = t(locale);
  const rows: ChatButton[][] = [
    [
      { id: "go", label: copy.bookTaxi },
      coursesButton(locale),
    ],
  ];
  const trailing: ChatButton[] = [];
  if (options.staff) {
    trailing.push(
      options.staff.onDuty
        ? { id: DUTY_OFF_ID, label: copy.offDutyBtn }
        : { id: DUTY_ON_ID, label: copy.onDutyBtn },
    );
  }
  trailing.push({ id: MENU_LANG_ID, label: copy.menuLangBtn });
  if (options.booking) {
    trailing.push({ id: "x", label: copy.cancel });
  }
  for (let i = 0; i < trailing.length; i += 2) {
    rows.push(trailing.slice(i, i + 2));
  }
  return rows;
}

export async function sendRoleMenu(
  channel: ChatChannel,
  inbound: InboundMessage,
  staff: StaffBinding | null,
  locale: ChatLocale,
) {
  const session = await getSession(inbound.channel, inbound.chatId);
  const booking = isActiveBooking(session);
  await channel.send({
    chatId: inbound.chatId,
    locale,
    text: menuText(locale, {
      channel: inbound.channel,
      staff,
      booking,
    }),
    buttons: menuButtons(locale, { staff, booking }),
  });
}
