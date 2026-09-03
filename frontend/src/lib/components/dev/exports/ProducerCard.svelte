<script lang="ts">
  import type { Component } from 'svelte';
  import type { Icon as IconType } from '@lucide/svelte';
  import Download from '@lucide/svelte/icons/download';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { Button } from '$lib/components/ui/button';
  import InfoTooltip from '$lib/components/ui/info-tooltip';
  import type { EventProducerDef } from '$lib/domain/eventModules';

  /**
   * One thing this event can produce.
   *
   * Flat card per `DESIGN.md`: 1px border, `sm` radius, no shadow. The label
   * carries one visible line and everything else sits behind the ⓘ, which is the
   * copy-density rule these cards exist to respect - six of them stacked with a
   * paragraph each would push the buttons off the first screen.
   *
   * The count is the difference between a disabled button and a dead one: an
   * event with no finalised closing says so instead of failing on click.
   */
  let {
    def,
    Icon,
    countLabel,
    empty,
    busy,
    onrun,
  }: {
    def: EventProducerDef;
    Icon: Component<IconType> | typeof IconType;
    /** What it will act on, already pluralised ("18 closings finalisés"). */
    countLabel: string;
    /** Nothing to produce: the control is disabled and says why. */
    empty: boolean;
    busy: boolean;
    onrun: () => void;
  } = $props();
</script>

<div class="flex flex-col gap-4 rounded-sm border bg-card p-6">
  <div class="flex items-start gap-3">
    <Icon class="mt-0.5 h-5 w-5 shrink-0 text-epi-blue" />
    <div class="min-w-0 flex-1 space-y-1">
      <div class="flex items-center gap-1.5">
        <h2 class="truncate font-semibold text-foreground">{def.label}</h2>
        <InfoTooltip text={def.help} />
      </div>
      <p class="text-sm leading-snug text-muted-foreground">
        {def.description}
      </p>
    </div>
    <span
      class="shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[0.65rem] tracking-wider text-muted-foreground uppercase"
    >
      {def.format}
    </span>
  </div>

  <div class="mt-auto flex items-center justify-between gap-3">
    <span class="font-mono text-xs text-muted-foreground">{countLabel}</span>
    <Button
      variant="outline"
      size="sm"
      class="rounded-sm"
      disabled={busy || empty}
      onclick={onrun}
    >
      {#if busy}
        <LoaderCircle class="mr-1.5 h-4 w-4 animate-spin" />
        Génération…
      {:else}
        <Download class="mr-1.5 h-4 w-4" />
        Télécharger
      {/if}
    </Button>
  </div>
</div>
