/**
 * Normalizes a stored phone number into the digits-only, country-code-included
 * format WhatsApp's wa.me links require.
 *
 * users_profile.phone_number is stored inconsistently across rows — some
 * plain 10-digit local numbers ("9849122145"), some already with a country
 * code ("+919885000708") — confirmed by inspecting live data. wa.me needs
 * digits only, country code included, no leading "+".
 *
 * This only handles the common case (a bare 10-digit Indian mobile number
 * gets "91" prepended); numbers that already include a country code, or are
 * some other length, are passed through digit-stripped as-is.
 */
export function toWhatsAppNumber(phoneNumber: string): string {
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  if (digitsOnly.length === 10) {
    return `91${digitsOnly}`;
  }
  return digitsOnly;
}

export function buildWhatsAppLink(phoneNumber: string): string {
  return `https://wa.me/${toWhatsAppNumber(phoneNumber)}`;
}
