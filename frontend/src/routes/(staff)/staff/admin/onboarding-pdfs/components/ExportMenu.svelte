<script lang="ts" module>
  type DocType = 'image-rights' | 'rules';
</script>

<script lang="ts">
  import Archive from '@lucide/svelte/icons/archive';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ImageIcon from '@lucide/svelte/icons/image';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import ScrollText from '@lucide/svelte/icons/scroll-text';
  import type { Icon as IconType } from '@lucide/svelte';
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

  let { lastExportAt }: { lastExportAt: string | null } = $props();

  // The completion timeline is fetched lazily when the popover opens rather than
  // passed down from the page load: it's a full talent-table scan and that load
  // re-runs every 5s (live job feed), so keeping it off the load avoids the scan
  // on every tick. Refetched on each open so the per-period counts and the
  // "depuis le dernier export" delta stay fresh without a standing query.
  let timeline = $state<{ at: number; type: DocType }[]>([]);
  // First successful fetch flips this; the popover body shows a spinner until
  // then, then keeps the last data on subsequent re-opens while it refetches.
  let loaded = $state(false);

  const exportBase = resolve('/staff/admin/onboarding-pdfs/export');
  const timelineHref = resolve('/staff/admin/onboarding-pdfs/export-timeline');

  async function loadTimeline() {
    try {
      const res = await fetch(timelineHref);
      if (!res.ok) throw new Error(`timeline ${res.status}`);
      const data: { timeline: { at: string; type: DocType }[] } =
        await res.json();
      timeline = data.timeline.map((d) => ({
        at: new Date(d.at).getTime(),
        type: d.type,
      }));
      loaded = true;
    } catch (err) {
      console.error('[onboarding-pdfs] timeline fetch failed', err);
      toast.error("Impossible de charger l'historique des exports.");
    }
  }

  const exportWindow = createExportWindow(() => timeline);
  const sinceRange = $derived(exportWindow.sinceRange(lastExportAt));
  const sinceCount = $derived(
    sinceRange ? exportWindow.countIn(sinceRange) : 0,
  );

  const rows: { type: DocType | null; label: string; Icon: typeof IconType }[] =
    [
      { type: null, label: 'Tout télécharger', Icon: Archive },
      { type: 'image-rights', label: "Droits à l'image", Icon: ImageIcon },
      { type: 'rules', label: 'Règlements co-signés', Icon: ScrollText },
    ];

  // Native `download` anchors keep the streamed response (the browser shows its
  // own progress). The toast acknowledges the click, since the server spends a
  // beat fetching the PDFs from storage before bytes flow. Advancing the mark is
  // the server's job (driven by `advance` in the href), applied once the archive
  // is assembled, not once the browser has the bytes: a streamed download can't
  // be delivery-confirmed. Cancelling before assembly won't advance the mark,
  // cancelling after may; that's fine because it's a convenience filter, with
  // the all-time export as the authoritative fallback. The page's poll then
  // refreshes the "depuis le dernier export" delta.
  function onDownload() {
    toast.info("Préparation de l'archive, le téléchargement va démarrer…");
  }
</script>

{#snippet downloadRow(
  label: string,
  count: number,
  href: string,
  Icon: typeof IconType,
  disabled: boolean,
)}
  {#if count > 0 && !disabled}
    <a
      {href}
      download
      onclick={() => onDownload()}
      class="flex items-center justify-between gap-6 rounded-sm px-2 py-2 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
    >
      <span class="flex items-center gap-2">
        <Icon class="h-4 w-4 text-epi-blue" />
        {label}
      </span>
      <span class="font-mono text-xs text-muted-foreground">
        {count}
      </span>
    </a>
  {:else}
    <div
      class="flex cursor-not-allowed items-center justify-between gap-6 rounded-sm px-2 py-2 text-sm text-muted-foreground/50"
    >
      <span class="flex items-center gap-2">
        <Icon class="h-4 w-4" />
        {label}
      </span>
      <span class="font-mono text-xs">{disabled ? '—' : 0}</span>
    </div>
  {/if}
{/snippet}

<Popover.Root onOpenChange={(open) => open && loadTimeline()}>
  <Popover.Trigger class={cn(buttonVariants({ variant: 'default' }), 'gap-2')}>
    <Archive class="h-4 w-4" />
    Télécharger les PDF signés
    <ChevronDown class="h-4 w-4 opacity-70" />
  </Popover.Trigger>
  <Popover.Content align="end" class="w-96 space-y-4 p-4">
    <p
      class="font-mono text-[0.7rem] tracking-wider text-muted-foreground uppercase"
    >
      Documents signés
    </p>

    {#if !loaded}
      <div
        class="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
      >
        <LoaderCircle class="h-4 w-4 animate-spin" />
        Chargement de l'historique…
      </div>
    {:else}
      <ExportSinceCard
        {lastExportAt}
        count={sinceCount}
        href={sinceRange
          ? exportHref(exportBase, sinceRange, { advance: true })
          : exportBase}
        nothingNewLabel="Aucun nouveau document depuis."
        {onDownload}
      />

      <ExportWindowPicker {exportWindow} />

      <div class="space-y-0.5">
        {#each rows as row (row.type)}
          {@render downloadRow(
            row.label,
            exportWindow.countIn(exportWindow.selectedRange, row.type),
            exportHref(exportBase, exportWindow.selectedRange, {
              type: row.type,
              advance: row.type === null && exportWindow.period === 'all',
            }),
            row.Icon,
            exportWindow.customInvalid,
          )}
        {/each}
      </div>

      <p class="text-[0.7rem] leading-snug text-muted-foreground">
        Archive ZIP, un dossier par type. Les PDF déjà générés sont rassemblés,
        rien n'est régénéré.
      </p>
    {/if}
  </Popover.Content>
</Popover.Root>
