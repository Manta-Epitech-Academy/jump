<script lang="ts">
  import Sparkle from '@lucide/svelte/icons/sparkle';
  import { resolve } from '$app/paths';
  import * as Card from '$lib/components/ui/card';

  // epi-blue (#013afb) as rgb for the bg tint scale.
  const BG_RGB = '1, 58, 251';

  type InterestRow = {
    interestId: string;
    nom: string;
    emoji: string | null;
    count: number;
  };

  type Props = {
    eventId: string;
    interests: InterestRow[];
  };

  let { eventId, interests }: Props = $props();

  const inscritsBase = $derived(
    resolve(`/staff/dev/events/${eventId}/inscrits`),
  );

  const max = $derived(
    interests.reduce((m, r) => Math.max(m, r.count), 0) || 1,
  );

  const sized = $derived(
    interests.map((i) => ({
      ...i,
      // Maps count → font-size 12-20px and bg opacity 0.08 → 0.32.
      fontSize: 12 + Math.round((i.count / max) * 8),
      bgAlpha: 0.08 + (i.count / max) * 0.24,
    })),
  );
</script>

<Card.Root class="rounded-sm shadow-sm dark:shadow-none">
  <div
    class="flex flex-row items-center gap-2 border-b bg-muted/30 px-6 pt-4 pb-3"
  >
    <Sparkle class="h-5 w-5 text-epi-blue" />
    <h3 class="font-heading text-2xl tracking-wide text-foreground uppercase">
      Centres d’intérêt déclarés
    </h3>
  </div>
  <Card.Content class="p-5">
    {#if interests.length === 0}
      <p class="py-6 text-center text-sm text-muted-foreground">
        Aucun centre d’intérêt renseigné pour les inscrits.
      </p>
    {:else}
      <p
        class="mb-3 font-mono text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
      >
        Cliquer pour filtrer les inscrits
      </p>
      <div class="flex flex-wrap gap-2">
        {#each sized as i (i.interestId)}
          <a
            href={`${inscritsBase}?interest=${i.interestId}`}
            class="inline-flex items-baseline gap-1.5 rounded-sm border border-epi-blue/20 px-3 py-1 font-medium text-foreground transition-all hover:border-epi-blue hover:bg-epi-blue/15 hover:text-epi-blue hover:shadow-sm"
            style="font-size: {i.fontSize}px; background: rgba({BG_RGB},{i.bgAlpha});"
          >
            {#if i.emoji}<span aria-hidden="true">{i.emoji}</span>{/if}
            {i.nom}
            <span class="font-mono text-[10px] font-bold text-epi-blue">
              {i.count}
            </span>
          </a>
        {/each}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
