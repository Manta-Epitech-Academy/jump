<script lang="ts">
  import { page } from '$app/state';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import FilterSelect from '$lib/components/staff/FilterSelect.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import SubjectCard from '$lib/components/workshops/SubjectCard.svelte';
  import { countNounForm } from '$lib/components/staff/datatable/countLabel';
  import { setListParams } from '$lib/components/staff/datatable/urlList';
  import {
    catalogueDomainOptions,
    subjectsInDomain,
  } from '$lib/domain/workshopCatalogue';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Underscored, which `CATALOGUE_KEY_PATTERN` refuses: a domain key is
  // authored, so a plain `all` could one day name a real domain.
  const ALL = '_all';
  const DOMAIN_PARAM = 'domaine';

  const domains = $derived(catalogueDomainOptions(data.subjects));
  // A domain the URL names but no shown subject carries reads as no filter,
  // rather than as an empty page nothing on screen explains.
  const domain = $derived(
    domains.find(
      (option) => option.key === page.url.searchParams.get(DOMAIN_PARAM),
    ) ?? null,
  );
  const shown = $derived(subjectsInDomain(data.subjects, domain?.key ?? null));

  const filterOptions = $derived([
    { value: ALL, label: 'Tous les domaines', count: data.subjects.length },
    ...domains.map((option) => ({
      value: option.key,
      label: option.label,
      count: option.count,
    })),
  ]);

  const countLine = $derived(
    `${shown.length} ${countNounForm(shown.length, 'sujet')}${domain ? ` · ${domain.label}` : ''}`,
  );

  // In the URL, so a filtered catalogue is a link a colleague can open.
  function pickDomain(value: string) {
    setListParams({ [DOMAIN_PARAM]: value === ALL ? '' : value });
  }
</script>

<svelte:head>
  <title>Catalogue</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <PageHeader
    title="Catalogue"
    subtitle={data.subjects.length > 0 ? countLine : undefined}
  >
    {#snippet actions()}
      {#if domains.length > 0}
        <FilterSelect
          options={filterOptions}
          value={domain?.key ?? ALL}
          onChange={pickDomain}
          ariaLabel="Filtrer par domaine"
        />
      {/if}
    {/snippet}
  </PageHeader>

  {#if data.subjects.length === 0}
    <ResultsNotice
      icon={LayoutGrid}
      title="Aucun sujet au catalogue pour l'instant"
      description="Un sujet y apparaît dès que son accroche, son niveau, ses domaines et un visuel sont renseignés."
    />
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {#each shown as subject (subject.slug)}
        <SubjectCard {subject} />
      {/each}
    </div>
  {/if}
</div>
