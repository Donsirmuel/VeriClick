/**
 * Everything this app keeps in localStorage, and the one way to clear it.
 *
 * Signing out only ever removed the two tokens, so per-account flags survived
 * into the next session in the same browser. Deleting an account and signing
 * up again then landed on a dashboard that behaved as if the new account had
 * already been onboarded — the product tour never played, because the previous
 * account's "seen it" flag was still sitting there.
 *
 * Anything account-scoped added later belongs in this list.
 */
export const SESSION_KEYS = [
  'token',
  'refresh',
  'vericlick_tour_completed',
  'vericlick-first-bot-blocked-toast',
] as const

/** Wipe the browser's copy of who is signed in and what they have seen. */
export function clearSession() {
  for (const key of SESSION_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      // A browser with storage disabled has nothing to clear.
    }
  }
}
