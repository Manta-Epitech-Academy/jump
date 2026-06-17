<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
  import Download from '@lucide/svelte/icons/download';
  import * as Select from '$lib/components/ui/select';

  let { data }: { data: PageData } = $props();

  let pctResponse = $derived(
    data.participantCount > 0
      ? Math.round((data.submissionCount / data.participantCount) * 100)
      : 0,
  );

  function onCampusChange(value: string | undefined) {
    const url = new URL(page.url);
    if (value && value !== 'all') {
      url.searchParams.set('campus', value);
    } else {
      url.searchParams.delete('campus');
    }
    goto(url.toString(), { keepFocus: true, noScroll: true });
  }

  let subtitle = $derived(
    data.selectedCampus === 'all'
      ? 'Stage de Seconde - tous campus confondus'
      : `Stage de Seconde - ${data.campuses.find((c: { id: string; name: string }) => c.id === data.selectedCampus)?.name ?? ''}`,
  );

  let exportHref = $derived(
    data.selectedCampus === 'all'
      ? resolve('/staff/admin/feedback/export')
      : resolve(`/staff/admin/feedback/export?campus=${data.selectedCampus}`),
  );
</script>

<svelte:head>
  <title>Feedback - Stage de Seconde</title>
</svelte:head>

<div class="space-y-6">
  <AdminPageHeader title="Feedback" {subtitle} />

  <div class="flex flex-wrap items-center justify-between gap-4">
    <Select.Root
      type="single"
      value={data.selectedCampus}
      onValueChange={onCampusChange}
    >
      <Select.Trigger class="h-9 w-56 rounded-sm text-xs">
        {data.selectedCampus === 'all'
          ? 'Tous les campus'
          : (data.campuses.find(
              (c: { id: string; name: string }) => c.id === data.selectedCampus,
            )?.name ?? '')}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="all">Tous les campus</Select.Item>
        {#each data.campuses as campus (campus.id)}
          <Select.Item value={campus.id}>{campus.name}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>

    <div class="flex items-center gap-4">
      <p class="text-sm text-muted-foreground">
        <span class="font-mono font-bold text-foreground"
          >{data.submissionCount}</span
        >
        / {data.participantCount} reponses
        <span class="text-xs">({pctResponse} %)</span>
      </p>

      <a
        href={exportHref}
        download
        class="inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-medium hover:bg-accent"
      >
        <Download class="h-3.5 w-3.5" />
        Exporter CSV
      </a>
    </div>
  </div>

  {#if data.schema}
    <div class="space-y-4">
      {#each data.schema.questions as q (q.id)}
        {#if !q.identity && q.type !== 'gate'}
          {@const agg = data.aggregated[q.id]}
          {#if agg}
            <section class="rounded-sm border bg-card p-4">
              <h3 class="mb-3 text-sm font-semibold">{q.prompt}</h3>

              {#if agg.distribution}
                <div class="space-y-2">
                  {#each Object.entries(agg.distribution) as [option, count] (option)}
                    {@const pct =
                      data.submissionCount > 0
                        ? Math.round((count / data.submissionCount) * 100)
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
