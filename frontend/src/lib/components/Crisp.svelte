<script lang="ts">
  import { page } from '$app/state';
  import { env } from '$env/dynamic/public';
  import { isSupportSurface } from '$lib/domain/supportSurfaces';

  // Live-chat widget. The website ID comes from the runtime container env
  // (per-environment k8s deployment), like Umami. Empty/unset -> never loads, so
  // Crisp is fully hidden. The crisp.chat hosts are whitelisted in the CSP
  // (svelte.config.js, `kit.csp.directives`: `script-src`, `style-src`,
  // `font-src` and `connect-src`, the last one for the `wss://` relay).
  //
  // Scoped to the login + onboarding surfaces only (see supportSurfaces): we help
  // talents and parents get INTO the app, then step out of the way, so the
  // national team isn't flooded with local/on-site questions from the whole
  // talent space during a stage de seconde.
  //
  // No teardown: once l.js loads it injects a global widget (a `.crisp-client`
  // node + `window.$crisp`) with no clean removal API, and unmounting this
  // component does NOT remove it. So we never try to unload: we load lazily the
  // first time we hit a support surface and drive Crisp's own chat:show /
  // chat:hide on each client-side route change. (Across route groups the
  // component unmounts before it can hide, so a talent->staff exit must still be
  // a full-page nav -- see TalentImpersonationBanner.stopImpersonating.)
  const websiteId = env.PUBLIC_CRISP_WEBSITE_ID ?? '';

  type CrispWindow = { $crisp?: unknown[]; CRISP_WEBSITE_ID?: string };

  function ensureLoaded() {
    const w = window as unknown as CrispWindow;
    if (w.$crisp) return; // already initialized by this or another mount

    // Mirror the official Crisp snippet: seed the queue + website id on window,
    // then async-load the loader. RGPD: we deliberately do NOT push any talent
    // identity (email/name) -- talents can be minors.
    w.$crisp = [];
    w.CRISP_WEBSITE_ID = websiteId;

    const s = document.createElement('script');
    s.src = 'https://client.crisp.chat/l.js';
    s.async = true;
    document.head.appendChild(s);
  }

  $effect(() => {
    if (!websiteId) return;
    const onSurface = isSupportSurface(page.url.pathname);
    if (onSurface) ensureLoaded();
    // Safe before l.js loads (commands queue) and a no-op if never loaded.
    const w = window as unknown as CrispWindow;
    w.$crisp?.push(['do', onSurface ? 'chat:show' : 'chat:hide']);
  });
</script>
