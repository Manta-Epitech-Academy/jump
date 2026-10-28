<script lang="ts">
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import X from '@lucide/svelte/icons/x';
  import Check from '@lucide/svelte/icons/check';
  import Minus from '@lucide/svelte/icons/minus';
  import Clock from '@lucide/svelte/icons/clock';
  import Unplug from '@lucide/svelte/icons/unplug';
  import Download from '@lucide/svelte/icons/download';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Table from '$lib/components/ui/table';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import { setListParams } from '$lib/components/staff/datatable/urlList';
  import { createUrlSearch } from '$lib/components/staff/datatable/urlSearch.svelte';
  import EmptyCohortNotice from '$lib/components/dev/EmptyCohortNotice.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import ActiveFilterChips, {
    type ActiveFilterChip,
  } from '$lib/components/staff/ActiveFilterChips.svelte';
  import type { ColumnDef } from '$lib/components/staff/datatable/types';
  import {
    statusBadgeClass,
    type StatusTone,
  } from '$lib/components/staff/statusBadge';
  import { talentFicheHref } from '$lib/components/dev/talentFiche';
  import { niveauLabel } from '$lib/domain/niveau';
  import { cohortNounForms } from '$lib/domain/event';
  import { XP_EXPLAINER_FR } from '$lib/domain/xp';
  import {
    civiliteLabel,
    civiliteShortTitle,
    formatGivenName,
  } from '$lib/domain/profile';
  import { parcoursLabel } from '$lib/domain/enrolmentHistory';
  import {
    INSCRITS_SORT_DEFAULT_DIR,
    inscritsClearedFacetParams,
    inscritsFacetParams,
    inscritsSortParams,
    parseInscritsView,
    type InscritsFacet,
    type InscritsSortKey,
  } from '$lib/domain/inscritsView';
  import {
    RULES_STATUS_LABELS,
    NO_DOSSIER_HINT,
    INSCRIT_STATUS_LABELS,
    type RulesStatus,
    type InscritStatus,
  } from '$lib/domain/dossierCompliance';
  import {
    IMAGE_RIGHTS_DISPLAY_LABELS,
    imageRightsDisplayStatus,
    type ImageRightsDisplayStatus,
  } from '$lib/domain/imageRights';

  import {
    compareRows,
    matchesFacets,
    rosterFacets,
    type InscritInterest,
    type InscritRow,
    type InscritsCohort,
    type RosterFacet,
  } from '$lib/domain/inscritsRoster';
  import {
    buildHaystack,
    matchesAllTokens,
    searchTokens,
  } from '$lib/components/staff/datatable/search';
  import {
    nextSort,
    rowComparator,
  } from '$lib/components/staff/datatable/sort';

  // The streamed cohort payload plus the cheap shell values the table needs.
  // The view it shows (filters, sort, search) is not held here: it is read off
  // the address (`$lib/domain/inscritsView`) and every control writes there, so
  // a reload, a shared link and the Back button all show the same list.
  let {
    rows,
    event,
    showStatutColumn = true,
  }: InscritsCohort & {
    event: {
      id: string;
      titre: string;
      externalId: string | null;
      cohortNoun: string | null;
    };
    // Inscrits sub-option: campuses that don't onboard (e.g. Paris) hide the
    // dossier/statut funnel column so it isn't dead noise. Gates only this column
    // (header, filter, cells) - the talent fiche is untouched.
    showStatutColumn?: boolean;
  } = $props();

  // What this event calls a cohort member ("stagiaire" / "participant"), from the
  // event's Jump-owned config. Single source for every label below.
  const noun = $derived(cohortNounForms(event.cohortNoun));

  // Status tints for the dossier tooltip. The tooltip surface is bg-foreground,
  // which inverts with the theme: dark in light mode (the bright tints pop) but
  // light (#c9c9c9) in dark mode, where those same bright tints wash out to
  // ~1.2:1. So each bright tint is paired with a darker -900 shade applied via
  // `dark:`, uniform across all four states so they clear WCAG AA (4.5:1) on the
  // light dark-mode surface: teal 5.72, amber 5.48, orange 5.66, red 6.05. The
  // status is also carried by an icon + label, so color is reinforcement only.
  const rulesTone = (s: RulesStatus) =>
    s === 'signed'
      ? 'text-epi-tech'
      : s === 'awaiting_parent'
        ? 'text-warning'
        : 'text-destructive';
  const imageTone = (s: ImageRightsDisplayStatus) =>
    s === 'accepted'
      ? 'text-epi-tech'
      : s === 'refused'
        ? 'text-epi-together-ink'
        : s === 'awaiting_parent'
          ? 'text-warning'
          : 'text-destructive';

  // Statut badge presentation, one entry per funnel state. Danger = never
  // logged in (the most urgent case), warning = connected but dossier in
  // progress, success = connected with both gates done. `no_dossier` reads
  // « - » in the table (a collégien is not a row anyone chases) and neutral on
  // a card.
  const INSCRIT_STATUS_BADGE: Record<
    InscritStatus,
    { icon: typeof Check; tone: StatusTone }
  > = {
    no_dossier: { icon: Minus, tone: 'neutral' },
    never_connected: { icon: Unplug, tone: 'danger' },
    in_progress: { icon: Clock, tone: 'warning' },
    ready: { icon: Check, tone: 'success' },
  };

  const view = $derived(parseInscritsView(page.url.searchParams));
  const search = createUrlSearch();

  const facets = $derived(
    rosterFacets(rows, { showStatut: showStatutColumn }, view),
  );
  const facetOf = $derived(
    new Map<InscritsFacet, RosterFacet>(facets.map((f) => [f.facet, f])),
  );

  function setFacet(facet: InscritsFacet, values: string[]) {
    setListParams(inscritsFacetParams(facet, values));
  }

  // The header filter of a facet, or none when the event does not offer it or
  // when it has a single value to offer.
  function filterOf(facet: InscritsFacet): ColumnDef['filter'] {
    const f = facetOf.get(facet);
    return f && f.options.length > 0
      ? {
          options: f.options,
          selected: f.selected,
          onChange: (values) => setFacet(facet, values),
        }
      : undefined;
  }

  // The table holds the mockup's columns and, like the mockup, gives each one
  // control: the names and XP sort, every other column filters from its
  // header. It fits the content track (a roster that scrolls sideways loses
  // the reading of a row); below `xl` the track is too narrow for these
  // columns, so the rows fold into cards there (`cardsBelow`). Fixed layout:
  // the widths below are the budget, and Lycée (`w-full`) takes what is left.
  const columns = $derived.by<ColumnDef[]>(() => {
    const sortable = (key: InscritsSortKey) => ({
      key,
      sortable: true,
      defaultSortDir: INSCRITS_SORT_DEFAULT_DIR[key],
    });
    const filtered = (facet: InscritsFacet, label: string, width: string) => ({
      key: facet,
      label,
      class: width,
      filter: filterOf(facet),
    });
    const cols: ColumnDef[] = [
      filtered('genre', 'Genre', 'w-20'),
      { ...sortable('prenom'), label: 'Prénom', class: 'w-24' },
      { ...sortable('nom'), label: 'Nom', class: 'w-28' },
      // XP right after the name: it's the engagement signal we want the eye to
      // catch first, shown as a coloured pill (not flush grey data).
      { ...sortable('xp'), label: 'XP', class: 'w-20' },
      filtered('parcours', 'Parcours', 'w-32'),
      filtered('tech', 'Tech', 'w-40'),
      filtered('lycee', 'Lycée', 'w-full'),
      filtered('niveau', 'Niveau', 'w-28'),
    ];
    if (facetOf.has('statut')) cols.push(filtered('statut', 'Statut', 'w-28'));
    return cols;
  });

  function toggleSort(key: string) {
    const next = nextSort<InscritsSortKey>(
      columns,
      { key: view.sort, dir: view.dir },
      key,
    );
    setListParams(inscritsSortParams(next.key, next.dir));
  }

  const chips = $derived<ActiveFilterChip[]>(
    facets.flatMap((f) =>
      f.selected.map((value) => ({
        id: `${f.facet}:${value}`,
        facet: f.title,
        label: f.options.find((o) => o.value === value)?.label ?? value,
        onRemove: () =>
          setFacet(
            f.facet,
            f.selected.filter((v) => v !== value),
          ),
      })),
    ),
  );

  // Clears the filters and the search, keeps the sort: what is cleared is what
  // narrowed the list, not how it is ordered.
  function resetFilters() {
    search.clear();
    setListParams({ ...inscritsClearedFacetParams(), q: '' });
  }

  function makeHaystack(r: InscritRow): string {
    return buildHaystack([
      r.nom,
      r.prenom,
      niveauLabel(r.niveau),
      r.schoolName,
      r.email,
    ]);
  }

  const filtered = $derived.by(() => {
    const tokens = searchTokens(search.value);
    const out = rows.filter(
      (r) =>
        matchesFacets(r, facets) && matchesAllTokens(makeHaystack(r), tokens),
    );
    out.sort(
      rowComparator({
        compare: (a, b) => compareRows(a, b, view.sort),
        dir: view.dir,
      }),
    );
    return out;
  });

  const anyFiltersApplied = $derived(
    chips.length > 0 || search.value.trim().length > 0,
  );

  let exporting = $state(false);

  // Export exactly the rows the dev is looking at (current filters + sort): POST
  // their talent ids in display order to the export endpoint, which builds the
  // XLSX server-side, then download the returned file.
  async function exportXlsx() {
    if (exporting || filtered.length === 0) return;
    exporting = true;
    try {
      const res = await fetch(`${page.url.pathname}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ talentIds: filtered.map((r) => r.talentId) }),
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Inscrits - ${event.titre}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('export xlsx', e);
      toast.error("L'export n'a pas pu être généré. Réessayez.");
    } finally {
      exporting = false;
    }
  }
</script>

<!-- Statut badge tooltip: the three triage signals at a glance (did the student
     connect, do they still owe a règlement, a droit-à-l'image), so staff can
     triage the cohort without opening each fiche: the fiche stays the place for
     the full history and next actions. -->
{#snippet statusBreakdown(r: InscritRow)}
  {#if r.status === 'no_dossier'}
    <!-- A collégien owes none of the three documents below, so listing them
         with a red cross each would read as a dossier to chase. The single line
         is the whole answer, and it carries the reason the chip's label leaves
         out. -->
    <p>{NO_DOSSIER_HINT}</p>
  {:else}
    {@const RulesIcon = r.rulesStatus === 'signed' ? Check : Clock}
    {@const imageDisplay = imageRightsDisplayStatus(
      r.imageStatus,
      r.studentSigned,
    )}
    {@const ImageIcon =
      imageDisplay === 'accepted'
        ? Check
        : imageDisplay === 'refused'
          ? X
          : Clock}
    <div class="space-y-1.5">
      <div class="flex items-center justify-between gap-6">
        <span class="text-background/70">Connexion</span>
        <span
          class={cn(
            'inline-flex items-center gap-1 font-bold',
            r.connected ? 'text-epi-tech' : 'text-destructive',
          )}
        >
          {#if r.connected}
            <Check class="h-3 w-3" />
            Connecté
          {:else}
            <X class="h-3 w-3" />
            Jamais connecté
          {/if}
        </span>
      </div>
      <div class="flex items-center justify-between gap-6">
        <span class="text-background/70">Règlement intérieur</span>
        <span
          class={cn(
            'inline-flex items-center gap-1 font-bold',
            rulesTone(r.rulesStatus),
          )}
        >
          <RulesIcon class="h-3 w-3" />
          {RULES_STATUS_LABELS[r.rulesStatus]}
        </span>
      </div>
      <div class="flex items-center justify-between gap-6">
        <span class="text-background/70">Droit à l'image</span>
        <span
          class={cn(
            'inline-flex items-center gap-1 font-bold',
            imageTone(imageDisplay),
          )}
        >
          <ImageIcon class="h-3 w-3" />
          {IMAGE_RIGHTS_DISPLAY_LABELS[imageDisplay]}
        </span>
      </div>
    </div>
  {/if}
{/snippet}

{#snippet interestChips(interests: InscritInterest[])}
  {#if interests.length === 0}
    <span class="text-sm text-muted-foreground">-</span>
  {:else}
    <span class="flex flex-wrap gap-1">
      {#each interests as interest (interest.id)}
        <!-- A tag, so a pill (`DESIGN.md`, and the mockup's Tech chips), in
             sentence case rather than the chip's capitals: an interest is a
             phrase (« Data science / analyse de données »), and in capitals
             the longer ones took three lines. -->
        <span
          class="rounded-full bg-epi-blue/5 px-2 py-0.5 epi-chip whitespace-normal text-epi-blue normal-case"
        >
          {interest.nom}
        </span>
      {/each}
    </span>
  {/if}
{/snippet}

{#snippet parcoursPill(r: InscritRow)}
  {@const label = parcoursLabel(r.priorEnrolments)}
  {#if r.priorEnrolments === 0}
    <span
      class="inline-flex rounded-full bg-epi-tech/10 px-2 py-0.5 epi-chip whitespace-nowrap text-epi-tech-ink normal-case"
    >
      {label}
    </span>
  {:else}
    <span class="text-sm whitespace-nowrap">{label}</span>
  {/if}
{/snippet}

{#if rows.length === 0}
  <EmptyCohortNotice cohortNoun={event.cohortNoun} />
{:else}
  <div class="space-y-3">
    <DataTableToolbar
      searchValue={search.value}
      onSearchInput={(v) => (search.value = v)}
      searchPlaceholder={`Rechercher un ${noun.singular}…`}
      searchWidthClass="w-full max-w-[230px]"
      count={filtered.length}
      countNoun={noun.singular}
      countNounPlural={noun.plural}
      filtersApplied={anyFiltersApplied}
    >
      {#snippet countActions()}
        <!-- Export keeps to the right edge of the count line (ml-auto), acting
             on exactly the count shown. -->
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="outline"
                  size="sm"
                  onclick={exportXlsx}
                  disabled={exporting || filtered.length === 0}
                  class="ml-auto rounded-sm"
                >
                  {#if exporting}
                    <LoaderCircle class="mr-1.5 h-4 w-4 animate-spin" />
                  {:else}
                    <Download class="mr-1.5 h-4 w-4" />
                  {/if}
                  Exporter (XLSX)
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content class="max-w-60 rounded-sm">
              {@const exportNoun =
                filtered.length > 1 ? noun.plural : noun.singular}
              <p>
                {#if anyFiltersApplied}
                  Exporte les {filtered.length}
                  {exportNoun} actuellement affichés (filtres et tri appliqués), pas
                  toute la cohorte.
                {:else}
                  Exporte toute la cohorte ({filtered.length}
                  {exportNoun}).
                {/if}
              </p>
            </Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      {/snippet}
    </DataTableToolbar>

    <ActiveFilterChips {chips} onReset={resetFilters} />

    <!-- One provider for the whole table: it only carries the hover-delay
         config, so the per-row badge tooltips share a single instance rather
         than spinning up one provider per cohort row (~200 at full stage). -->
    <Tooltip.Provider delayDuration={150}>
      <SortableTable
        onResetFilters={anyFiltersApplied ? resetFilters : undefined}
        {columns}
        rows={filtered}
        sortKey={view.sort}
        sortDir={view.dir}
        onSort={toggleSort}
        rowKey={(r) => r.id}
        rowHref={(r) => talentFicheHref(r.talentId, event.id)}
        rowLabel={(r) => `Voir la fiche de ${r.prenom} ${r.nom}`}
        stickyHeader
        layout="fixed"
        cardsBelow="xl"
      >
        {#snippet row(r: InscritRow)}
          <!-- « Mme » / « M. », the word for `autre`, which has no courtesy
               title, and « - » when the talent left it blank, as every empty
               cell reads: the two filter values never look alike. -->
          <Table.Cell class="text-sm text-muted-foreground">
            {civiliteShortTitle(r.civilite) || civiliteLabel(r.civilite) || '-'}
          </Table.Cell>
          <!-- prénom/nom truncate within their fixed columns: realistic names
               fit, but a freak-long one ellipsizes inside its cell (full value
               on hover) instead of bleeding into the neighbouring column. -->
          <Table.Cell class="font-medium">
            {@const prenom = formatGivenName(r.prenom)}
            <span class="block truncate" title={prenom}>{prenom}</span>
          </Table.Cell>
          <Table.Cell class="font-bold uppercase">
            <span class="block truncate" title={r.nom}>{r.nom}</span>
          </Table.Cell>
          <Table.Cell>
            <!-- XP as a coloured pill right beside the name: the engagement
                 signal reads at a glance, not as flush grey data. Still the
                 row-link anchor (relative z-10) with the hover explainer like
                 the status badge; click opens the fiche, tabindex=-1 keeps one
                 tab stop. Rides the table-level Tooltip.Provider. -->
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={talentFicheHref(r.talentId, event.id)}
                    tabindex={-1}
                    class="relative z-10 inline-flex items-center gap-1 rounded-full bg-epi-tech-ink/10 px-2 py-0.5 text-xs font-bold text-epi-tech-ink"
                  >
                    <Sparkles class="h-3 w-3" />
                    {r.xp}
                  </a>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content class="max-w-60">
                <p class="text-xs">{XP_EXPLAINER_FR}</p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Table.Cell>
          <Table.Cell>{@render parcoursPill(r)}</Table.Cell>
          <Table.Cell class="whitespace-normal">
            {@render interestChips(r.techInterests)}
          </Table.Cell>
          <Table.Cell class="text-sm whitespace-normal">
            {#if r.schoolName}
              <!-- Some school names run very long (e.g. "Section d'enseignement
                 général et technologique du Lycée agricole …"). Lycée takes
                 the width the fixed columns leave, so a name may take a second
                 line before it is cut; full name on hover. -->
              <span class="line-clamp-2" title={r.schoolName}>
                {r.schoolName}
              </span>
            {:else}
              <span class="text-muted-foreground">-</span>
            {/if}
          </Table.Cell>
          <Table.Cell>
            {#if r.niveau}
              <Badge
                variant="secondary"
                class="rounded-sm bg-epi-blue/5 px-2 py-0 epi-chip text-epi-blue"
              >
                {niveauLabel(r.niveau)}
              </Badge>
            {:else}
              <span class="text-sm text-muted-foreground">-</span>
            {/if}
          </Table.Cell>
          {#if facetOf.has('statut')}
            <Table.Cell>
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    {@const badge = INSCRIT_STATUS_BADGE[r.status]}
                    {@const BadgeIcon = badge.icon}
                    <!-- The badge IS the row link: relative z-10 lifts it above
                         the stretched-link overlay so it both fires the tooltip
                         on hover and navigates to the fiche on click (cmd/middle
                         click included). tabindex=-1 keeps a single tab stop per
                         row - the overlay link already covers keyboard nav. -->
                    <!-- A talent with no dossier owes nothing, so the cell
                         reads « - » like any empty one, and the tooltip says
                         why. The chip's label was also the one that did not
                         fit the column. -->
                    {#if r.status === 'no_dossier'}
                      <a
                        {...props}
                        href={talentFicheHref(r.talentId, event.id)}
                        tabindex={-1}
                        aria-label={INSCRIT_STATUS_LABELS[r.status]}
                        class="relative z-10 text-sm text-muted-foreground"
                      >
                        -
                      </a>
                    {:else}
                      <a
                        {...props}
                        href={talentFicheHref(r.talentId, event.id)}
                        tabindex={-1}
                        class={cn(
                          'relative z-10',
                          statusBadgeClass(badge.tone),
                        )}
                      >
                        <BadgeIcon class="h-3 w-3" />
                        {INSCRIT_STATUS_LABELS[r.status]}
                      </a>
                    {/if}
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content class="max-w-64">
                  {@render statusBreakdown(r)}
                </Tooltip.Content>
              </Tooltip.Root>
            </Table.Cell>
          {/if}
        {/snippet}

        <!-- Card (below xl): the roster's columns can't fit there, so the
             row folds to the name with XP and the status badge top-right, then
             the parcours, lycée and niveau beneath. Its filters open from the
             table's "Filtrer" drawer. The whole card links to the fiche via
             SortableTable's `rowHref`, so the badge stays a plain span here. -->
        {#snippet mobileRow(r: InscritRow)}
          {@const prenom = formatGivenName(r.prenom)}
          {@const badge = INSCRIT_STATUS_BADGE[r.status]}
          {@const BadgeIcon = badge.icon}
          <div class="min-w-0 space-y-1">
            <div class="flex items-start justify-between gap-2">
              <p class="min-w-0 truncate text-sm">
                <span class="font-medium">{prenom}</span>
                <span class="font-bold uppercase">{r.nom}</span>
              </p>
              <div class="flex shrink-0 items-center gap-1.5">
                <span
                  class="inline-flex items-center gap-1 rounded-full bg-epi-tech-ink/10 px-2 py-0.5 text-xs font-bold text-epi-tech-ink"
                >
                  <Sparkles class="h-3 w-3" />
                  {r.xp}
                </span>
                {#if facetOf.has('statut')}
                  <span class={statusBadgeClass(badge.tone)}>
                    <BadgeIcon class="h-3 w-3" />
                    {INSCRIT_STATUS_LABELS[r.status]}
                  </span>
                {/if}
              </div>
            </div>
            <div>{@render parcoursPill(r)}</div>
            <div class="flex items-center gap-2">
              <span
                class="min-w-0 flex-1 truncate text-xs text-muted-foreground"
              >
                {r.schoolName || '-'}
              </span>
              {#if r.niveau}
                <Badge
                  variant="secondary"
                  class="shrink-0 rounded-sm bg-epi-blue/5 px-2 py-0 epi-chip text-epi-blue"
                >
                  {niveauLabel(r.niveau)}
                </Badge>
              {/if}
            </div>
          </div>
        {/snippet}
      </SortableTable>
    </Tooltip.Provider>
  </div>
{/if}
