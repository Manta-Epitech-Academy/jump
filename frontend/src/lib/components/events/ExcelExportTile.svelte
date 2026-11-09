<script lang="ts">
  import type { Snippet } from 'svelte';
  import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { ACTION_TILE_CLASS } from './actionTile';

  // « Exporter Excel » as an event's square action tile: a plain download, the
  // tooltip saying what the file holds. The event home exports the whole event
  // with it, the Inscrits page the list it shows; one shape for both, as the PO
  // asked (29/10/2026).
  let { href, children }: { href: string; children: Snippet } = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        {href}
        download
        variant="outline"
        class={ACTION_TILE_CLASS}
      >
        <FileSpreadsheet />
        Exporter Excel
      </Button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content class="max-w-64">{@render children()}</Tooltip.Content>
</Tooltip.Root>
