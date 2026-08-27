import { TRANSPORT_COMPANIES } from "./companies";
import { LICENSED_TAXIS } from "../licensed-taxis";
import { sameWhatsAppId } from "../phone";
import type { InboundMessage, SupplierKind } from "./types";

export type StaffIdentity = {
  kind: SupplierKind;
  supplierId: string;
};

export function staffIdentityFromPhone(phone: string | null | undefined): StaffIdentity | null {
  if (!phone) return null;
  const taxis = LICENSED_TAXIS.filter((taxi) => sameWhatsAppId(phone, taxi.phone)).sort(
    (a, b) => a.id.localeCompare(b.id),
  );
  if (taxis[0]) return { kind: "taxi", supplierId: taxis[0].id };
  const companies = TRANSPORT_COMPANIES.filter((company) =>
    sameWhatsAppId(phone, company.phone),
  ).sort((a, b) => a.id.localeCompare(b.id));
  if (companies[0]) return { kind: "company", supplierId: companies[0].id };
  return null;
}

export function staffIdentityFromChatId(chatId: string): StaffIdentity | null {
  return staffIdentityFromPhone(chatId);
}

function isOwnContact(inbound: Pick<InboundMessage, "fromId" | "contact">) {
  const contact = inbound.contact;
  if (!contact?.phone) return false;
  if (contact.userId && contact.userId !== inbound.fromId) return false;
  return true;
}

export function staffIdentityFromInbound(
  inbound: Pick<InboundMessage, "chatId" | "fromId" | "contact" | "text">,
  ignoreContact = false,
): StaffIdentity | null {
  const shared =
    !ignoreContact && isOwnContact(inbound)
      ? staffIdentityFromPhone(inbound.contact?.phone)
      : null;
  return (
    staffIdentityFromChatId(inbound.chatId) ??
    shared ??
    staffIdentityFromPhone(inbound.text?.trim())
  );
}
