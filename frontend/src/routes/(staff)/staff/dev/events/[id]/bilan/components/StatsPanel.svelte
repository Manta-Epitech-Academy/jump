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

<aside class="@container min-w-0 space-y-4">
  <section class="rounded-sm border bg-card p-4">
    <div class="flex items-baseline justify-between gap-2">
      <h2
        class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
      >
        Taux de réponse
      </h2>
      <p class="text-sm text-muted-foreground">
        <span class="font-mono font-bold text-foreground">{respondedCount}</span
        >
        / {total} stagiaires
      </p>
    </div>
    <p class="mt-2 text-3xl font-bold text-epi-blue">
      {pct}<span class="text-lg">%</span>
    </p>
    <!-- Progress bar so the hero stat fills the (now wider) card instead of a lone
         number leaving the strip looking empty. -->
    <div
      class="mt-2 h-2 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-800"
    >
      <div class="h-full rounded-sm bg-epi-blue/80" style="width: {pct}%"></div>
    </div>
  </section>

  {#if chartQuestions.length > 0}
    <section class="rounded-sm border bg-card p-4">
      <h2
        class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
      >
        Réponses
      </h2>
      <!-- Tile the breakdowns into balanced columns once the panel itself is wide
           enough (container query, not viewport): on this page the panel is ~half
           the screen, where a single column read as one very long strip. CSS
           multi-column balances variable-height blocks better than a 2-col grid;
           break-inside-avoid keeps a question whole across the column boundary. -->
      <div class="mt-4 gap-x-8 @xl:columns-2">
        {#each chartQuestions as q (q.questionId)}
          {@const answered = q.answeredCount}
          <div class="mb-5 break-inside-avoid">
            <h3 class="mb-2 text-sm font-semibold">{q.prompt}</h3>
            <div class="space-y-2">
              {#each q.options as opt (opt.optionId)}
                {@const optPct =
                  answered > 0 ? Math.round((opt.count / answered) * 100) : 0}
                <!-- Label sits on its own line above a full-width bar: in a half-width
                     column, label-beside-bar squeezed the label to ~96px and chopped
                     most of them. Stacked, the label gets the whole column. -->
                <div class="space-y-1">
                  <div class="flex items-baseline justify-between gap-2">
                    <span class="min-w-0 truncate text-xs" title={opt.label}>
                      {opt.label}
                    </span>
                    <span
                      class="shrink-0 font-mono text-[11px] text-muted-foreground"
                    >
                      {opt.count}{#if answered > 0}<span
                          class="text-muted-foreground/60"
                        >
                          · {optPct}%</span
                        >{/if}
                    </span>
                  </div>
                  <div
                    class="h-2 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-800"
                  >
                    <div
                      class="h-full rounded-sm bg-epi-blue/80"
                      style="width: {optPct}%"
                    ></div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</aside>
