<script lang="ts">
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';

  let { data }: { data: PageData } = $props();

  const iframeSrc = $derived(
    `${data.jumpGamesUrl.replace(/\/$/, '')}/?token=${encodeURIComponent(data.token)}`,
  );
</script>

<div class="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
  <div class="flex items-center justify-between">
    <Button variant="ghost" href={resolve('/')}>
      <ArrowLeft class="mr-2 h-4 w-4" /> Retour
    </Button>
    <h1 class="text-lg font-bold capitalize">
      {data.publication.game} · niveau {data.publication.level}
    </h1>
    <div class="w-24"></div>
  </div>

  <div
    class="overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
  >
    <iframe
      src={iframeSrc}
      title="Mini-jeu"
      sandbox="allow-scripts allow-same-origin"
      referrerpolicy="no-referrer"
      allow="fullscreen"
      class="block h-[720px] w-full border-0"
    ></iframe>
  </div>

  <p class="text-center text-xs text-slate-500 dark:text-slate-400">
    Si tu fermes cette page avant la fin, ta partie sera perdue.
  </p>
</div>
