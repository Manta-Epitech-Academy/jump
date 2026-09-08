<script lang="ts">
  import { env } from '$env/dynamic/public';

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
  const HOST = 'https://jump-umami.epiboost.eu';
  const websiteId = env.PUBLIC_UMAMI_WEBSITE_ID ?? '';
  const enabled = websiteId !== '';
</script>

<svelte:head>
  {#if enabled}
    <script defer src="{HOST}/script.js" data-website-id={websiteId}></script>
  {/if}
</svelte:head>
