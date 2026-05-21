<script lang="ts">
  import '@fontsource/anton';
  import '@fontsource-variable/ibm-plex-sans';
  // Space Mono — `font-mono` accents (overlines, dates, code blocks). Per
  // the charte, mono is the third brand family alongside Anton + IBM Plex
  // Sans, used to keep the "typed terminal" voice on tech surfaces.
  import '@fontsource/space-mono/400.css';
  import '@fontsource/space-mono/700.css';
  import './layout.css';
  import { Toaster } from '$lib/components/ui/sonner';
  import { onNavigate } from '$app/navigation';
  import { ModeWatcher } from 'mode-watcher';
  import { page } from '$app/state';
  import { dev } from '$app/environment';
  import ImpersonationBanner from '$lib/components/ImpersonationBanner.svelte';
  import Umami from '$lib/components/Umami.svelte';
  import { identify, reset } from '$lib/analytics';

  // Import SVGs as URLs using Vite's ?url suffix
  import faviconProd from '$lib/assets/favicon.svg?url';
  import faviconDev from '$lib/assets/favicon-dev.svg?url';

  let { children } = $props();

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

  // Functional distinct_id is the StaffProfile.id / Talent.id (cuid, stable
  // across sessions, decoupled from auth provider). Properties shape per
  // product spec: account_type, role (staff role only — null for talents),
  // campus name, email.
  //
  // Impersonation: when an admin uses login-as, BetterAuth swaps the active
  // session to the target user. Without special handling, every analytics
  // event during the impersonation would be attributed to the target — admin
  // debug clicks polluting the user's funnels and replays. Instead, we
  // identify as the real admin and tag the target via `impersonating_target_id`
  // so admin-driven sessions stay filterable from genuine user behavior.
  let identityKey = $state<string | null>(null);
  $effect(() => {
    const user = page.data.user;
    const staff = page.data.staffProfile;
    const talent = page.data.talent;
    const impersonator = page.data.impersonator;
    let next: {
      id: string;
      data: Record<string, string | number | null>;
    } | null = null;
    if (impersonator) {
      const adminId = impersonator.staffProfileId ?? impersonator.userId;
      next = {
        id: adminId,
        data: {
          account_type: 'staff',
          role: impersonator.staffRole ?? null,
          campus: impersonator.campusName ?? null,
          email: impersonator.email ?? null,
          impersonating_target_id: staff?.id ?? talent?.id ?? null,
        },
      };
    } else if (staff) {
      next = {
        id: staff.id,
        data: {
          account_type: 'staff',
          role: staff.staffRole ?? null,
          campus: staff.campus?.name ?? null,
          email: user?.email ?? null,
        },
      };
    } else if (talent) {
      next = {
        id: talent.id,
        data: {
          account_type: 'talent',
          role: null,
          campus: page.data.talentCampusName ?? null,
          email: user?.email ?? talent.email ?? null,
        },
      };
    }
    const key = next
      ? `${next.id}|${next.data.account_type}|${next.data.impersonating_target_id ?? ''}`
      : null;
    if (key === identityKey) return;
    identityKey = key;
    if (next) identify(next.id, next.data);
    else reset();
  });
</script>

<svelte:head>
  <title>Jump {userCampusName ? `| ${userCampusName}` : ''}</title>
  <link rel="icon" href={dev ? faviconDev : faviconProd} />
</svelte:head>

<ModeWatcher />
<Umami />

<div style="display: contents">
  <Toaster richColors position="top-center" />
  <ImpersonationBanner />
  {@render children()}
</div>
