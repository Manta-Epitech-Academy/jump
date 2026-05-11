<script lang="ts">
  import { env } from '$env/dynamic/public';

  // Host is constant across all environments, hardcoded here to match the
  // value whitelisted in svelte.config.js CSP. Website ID and recorder flag
  // come from the runtime container env (per-environment k8s deployment).
  const HOST = 'https://jump-umami.epiboost.eu';
  const websiteId = env.PUBLIC_UMAMI_WEBSITE_ID ?? '';
  const recorderEnabled = Boolean(env.PUBLIC_UMAMI_RECORDER);
  const enabled = websiteId !== '';
</script>

<svelte:head>
  {#if enabled}
    <script defer src="{HOST}/script.js" data-website-id={websiteId}></script>
    {#if recorderEnabled}
      <script
        defer
        src="{HOST}/recorder.js"
        data-website-id={websiteId}
        data-sample-rate="0.85"
        data-mask-level="moderate"
        data-max-duration="600000"
      ></script>
    {/if}
  {/if}
</svelte:head>
