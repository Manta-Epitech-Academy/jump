<script lang="ts">
  import Download from '@lucide/svelte/icons/download';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import History from '@lucide/svelte/icons/history';
  import { resolve } from '$app/paths';
  import { buttonVariants } from '$lib/components/ui/button';
  import * as Popover from '$lib/components/ui/popover';
  import SegmentedFilter from '$lib/components/staff/SegmentedFilter.svelte';
  import { cn, formatDateTimeFr } from '$lib/utils';
  import { toast } from 'svelte-sonner';

  // The CSV-export affordance for the Données tab, modelled on the onboarding-PDF
  // export menu. `timeline` is one confirmation instant per talent that would
  // appear in the export (the parent dedups by talent and keeps the most recent
  // instant), so the per-window counts here equal the talents the CSV will carry.
  // `lastExportAt` is this admin's high-water mark (StaffProfile.sfExportedAt).
  let {
    timeline,
    lastExportAt,
  }: {
    timeline: { confirmedAt: string }[];
    lastExportAt: string | null;
  } = $props();

  const exportBase = resolve('/staff/admin/sf-conflicts/export');
  const DAY = 86_400_000;

  // Parse the ISO instants once into sortable numbers; recomputed when a rescan
  // re-ships the timeline, which is also when the "now"-relative buckets refresh.
  const items = $derived(
    timeline.map((t) => new Date(t.confirmedAt).getTime()),
  );

  // One clock shared by every rolling-window bucket so the 7j/30j boundaries (and
  // the links built from them) stay consistent rather than each sampling its own.
  const now = $derived.by(() => {
    void items;
    return Date.now();
  });

  // Confirmation window for the download link + count. `null` bound = open-ended.
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

  function countIn(range: Range): number {
    return items.filter(
      (ms) =>
        (range.from === null || ms >= range.from) &&
        (range.to === null || ms <= range.to),
    ).length;
  }

  const periodOptions = [
    { value: '7d', label: '7 j' },
    { value: '30d', label: '30 j' },
    { value: 'all', label: 'Tout' },
    { value: 'custom', label: 'Perso' },
  ];

  // "Depuis le dernier export": talents confirmed at/after this admin's
  // high-water mark. Hidden until they have exported once.
  const sinceMark = $derived(
    lastExportAt ? new Date(lastExportAt).getTime() : null,
  );
  const sinceRange = $derived<Range>({ from: sinceMark, to: null });
  const sinceCount = $derived(sinceMark === null ? 0 : countIn(sinceRange));

  const selectedCount = $derived(countIn(selectedRange));

  // `advance` marks a download covering everything up to now (the all-time export
  // or the "since" delta). The endpoint reads it to advance this admin's
  // high-water mark once the CSV is built; scoped windows omit it, so the intent
  // rides the same request as the download with no second round-trip.
  function exportHref(range: Range, advance = false): string {
    const params = new URLSearchParams();
    if (range.from !== null)
      params.set('from', new Date(range.from).toISOString());
    if (range.to !== null) params.set('to', new Date(range.to).toISOString());
    if (advance) params.set('advance', '1');
    const qs = params.toString();
    return qs ? `${exportBase}?${qs}` : exportBase;
  }

  function onDownload() {
    toast.info('Génération du CSV, le téléchargement va démarrer…');
  }

  function sinceLabel(iso: string): string {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
    if (h < 1) return "il y a moins d'une heure";
    if (h < 24) return `il y a ${h} h`;
    return `il y a ${Math.floor(h / 24)} j`;
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
            href={exportHref(sinceRange, true)}
            download
            onclick={() => onDownload()}
            class={cn(
              buttonVariants({ variant: 'default', size: 'sm' }),
              'w-full gap-2',
            )}
          >
            <Download class="h-4 w-4" />
            Exporter les nouveaux ({sinceCount})
          </a>
        {:else}
          <p class="text-xs text-muted-foreground">
            Aucun nouveau talent confirmé depuis.
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

    {#if selectedCount > 0 && !customInvalid}
      <a
        href={exportHref(selectedRange, period === 'all')}
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
        {customInvalid ? 'Période invalide' : 'Aucun talent sur la période'}
      </div>
    {/if}

    <p class="text-[0.7rem] leading-snug text-muted-foreground">
      Une ligne par champ à transmettre (contacts parents, centres d'intérêt) ou
      à arbitrer. La fenêtre filtre sur la date de confirmation du talent ; «
      Tout » exporte l'intégralité.
    </p>
  </Popover.Content>
</Popover.Root>
