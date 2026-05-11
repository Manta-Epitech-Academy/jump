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
</script>

<svelte:head>
  <title>Jump {userCampusName ? `| ${userCampusName}` : ''}</title>
  <link rel="icon" href={dev ? faviconDev : faviconProd} />
</svelte:head>

<ModeWatcher />

<div style="display: contents">
  <Toaster richColors position="top-center" />
  <ImpersonationBanner />
  {@render children()}
</div>
