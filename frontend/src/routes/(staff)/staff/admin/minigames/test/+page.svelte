<script lang="ts">
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import FlaskConical from '@lucide/svelte/icons/flask-conical';

  let { data }: { data: PageData } = $props();

  const iframeSrc = $derived(
    `${data.jumpGamesUrl.replace(/\/$/, '')}/?token=${encodeURIComponent(data.token)}`,
  );
</script>

<svelte:head>
  <title>Test mini-jeu — {data.gameName} · {data.level}</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <Button variant="ghost" href={resolve('/staff/admin/minigames')}>
      <ArrowLeft class="mr-2 h-4 w-4" /> Retour
    </Button>
    <div class="flex items-center gap-2 text-sm font-bold uppercase">
      <FlaskConical class="h-4 w-4 text-epi-pink" />
      Mode test · <span>{data.gameName}</span> · niveau {data.level}
    </div>
    <div class="w-24"></div>
  </div>

  <div class="overflow-hidden rounded-sm border bg-card shadow-sm">
    <iframe
      src={iframeSrc}
      title="Test mini-jeu"
      sandbox="allow-scripts allow-same-origin"
      referrerpolicy="no-referrer"
      allow="fullscreen"
      class="block h-[720px] w-full border-0"
    ></iframe>
  </div>

  <p class="text-center text-xs text-muted-foreground">
    Aucune tentative n'est enregistrée — les callbacks de cette session sont
    ignorés.
  </p>
</div>
