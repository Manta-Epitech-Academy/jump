import { createAuthClient } from 'better-auth/svelte';
import { adminClient, emailOTPClient } from 'better-auth/client/plugins';
import { base } from '$app/paths';

export const authClient = createAuthClient({
  basePath: `${base}/api/auth`,
  plugins: [adminClient(), emailOTPClient()],
});
