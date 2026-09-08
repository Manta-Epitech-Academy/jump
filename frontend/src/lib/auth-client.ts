import { createAuthClient } from 'better-auth/svelte';
import { adminClient } from 'better-auth/client/plugins';
import { resolve } from '$app/paths';

export const authClient = createAuthClient({
  basePath: resolve('/api/auth'),
  // No `emailOTPClient()`: the OTP flow is driven entirely server-side by the
  // `/login` actions, and nothing in the app calls `signIn.emailOtp`. Shipping
  // the client plugin only advertised a door this app does not use.
  plugins: [adminClient()],
});
