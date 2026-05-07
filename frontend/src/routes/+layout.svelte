<script lang="ts">
  import '@fontsource/anton';
  import '@fontsource-variable/ibm-plex-sans';
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

  let identityKey = $state<string | null>(null);
  $effect(() => {
    const staff = page.data.staffProfile;
    const talent = page.data.talent;
    let next: {
      id: string;
      data: Record<string, string | number | null>;
    } | null = null;
    if (staff) {
      next = {
        id: staff.id,
        data: {
          kind: 'staff',
          role: staff.staffRole ?? 'unknown',
          campusId: staff.campusId ?? null,
        },
      };
    } else if (talent) {
      next = {
        id: talent.id,
        data: {
          kind: 'talent',
          level: talent.level,
          xp: talent.xp,
        },
      };
    }
    const key = next ? `${next.id}|${next.data.kind}` : null;
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
