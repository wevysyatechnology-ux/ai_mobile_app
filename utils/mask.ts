/**
 * Privacy masking for anything a member shares outside the app (e.g. the receipt screenshot posted
 * to a WhatsApp group): a customer's name and number are only partly visible.
 */

/** "Rakshith" -> "Ra****th", "Ramya" -> "Ra**a", "Sai" -> "S**". */
function maskWord(word: string): string {
  const w = word.trim();
  const n = w.length;
  if (n === 0) return '';
  if (n <= 3) return w[0] + '*'.repeat(n - 1);
  if (n <= 5) return w.slice(0, 2) + '*'.repeat(n - 3) + w.slice(-1);
  return w.slice(0, 2) + '*'.repeat(n - 4) + w.slice(-2);
}

/** "Ramyash Kumar" -> "Ra***sh K." : first word partly hidden, later words reduced to an initial. */
export function maskName(full: string | null | undefined): string {
  const words = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const [first, ...rest] = words;
  return [maskWord(first), ...rest.map((w) => w[0].toUpperCase() + '.')].join(' ');
}

/** "9876543210" / "+91 98765 43210" -> "98******10"; too-short numbers are fully hidden. */
export function maskPhone(phone: string | null | undefined): string {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length > 10) digits = digits.slice(-10); // drop +91 / leading 0
  if (digits.length === 0) return '';
  if (digits.length < 6) return '*'.repeat(digits.length);
  return digits.slice(0, 2) + '*'.repeat(digits.length - 4) + digits.slice(-2);
}
