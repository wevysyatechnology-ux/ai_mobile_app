/**
 * Turns a raw database value into display text: "open" -> "Open", "in_progress" -> "In progress".
 * Use for status/type/category strings that are stored lowercase (or snake_case) in Supabase.
 */
export function formatLabel(value: string | null | undefined, fallback = ''): string {
  const text = String(value ?? '').trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (!text) return fallback;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
