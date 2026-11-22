<script lang="ts">
  import '@fontsource/anton';
  import '@fontsource-variable/ibm-plex-sans';
  // Space Mono: `font-mono` accents (overlines, dates, code blocks). Per
  // the charte, mono is the third brand family alongside Anton + IBM Plex
  // Sans, used to keep the "typed terminal" voice on tech surfaces.
  import '@fontsource/space-mono/400.css';
  import '@fontsource/space-mono/700.css';
  import './layout.css';
  import { Toaster } from '#lib/components/ui/sonner/index.ts';
  import * as Tooltip from '#lib/components/ui/tooltip/index.ts';
  import { onMount } from 'svelte';
  import { onNavigate, beforeNavigate } from '$app/navigation';
  import { ModeWatcher } from 'mode-watcher';
  import { page, updated } from '$app/state';
  import { dev } from '$app/env';
  import Umami from '#lib/components/Umami.svelte';
  import ImpersonationAutoExit from '#lib/components/ImpersonationAutoExit.svelte';
  import RealSendsBanner from '#lib/components/layout/RealSendsBanner.svelte';
  import DevRedirectPinBanner from '#lib/components/layout/DevRedirectPinBanner.svelte';
  import NavigationProgress from '#lib/components/layout/NavigationProgress.svelte';
  import {
    analyticsIdentity,
    identify,
    setAnalyticsSubject,
  } from '#lib/analytics.ts';
  import { READER_TIMEZONE_COOKIE } from '#lib/domain/planningTime.ts';

  // Import SVGs as URLs using Vite's ?url suffix
  import faviconProd from '#lib/assets/favicon.svg?url';
  import faviconDev from '#lib/assets/favicon-dev.svg?url';

  let { children } = $props();

  // Stale-client recovery: once kit's `version.pollInterval` has detected a new
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

  // The reader's timezone, kept for the server so a line about the reader (the
  // dev space's greeting) is read on the reader's clock from the first render
  // (`getReaderTimezone`). Set from every space, since any of them may be the
  // first one a staff member opens.
  onMount(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const cookie = `${READER_TIMEZONE_COOKIE}=${tz}`;
    if (!document.cookie.split('; ').includes(cookie)) {
      document.cookie = `${cookie};path=/;max-age=31536000;SameSite=Lax`;
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

  // Who Umami measures on this page (`analyticsIdentity`, where the rules
  // live). The subject is set on every change, because `beforeSend` enforces
  // it on every payload; `identify` is called only when the properties change,
  // since the tracker keeps them for the rest of the tab's life.
  let identified: string | null = null;
  $effect(() => {
    const { subject, properties } = analyticsIdentity(page.data);
    setAnalyticsSubject(subject);
    const key = properties && JSON.stringify([subject.distinctId, properties]);
    if (key === identified) return;
    identified = key;
    if (properties) identify(properties);
  });
</script>

<svelte:head>
  <title>Jump {userCampusName ? `| ${userCampusName}` : ''}</title>
  <link rel="icon" href={dev ? faviconDev : faviconProd} />
</svelte:head>

<!-- The FOUC-prevention script it would inject here carries no nonce and
     kit's `csp` blocks it; `src/app.html` emits a nonce-carrying copy instead
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
