<script lang="ts">
  import Archive from '@lucide/svelte/icons/archive';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Download from '@lucide/svelte/icons/download';
  import History from '@lucide/svelte/icons/history';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { resolve } from '$app/paths';
  import { buttonVariants } from '$lib/components/ui/button';
  import * as Popover from '$lib/components/ui/popover';
  import SegmentedFilter from '$lib/components/staff/SegmentedFilter.svelte';
  import { cn, formatDateTimeFr } from '$lib/utils';
  import { toast } from 'svelte-sonner';

  let { lastExportAt }: { lastExportAt: string | null } = $props();

  // The conducted-at timeline is fetched lazily when the popover opens rather
  // than passed down from the page load: it's an unbounded scan of every done
  // closing, needed only to count PDFs per period, so keeping it off the load
  // lets the page chrome paint without it. Refetched on each open so the counts
  // and the "depuis le dernier export" delta stay fresh.
  let timeline = $state<string[]>([]);
  // First successful fetch flips this; the popover body shows a spinner until
  // then, then keeps the last data on subsequent re-opens while it refetches.
  let loaded = $state(false);

  const exportBase = resolve('/staff/admin/closing-pdfs/export');
  const timelineHref = resolve('/staff/admin/closing-pdfs/export-timeline');
  const DAY = 86_400_000;

  async function loadTimeline() {
    try {
      const res = await fetch(timelineHref);
      if (!res.ok) throw new Error(`timeline ${res.status}`);
      const data: { timeline: string[] } = await res.json();
      timeline = data.timeline;
      loaded = true;
    } catch (err) {
      console.error('[closing-pdfs] timeline fetch failed', err);
      toast.error("Impossible de charger l'historique des exports.");
    }
  }

  const items = $derived(timeline.map((iso) => new Date(iso).getTime()));

  const now = $derived.by(() => {
    void items;
    return Date.now();
  });

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

  const sinceMark = $derived(
    lastExportAt ? new Date(lastExportAt).getTime() : null,
  );
  const sinceRange = $derived<Range>({ from: sinceMark, to: null });
  const sinceCount = $derived(sinceMark === null ? 0 : countIn(sinceRange));

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
    toast.info('Génération des PDF en cours, le téléchargement va démarrer...');
  }

  function sinceLabel(iso: string): string {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
    if (h < 1) return "il y a moins d'une heure";
    if (h < 24) return `il y a ${h} h`;
    return `il y a ${Math.floor(h / 24)} j`;
  }
</script>

<Popover.Root onOpenChange={(open) => open && loadTimeline()}>
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

    {#if !loaded}
      <div
        class="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
      >
        <LoaderCircle class="h-4 w-4 animate-spin" />
        Chargement de l'historique...
      </div>
    {:else}
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
              Télécharger les nouveaux ({sinceCount})
            </a>
          {:else}
            <p class="text-xs text-muted-foreground">
              Aucun nouveau closing depuis.
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

      {@const count = countIn(selectedRange)}
      {#if count > 0 && !customInvalid}
        <a
          href={exportHref(selectedRange, period === 'all')}
          download
          onclick={() => onDownload()}
          class="flex items-center justify-between gap-6 rounded-sm px-2 py-2 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
        >
          <span class="flex items-center gap-2">
            <Archive class="h-4 w-4 text-epi-blue" />
            Télécharger
          </span>
          <span class="font-mono text-xs text-muted-foreground">
            {count} PDF
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
            {customInvalid ? '-' : '0'}
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
