<script lang="ts">
  import type { FormStats } from '$lib/server/feedbackStats';

  let {
    respondedCount,
    total,
    stats,
  }: {
    respondedCount: number;
    total: number;
    stats: FormStats | null;
  } = $props();

  const pct = $derived(
    total > 0 ? Math.round((respondedCount / total) * 100) : 0,
  );

  // Only choice-style questions get a bar chart; free-text answers are summarized
  // by their count (the full text lives in the admin export).
  const chartQuestions = $derived(
    (stats?.questions ?? []).filter(
      (q) => q.type !== 'text' && q.type !== 'textarea',
    ),
  );
</script>

<aside class="min-w-0 space-y-4">
  <section class="rounded-sm border bg-card p-4">
    <h2
      class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
    >
      Taux de réponse
    </h2>
    <p class="mt-2 text-3xl font-bold text-epi-blue">
      {pct}<span class="text-lg">%</span>
    </p>
    <p class="text-sm text-muted-foreground">
      <span class="font-mono font-bold text-foreground">{respondedCount}</span>
      / {total} stagiaires
    </p>
  </section>

  {#if chartQuestions.length > 0}
    <section class="space-y-4 rounded-sm border bg-card p-4">
      <h2
        class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
      >
        Réponses
      </h2>
      {#each chartQuestions as q (q.questionId)}
        {@const answered = q.answeredCount}
        <div>
          <h3 class="mb-2 text-sm font-semibold">{q.prompt}</h3>
          <div class="space-y-1.5">
            {#each q.options as opt (opt.optionId)}
              {@const optPct =
                answered > 0 ? Math.round((opt.count / answered) * 100) : 0}
              <div class="flex items-center gap-2">
                <span class="w-28 shrink-0 truncate text-xs" title={opt.label}>
                  {opt.label}
                </span>
                <div
                  class="h-4 flex-1 rounded-sm bg-slate-100 dark:bg-slate-800"
                >
                  <div
                    class="h-full rounded-sm bg-epi-blue/80"
                    style="width: {optPct}%"
                  ></div>
                </div>
                <span
                  class="w-12 shrink-0 text-right font-mono text-[11px] text-muted-foreground"
                >
                  {opt.count}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </section>
  {/if}
</aside>
