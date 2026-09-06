<script lang="ts">
  import '../../layout.css';
  import { Button } from '$lib/components/ui/button';
  import LogOut from '@lucide/svelte/icons/log-out';
  import { resolve } from '$app/paths';
  import Crisp from '$lib/components/Crisp.svelte';

  let { data, children } = $props();
  const isLoginPage = $derived(!data.user);
</script>

{#if isLoginPage}
  {@render children()}
{:else}
  <!-- `parent-layout` carries the space skin (radius, elevation, focus ring);
       see the space-skins block in layout.css. The login page bypasses this
       wrapper, so `ParentFlowShell` declares the same class on its own root. -->
  <div class="parent-layout min-h-dvh bg-background">
    {@render children()}
  </div>
{/if}

<!-- Live-chat widget, self-gated to the parent onboarding flow (see Crisp.svelte / supportSurfaces). No-op unless PUBLIC_CRISP_WEBSITE_ID is set. -->
<Crisp />
