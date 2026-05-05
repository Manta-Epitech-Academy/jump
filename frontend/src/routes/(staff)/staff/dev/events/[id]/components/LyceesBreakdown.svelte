<script lang="ts">
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import * as Card from '$lib/components/ui/card';

  type LyceeRow = {
    lyceeId: string;
    nom: string;
    count: number;
  };

  type Props = {
    lycees: LyceeRow[];
    totalParticipations: number;
  };

  let { lycees, totalParticipations }: Props = $props();

  const max = $derived(lycees.reduce((m, r) => Math.max(m, r.count), 0) || 1);
</script>

<Card.Root class="rounded-sm shadow-sm dark:shadow-none">
  <Card.Header class="border-b bg-muted/30 pt-4 pb-3">
    <Card.Title
      class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
    >
      <GraduationCap class="h-4 w-4 text-epi-blue" />
      Origine — top lycées
    </Card.Title>
  </Card.Header>
  <Card.Content class="space-y-3 p-5">
    {#if lycees.length === 0}
      <p class="py-6 text-center text-sm text-muted-foreground">
        Aucun lycée renseigné pour les inscrits.
      </p>
    {:else}
      {#each lycees as lyc (lyc.lyceeId)}
        {@const pct = totalParticipations
          ? Math.round((lyc.count / totalParticipations) * 100)
          : 0}
        <div>
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="truncate font-medium">{lyc.nom}</span>
            <span
              class="shrink-0 font-mono text-[10px] font-bold text-muted-foreground"
            >
              {lyc.count} · {pct}%
            </span>
          </div>
          <div
            class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted dark:bg-muted/30"
          >
            <div
              class="h-full bg-linear-to-r from-epi-blue to-epi-pink transition-[width] duration-700 ease-out"
              style="width: {(lyc.count / max) * 100}%"
            ></div>
          </div>
        </div>
      {/each}
    {/if}
  </Card.Content>
</Card.Root>
