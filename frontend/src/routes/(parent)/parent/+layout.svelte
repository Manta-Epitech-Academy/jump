<script lang="ts">
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
    <header
      class="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/80"
    >
      <div
        class="mx-auto flex h-16 max-w-4xl items-center justify-between px-4"
      >
        <a href={resolve('/parent')} class="flex items-center gap-2">
          <span
            class="font-heading text-xl font-bold tracking-tight text-epi-blue uppercase"
          >
            Jump
          </span>
          <span
            class="rounded-full bg-epi-blue/10 px-2 py-0.5 text-[10px] font-bold text-epi-blue uppercase"
          >
            Parent
          </span>
        </a>

        <form method="POST" action={resolve('/logout')}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            class="gap-2 text-slate-500 hover:text-red-500"
          >
            <LogOut class="h-4 w-4" />
            Déconnexion
          </Button>
        </form>
      </div>
    </header>

    <main class="mx-auto max-w-4xl px-4 py-8">
      {@render children()}
    </main>
  </div>
{/if}
