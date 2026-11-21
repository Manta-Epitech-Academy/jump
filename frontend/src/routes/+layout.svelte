<script lang="ts">
  import '@fontsource/anton';
  import '@fontsource-variable/ibm-plex-sans';
  // Space Mono: `font-mono` accents (overlines, dates, code blocks). Per
  // the charte, mono is the third brand family alongside Anton + IBM Plex
  // Sans, used to keep the "typed terminal" voice on tech surfaces.
  import '@fontsource/space-mono/400.css';
  import '@fontsource/space-mono/700.css';
  import './layout.css';
  import { Toaster } from '$lib/components/ui/sonner';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { onNavigate, beforeNavigate } from '$app/navigation';
  import { ModeWatcher } from 'mode-watcher';
  import { page, updated } from '$app/state';
  import { dev } from '$app/environment';
  import Umami from '$lib/components/Umami.svelte';
  import ImpersonationAutoExit from '$lib/components/ImpersonationAutoExit.svelte';
  import RealSendsBanner from '$lib/components/layout/RealSendsBanner.svelte';
  import DevRedirectPinBanner from '$lib/components/layout/DevRedirectPinBanner.svelte';
  import NavigationProgress from '$lib/components/layout/NavigationProgress.svelte';
  import { identify, setAnalyticsSubject } from '$lib/analytics';
  import { objectedToUsageMeasurement } from '$lib/domain/usage';

  // Import SVGs as URLs using Vite's ?url suffix
  import faviconProd from '$lib/assets/favicon.svg?url';
  import faviconDev from '$lib/assets/favicon-dev.svg?url';

  let { children } = $props();

  // Stale-client recovery: once `kit.version.pollInterval` has detected a new
  // deploy (`updated.current` true), turn the next client-side navigation into
  // a full page load. The fresh document references the new hashed chunks, so
  // we never try to import a chunk the new image already deleted (the 404 +
  // "Failed to fetch dynamically imported module" after a prod update).
  beforeNavigate((navigation) => {
    if (updated.current && navigation.to?.url && !navigation.willUnload) {
      navigation.cancel();
      window.location.href = navigation.to.url.href;
    }
  });

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  // Access staff campus from page data (via layout.server.ts -> hooks)
  let userCampusName = $derived(page.data.staffProfile?.campus?.name);

  // Who Umami is told it is measuring. Staff are identified by their
  // StaffProfile.id (stable across sessions, decoupled from the auth provider):
  // adults, employees, and per-person history is what was asked for, the same
  // regime as Jump's own measurement. A talent never is: no id goes with their
  // events, so Umami keys them on its own monthly-rotating session hash, and a
  // talent who objected sends nothing at all (`setAnalyticsSubject`,
  // `$lib/analytics`). Properties: account_type, role (staff role only, null
  // for talents), campus name, and email for staff only, since talents can be
  // minors.
  //
  // Impersonation: when an admin uses login-as, BetterAuth swaps the active
  // session to the target user. Without special handling, every analytics
  // event during the impersonation would be attributed to the target: admin
  // debug clicks polluting the user's funnels. Instead, we identify as the real
  // admin and say what kind of account they are acting as, so admin-driven
  // sessions stay filterable from genuine user behavior. The target's id goes
  // along only when it is a member of staff: a talent's id is exactly the
  // stable identifier this whole block keeps away from Umami.
  let identityKey = $state<string | null>(null);
  $effect(() => {
    const user = page.data.user;
    const staff = page.data.staffProfile;
    const talent = page.data.talent;
    const impersonator = page.data.impersonator;
    let distinctId: string | undefined;
    let data: Record<string, string | number | null> | null = null;
    if (impersonator) {
      distinctId = impersonator.staffProfileId ?? impersonator.userId;
      data = {
        account_type: 'staff',
        role: impersonator.staffRole ?? null,
        campus: impersonator.campusName ?? null,
        email: impersonator.email ?? null,
        impersonating: staff ? 'staff' : talent ? 'talent' : null,
        impersonating_target_id: staff?.id ?? null,
      };
    } else if (staff) {
      distinctId = staff.id;
      data = {
        account_type: 'staff',
        role: staff.staffRole ?? null,
        campus: staff.campus?.name ?? null,
        email: user?.email ?? null,
      };
    } else if (talent) {
      data = {
        account_type: 'talent',
        role: null,
        campus: page.data.talentCampusName ?? null,
      };
    }
    const measured = !objectedToUsageMeasurement(talent);
    setAnalyticsSubject({ measured, distinctId });
    const key = data
      ? `${distinctId ?? ''}|${data.account_type}|${data.campus ?? ''}|${data.impersonating ?? ''}|${data.impersonating_target_id ?? ''}|${measured}`
      : null;
    if (key === identityKey) return;
    identityKey = key;
    if (data && measured) identify(data);
  });
</script>

<svelte:head>
  <title>Jump {userCampusName ? `| ${userCampusName}` : ''}</title>
  <link rel="icon" href={dev ? faviconDev : faviconProd} />
</svelte:head>

<!-- The FOUC-prevention script it would inject here carries no nonce and
     `kit.csp` blocks it; `src/app.html` emits a nonce-carrying copy instead
     (see `THEME_INIT` in hooks.server.ts, issue #277). -->
<ModeWatcher disableHeadScriptInjection />
<Umami />
<ImpersonationAutoExit />

<div style="display: contents">
  <NavigationProgress />
  <Toaster richColors position="top-center" closeButton />
  <!-- Outbound status banners share one sticky region so they stack as blocks
       instead of two independent `sticky top-0` layers fighting for the same
       offset (which made the second paint over the first when both are armed). -->
  {#if page.data.armedRealSends || page.data.devRedirectPin}
    <div class="sticky top-0 z-50">
      {#if page.data.armedRealSends}
        <RealSendsBanner until={page.data.armedRealSendsUntil} />
      {/if}
      {#if page.data.devRedirectPin}
        <DevRedirectPinBanner
          until={page.data.devRedirectPin.until}
          to={page.data.devRedirectPin.to}
        />
      {/if}
    </div>
  {/if}
  <Tooltip.Provider>
    {@render children()}
  </Tooltip.Provider>
</div>
