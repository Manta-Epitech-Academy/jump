<script lang="ts">
  import { env } from '$env/dynamic/public';
  import { page } from '$app/state';
  import { UMAMI_BEFORE_SEND, analyticsIdentity } from '$lib/analytics';

  // Host is constant across all environments, hardcoded here to match the
  // value whitelisted in svelte.config.js CSP. The website ID comes from the
  // runtime container env (per-environment k8s deployment).
  //
  // PAGE VIEWS AND NAMED EVENTS ONLY. The session recorder that used to load
  // beside this script is gone and must not come back. This component is
  // rendered once from the root layout with no route condition and no
  // `+layout@*.svelte` anywhere to reset it, so anything mounted here runs on
  // every space at once: filming minors on the talent and parent portals, and
  // filming their names, emails and phone numbers off the staff screens that
  // display them. It was also the only reason the CSP carried
  // `'unsafe-inline'`. See issue #275.
  //
  // A TALENT WHO OBJECTED GETS NO SCRIPT AT ALL. Rendered on the server, their
  // page never contacts the Umami host, so not even their address reaches it.
  // That cannot cover a tracker already running when they arrive (signed in on
  // a tab that loaded it while signed out), and nothing can unload one, so
  // every send also passes through `beforeSend` in `$lib/analytics`, which
  // drops it. The two together are what makes the settings switch true
  // (#518).
  const HOST = 'https://jump-umami.epiboost.eu';
  const websiteId = env.PUBLIC_UMAMI_WEBSITE_ID ?? '';
  const enabled = $derived(
    websiteId !== '' && analyticsIdentity(page.data).subject.measured,
  );
</script>

<svelte:head>
  {#if enabled}
    <script
      defer
      src="{HOST}/script.js"
      data-website-id={websiteId}
      data-before-send={UMAMI_BEFORE_SEND}
    ></script>
  {/if}
</svelte:head>
