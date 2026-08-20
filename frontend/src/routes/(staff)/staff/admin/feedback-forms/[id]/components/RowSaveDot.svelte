<script lang="ts">
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import Check from '@lucide/svelte/icons/check';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import type { SaveState } from '../editor.svelte';

  // Per-row echo of an inline edit's fate, so a single field's save is visible
  // without scanning the global indicator.
  let { state }: { state: SaveState | undefined } = $props();
</script>

<span class="inline-flex h-3.5 w-3.5 items-center justify-center">
  {#if state === 'saving'}
    <Loader2 class="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  {:else if state === 'saved'}
    <Check class="h-3.5 w-3.5 text-success" />
  {:else if state === 'error'}
    <TriangleAlert class="h-3.5 w-3.5 text-destructive" />
  {/if}
</span>
