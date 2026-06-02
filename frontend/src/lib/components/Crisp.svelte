<script lang="ts">
  import { onMount } from 'svelte';
  import { env } from '$env/dynamic/public';

  // Website ID comes from the runtime container env (per-environment k8s
  // deployment), like Umami. Empty/unset -> the widget never loads, so Crisp is
  // fully hidden. The crisp.chat hosts are whitelisted in the CSP (hooks.server.ts).
  const websiteId = env.PUBLIC_CRISP_WEBSITE_ID ?? '';

  onMount(() => {
    if (!websiteId) return;

    // Mirror the official Crisp snippet: seed the queue + website id on window,
    // then async-load the loader script. RGPD: we deliberately do NOT push any
    // talent identity (email/name) — talents can be minors.
    const w = window as unknown as {
      $crisp: unknown[];
      CRISP_WEBSITE_ID: string;
    };
    w.$crisp = [];
    w.CRISP_WEBSITE_ID = websiteId;

    const s = document.createElement('script');
    s.src = 'https://client.crisp.chat/l.js';
    s.async = true;
    document.head.appendChild(s);
  });
</script>
