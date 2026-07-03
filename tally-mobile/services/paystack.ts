/**
 * Paystack public key (test mode).
 * Replace with your real test key from dashboard.paystack.com > Settings > API Keys.
 * The public key is safe to ship in the app; the secret key lives only in the
 * backend (application.properties) and is never bundled here.
 */
export const PAYSTACK_PUBLIC_KEY = "pk_test_a6dabace78597c9cdfa3310c0be8efdf77091f5e";

/** Client-side transaction reference, e.g. TALLY-4F9C21AB */
export function generatePaystackReference(): string {
  const random = Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, "0");
  return `TALLY-${random}`;
}
