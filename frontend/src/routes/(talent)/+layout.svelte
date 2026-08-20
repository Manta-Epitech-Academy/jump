<script lang="ts">
  import '../../routes/layout.css';
  import { onMount } from 'svelte';
  import TalentImpersonationBanner from '$lib/components/TalentImpersonationBanner.svelte';
  import Crisp from '$lib/components/Crisp.svelte';

  let { children } = $props();

  onMount(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!document.cookie.includes(`tz=${tz}`)) {
      document.cookie = `tz=${tz};path=/;max-age=31536000;SameSite=Lax`;
    }
  });
</script>

<!-- The "Friendly Tech" Camper Wrapper -->
<div
  class="camper-layout min-h-dvh bg-slate-50 text-slate-900 selection:bg-epi-tech selection:text-black dark:bg-slate-950 dark:text-slate-100 dark:selection:bg-epi-tech"
>
  <TalentImpersonationBanner />
  {@render children()}
</div>

<!-- Live-chat widget, self-gated to the login + onboarding surfaces (see Crisp.svelte / supportSurfaces). No-op unless PUBLIC_CRISP_WEBSITE_ID is set. -->
<Crisp />
