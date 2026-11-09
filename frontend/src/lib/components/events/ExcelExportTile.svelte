<script lang="ts">
  import type { Snippet } from 'svelte';
  import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { ACTION_TILE_CLASS } from './actionTile';

  // « Exporter Excel » as an event's square action tile, on its home: a plain
  // download, the tooltip saying what the file holds. It is the event's one
  // export; the pages' own were retired unused (#491).
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
