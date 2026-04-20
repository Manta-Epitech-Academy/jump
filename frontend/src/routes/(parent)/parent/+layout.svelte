<script lang="ts">
  import '../../layout.css';
  import { Button } from '$lib/components/ui/button';
  import { LogOut } from '@lucide/svelte';
  import { resolve } from '$app/paths';

  let { data, children } = $props();
  const isLoginPage = $derived(!data.user);
</script>

{#if isLoginPage}
  {@render children()}
{:else}
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950">
    {@render children()}
  </div>
{/if}
