<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { authClient } from '$lib/auth-client';
  import { toast } from 'svelte-sonner';
  import { IMPERSONATION_IDLE_WINDOW_SEC } from '$lib/domain/impersonation';

  // Headless guard, mounted once in the root layout. An impersonation session
  // is an idle timeout: the server slides its expiry forward on each request
  // while the admin is active (`slideImpersonationExpiry`), and once it lapses
  // BetterAuth bounces the admin to login, dropping their own admin session
  // with it. To avoid that dead-end we call the *supported* stop-impersonating
  // API a touch before the server-side expiry, while the session is still
  // valid: it cleanly restores the admin session, so we land the admin back in
  // their space with a toast instead of a confusing logout.
  //
  // "Active" means the server slid the window forward, and it does that on
  // every request that runs the hook (`slideImpersonationExpiry`), not only on
  // navigations. So the countdown resets on every server load, detected
  // reactively: a navigation changes `page.url`, and an in-place `invalidateAll`
  // changes `page.data`. That second signal is the one a navigation-only reset
  // misses, and it matters: onboarding steps and activity step-validation
  // advance via `invalidateAll` without ever navigating (`stepSubmit.ts`: "the
  // wizard never navigates between steps"), yet each still slides the session.
  // We intentionally do not derive the deadline from `session.expiresAt`: under
  // the 5-min cookie cache that value can lag the true expiry, whereas a fresh
  // `IDLE_LIMIT_MS` from each load tracks the same "last activity" the server
  // saw. The timer reaches zero only once the admin has gone a full window with
  // no request at all.

  // Bow out this far before the server-side expiry, covering request latency
  // and the slide's write throttle (must exceed `MIN_BUMP_MS` server-side).
  const STOP_BEFORE_MS = 45_000;
  const IDLE_LIMIT_MS = IMPERSONATION_IDLE_WINDOW_SEC * 1000 - STOP_BEFORE_MS;

  const session = $derived(
    page.data.session as { impersonatedBy?: string | null } | null,
  );
  const isImpersonating = $derived(Boolean(session?.impersonatedBy));
  // Mirror the manual banners' return targets: talent impersonations land on
  // the talent roster, staff impersonations on the users list.
  const returnPath = $derived(
    page.data.talent ? '/staff/admin/talents' : '/staff/admin/users',
  );

  async function autoExit() {
    try {
      await authClient.admin.stopImpersonating();
      toast.info(
        "Session d'impersonation expirée, retour à votre compte admin.",
      );
      await goto(resolve(returnPath), { invalidateAll: true });
    } catch {
      // The window lapsed before we could stop (e.g. the machine slept past
      // expiry): the supported API can no longer restore the admin session, so
      // route to login with an explanation rather than a bare bounce.
      toast.info("Session d'impersonation expirée, reconnectez-vous.");
      await goto(resolve('/staff/login'), { invalidateAll: true });
    }
  }

  // Reading `page.url` and `page.data` registers both as reactive dependencies,
  // so this re-runs (and the timer restarts) on every navigation and every
  // in-place reload. Svelte runs the returned cleanup before each re-run and on
  // unmount, tearing down the previous timer, so there is no stray handle to
  // track by hand. Runs once on mount too, arming the countdown immediately.
  $effect(() => {
    page.url;
    page.data;
    if (!isImpersonating) return;
    const timer = setTimeout(autoExit, IDLE_LIMIT_MS);
    return () => clearTimeout(timer);
  });
</script>
