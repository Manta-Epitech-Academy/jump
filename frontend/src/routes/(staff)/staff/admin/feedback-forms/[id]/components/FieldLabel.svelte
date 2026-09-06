<script lang="ts">
  import { Label } from '$lib/components/ui/label';
  import { InfoTooltip } from '$lib/components/ui/info-tooltip';

  // Epitech DS field label: Space-Mono overline, uppercase, tracked. Optional
  // info bubble for the cryptic builder knobs (identity, gate, option kinds).
  let { text, forId, info }: { text: string; forId?: string; info?: string } =
    $props();

  const cls = 'epi-overline text-muted-foreground';
</script>

<div class="flex items-center gap-1.5">
  {#if forId}
    <Label for={forId} class={cls}>{text}</Label>
  {:else}
    <span class={cls}>{text}</span>
  {/if}
  {#if info}<InfoTooltip text={info} />{/if}
</div>
