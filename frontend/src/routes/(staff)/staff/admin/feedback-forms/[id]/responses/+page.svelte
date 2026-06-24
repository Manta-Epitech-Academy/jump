<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Download from '@lucide/svelte/icons/download';
  import FormTabs from '../components/FormTabs.svelte';
  import FilterSelect from '$lib/components/staff/FilterSelect.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import * as Table from '$lib/components/ui/table';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const campusFilterOptions = $derived([
    { value: 'all', label: 'Tous les campus' },
    ...data.campuses.map((c) => ({ value: c.name, label: c.name })),
  ]);

  function onCampusChange(value: string | undefined) {
    const url = new URL(page.url);
    if (value && value !== 'all') url.searchParams.set('campus', value);
    else url.searchParams.delete('campus');
    goto(url.toString(), { keepFocus: true, noScroll: true });
  }

  const exportHref = $derived(
    data.selectedCampus === 'all'
      ? `${page.url.pathname}/export`
      : `${page.url.pathname}/export?campus=${encodeURIComponent(data.selectedCampus)}`,
  );

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
</script>

<svelte:head><title>Réponses · {data.form.title}</title></svelte:head>

<div class="space-y-6 pb-16">
  <a
    href={resolve('/staff/admin/feedback-forms')}
    class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
  >
    <ArrowLeft class="h-4 w-4" /> Tous les formulaires
  </a>

  <FormTabs formId={data.form.id} />

  <div class="flex flex-wrap items-center justify-between gap-4">
    <FilterSelect
      options={campusFilterOptions}
      value={data.selectedCampus}
      onChange={onCampusChange}
      ariaLabel="Filtrer par campus"
      triggerClass="text-xs"
    />

    <a
      href={exportHref}
      download
      class="inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-medium hover:bg-accent"
    >
      <Download class="h-3.5 w-3.5" /> Exporter CSV
    </a>
  </div>

  {#await data.results}
    <ResultsSkeleton rail={false} />
  {:then { stats, publicRespondents }}
    {@const total = stats.totalSubmissions}
    {@const chartQuestions = stats.questions.filter(
      (q) => q.type !== 'text' && q.type !== 'textarea',
    )}
    {@const textQuestions = stats.questions.filter(
      (q) => q.type === 'text' || q.type === 'textarea',
    )}

    <p class="text-sm text-muted-foreground">
      <span class="font-mono font-bold text-foreground">{total}</span>
      réponses
      <span class="text-xs"
        >({stats.authSubmissions} authentifiées · {stats.publicSubmissions} publiques)</span
      >
    </p>

    {#if total === 0}
      <div
        class="rounded-sm border border-dashed bg-muted/10 p-16 text-center text-sm text-muted-foreground"
      >
        Aucune réponse pour ce filtre.
      </div>
    {:else}
      <div class="space-y-4">
        {#each chartQuestions as q (q.questionId)}
          <section class="rounded-sm border bg-card p-4">
            <h3 class="mb-3 text-sm font-semibold">{q.prompt}</h3>
            <div class="space-y-2">
              {#each q.options as opt (opt.optionId)}
                {@const pct =
                  q.answeredCount > 0
                    ? Math.round((opt.count / q.answeredCount) * 100)
                    : 0}
                <div class="flex items-center gap-3">
                  <span class="w-48 shrink-0 truncate text-sm">{opt.label}</span
                  >
                  <div class="flex-1">
                    <div class="h-6 rounded-sm bg-slate-100 dark:bg-slate-800">
                      <div
                        class="h-full rounded-sm bg-epi-blue/80"
                        style="width: {pct}%"
                      ></div>
                    </div>
                  </div>
                  <span
                    class="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground"
                  >
                    {opt.count} ({pct}%)
                  </span>
                </div>
              {/each}
            </div>
          </section>
        {/each}

        {#each textQuestions as q (q.questionId)}
          <section class="rounded-sm border bg-card p-4">
            <h3 class="mb-3 text-sm font-semibold">{q.prompt}</h3>
            {#if q.freeTexts.length > 0}
              <ul class="max-h-64 space-y-2 overflow-y-auto">
                {#each q.freeTexts as text, i (i)}
                  <li class="rounded-sm border bg-muted/20 px-3 py-2 text-sm">
                    {text}
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="text-sm text-muted-foreground italic">
                Aucune réponse.
              </p>
            {/if}
          </section>
        {/each}
      </div>
    {/if}

    {#if publicRespondents.length > 0}
      <section class="space-y-3 rounded-sm border bg-card p-4">
        <div>
          <h2 class="text-sm font-semibold">Réponses publiques</h2>
          <p class="text-xs text-muted-foreground">
            Stagiaires sans compte Jump (campus non onboardés). À rattacher plus
            tard à un talent par e-mail.
          </p>
        </div>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>E-mail</Table.Head>
              <Table.Head>Prénom</Table.Head>
              <Table.Head>Nom</Table.Head>
              <Table.Head>Campus déclaré</Table.Head>
              <Table.Head class="text-right">Le</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each publicRespondents as r (r.id)}
              <Table.Row>
                <Table.Cell class="font-mono text-xs"
                  >{r.email ?? '—'}</Table.Cell
                >
                <Table.Cell>{r.firstName ?? '—'}</Table.Cell>
                <Table.Cell>{r.lastName ?? '—'}</Table.Cell>
                <Table.Cell class="text-muted-foreground"
                  >{r.campusLabel ?? '—'}</Table.Cell
                >
                <Table.Cell class="text-right font-mono text-xs">
                  {dateFmt.format(new Date(r.submittedAt))}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </section>
    {/if}
  {/await}
</div>
