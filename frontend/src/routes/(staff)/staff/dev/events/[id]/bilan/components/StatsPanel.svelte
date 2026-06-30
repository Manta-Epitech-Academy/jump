<script lang="ts">
  import { RECO_QUESTION_KEY, RECO_VERDICT_LABEL } from '$lib/domain/feedback';
  import { cohortNounForms } from '$lib/domain/event';
  import type { FormStats } from '$lib/server/feedbackStats';

  let {
    respondedCount,
    total,
    stats,
    cohortNoun,
  }: {
    respondedCount: number;
    total: number;
    stats: FormStats | null;
    cohortNoun: string;
  } = $props();

  // Event's Jump-owned cohort noun ("stagiaire" / "participant").
  const noun = $derived(cohortNounForms(cohortNoun));

  const pct = $derived(
    total > 0 ? Math.round((respondedCount / total) * 100) : 0,
  );

  // Only the recommendation question is charted here: it is the single most
  // important answer ("à quel point l'event leur a plu"). Every other answer is
  // reachable from the XLSX export; surfacing them all turned the rail into a
  // wall of bars that buried the one number staff actually scan for.
  const recoStat = $derived(
    stats?.questions.find((q) => q.key === RECO_QUESTION_KEY) ?? null,
  );
</script>

<div class="min-w-0 space-y-4">
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
        / {total}
        {noun.plural}
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

  {#if recoStat}
    {@const answered = recoStat.answeredCount}
    <section class="rounded-sm border bg-card p-4">
      <!-- The question is the card title outright: a separate "Recommandation"
           eyebrow just restated it. Static, staff-facing wording single-sourced in
           domain/feedback, not the question's own talent-phrased prompt, so the
           verdict reads the same across every form. -->
      <h2 class="mb-3 text-sm font-semibold">{RECO_VERDICT_LABEL}</h2>
      <!-- Single question in a narrow (30%) rail: stack each label above its
           full-width bar so the label keeps the whole column instead of being
           chopped beside the bar. -->
      <div class="space-y-2">
        {#each recoStat.options as opt (opt.optionId)}
          {@const optPct =
            answered > 0 ? Math.round((opt.count / answered) * 100) : 0}
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
    </section>
  {/if}
</div>
