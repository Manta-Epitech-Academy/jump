<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Download from '@lucide/svelte/icons/download';
  import Funnel from '@lucide/svelte/icons/funnel';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import FormTabs from '../components/FormTabs.svelte';
  import SearchableSelect, {
    type SelectOption,
  } from '$lib/components/staff/SearchableSelect.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import * as Table from '$lib/components/ui/table';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // SearchableSelect renders the "Tous les campus" sentinel itself (its `'all'`
  // row), so the options list is just the real campuses. Campus is a long,
  // typeable list, so it gets the search box per the FilterSelect/SearchableSelect
  // convention, not a plain dropdown.
  const campusOptions: SelectOption[] = $derived(
    data.campuses.map((c) => ({ value: c.name, label: c.name })),
  );

  // The event axis: a form is reused across many events, so this is the primary
  // way to read "the Coding Club de juin" instead of every event's responses at
  // once. Each option carries its campus, date and response count; the public
  // (hors-événement) bucket joins the list only when there are public responses.
  // SearchableSelect owns the "Tous les événements" sentinel.
  const eventOptions: SelectOption[] = $derived([
    ...data.breakdown.events.map((e) => ({
      value: e.eventId,
      label: `${e.label} · ${e.campusName} · ${e.dateLabel} (${e.count})`,
    })),
    ...(data.breakdown.publicCount > 0
      ? [
          {
            value: 'public',
            label: `Réponses publiques · hors événement (${data.breakdown.publicCount})`,
          },
        ]
      : []),
  ]);

  const selectedEventLabel = $derived(
    data.selectedEvent === 'all'
      ? null
      : data.selectedEvent === 'public'
        ? 'Réponses publiques (hors événement)'
        : (data.breakdown.events.find((e) => e.eventId === data.selectedEvent)
            ?.label ?? null),
  );

  function setParam(key: string, value: string | undefined) {
    const url = new URL(page.url);
    if (value && value !== 'all') url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    goto(url.toString(), { keepFocus: true, noScroll: true });
  }

  const exportHref = $derived.by(() => {
    const p = new URLSearchParams();
    if (data.selectedCampus !== 'all') p.set('campus', data.selectedCampus);
    if (data.selectedEvent !== 'all') p.set('event', data.selectedEvent);
    const qs = p.toString();
    return `${page.url.pathname}/export${qs ? `?${qs}` : ''}`;
  });

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
    <div class="flex flex-wrap items-center gap-2">
      {#if eventOptions.length > 0}
        <SearchableSelect
          options={eventOptions}
          value={data.selectedEvent}
          onChange={(v) => setParam('event', v)}
          allLabel="Tous les événements"
          placeholder="Tous les événements"
          searchPlaceholder="Rechercher un événement…"
          emptyLabel="Aucun événement."
          triggerClass="w-full sm:w-80"
        >
          {#snippet icon()}
            <CalendarDays class="h-4 w-4 text-muted-foreground" />
          {/snippet}
        </SearchableSelect>
      {/if}
      <SearchableSelect
        options={campusOptions}
        value={data.selectedCampus}
        onChange={(v) => setParam('campus', v)}
        allLabel="Tous les campus"
        placeholder="Tous les campus"
        searchPlaceholder="Rechercher un campus…"
        emptyLabel="Aucun campus."
        triggerClass="w-full sm:w-56"
      >
        {#snippet icon()}
          <Funnel class="h-4 w-4 text-muted-foreground" />
        {/snippet}
      </SearchableSelect>
    </div>

    <a
      href={exportHref}
      download
      class="inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-medium hover:bg-accent"
    >
      <Download class="h-3.5 w-3.5" /> Exporter CSV
    </a>
  </div>

  {#if selectedEventLabel}
    <p class="-mt-2 text-sm font-semibold text-foreground">
      {selectedEventLabel}
    </p>
  {/if}

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
                    <div class="h-6 rounded-sm bg-muted">
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
              <Table.Head>Date</Table.Head>
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
                <Table.Cell class="font-mono text-xs text-muted-foreground">
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
