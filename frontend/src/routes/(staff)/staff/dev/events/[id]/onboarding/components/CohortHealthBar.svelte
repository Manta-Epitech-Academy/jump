<script lang="ts">
  import { cn } from '$lib/utils';

  let {
    ready,
    incomplete,
    none,
  }: {
    ready: number;
    incomplete: number;
    none: number;
  } = $props();

  let total = $derived(ready + incomplete + none);
  let readyPct = $derived(total === 0 ? 0 : (ready / total) * 100);
  let incompletePct = $derived(total === 0 ? 0 : (incomplete / total) * 100);
  let nonePct = $derived(total === 0 ? 0 : (none / total) * 100);

  // Brand-token mapping. Sustained bar surfaces use the muted teal-solid
  // (per dashboard convention) so the neon `epi-teal` stays an accent.
  // Incomplete = epi-orange (together), none = epi-pink (tomorrow), mirroring
  // Direction A's BLOCKED magenta in onboarding-screens.jsx.
  const SEGMENTS: {
    key: 'ready' | 'incomplete' | 'none';
    label: string;
    bar: string;
    dot: string;
  }[] = [
    {
      key: 'ready',
      label: 'prêts',
      bar: 'bg-epi-teal-solid',
      dot: 'bg-epi-teal-solid',
    },
    {
      key: 'incomplete',
      label: 'incomplets',
      bar: 'bg-epi-orange',
      dot: 'bg-epi-orange',
    },
    {
      key: 'none',
      label: 'sans aucun document',
      bar: 'bg-epi-pink',
      dot: 'bg-epi-pink',
    },
  ];

  let counts = $derived({ ready, incomplete, none });
  let pcts = $derived({
    ready: readyPct,
    incomplete: incompletePct,
    none: nonePct,
  });
</script>

<div class="space-y-2">
  <div
    class="flex h-2 w-full overflow-hidden rounded-full bg-muted dark:bg-muted/40"
    role="img"
    aria-label={`${ready} prêts, ${incomplete} incomplets, ${none} sans aucun document`}
  >
    {#each SEGMENTS as seg (seg.key)}
      {@const pct = pcts[seg.key]}
      {#if pct > 0}
        <div
          class={cn('h-full transition-all', seg.bar)}
          style:width={`${pct}%`}
          title={`${counts[seg.key]} ${seg.label}`}
        ></div>
      {/if}
    {/each}
  </div>

  <div
    class="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground"
  >
    {#each SEGMENTS as seg (seg.key)}
      {#if counts[seg.key] > 0 || seg.key !== 'none'}
        <span class="inline-flex items-center gap-1.5">
          <span class={cn('h-2 w-2 rounded-sm', seg.dot)}></span>
          <span class="font-bold text-foreground">{counts[seg.key]}</span>
          <span>{seg.label}</span>
        </span>
      {/if}
    {/each}
  </div>
</div>
