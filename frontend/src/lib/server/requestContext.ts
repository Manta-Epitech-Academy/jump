import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped ambient context, established once per request in
 * `hooks.server.ts` and readable anywhere downstream without threading it
 * through call signatures.
 *
 * It carries the identity of the human driving the request, so the dev-redirect
 * trap (`$lib/server/{email,sms}/dev-redirect.ts`) can route a trapped copy to
 * whoever *caused* a send instead of the shared `*_DEV_RECIPIENTS` list — on a
 * shared dev/staging env each tester then only receives their own traffic.
 * Sends with no request actor (cron, worker, logged-out OTP) find no store and
 * fall back to the env list.
 *
 * `AsyncLocalStorage` propagates across the `await`/promise chain created
 * inside `run()`, so even a fire-and-forget send started during a request
 * (e.g. the onboarding parent-welcome mail) inherits the actor — the snapshot
 * is captured when the async work is scheduled, not when it resolves.
 */
export interface RequestContext {
  /**
   * Email of the human driving this request, or null if none. This is the
   * impersonator when staff impersonate someone (the real admin behind the
   * session), otherwise the logged-in user — see the capture in
   * `hooks.server.ts`. Used as the dev-redirect fallback when the actor has no
   * personal `devRedirectEmails` configured.
   */
  actorEmail: string | null;
  /** The acting staff member's personal dev-redirect email list (may be empty). */
  devRedirectEmails: readonly string[];
  /** The acting staff member's personal dev-redirect phone list (may be empty). */
  devRedirectPhones: readonly string[];
  /**
   * Whether the acting human has deliberately armed real sends (see
   * `armRealSends.ts`). When true, sends in this request bypass the trap and
   * reach real recipients. Never set for background work (cron/worker carry no
   * cookie), so arming can only affect the sends a human is actively driving.
   */
  armedRealSends: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** The acting user's email for the current request, or null outside one. */
export function currentActorEmail(): string | null {
  return storage.getStore()?.actorEmail ?? null;
}

/** The acting staff member's configured dev-redirect emails (empty if none). */
export function currentDevRedirectEmails(): readonly string[] {
  return storage.getStore()?.devRedirectEmails ?? [];
}

/** The acting staff member's configured dev-redirect phones (empty if none). */
export function currentDevRedirectPhones(): readonly string[] {
  return storage.getStore()?.devRedirectPhones ?? [];
}

/** Whether the current request has real sends armed (false outside a request). */
export function currentArmedRealSends(): boolean {
  return storage.getStore()?.armedRealSends ?? false;
}
