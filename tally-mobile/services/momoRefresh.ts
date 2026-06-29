/**
 * Module-level flag so the Add Expense screen can signal the Home screen
 * that a MoMo payment was made and the wallet balance should be re-fetched.
 * Uses a plain variable (no file I/O) — works because both screens live
 * in the same JS runtime.
 */
let _pending = false;

export function signalMomoRefresh(): void {
  _pending = true;
}

/** Returns true once (then resets the flag). */
export function consumeMomoRefresh(): boolean {
  const v = _pending;
  _pending = false;
  return v;
}
