const TENANT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Microsoft's own directory for personal accounts. A GUID like any other, but
// pinning to it admits every personal Microsoft account, as `consumers` does.
const PERSONAL_ACCOUNTS_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';

/**
 * The Entra directory the staff Microsoft door is pinned to, or a refusal to
 * boot.
 *
 * The pin is what makes the address on a Microsoft sign-in worth trusting.
 * BetterAuth links a Microsoft sign-in onto the existing account holding the
 * same address (`trustedProviders` in `server/auth.ts`), and the staff door
 * checks that address, not where it came from. Inside one directory, only its
 * administrators set an address. Left blank, the provider falls back to
 * `common`: any directory completes the flow, and whoever administers their
 * own can assert an admin's `@epitech.eu` address and be signed in as that
 * admin (security audit run-1). The fallback is silent, so a blank line in a
 * new environment's config would open it with nothing to show for it.
 *
 * Hence a tenant id and nothing else. `common`, `organizations` and `consumers`
 * are the multi-directory endpoints. A domain name such as `epitech.eu` would
 * pin the endpoint, but BetterAuth compares it to the issuer's id when it
 * checks a token, so every sign-in through `/sign-in/social`'s `idToken` form
 * would fail.
 */
export function pinnedMicrosoftTenant(value: string | undefined): string {
  if (
    !value ||
    !TENANT_ID.test(value) ||
    value.toLowerCase() === PERSONAL_ACCOUNTS_TENANT
  ) {
    throw new Error(
      `MICROSOFT_TENANT_ID must be the id (a GUID) of the directory staff sign in with, got ${JSON.stringify(value ?? '')}`,
    );
  }
  return value;
}
