<script lang="ts">
  import '../../routes/layout.css';
  import { onMount } from 'svelte';

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
  class="camper-layout min-h-screen bg-slate-50 text-slate-900 selection:bg-epi-teal selection:text-black dark:bg-slate-950 dark:text-slate-100 dark:selection:bg-epi-teal"
>
  {@render children()}
</div>
