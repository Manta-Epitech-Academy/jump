<script lang="ts">
  import { cn } from '$lib/utils';
  import {
    isActivityFinished,
    type WorkshopActivity,
  } from '$lib/domain/workshops';

  // How far a talent is on one subject, in the hero: the 2027 mockup's step
  // panel, a darker inset on the blue with one segment per step and the step
  // in mono neon. Without the step's name, which CTFd does not send (#501, out
  // of scope): only how many are validated. A subject not started shows an
  // empty bar, which is how a started one stands apart among equal choices
  // (AC2), and one whose step count CTFd has not reported yet stands on a line.
  //
  // `compact` is the same reading inside one tile among several choices,
  // where the panel and its sentences would outweigh the subject itself: the
  // bar and the figure only, or one short word when CTFd has no count yet.
  let {
    activity,
    compact = false,
  }: {
    activity: Pick<
      WorkshopActivity,
      'solvedSteps' | 'totalSteps' | 'startedAt'
    >;
    compact?: boolean;
  } = $props();

  // Beyond this many steps, a segment per step stops reading as one.
  const MAX_SEGMENTS = 12;

  const started = $derived(activity.startedAt !== null);
  const finished = $derived(isActivityFinished(activity));
  const progress = $derived(
    activity.totalSteps > 0
      ? Math.round((activity.solvedSteps / activity.totalSteps) * 100)
      : 0,
  );
  const stepLabel = $derived(
    finished
      ? 'Terminé'
      : !started
        ? 'Pas encore commencé'
        : `Étape ${Math.min(activity.solvedSteps + 1, activity.totalSteps)} / ${activity.totalSteps}`,
  );
</script>

<div class={compact ? 'flex flex-col' : 'rounded-lg bg-epi-dark/35 px-4 py-3'}>
  {#if activity.totalSteps > 0}
    <p
      class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm text-white"
    >
      <span class={compact ? 'sr-only' : 'whitespace-nowrap'}
        >Ta progression</span
      >
      <span
        class="font-mono font-bold whitespace-nowrap text-epi-tech uppercase"
      >
        {stepLabel}
      </span>
    </p>
    <div
      class="mt-2 flex h-2 gap-1"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={activity.totalSteps}
      aria-valuenow={activity.solvedSteps}
      aria-label="Étapes validées"
    >
      {#if activity.totalSteps <= MAX_SEGMENTS}
        {#each Array.from({ length: activity.totalSteps }, (_, i) => i) as step (step)}
          <span
            class={cn(
              'flex-1 rounded-full transition-ui',
              step < activity.solvedSteps ? 'bg-epi-tech' : 'bg-white/25',
            )}
          ></span>
        {/each}
      {:else}
        <span class="flex-1 overflow-hidden rounded-full bg-white/25">
          <span
            class="block h-full w-(--progress) bg-epi-tech transition-ui"
            style:--progress="{progress}%"
          ></span>
        </span>
      {/if}
    </div>
  {:else if compact}
    <p class="font-mono text-sm font-bold text-white/80 uppercase">
      {started ? 'Commencé' : 'Pas encore commencé'}
    </p>
  {:else}
    <p class="text-sm text-white/80">
      {started
        ? 'Reprends là où tu t’es arrêté.'
        : 'Avance à ton rythme : chaque étape te rapporte des XP.'}
    </p>
  {/if}
</div>
