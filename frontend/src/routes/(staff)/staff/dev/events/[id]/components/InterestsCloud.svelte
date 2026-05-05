<script lang="ts">
  import Sparkle from '@lucide/svelte/icons/sparkle';
  import * as Card from '$lib/components/ui/card';

  // epi-blue (#013afb) as rgb for the bg tint scale.
  const BG_RGB = '1, 58, 251';

  type InterestRow = {
    interestId: string;
    label: string;
    count: number;
  };

  type Props = {
    interests: InterestRow[];
  };

  let { interests }: Props = $props();

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
  <Card.Header class="border-b bg-muted/30 pt-4 pb-3">
    <Card.Title
      class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
    >
      <Sparkle class="h-4 w-4 text-epi-blue" />
      Centres d’intérêt déclarés
    </Card.Title>
  </Card.Header>
  <Card.Content class="p-5">
    {#if interests.length === 0}
      <p class="py-6 text-center text-sm text-muted-foreground">
        Aucun centre d’intérêt renseigné pour les inscrits.
      </p>
    {:else}
      <div class="flex flex-wrap gap-2">
        {#each sized as i (i.interestId)}
          <span
            class="inline-flex items-baseline gap-1.5 rounded-sm px-3 py-1 font-medium text-foreground"
            style="font-size: {i.fontSize}px; background: rgba({BG_RGB},{i.bgAlpha});"
          >
            {i.label}
            <span class="font-mono text-[10px] font-bold text-epi-blue">
              {i.count}
            </span>
          </span>
        {/each}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
