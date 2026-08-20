<script lang="ts" module>
  export type BreakdownRow = {
    id: string;
    label: string;
    emoji?: string | null;
    count: number;
  };
  /** Singular/plural pair for the "Autres" tail summary. */
  export type TailNoun = { item: [string, string]; category: [string, string] };
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import X from '@lucide/svelte/icons/x';
  import * as Card from '$lib/components/ui/card';
  import { cn } from '$lib/utils';

  // One ranked-bar card shared by the event dashboard and the Inscrits sidebar,
  // so the two surfaces can never drift on how a cohort breakdown looks. The
  // `interaction` prop is the only behavioural fork:
  //   • 'navigate' (dashboard) — each row is a link to the filtered Inscrits
  //     page, so the trailing chevron reads as "go there". This is the default.
  //   • 'filter'   (Inscrits)  — rows toggle an in-page facet. No chevron (it
  //     would imply leaving), the active row flips to a clear (×) affordance,
  //     and a header hint spells out that clicking filters the list in place.
  // Domain specifics (icon, title, row labels, tail nouns) live in the thin
  // LyceesBreakdown / InterestsCloud adapters; only layout + interaction here.
  type Props = {
    title: string;
    icon: Snippet;
    /** Visible head of the ranking (already capped by the caller). */
    rows: BreakdownRow[];
    /**
     * Rows past the cap. When present (filter surfaces), the "Autres" summary
     * becomes an expander revealing them, so every facet stays reachable even
     * without a separate dropdown. Omit on read-only surfaces.
     */
    tailRows?: BreakdownRow[];
    /** Pre-summarised tail for surfaces that don't pass `tailRows`. */
    others?: { count: number; categories: number } | null;
    tailNoun: TailNoun;
    /** Cohort size — denominator for each proportion bar. */
    totalParticipations: number;
    activeId?: string;
    /**
     * 'navigate' (dashboard) — rows link to the filtered Inscrits page, trailing
     * chevron. 'filter' (Inscrits sidebar, when this card *is* the filter) — rows
     * toggle an in-page facet. 'readonly' — plain non-clickable rows, for when
     * the facet is filtered elsewhere (e.g. a toolbar dropdown) or not at all.
     */
    interaction?: 'navigate' | 'filter' | 'readonly';
    /** Required for the clickable modes; ignored when 'readonly'. */
    hrefFor?: (id: string) => string;
    /** Filter mode only — href that drops the active facet (active row link). */
    clearHref?: string;
    emptyText: string;
  };

  let {
    title,
    icon,
    rows,
    tailRows,
    others = null,
    tailNoun,
    totalParticipations,
    activeId,
    interaction = 'navigate',
    hrefFor,
    clearHref,
    emptyText,
  }: Props = $props();

  const isFilter = $derived(interaction === 'filter');
  const isInteractive = $derived(interaction !== 'readonly');
  const noun = (n: number, pair: [string, string]) =>
    n > 1 ? pair[1] : pair[0];
  const pctOf = (count: number) =>
    totalParticipations ? Math.round((count / totalParticipations) * 100) : 0;

  // Tail is summarised from the rows themselves so the expander never depends on
  // a separately-passed count drifting out of sync.
  const tailSummary = $derived(
    tailRows && tailRows.length > 0
      ? {
          count: tailRows.reduce((sum, r) => sum + r.count, 0),
          categories: tailRows.length,
        }
      : null,
  );
  // If the active facet lives in the tail, keep the tail open so its row (and
  // its clear affordance) stay on screen — collapsing would hide the filter.
  const activeInTail = $derived(
    !!activeId && (tailRows ?? []).some((r) => r.id === activeId),
  );
  let expanded = $state(false);
  const showTail = $derived(expanded || activeInTail);
</script>

