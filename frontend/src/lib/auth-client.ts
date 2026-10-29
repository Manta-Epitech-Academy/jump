import { createAuthClient } from 'better-auth/svelte';
import { resolve } from '$app/paths';

export const authClient = createAuthClient({
  basePath: resolve('/api/auth'),
  // No `emailOTPClient()`: the OTP flow is driven entirely server-side by the
  // `/login` actions, and nothing in the app calls `signIn.emailOtp`. Shipping
  // the client plugin only advertised a door this app does not use.
  // No `adminClient()` either: impersonation starts and stops through Jump's
  // own routes (`server/auth/impersonate.ts`), which keep its audit trail.
});
