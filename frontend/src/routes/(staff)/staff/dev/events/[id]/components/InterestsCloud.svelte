<script lang="ts">
  import Sparkle from '@lucide/svelte/icons/sparkle';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { resolve } from '$app/paths';
  import * as Card from '$lib/components/ui/card';

  type InterestRow = {
    interestId: string;
    nom: string;
    emoji: string | null;
    count: number;
  };

  /**
   * The server caps `rows` to a top-N; `others.count` is the sum of tail
   * declarations (a stagiaire picking 3 tail interests adds 3) — labelled
   * "déclarations" rather than "stagiaires" because it's not unique-stagiaire count.
   */
  type Breakdown = {
    rows: InterestRow[];
    others: { count: number; categories: number } | null;
  };

  type Props = {
    eventId: string;
    breakdown: Breakdown;
    /** Cohort size — denominator for the proportion bar. */
    totalParticipations: number;
  };

  let { eventId, breakdown, totalParticipations }: Props = $props();

  const inscritsBase = $derived(
    resolve(`/staff/dev/events/${eventId}/inscrits`),
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
  <Card.Content class="space-y-1 p-2">
    {#if breakdown.rows.length === 0}
      <p class="py-6 text-center text-sm text-muted-foreground">
        Aucun centre d’intérêt renseigné pour les inscrits.
      </p>
    {:else}
      <p
        class="px-2 pt-1 pb-2 font-mono text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
      >
        Cliquer pour filtrer les inscrits
      </p>
      {#each breakdown.rows as i (i.interestId)}
        {@const pct = totalParticipations
          ? Math.round((i.count / totalParticipations) * 100)
          : 0}
        <a
          href={`${inscritsBase}?interest=${i.interestId}`}
          title={`Filtrer · ${i.count} ${i.count > 1 ? 'stagiaires' : 'stagiaire'}`}
          class="group block rounded-sm px-3 py-2 transition-colors hover:bg-epi-blue/5"
        >
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="flex min-w-0 items-baseline gap-2">
              {#if i.emoji}
                <span aria-hidden="true" class="shrink-0 text-base leading-none"
                  >{i.emoji}</span
                >
              {/if}
              <span
                class="truncate font-medium underline decoration-muted-foreground/40 decoration-dotted underline-offset-4 group-hover:text-epi-blue group-hover:decoration-epi-blue"
                >{i.nom}</span
              >
            </span>
            <span
              class="flex shrink-0 items-center gap-1 font-mono text-[10px] font-bold text-muted-foreground"
            >
              {i.count} · {pct}%
              <ChevronRight
                class="h-3.5 w-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-epi-blue"
              />
            </span>
          </div>
          <div
            class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted dark:bg-muted/30"
          >
            <div
              class="h-full bg-epi-blue transition-[width] duration-700 ease-out"
              style="width: {pct}%"
            ></div>
          </div>
        </a>
      {/each}

      {#if breakdown.others}
        <div
          class="block rounded-sm border-t border-dashed border-border/60 px-3 py-2 text-sm"
        >
          <div
            class="flex items-baseline justify-between gap-3 text-muted-foreground"
          >
            <span class="italic">Autres</span>
            <span
              class="flex shrink-0 items-center gap-1 font-mono text-[10px] font-bold"
            >
              {breakdown.others.count}
              {breakdown.others.count > 1 ? 'déclarations' : 'déclaration'} ·
              {breakdown.others.categories}
              {breakdown.others.categories > 1 ? 'centres' : 'centre'}
            </span>
          </div>
        </div>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
