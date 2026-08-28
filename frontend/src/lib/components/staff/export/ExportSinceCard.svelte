<script lang="ts">
  import Download from '@lucide/svelte/icons/download';
  import History from '@lucide/svelte/icons/history';
  import { buttonVariants } from '$lib/components/ui/button';
  import { cn, formatDateTimeFr } from '$lib/utils';
  import { sinceLabel } from './exportWindow.svelte';

  // "Depuis le dernier export": what has become exportable since this admin's
  // own high-water mark, with a one-click download of exactly that delta.
  // Hidden entirely until they have exported once. Identical in the three export
  // menus apart from the sentence for an empty delta, which names what is being
  // counted.
  let {
    lastExportAt,
    count,
    href,
    nothingNewLabel,
    onDownload,
  }: {
    /** The admin's high-water mark; renders nothing when they never exported. */
    lastExportAt: string | null;
    count: number;
    href: string;
    /** e.g. "Aucun nouveau document depuis." */
    nothingNewLabel: string;
    /**
     * Acknowledge the click. The server spends a beat assembling the archive
     * before bytes flow, so each menu raises its own toast saying so.
     */
    onDownload?: () => void;
  } = $props();
</script>

{#if lastExportAt !== null}
  <div
    class="space-y-2.5 rounded-md border border-epi-blue/30 bg-epi-blue/5 p-3"
  >
    <div>
      <div class="flex items-center gap-2 text-sm font-medium">
        <History class="h-4 w-4 text-epi-blue" />
        Depuis le dernier export
      </div>
      <p
        class="mt-1 text-xs text-muted-foreground"
        title={formatDateTimeFr(lastExportAt)}
      >
        Dernier export {sinceLabel(lastExportAt)}
      </p>
    </div>
    {#if count > 0}
      <a
        {href}
        download
        onclick={() => onDownload?.()}
        class={cn(
          buttonVariants({ variant: 'default', size: 'sm' }),
          'w-full gap-2',
        )}
      >
        <Download class="h-4 w-4" />
        Télécharger les nouveaux ({count})
      </a>
    {:else}
      <p class="text-xs text-muted-foreground">{nothingNewLabel}</p>
    {/if}
  </div>
{/if}
