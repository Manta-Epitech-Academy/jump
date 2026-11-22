<script lang="ts">
  import '../../routes/layout.css';
  import { onMount } from 'svelte';
  import { BitsConfig } from 'bits-ui';
  import TalentImpersonationBanner from '#lib/components/TalentImpersonationBanner.svelte';
  import Crisp from '#lib/components/Crisp.svelte';

  let { children } = $props();

  onMount(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!document.cookie.includes(`tz=${tz}`)) {
      document.cookie = `tz=${tz};path=/;max-age=31536000;SameSite=Lax`;
    }
  });
</script>

<!-- The "Friendly Tech" Camper Wrapper. It carries the talent skin (radius,
     elevation, focus ring), so every popover, dialog and select opens inside
     it rather than at the end of <body>, where it would fall back to the staff
     skin: a portal leaves the DOM tree, and the skin's tokens with it. -->
<div
  class="camper-layout min-h-dvh bg-background text-foreground selection:bg-epi-tech selection:text-black dark:selection:bg-epi-tech"
>
  <BitsConfig defaultPortalTo=".camper-layout">
    <TalentImpersonationBanner />
    {@render children()}
  </BitsConfig>
</div>

<!-- Live-chat widget, self-gated to the login + onboarding surfaces (see Crisp.svelte / supportSurfaces). No-op unless PUBLIC_CRISP_WEBSITE_ID is set. -->
<Crisp />
