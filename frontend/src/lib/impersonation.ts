import { resolve } from '$app/paths';

/**
 * Ends the admin impersonation this browser is in and restores the admin's
 * session cookie (`routes/api/impersonation/stop`). Throws when the server
 * could not, so each caller keeps its own fallback.
 */
export async function stopImpersonating(): Promise<void> {
  const res = await fetch(resolve('/api/impersonation/stop'), {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`stop impersonation failed: ${res.status}`);
}
