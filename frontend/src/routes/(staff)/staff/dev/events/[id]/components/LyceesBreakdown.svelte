<script lang="ts">
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { resolve } from '$app/paths';
  import * as Card from '$lib/components/ui/card';

  type LyceeRow = {
    lyceeId: string;
    nom: string;
    count: number;
  };

  type Props = {
    eventId: string;
    lycees: LyceeRow[];
    totalParticipations: number;
  };

  let { eventId, lycees, totalParticipations }: Props = $props();

  const inscritsBase = $derived(
    resolve(`/staff/dev/events/${eventId}/inscrits`),
  );
</script>

<Card.Root class="rounded-sm shadow-sm dark:shadow-none">
  <div
    class="flex flex-row items-center gap-2 border-b bg-muted/30 px-6 pt-4 pb-3"
  >
    <GraduationCap class="h-5 w-5 text-epi-blue" />
    <h3 class="font-heading text-2xl tracking-wide text-foreground uppercase">
      Origine — top lycées
    </h3>
  </div>
  <Card.Content class="space-y-1 p-2">
    {#if lycees.length === 0}
      <p class="py-6 text-center text-sm text-muted-foreground">
        Aucun lycée renseigné pour les inscrits.
      </p>
    {:else}
      {#each lycees as lyc (lyc.lyceeId)}
        {@const pct = totalParticipations
          ? Math.round((lyc.count / totalParticipations) * 100)
          : 0}
        <a
          href={`${inscritsBase}?lycee=${lyc.lyceeId}`}
          class="group block rounded-sm px-3 py-2 transition-colors hover:bg-epi-blue/5"
        >
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span
              class="truncate font-medium underline decoration-muted-foreground/40 decoration-dotted underline-offset-4 group-hover:text-epi-blue group-hover:decoration-epi-blue"
              >{lyc.nom}</span
            >
            <span
              class="flex shrink-0 items-center gap-1 font-mono text-[10px] font-bold text-muted-foreground"
            >
              {lyc.count} · {pct}%
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
    {/if}
  </Card.Content>
</Card.Root>
