import { createAuthClient } from 'better-auth/svelte';
import { adminClient, emailOTPClient } from 'better-auth/client/plugins';
import { resolve } from '$app/paths';

export const authClient = createAuthClient({
  basePath: resolve('/api/auth'),
  plugins: [adminClient(), emailOTPClient()],
});
