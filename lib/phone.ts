export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

/** WhatsApp `from` / registry phones: 590690… (no +). */
export function whatsappId(value: string) {
  let digits = digitsOnly(value);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = `590${digits.slice(1)}`;
  }
  return digits.length >= 10 ? digits : null;
}

export function sameWhatsAppId(a: string, b: string) {
  const left = whatsappId(a);
  const right = whatsappId(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length === 11 && left.startsWith("1") && left.slice(1) === right) {
    return true;
  }
  if (right.length === 11 && right.startsWith("1") && right.slice(1) === left) {
    return true;
  }
  return false;
}

export function isValidPhone(value: string) {
  const digits = digitsOnly(value);
  return digits.length >= 8 && digits.length <= 15;
}

/** WhatsApp chat id as a stored passenger phone (`+590…`), or null. */
export function whatsappPassengerPhone(chatId: string) {
  const id = whatsappId(chatId);
  return id && isValidPhone(id) ? `+${id}` : null;
}

export function phoneHref(value: string) {
  const digits = digitsOnly(value);
  if (!digits) return "tel:";
  return digits.startsWith("0") ? `tel:${digits}` : `tel:+${digits}`;
}

export function phoneLabel(value: string) {
  const digits = digitsOnly(value);
  if (digits.length === 12 && digits.startsWith("590")) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
  }
  return value.trim();
}
