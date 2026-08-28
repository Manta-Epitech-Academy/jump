<script lang="ts">
  import Download from '@lucide/svelte/icons/download';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { resolve } from '$app/paths';
  import { buttonVariants } from '$lib/components/ui/button';
  import * as Popover from '$lib/components/ui/popover';
  import ExportSinceCard from '$lib/components/staff/export/ExportSinceCard.svelte';
  import ExportWindowPicker from '$lib/components/staff/export/ExportWindowPicker.svelte';
  import {
    createExportWindow,
    exportHref,
  } from '$lib/components/staff/export/exportWindow.svelte';
  import { cn } from '$lib/utils';
  import { toast } from 'svelte-sonner';

  // The CSV-export affordance for the Données tab. Unlike the two PDF menus, its
  // timeline is handed down rather than fetched on open: the parent already holds
  // the resolved scans, so it dedups by talent and keeps the most recent
  // confirmation instant. The per-window counts here therefore equal the talents
  // the CSV will carry, with no second query. `lastExportAt` is this admin's
  // high-water mark (StaffProfile.sfExportedAt).
  let {
    timeline,
    lastExportAt,
  }: {
    timeline: { confirmedAt: string }[];
    lastExportAt: string | null;
  } = $props();

  const exportBase = resolve('/staff/admin/sf-conflicts/export');

  const items = $derived(
    timeline.map((t) => ({ at: new Date(t.confirmedAt).getTime() })),
  );
  const exportWindow = createExportWindow(() => items);
  const sinceRange = $derived(exportWindow.sinceRange(lastExportAt));
  const sinceCount = $derived(
    sinceRange ? exportWindow.countIn(sinceRange) : 0,
  );
  const selectedCount = $derived(
    exportWindow.countIn(exportWindow.selectedRange),
  );

  function onDownload() {
    toast.info('Génération du CSV, le téléchargement va démarrer…');
  }
</script>

<Popover.Root>
  <Popover.Trigger class={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}>
    <Download class="h-4 w-4" />
    Exporter CSV
    <ChevronDown class="h-4 w-4 opacity-70" />
  </Popover.Trigger>
  <Popover.Content align="end" class="w-96 space-y-4 p-4">
    <p
      class="font-mono text-[0.7rem] tracking-wider text-muted-foreground uppercase"
    >
      Export Salesforce
    </p>

    <ExportSinceCard
      {lastExportAt}
      count={sinceCount}
      href={sinceRange
        ? exportHref(exportBase, sinceRange, { advance: true })
        : exportBase}
      nothingNewLabel="Aucun nouveau talent confirmé depuis."
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
        class={cn(buttonVariants({ variant: 'default' }), 'w-full gap-2')}
      >
        <Download class="h-4 w-4" />
        Exporter le CSV ({selectedCount} talent{selectedCount > 1 ? 's' : ''})
      </a>
    {:else}
      <div
        class={cn(
          buttonVariants({ variant: 'default' }),
          'pointer-events-none w-full gap-2 opacity-50',
        )}
      >
        <Download class="h-4 w-4" />
        {exportWindow.customInvalid
          ? 'Période invalide'
          : 'Aucun talent sur la période'}
      </div>
    {/if}

    <p class="text-[0.7rem] leading-snug text-muted-foreground">
      Une ligne par champ à transmettre (contacts parents, centres d'intérêt) ou
      à arbitrer. La fenêtre filtre sur la date de confirmation du talent ; «
      Tout » exporte l'intégralité.
    </p>
  </Popover.Content>
</Popover.Root>
