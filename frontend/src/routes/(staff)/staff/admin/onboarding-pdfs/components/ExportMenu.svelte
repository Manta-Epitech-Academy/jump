<script lang="ts" module>
  type DocType = 'image-rights' | 'rules';
  export type ExportTimelineEntry = { type: DocType; finishedAt: string };
</script>

<script lang="ts">
  import Archive from '@lucide/svelte/icons/archive';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Download from '@lucide/svelte/icons/download';
  import History from '@lucide/svelte/icons/history';
  import ImageIcon from '@lucide/svelte/icons/image';
  import ScrollText from '@lucide/svelte/icons/scroll-text';
  import type { Icon as IconType } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { buttonVariants } from '$lib/components/ui/button';
  import * as Popover from '$lib/components/ui/popover';
  import SegmentedFilter from '$lib/components/staff/SegmentedFilter.svelte';
  import { cn, formatDateTimeFr } from '$lib/utils';
  import { toast } from 'svelte-sonner';

  let {
    timeline,
    lastExportAt,
  }: {
    timeline: ExportTimelineEntry[];
    lastExportAt: string | null;
  } = $props();

  const exportBase = resolve('/staff/admin/onboarding-pdfs/export');
  const DAY = 86_400_000;

  // Parse the ISO timeline once into sortable instants. Recomputed when the
  // poll re-ships `timeline`, which is also when "now"-relative buckets refresh.
  const items = $derived(
    timeline.map((d) => ({
      type: d.type,
      ms: new Date(d.finishedAt).getTime(),
    })),
  );

  // One clock shared by every rolling-window bucket, re-read each time the poll
  // reloads `timeline` so the 7j/30j boundaries (and the links built from them)
  // stay consistent with one another rather than each sampling its own `now`.
  const now = $derived.by(() => {
    void items;
    return Date.now();
  });

  // Completion window for download links + counts. `null` bound = open-ended.
  type Range = { from: number | null; to: number | null };

  type Period = '7d' | '30d' | 'all' | 'custom';
  let period = $state<Period>('all');
  let customFrom = $state('');
  let customTo = $state('');

  const startOfDay = (ymd: string) => new Date(`${ymd}T00:00:00`).getTime();
  const endOfDay = (ymd: string) => new Date(`${ymd}T23:59:59.999`).getTime();

  function periodRange(p: Exclude<Period, 'custom'>): Range {
    if (p === '7d') return { from: now - 7 * DAY, to: null };
    if (p === '30d') return { from: now - 30 * DAY, to: null };
    return { from: null, to: null };
  }

  const customRange = $derived<Range>({
    from: customFrom ? startOfDay(customFrom) : null,
    to: customTo ? endOfDay(customTo) : null,
  });
  // A custom window is unusable until both ends are set and ordered.
  const customInvalid = $derived(
    period === 'custom' &&
      (!customFrom ||
        !customTo ||
        (customRange.from !== null &&
          customRange.to !== null &&
          customRange.from > customRange.to)),
  );

  const selectedRange = $derived<Range>(
    period === 'custom' ? customRange : periodRange(period),
  );

  function countIn(range: Range, type?: DocType): number {
    return items.filter(
      (it) =>
        (!type || it.type === type) &&
        (range.from === null || it.ms >= range.from) &&
        (range.to === null || it.ms <= range.to),
    ).length;
  }

  // Plain window labels. The selected window's per-type counts live in the
  // download rows below, so the segments stay uncluttered.
  const periodOptions = [
    { value: '7d', label: '7 j' },
    { value: '30d', label: '30 j' },
    { value: 'all', label: 'Tout' },
    { value: 'custom', label: 'Perso' },
  ];

  // "Depuis le dernier export": docs finished at/after this admin's high-water
  // mark. Hidden until they have exported once.
  const sinceMark = $derived(
    lastExportAt ? new Date(lastExportAt).getTime() : null,
  );
  const sinceRange = $derived<Range>({ from: sinceMark, to: null });
  const sinceCount = $derived(sinceMark === null ? 0 : countIn(sinceRange));

  // `advance` marks a download that covers everything up to now (the all-time
  // export or the "since" delta). The export endpoint reads it to advance this
  // admin's archival high-water mark once it has built the archive; scoped or
  // historical windows omit it. So the intent rides the same request as the
  // download, with no second round-trip.
  function exportHref(
    type: DocType | null,
    range: Range,
    advance = false,
  ): string {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (range.from !== null)
      params.set('from', new Date(range.from).toISOString());
    if (range.to !== null) params.set('to', new Date(range.to).toISOString());
    if (advance) params.set('advance', '1');
    const qs = params.toString();
    return qs ? `${exportBase}?${qs}` : exportBase;
  }

  const rows: { type: DocType | null; label: string; Icon: typeof IconType }[] =
    [
      { type: null, label: 'Tout télécharger', Icon: Archive },
      { type: 'image-rights', label: "Droits à l'image", Icon: ImageIcon },
      { type: 'rules', label: 'Règlements co-signés', Icon: ScrollText },
    ];

  // Native `download` anchors keep the streamed response (browser shows its own
  // progress). The toast acknowledges the click, since the server spends a beat
  // fetching the PDFs from storage before bytes flow. Mark advancement is the
  // server's job (driven by `advance` in the href, applied once the archive is
  // built), so a cancelled download never advances it; the page's poll then
  // refreshes the "depuis le dernier export" delta.
  function onDownload() {
    toast.info("Préparation de l'archive, le téléchargement va démarrer…");
  }

  function sinceLabel(iso: string): string {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
    if (h < 1) return "il y a moins d'une heure";
    if (h < 24) return `il y a ${h} h`;
    return `il y a ${Math.floor(h / 24)} j`;
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
      <span class="font-mono text-xs text-muted-foreground tabular-nums">
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
      <span class="font-mono text-xs tabular-nums">{disabled ? '—' : 0}</span>
    </div>
  {/if}
{/snippet}

<Popover.Root>
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

    {#if sinceMark !== null}
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
            title={formatDateTimeFr(lastExportAt!)}
          >
            Dernier export {sinceLabel(lastExportAt!)}
          </p>
        </div>
        {#if sinceCount > 0}
          <a
            href={exportHref(null, sinceRange, true)}
            download
            onclick={() => onDownload()}
            class={cn(
              buttonVariants({ variant: 'default', size: 'sm' }),
              'w-full gap-2',
            )}
          >
            <Download class="h-4 w-4" />
            Télécharger les nouveaux ({sinceCount})
          </a>
        {:else}
          <p class="text-xs text-muted-foreground">
            Aucun nouveau document depuis.
          </p>
        {/if}
      </div>
    {/if}

    <div class="space-y-2">
      <span
        class="font-mono text-[0.7rem] tracking-wider text-muted-foreground uppercase"
      >
        Période
      </span>
      <SegmentedFilter
        options={periodOptions}
        value={period}
        onChange={(v) => (period = v as Period)}
        ariaLabel="Période d'export"
        fullWidth
      />

      {#if period === 'custom'}
        <div class="flex items-end gap-2 pt-1">
          <label
            class="flex flex-1 flex-col gap-1 text-[0.7rem] tracking-wide text-muted-foreground uppercase"
          >
            Du
            <input
              type="date"
              bind:value={customFrom}
              max={customTo || undefined}
              class="h-9 w-full rounded-sm border bg-transparent px-2 text-sm normal-case"
            />
          </label>
          <label
            class="flex flex-1 flex-col gap-1 text-[0.7rem] tracking-wide text-muted-foreground uppercase"
          >
            Au
            <input
              type="date"
              bind:value={customTo}
              min={customFrom || undefined}
              class="h-9 w-full rounded-sm border bg-transparent px-2 text-sm normal-case"
            />
          </label>
        </div>
        {#if customInvalid}
          <p class="text-xs text-muted-foreground">
            Choisissez une date de début et de fin valides.
          </p>
        {/if}
      {/if}
    </div>

    <div class="space-y-0.5">
      {#each rows as row (row.type)}
        {@render downloadRow(
          row.label,
          countIn(selectedRange, row.type ?? undefined),
          exportHref(
            row.type,
            selectedRange,
            row.type === null && period === 'all',
          ),
          row.Icon,
          customInvalid,
        )}
      {/each}
    </div>

    <p class="text-[0.7rem] leading-snug text-muted-foreground">
      Archive ZIP, un dossier par type. Les PDF déjà générés sont rassemblés,
      rien n'est régénéré.
    </p>
  </Popover.Content>
</Popover.Root>
