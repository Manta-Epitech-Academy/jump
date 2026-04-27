<script lang="ts">
  import type { PageData } from './$types';
  import { ArrowLeft, ShieldHalf, HardHat } from '@lucide/svelte';
  import { buttonVariants } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';

  let { data }: { data: PageData } = $props();
</script>

<div class="flex flex-col space-y-6">
  <div class="flex items-center gap-4 border-b pb-4">
    <a
      href={resolve('/staff/pedago')}
      class={buttonVariants({ variant: 'ghost', size: 'icon' })}
    >
      <ArrowLeft class="h-4 w-4" />
    </a>
    <div>
      <h1
        class="flex items-center gap-3 text-3xl font-bold text-epi-blue uppercase"
      >
        <ShieldHalf class="h-7 w-7" />
        Factions<span class="text-foreground">_</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        {data.event.titre}
      </p>
    </div>
  </div>

  <div
    class="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-epi-orange/50 bg-epi-orange/5 p-12 text-center md:p-24"
  >
    <div
      class="relative mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-epi-orange/20 text-epi-orange"
    >
      <HardHat class="h-10 w-10" />
    </div>

    <h2
      class="mb-2 font-heading text-2xl tracking-wide text-epi-orange uppercase"
    >
      Module en construction
    </h2>
    <p class="max-w-md text-sm text-muted-foreground">
      L'interface de gestion des factions et des points collectifs n'est pas
      encore implémentée. Ce socle est prêt pour qu'Eliot prenne le relais !
    </p>
  </div>
</div>