{#snippet rowInner(r: BreakdownRow, pct: number, active: boolean)}
  <div class="flex items-baseline justify-between gap-3 text-sm">
    <span class="flex min-w-0 items-baseline gap-2">
      {#if r.emoji}
        <span aria-hidden="true" class="shrink-0 text-base leading-none"
          >{r.emoji}</span
        >
      {/if}
      <span
        class={cn(
          'truncate font-medium',
          // The link affordance (dotted underline + hover tint) only makes
          // sense on the clickable modes — a readonly row is just a label.
          isInteractive &&
            'underline decoration-muted-foreground/40 decoration-dotted underline-offset-4 group-hover:text-epi-blue group-hover:decoration-epi-blue',
        )}>{r.label}</span
      >
    </span>
    <span
      class="flex shrink-0 items-center gap-1 font-mono text-xs font-bold text-muted-foreground"
    >
      {r.count} · {pct}%
      {#if interaction === 'navigate'}
        <ChevronRight
          class="h-3.5 w-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-epi-blue"
        />
      {:else if interaction === 'filter' && active}
        <X class="h-3.5 w-3.5 text-epi-blue" />
      {/if}
    </span>
  </div>
  <div
    class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted dark:bg-muted/30"
  >
    <div
      class="h-full bg-epi-blue transition-[width] duration-700 ease-out"
      style="width: {pct}%"
    ></div>
  </div>
{/snippet}

{#snippet rowLink(r: BreakdownRow)}
  {@const pct = pctOf(r.count)}
  {@const active = r.id === activeId}
  {#if isInteractive}
    <a
      href={isFilter && active && clearHref ? clearHref : hrefFor?.(r.id)}
      title={isFilter && active
        ? 'Retirer le filtre'
        : `Filtrer · ${r.count} ${noun(r.count, tailNoun.item)}`}
      aria-current={active ? 'true' : undefined}
      class={cn(
        'group block rounded-sm px-3 py-2 transition-colors hover:bg-epi-blue/5',
        active && 'bg-epi-blue/10 ring-1 ring-epi-blue/30',
      )}
    >
      {@render rowInner(r, pct, active)}
    </a>
  {:else}
    <div class="block rounded-sm px-3 py-2">
      {@render rowInner(r, pct, active)}
    </div>
  {/if}
{/snippet}

<Card.Root class="rounded-sm shadow-sm dark:shadow-none">
  <div
    class="flex flex-row items-center gap-2 border-b bg-muted/30 px-6 pt-4 pb-3"
  >
    {@render icon()}
    <h3 class="font-heading text-display-m text-foreground">
      {title}
    </h3>
  </div>
  <Card.Content class="space-y-1 p-2">
    {#if rows.length === 0}
      <p class="py-6 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    {:else}
      {#if isFilter}
        <p class="px-2 pt-1 pb-2 epi-overline text-muted-foreground">
          Cliquer pour filtrer les inscrits
        </p>
      {/if}

      {#each rows as r (r.id)}
        {@render rowLink(r)}
      {/each}

      {#if isInteractive && tailRows && tailRows.length > 0 && tailSummary}
        {#if showTail}
          {#each tailRows as r (r.id)}
            {@render rowLink(r)}
          {/each}
          {#if !activeInTail}
            <button
              type="button"
              onclick={() => (expanded = false)}
              class="flex w-full cursor-pointer items-center justify-center gap-1 rounded-sm border-t border-dashed border-border/60 px-3 py-2 epi-overline text-muted-foreground transition-colors hover:bg-epi-blue/5 hover:text-epi-blue"
            >
              <ChevronUp class="h-3.5 w-3.5" />
              Réduire
            </button>
          {/if}
        {:else}
          <button
            type="button"
            onclick={() => (expanded = true)}
            class="block w-full cursor-pointer rounded-sm border-t border-dashed border-border/60 px-3 py-2 text-left text-sm transition-colors hover:bg-epi-blue/5"
          >
            <div
              class="flex items-baseline justify-between gap-3 text-muted-foreground"
            >
              <span class="italic">Autres</span>
              <span
                class="flex shrink-0 items-center gap-1 font-mono text-xs font-bold"
              >
                {tailSummary.count}
                {noun(tailSummary.count, tailNoun.item)} ·
                {tailSummary.categories}
                {noun(tailSummary.categories, tailNoun.category)}
                <ChevronDown class="h-3.5 w-3.5" />
              </span>
            </div>
          </button>
        {/if}
      {:else if isInteractive && others}
        <div
          class="block rounded-sm border-t border-dashed border-border/60 px-3 py-2 text-sm"
        >
          <div
            class="flex items-baseline justify-between gap-3 text-muted-foreground"
          >
            <span class="italic">Autres</span>
            <span
              class="flex shrink-0 items-center gap-1 font-mono text-xs font-bold"
            >
              {others.count}
              {noun(others.count, tailNoun.item)} ·
              {others.categories}
              {noun(others.categories, tailNoun.category)}
            </span>
          </div>
        </div>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
