<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // The token is only minted once the talent explicitly starts (POST action),
  // so the iframe stays unmounted until then.
  const iframeSrc = $derived(
    form?.token
      ? `${data.jumpGamesUrl.replace(/\/$/, '')}/?token=${encodeURIComponent(form.token)}`
      : null,
  );

  let starting = $state(false);
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

  {#if iframeSrc}
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
  {:else}
    <div
      class="flex flex-col items-center gap-4 rounded-3xl bg-white p-10 text-center shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
    >
      <div class="rounded-full bg-blue-50 p-4 dark:bg-blue-950/20">
        <Gamepad2 class="h-8 w-8 text-epi-blue" />
      </div>
      <div>
        <h2 class="text-lg font-bold text-slate-900 dark:text-white">
          Prêt à relever le défi du jour ?
        </h2>
        <p class="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          Tu n'as qu'une seule tentative. Lance la partie quand tu es prêt — le
          chrono démarre immédiatement.
        </p>
      </div>
      <form
        method="POST"
        action="?/play"
        use:enhance={() => {
          starting = true;
          return async ({ update }) => {
            await update();
            starting = false;
          };
        }}
      >
        <Button
          type="submit"
          disabled={starting}
          class="rounded-xl bg-epi-blue font-bold text-white hover:bg-epi-blue/90"
        >
          {starting ? 'Chargement…' : 'Lancer la partie'}
        </Button>
      </form>
    </div>
  {/if}
</div>
