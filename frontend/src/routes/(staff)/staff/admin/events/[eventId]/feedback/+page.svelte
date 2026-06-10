<script lang="ts">
  import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
  import SegmentedFilter from '$lib/components/staff/SegmentedFilter.svelte';

  let { data } = $props();

  let activeForm = $state('w1');

  const formOptions = [
    { value: 'w1', label: 'Semaine 1' },
    { value: 'w2', label: 'Semaine 2' },
  ];

  let currentForm = $derived(data.forms.find((f) => f.formId === activeForm));
  let submissionCount = $derived(currentForm?.submissionCount ?? 0);
  let pctResponse = $derived(
    data.participantCount > 0
      ? Math.round((submissionCount / data.participantCount) * 100)
      : 0,
  );
</script>

<div class="space-y-6">
  <AdminPageHeader title="Feedback" subtitle={data.event.titre} />

  <div class="flex flex-wrap items-center justify-between gap-4">
    <SegmentedFilter
      options={formOptions}
      value={activeForm}
      onChange={(v) => (activeForm = v)}
      ariaLabel="Formulaire de feedback"
    />

    <p class="text-sm text-muted-foreground">
      <span class="font-mono font-bold text-foreground">{submissionCount}</span>
      / {data.participantCount} reponses
      <span class="text-xs">({pctResponse} %)</span>
    </p>
  </div>

  {#if currentForm}
    <div class="space-y-4">
      {#each currentForm.schema.questions as q (q.id)}
        {#if !q.identity && q.type !== 'gate'}
          {@const agg = currentForm.aggregated[q.id]}
          {#if agg}
            <section class="rounded-sm border bg-card p-4">
              <h3 class="mb-3 text-sm font-semibold">{q.prompt}</h3>

              {#if agg.distribution}
                <div class="space-y-2">
                  {#each Object.entries(agg.distribution) as [option, count] (option)}
                    {@const pct =
                      submissionCount > 0
                        ? Math.round((count / submissionCount) * 100)
                        : 0}
                    <div class="flex items-center gap-3">
                      <span class="w-48 shrink-0 truncate text-sm"
                        >{option}</span
                      >
                      <div class="flex-1">
                        <div
                          class="h-6 rounded-sm bg-slate-100 dark:bg-slate-800"
                        >
                          <div
                            class="h-full rounded-sm bg-epi-blue/80"
                            style="width: {pct}%"
                          ></div>
                        </div>
                      </div>
                      <span
                        class="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground"
                      >
                        {count} ({pct}%)
                      </span>
                    </div>
                  {/each}
                </div>
              {/if}

              {#if agg.texts}
                {#if agg.texts.length > 0}
                  <ul class="max-h-64 space-y-2 overflow-y-auto">
                    {#each agg.texts as text}
                      <li
                        class="rounded-sm border bg-muted/20 px-3 py-2 text-sm"
                      >
                        {text}
                      </li>
                    {/each}
                  </ul>
                {:else}
                  <p class="text-sm text-muted-foreground italic">
                    Aucune reponse.
                  </p>
                {/if}
              {/if}
            </section>
          {/if}
        {/if}
      {/each}
    </div>
  {/if}
</div>
