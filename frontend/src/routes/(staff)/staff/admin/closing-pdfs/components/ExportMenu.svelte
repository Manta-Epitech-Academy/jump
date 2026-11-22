<script lang="ts">
  import Archive from '@lucide/svelte/icons/archive';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { resolve } from '$app/paths';
  import { buttonVariants } from '#lib/components/ui/button/index.ts';
  import * as Popover from '#lib/components/ui/popover/index.ts';
  import ResultsNotice from '#lib/components/staff/ResultsNotice.svelte';
  import ExportSinceCard from '#lib/components/staff/export/ExportSinceCard.svelte';
  import ExportWindowPicker from '#lib/components/staff/export/ExportWindowPicker.svelte';
  import {
    createExportWindow,
    exportHref,
  } from '#lib/components/staff/export/exportWindow.svelte.ts';
  import { cn } from '#lib/utils.ts';
  import { toast } from 'svelte-sonner';
  import { refreshWhenReused } from '#lib/components/remoteQuery.svelte.ts';
  import { closingExportTimeline } from './exportTimeline.remote.ts';

  let { lastExportAt }: { lastExportAt: string | null } = $props();

  // The conducted-at timeline is asked for when the popover opens, not shipped
  // with the page load: it is an unbounded scan of every done closing, needed
  // only to count PDFs per period. A reopened popover shows what it read last and
  // asks again under it, so the counts and the "depuis le dernier export" delta
  // stay fresh.
  let open = $state(false);
  const timeline = $derived(open ? closingExportTimeline() : null);
  refreshWhenReused(() => timeline);

  const exportBase = resolve('staff/admin/closing-pdfs/export');

  const exportWindow = createExportWindow(() => timeline?.current ?? []);
  const sinceRange = $derived(exportWindow.sinceRange(lastExportAt));
  const sinceCount = $derived(
    sinceRange ? exportWindow.countIn(sinceRange) : 0,
  );
  const selectedCount = $derived(
    exportWindow.countIn(exportWindow.selectedRange),
  );

  function onDownload() {
    toast.info('Génération des PDF en cours, le téléchargement va démarrer...');
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger class={cn(buttonVariants({ variant: 'default' }), 'gap-2')}>
    <Archive class="h-4 w-4" />
    Exporter les PDF
    <ChevronDown class="h-4 w-4 opacity-70" />
  </Popover.Trigger>
  <Popover.Content align="end" class="w-96 space-y-4 p-4">
    <p
      class="font-mono text-[0.7rem] tracking-wider text-muted-foreground uppercase"
    >
      Synthèses de closing
    </p>

    {#if timeline?.error}
      <ResultsNotice
        compact
        description="L'historique des exports n'a pas pu être chargé. Rouvrez le menu pour réessayer."
      />
    {:else if !timeline?.ready}
      <div
        class="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <LoaderCircle class="h-4 w-4 animate-spin" />
        Chargement de l'historique...
      </div>
    {:else}
      <ExportSinceCard
        {lastExportAt}
        count={sinceCount}
        href={sinceRange
          ? exportHref(exportBase, sinceRange, { advance: true })
          : exportBase}
        nothingNewLabel="Aucun nouveau closing depuis."
        {onDownload}
      />

      <ExportWindowPicker {exportWindow} />

      {#if selectedCount > 0 && !exportWindow.customInvalid}
        <a
          href={exportHref(exportBase, exportWindow.selectedRange, {
            advance: exportWindow.period === 'all',
          })}
          download
          onclick={() => onDownload()}
          class="flex items-center justify-between gap-6 rounded-sm px-2 py-2 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
        >
          <span class="flex items-center gap-2">
            <Archive class="h-4 w-4 text-epi-blue" />
            Télécharger
          </span>
          <span class="font-mono text-xs text-muted-foreground">
            {selectedCount} PDF
          </span>
        </a>
      {:else}
        <div
          class="flex cursor-not-allowed items-center justify-between gap-6 rounded-sm px-2 py-2 text-sm text-muted-foreground/50"
        >
          <span class="flex items-center gap-2">
            <Archive class="h-4 w-4" />
            Télécharger
          </span>
          <span class="font-mono text-xs">
            {exportWindow.customInvalid ? '-' : '0'}
          </span>
        </div>
      {/if}

      <p class="text-[0.7rem] leading-snug text-muted-foreground">
        Archive ZIP. Les PDF sont générés à la volée, cela peut prendre quelques
        instants.
      </p>
    {/if}
  </Popover.Content>
</Popover.Root>
