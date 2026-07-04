/**
 * Shared display formatters so every screen renders dates and money the same way.
 */

/** "2026-06-28" → "28 June 2026". Falls back to the raw string if unparseable. */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return String(dateString);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** 12.5 or "12.5" → "GHS 12.50" */
export function formatCurrency(amount: number | string | null | undefined): string {
  const n = typeof amount === "number" ? amount : parseFloat(amount ?? "0");
  return `GHS ${(isNaN(n) ? 0 : n).toFixed(2)}`;
}
