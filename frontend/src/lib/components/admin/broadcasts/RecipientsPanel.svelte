<script lang="ts">
  import {
    RECIPIENT_ROLE_LABELS,
    RECIPIENT_EXCLUSION_REASON_LABELS,
    type IncludedRecipient,
    type ExcludedRecipient,
  } from '$lib/domain/broadcasts';
  import { buttonVariants } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import * as Collapsible from '$lib/components/ui/collapsible';
  import Users from '@lucide/svelte/icons/users';
  import Search from '@lucide/svelte/icons/search';
  import Download from '@lucide/svelte/icons/download';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { cn } from '$lib/utils';
  import { formatPhoneForDisplay } from '$lib/domain/phone';

  type Props = {
    total: number;
    included: IncludedRecipient[];
    excluded: ExcludedRecipient[];
    loading?: boolean;
    error?: string | null;
    /** Targeting not complete enough to resolve a roster yet. */
    incomplete?: boolean;
    csvHref: string;
  };

  let {
    total,
    included,
    excluded,
    loading = false,
    error = null,
    incomplete = false,
    csvHref,
  }: Props = $props();

  let q = $state('');
  let showExcluded = $state(false);

  const filtered = $derived.by(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return included;
    return included.filter((r) =>
      `${r.prenom} ${r.nom} ${r.email ?? ''} ${r.phone ?? ''}`
        .toLowerCase()
        .includes(needle),
    );
  });

  // The whole roster stays client-side so the search box is instant, but a
  // campus-wide audience (no event picked) can be the entire cumulative campus
  // population (thousands of rows), and the ScrollArea isn't virtualized. So we
  // paint at most MAX_VISIBLE_ROWS and point past that to the search box / CSV,
  // which stays exhaustive. Same bound the /staff/admin/talents list applies.
  const MAX_VISIBLE_ROWS = 100;

  const visibleIncluded = $derived(filtered.slice(0, MAX_VISIBLE_ROWS));
  const hiddenIncluded = $derived(filtered.length - visibleIncluded.length);

  const visibleExcluded = $derived(excluded.slice(0, MAX_VISIBLE_ROWS));
  const hiddenExcluded = $derived(excluded.length - visibleExcluded.length);
</script>

<div class="rounded-sm border bg-card p-4">
  <div class="mb-2 flex items-center justify-between">
    <h3 class="flex items-center gap-1.5 epi-overline text-muted-foreground">
      <Users class="h-3.5 w-3.5" /> Destinataires
    </h3>
    {#if loading}
      <span class="text-xs text-muted-foreground">…</span>
    {/if}
  </div>

  {#if error}
    <p class="text-xs text-destructive">Erreur : {error}</p>
  {:else if incomplete}
    <p class="text-xs text-muted-foreground">
      Choisis un campus et une audience pour voir la liste exacte des
      destinataires.
    </p>
  {:else}
    <div class="flex items-end justify-between gap-2">
      <div>
        <p class="font-heading text-display-xl text-epi-blue">
          {total}
        </p>
        <p class="mt-1 text-xs text-muted-foreground">
          recevront ce message{#if excluded.length > 0}
            · <span class="text-epi-together"
              >{excluded.length} exclu{excluded.length > 1 ? 's' : ''}</span
            >{/if}
        </p>
      </div>
      <a
        href={csvHref}
        download
        class={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'shrink-0',
        )}
      >
        <Download class="mr-1 h-3.5 w-3.5" /> CSV
      </a>
    </div>

    {#if total > 0}
      <div class="relative mt-3">
        <Search
          class="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          bind:value={q}
          placeholder="Filtrer la liste…"
          class="h-8 pl-8 text-sm"
        />
      </div>

      <ScrollArea class="mt-2 h-64 rounded-sm border bg-muted/10">
        {#if filtered.length === 0}
          <div
            class="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground"
          >
            Aucun destinataire ne correspond à « {q} ».
          </div>
        {:else}
          <ul class="divide-y divide-border">
            {#each visibleIncluded as r, i (`${r.email ?? r.phone ?? ''}-${r.prenom}-${r.nom}-${i}`)}
              <li class="flex items-center justify-between gap-2 px-3 py-1.5">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">
                    {r.prenom}
                    {r.nom}
                  </p>
                  <p class="truncate text-xs text-muted-foreground">
                    {r.email ?? formatPhoneForDisplay(r.phone) ?? '-'}
                  </p>
                </div>
                <span
                  class="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 epi-chip text-muted-foreground"
                >
                  {RECIPIENT_ROLE_LABELS[r.role]}
                </span>
              </li>
            {/each}
          </ul>
          {#if hiddenIncluded > 0}
            <p class="px-3 py-2 text-center text-xs text-muted-foreground">
              + {hiddenIncluded} autre{hiddenIncluded > 1 ? 's' : ''} masqué{hiddenIncluded >
              1
                ? 's'
                : ''}. Affine la recherche ou exporte le CSV pour la liste
              complète.
            </p>
          {/if}
        {/if}
      </ScrollArea>
    {:else}
      <p
        class="mt-3 rounded-sm border border-dashed p-4 text-center text-xs text-muted-foreground"
      >
        Aucun destinataire pour cette cible.
      </p>
    {/if}

    {#if excluded.length > 0}
      <Collapsible.Root
        open={showExcluded}
        onOpenChange={(o) => (showExcluded = o)}
        class="mt-2 rounded-sm border border-epi-together/30"
      >
        <Collapsible.Trigger
          class="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-xs font-medium text-epi-together hover:bg-epi-together/5"
        >
          <span
            >{excluded.length} exclu{excluded.length > 1 ? 's' : ''} (non contactable{excluded.length >
            1
              ? 's'
              : ''})</span
          >
          <ChevronDown
            class={cn(
              'h-4 w-4 transition-transform',
              showExcluded && 'rotate-180',
            )}
          />
        </Collapsible.Trigger>
        <Collapsible.Content>
          <ul class="divide-y divide-border border-t text-xs">
            {#each visibleExcluded as e, i (`${e.prenom}-${e.nom}-${e.reason}-${i}`)}
              <li class="flex items-center justify-between gap-2 px-3 py-1.5">
                <span class="truncate">{e.prenom} {e.nom}</span>
                <span class="shrink-0 text-muted-foreground"
                  >{RECIPIENT_EXCLUSION_REASON_LABELS[e.reason]}</span
                >
              </li>
            {/each}
          </ul>
          {#if hiddenExcluded > 0}
            <p
              class="border-t px-3 py-2 text-center text-xs text-muted-foreground"
            >
              + {hiddenExcluded} autre{hiddenExcluded > 1 ? 's' : ''}. Voir le
              CSV pour la liste complète.
            </p>
          {/if}
        </Collapsible.Content>
      </Collapsible.Root>
    {/if}

    <p class="mt-2 text-xs text-muted-foreground">
      Le CSV contient la liste complète et exacte de ce qui partira.
    </p>
  {/if}
</div>
