<script lang="ts">
  import { env } from '$env/dynamic/public';

  const host = env.PUBLIC_UMAMI_HOST?.replace(/\/$/, '') ?? '';
  const websiteId = env.PUBLIC_UMAMI_WEBSITE_ID ?? '';
  const recorderEnabled = Boolean(env.PUBLIC_UMAMI_RECORDER);
  const enabled = host !== '' && websiteId !== '';
</script>

<svelte:head>
  {#if enabled}
    <script defer src="{host}/script.js" data-website-id={websiteId}></script>
    {#if recorderEnabled}
      <script
        defer
        src="{host}/recorder.js"
        data-website-id={websiteId}
        data-sample-rate="0.85"
        data-mask-level="moderate"
        data-max-duration="600000"
      ></script>
    {/if}
  {/if}
</svelte:head>
