<script lang="ts">
  import type { Snippet } from 'svelte';
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import ClipboardList from '@lucide/svelte/icons/clipboard-list';
  import CircleCheckBig from '@lucide/svelte/icons/circle-check-big';
  import Check from '@lucide/svelte/icons/check';
  import Clock from '@lucide/svelte/icons/clock';
  import * as Card from '$lib/components/ui/card';
  import { cn } from '$lib/utils';
  import type { InterviewStatus } from '@prisma/client';
  import {
    INTERVIEW_TOTAL_SECONDS,
    INTERVIEW_VERDICT_ANCHOR_ID,
    INTERVIEWER_SECTION,
    interviewBlocAnchorId,
    type InterviewProgressSummary,
  } from '$lib/domain/interview';

  // Right-rail companion to InterviewGrid in interview mode: the grille status,
  // its ★-progress, a live minuteur and a section nav, lifted out of the grid so
  // they sit next to the guide while the questions stay on the left. The optional
  // `footer` carries the lifecycle controls + save indicator (the fiche wires
  // them to the grid), so the controls live with the status they act on.
  let {
    status,
    progress,
    startedAt,
    footer,
  }: {
    status: InterviewStatus | null;
    progress: InterviewProgressSummary | undefined;
    // Anchor for the minuteur: the interview's conduct timestamp (set at
    // "Démarrer"). Null until started; the timer only runs while in_progress.
    startedAt: Date | string | null;
    footer?: Snippet;
  } = $props();

  const done = $derived(progress?.done ?? 0);
  const total = $derived(progress?.total ?? 0);
  const sections = $derived(progress?.sections ?? []);
  const verdictDone = $derived(progress?.verdictDone ?? false);
  const pct = $derived(total > 0 ? Math.round((done / total) * 100) : 0);
  const allDone = $derived(total > 0 && done >= total);

  // ── Minuteur: elapsed since "Démarrer" against the 9 min 30 question budget ──
  // Anchored to the persisted start, not a client stopwatch, so it survives a
  // reload and reflects the lifecycle (an interview left open reads as open),
  // matching the rest of the feature: a lifecycle, not a screen.
  const startMs = $derived(startedAt ? new Date(startedAt).getTime() : null);
  let nowMs = $state(0);
  $effect(() => {
    if (status !== 'in_progress' || startMs == null) {
      nowMs = 0;
      return;
    }
    nowMs = Date.now();
    const id = setInterval(() => (nowMs = Date.now()), 1000);
    return () => clearInterval(id);
  });
  const elapsed = $derived(
    status === 'in_progress' && startMs != null && nowMs > 0
      ? Math.max(0, Math.floor((nowMs - startMs) / 1000))
      : null,
  );
  const overBudget = $derived(
    elapsed != null && elapsed > INTERVIEW_TOTAL_SECONDS,
  );

  function clock(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // Scroll the left-column grid to a bloc / the verdict. Same-page, so a plain
  // anchor lookup is enough; ids are shared with the grid (domain/interview).
  function jumpTo(anchorId: string) {
    document
      .getElementById(anchorId)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const navRow =
    'group flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-xs transition-colors hover:bg-muted/60';
</script>

<Card.Root class="rounded-sm shadow-sm dark:shadow-none">
  <div
    class="flex flex-row items-center gap-2 border-b bg-muted/30 px-6 pt-4 pb-3"
  >
    <ClipboardList class="h-5 w-5 text-epi-blue" />
    <h3 class="font-heading text-2xl tracking-wide text-foreground uppercase">
      Entretien
    </h3>
  </div>

  <Card.Content class="space-y-3 p-4">
    <!-- Session row: lifecycle status + the live minuteur, the two "right now"
         signals. The clock lives here, not above the bar, so the bar can't be
         misread as a time gauge — it belongs to the ★ block below. A pacing aid,
         not a deadline: it just turns amber once past the question budget. -->
    <div class="flex items-center justify-between gap-2">
      {#if status === 'done'}
        <span
          class="inline-flex items-center gap-1 rounded-full border border-epi-teal-solid/40 bg-epi-teal-solid/10 px-2 py-0.5 text-xs font-bold tracking-wide text-epi-teal-solid uppercase"
        >
          <CircleCheckBig class="h-3 w-3" /> Finalisé
        </span>
      {:else if status === 'in_progress'}
        <span
          class="inline-flex items-center gap-1 rounded-full border border-epi-orange/40 bg-epi-orange/10 px-2 py-0.5 text-xs font-bold tracking-wide text-epi-orange uppercase"
        >
          En cours
        </span>
      {:else}
        <span
          class="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-bold tracking-wide text-muted-foreground uppercase"
        >
          À faire
        </span>
      {/if}
      {#if elapsed !== null}
        <span
          class={cn(
            'inline-flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums',
            overBudget ? 'text-epi-orange' : 'text-foreground',
          )}
          title="Temps écoulé sur le budget des questions"
        >
          <Clock class="h-3.5 w-3.5" />
          {clock(elapsed)}<span class="ml-1 font-normal text-muted-foreground"
            >/ {clock(INTERVIEW_TOTAL_SECONDS)}</span
          >
        </span>
      {/if}
    </div>

    <!-- ★-progress: label, count and bar grouped, so the bar's referent is
         unambiguous (it tracks the incontournables, never the minuteur). Hidden
         until start — the "À faire" chip carries the not-started state. -->
    {#if status !== null}
      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <span
            class="flex items-center gap-1 text-xs font-medium text-muted-foreground"
          >
            <span class="text-epi-teal-solid">★</span> Incontournables
          </span>
          <span
            class={cn(
              'inline-flex items-center gap-1 font-mono text-xs font-bold tracking-widest uppercase',
              allDone ? 'text-epi-teal-solid' : 'text-muted-foreground',
            )}
          >
            {#if allDone}
              <span
                class="inline-flex"
                in:scale={{ duration: 220, start: 0.5, easing: backOut }}
              >
                <Check class="h-3.5 w-3.5" />
              </span>
            {/if}
            {done}/{total}
          </span>
        </div>
        <div
          class="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label="Progression des questions incontournables"
        >
          <div
            class={cn(
              'transition-all',
              allDone ? 'bg-epi-teal-solid' : 'bg-epi-blue',
            )}
            style={`width:${pct}%`}
          ></div>
        </div>
      </div>
    {/if}

    <!-- Section nav: per-bloc ★-completion + jump-to, so a 6-section grid is
         navigable from the rail (and the verdict is one click away). Shown once
         started; read-only review keeps it after clôture. -->
    {#if status !== null && sections.length > 0}
      <nav
        class="space-y-0.5 border-t pt-3"
        aria-label="Aller à une section de l'entretien"
      >
        {#each sections as section, i (section.key)}
          {@const complete = section.total > 0 && section.done >= section.total}
          <button
            type="button"
            onclick={() => jumpTo(interviewBlocAnchorId(section.key))}
            class={navRow}
          >
            <span
              class="w-4 shrink-0 font-mono text-[11px] text-muted-foreground"
            >
              {i + 1}
            </span>
            <span class="flex-1 truncate text-foreground">{section.title}</span>
            {#if complete}
              <Check class="h-3.5 w-3.5 shrink-0 text-epi-teal-solid" />
            {:else}
              <span
                class="shrink-0 font-mono text-[11px] text-muted-foreground"
              >
                {section.done}/{section.total}
              </span>
            {/if}
          </button>
        {/each}
        <button
          type="button"
          onclick={() => jumpTo(INTERVIEW_VERDICT_ANCHOR_ID)}
          class={navRow}
        >
          <span
            class="w-4 shrink-0 text-center font-mono text-[11px] text-epi-teal-solid"
          >
            ★
          </span>
          <span class="flex-1 truncate text-epi-blue">
            {INTERVIEWER_SECTION.title}
          </span>
          {#if verdictDone}
            <Check class="h-3.5 w-3.5 shrink-0 text-epi-teal-solid" />
          {:else}
            <span class="shrink-0 font-mono text-[11px] text-muted-foreground">
              0/1
            </span>
          {/if}
        </button>
      </nav>
    {/if}

    {#if footer}
      <div class="space-y-2 border-t pt-3">
        {@render footer()}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
