import type { RequestEvent } from '@sveltejs/kit';
import type { EventLifecycleStatus } from '$lib/domain/eventLifecycle';

/**
 * Dev-tooling: lets an admin impersonating a dev/superdev preview phase-specific
 * UI without touching event dates. The override is intentionally narrow:
 *
 *   1. Stored in a cookie scoped to /staff/dev so it never leaks elsewhere.
 *   2. Honored only when the active session is impersonated AND the impersonated
 *      role is dev/superdev AND the request targets a /staff/dev route.
 *   3. Read once per request in `hooks.server.ts` and exposed via
 *      `locals.stagePhaseOverride`.
 *
 * The defense-in-depth here protects against a stale cookie from a prior
 * impersonation leaking into a normal session: even if the cookie survives,
 * none of the gates pass, so the override stays null.
 */

export const DEV_PHASE_OVERRIDE_COOKIE = 'dev_phase_override';

/**
 * The dev workspace lives at this absolute path. We hardcode it rather than
 * resolving via `$app/paths` because `resolve()` returns a *relative* form
 * (`./staff/dev`) under SvelteKit's default `paths.relative = true`, which
 * fails to match `event.url.pathname` (always absolute).
 */
const DEV_WORKSPACE_PATH = '/staff/dev';

const VALID_OVERRIDES = ['upcoming', 'ongoing', 'past'] as const;

export function isDevPhaseOverride(
  value: string,
): value is EventLifecycleStatus {
  return (VALID_OVERRIDES as readonly string[]).includes(value);
}

export function isDevImpersonation(locals: App.Locals): boolean {
  const session = locals.session as { impersonatedBy?: string | null } | null;
  if (!session?.impersonatedBy) return false;
  const role = locals.staffProfile?.staffRole;
  return role === 'superdev' || role === 'dev';
}

function isDevWorkspacePath(pathname: string): boolean {
  return (
    pathname === DEV_WORKSPACE_PATH ||
    pathname.startsWith(`${DEV_WORKSPACE_PATH}/`)
  );
}

export function readDevPhaseOverride(
  event: RequestEvent,
): EventLifecycleStatus | null {
  if (!isDevImpersonation(event.locals)) return null;
  if (!isDevWorkspacePath(event.url.pathname)) return null;
  const raw = event.cookies.get(DEV_PHASE_OVERRIDE_COOKIE);
  if (!raw || !isDevPhaseOverride(raw)) return null;
  return raw;
}
