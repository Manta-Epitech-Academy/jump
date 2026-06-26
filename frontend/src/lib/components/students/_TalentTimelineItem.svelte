<script lang="ts">
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import Clock from '@lucide/svelte/icons/clock';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import * as Avatar from '$lib/components/ui/avatar';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import { formatDateFr, cn } from '$lib/utils';
  import {
    VERDICT_VALUES,
    VERDICT_LABELS,
    VERDICT_EMOJIS,
    CONTEXT_TAG_LABELS,
    CONTEXT_TAG_EMOJIS,
    tallyVerdicts,
  } from '$lib/domain/verdict';
  import type {
    ParticipationVerdict,
    ParticipationContextTag,
  } from '@prisma/client';

  /**
   * One row of a talent timeline, restyled to the Epitech charte: mono `< />`
   * overlines for dates, Anton uppercase for the event title, square chips
   * (no pill rounding) coloured with the four brand-vector tokens, themes
   * surfaced as `/`-separated keyword lists.
   *
   * The caller draws the vertical rail via a `before:` pseudo on the wrapping
   * element; this component owns the dot + panel pair.
   */
  type Props = {
    p: any;
    timezone: string;
    /**
     * `'alternating'` — used by `StudentTimeline` (cards zig-zag left/right
     * on md+, dot centered on a single midline).
     * `'linear'` — used by `GroupedTalentTimeline` (dot on the left rail,
     * panel to the right at every breakpoint).
     */
    layout?: 'alternating' | 'linear';
    /** Visually dim the row (used for the future group). */
    dim?: boolean;
  };

  let { p, timezone, layout = 'alternating', dim = false }: Props = $props();

  const eventDate = $derived(new Date(p.event?.date ?? ''));
  const now = $derived(new Date());
  const isUpcoming = $derived(eventDate > now);
  const isPresent = $derived(p.isPresent);
  const isLate = $derived(isPresent && (p.delay || 0) > 0);

  const VERDICT_PILL_CLASS: Record<ParticipationVerdict, string> = {
    comfortable:
      'border border-epi-teal-solid/40 bg-epi-teal-solid/10 text-epi-teal-solid',
    progressing: 'border border-epi-blue/40 bg-epi-blue/10 text-epi-blue',
    struggling: 'border border-epi-orange/40 bg-epi-orange/10 text-epi-orange',
  };

  const VERDICT_HISTOGRAM_TEXT_CLASS: Record<ParticipationVerdict, string> = {
    comfortable: 'text-epi-teal-solid',
    progressing: 'text-epi-blue',
    struggling: 'text-epi-orange',
  };
</script>

<div
  class={cn(
    'group is-active relative flex items-start',
    layout === 'alternating'
      ? 'justify-between md:justify-normal md:odd:flex-row-reverse'
      : 'justify-normal',
    dim && 'opacity-70',
  )}
>
  <!-- Connector dot — kept circular (avatars are the only circles in the DS;
       the timeline node reads as a "current position" pin, not a card). -->
  <div
    class={cn(
      'z-10 mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-background',
      layout === 'alternating' &&
        'md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2',
      isPresent
        ? isLate
          ? 'bg-epi-orange/20 text-epi-orange'
          : 'bg-epi-teal-solid text-white'
        : isUpcoming
          ? 'bg-epi-pink/15 text-epi-pink'
          : 'bg-muted text-muted-foreground',
    )}
  >
    {#if isPresent}{#if isLate}<Clock class="h-5 w-5" />{:else}<CircleCheck
          class="h-5 w-5"
        />{/if}{:else if isUpcoming}<CalendarClock
        class="h-5 w-5"
      />{:else}<CircleX class="h-5 w-5" />{/if}
  </div>

  <article
    class={cn(
      'rounded-sm border bg-card transition-colors hover:bg-muted/20',
      layout === 'alternating'
        ? 'w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)]'
        : 'ml-4 flex-1',
    )}
  >
    <header class="space-y-2 px-4 pt-4 pb-3">
      <div class="flex items-center justify-between gap-2">
        <p
          class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          <span class="opacity-60">&lt;</span>
          {formatDateFr(p.event?.date, timezone)}
          <span class="opacity-60">/&gt;</span>
        </p>
        {#if p.event?.mantas && p.event.mantas.length > 0}
          <div class="flex justify-end -space-x-2">
            {#each p.event.mantas as manta}
              {@const staff = manta.staffProfile}
              <Tooltip.Provider delayDuration={0}>
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    <Avatar.Root
                      class="relative h-6 w-6 border-2 border-card hover:z-10"
                    >
                      <Avatar.Image
                        src={staff?.user?.image ?? undefined}
                        alt={staff?.user?.name ?? ''}
                      />
                      <Avatar.Fallback
                        class="bg-muted text-[8px] font-bold text-foreground"
                        >{(staff?.user?.name || 'ST')
                          .substring(0, 2)
                          .toUpperCase()}</Avatar.Fallback
                      >
                    </Avatar.Root>
                  </Tooltip.Trigger>
                  <Tooltip.Content><p>{staff?.user?.name}</p></Tooltip.Content>
                </Tooltip.Root>
              </Tooltip.Provider>
            {/each}
          </div>
        {/if}
      </div>

      <h3 class="font-heading text-lg leading-tight tracking-wide uppercase">
        {p.event?.titre ?? 'Événement inconnu'}
      </h3>

      <div
        class="flex flex-wrap items-center gap-1.5 font-mono text-[10px] font-bold tracking-widest uppercase"
      >
        {#if isPresent && !isLate}
          <span
            class="inline-flex items-center gap-1 rounded-sm border border-epi-teal-solid/40 bg-epi-teal-solid/10 px-1.5 py-0.5 text-epi-teal-solid"
          >
            &lt; Présent /&gt;
          </span>
        {:else if isPresent && isLate}
          <span
            class="inline-flex items-center gap-1 rounded-sm border border-epi-orange/40 bg-epi-orange/10 px-1.5 py-0.5 text-epi-orange"
          >
            &lt; Présent /&gt;
          </span>
          <span
            class="inline-flex items-center gap-1 rounded-sm border border-epi-orange/40 bg-epi-orange/10 px-1.5 py-0.5 text-epi-orange"
          >
            +{p.delay >= 60 ? '60+' : p.delay} min
          </span>
        {:else if isUpcoming}
          <span
            class="inline-flex items-center gap-1 rounded-sm border border-epi-pink/40 bg-epi-pink/10 px-1.5 py-0.5 text-epi-pink"
          >
            &lt; Inscrit /&gt;
          </span>
        {:else}
          <span
            class="inline-flex items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-destructive"
          >
            &lt; Absent /&gt;
          </span>
        {/if}
      </div>
    </header>

    {#if p.activities && p.activities.length > 0}
      {@const displayActivities = p.activities.filter(
        (pa: any) =>
          pa.activity.activityType !== 'orga' || pa.verdict || pa.contextTag,
      )}
      {@const histogram = tallyVerdicts(
        displayActivities.map((pa: any) => pa.verdict),
      )}
      {@const verdictTotal =
        histogram.comfortable + histogram.progressing + histogram.struggling}

      {#if displayActivities.length > 0}
        <div class="border-t bg-muted/20 px-4 py-3">
          {#if verdictTotal > 1}
            <p
              class="mb-2.5 flex flex-wrap items-center gap-2 font-mono text-[10px] font-bold tracking-widest uppercase"
            >
              <span class="text-muted-foreground">Verdict /</span>
              {#each VERDICT_VALUES as v (v)}
                {#if histogram[v] > 0}
                  <span class={VERDICT_HISTOGRAM_TEXT_CLASS[v]}>
                    {VERDICT_EMOJIS[v]} ×{histogram[v]}
                  </span>
                {/if}
              {/each}
            </p>
          {/if}

          <ul class="space-y-1.5">
            {#each displayActivities as pa}
              {@const activity = pa.activity}
              <li class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span class="text-sm font-medium text-foreground">
                  {#if activity.link}
                    <a
                      href={activity.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 transition-colors hover:text-epi-blue hover:underline"
                    >
                      {activity.nom}
                      <ExternalLink class="h-3 w-3 opacity-60" />
                    </a>
                  {:else}
                    {activity.nom}
                  {/if}
                </span>

                {#if activity.activityThemes && activity.activityThemes.length > 0}
                  <span
                    class="font-mono text-[10px] font-bold tracking-widest text-epi-teal-solid uppercase"
                  >
                    {#each activity.activityThemes as at, i (at.theme.id ?? i)}{i >
                      0
                        ? ' '
                        : ''}{at.theme.nom}/{/each}
                  </span>
                {/if}

                {#if pa.verdict}
                  {@const v = pa.verdict as ParticipationVerdict}
                  <span
                    class={cn(
                      'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase',
                      VERDICT_PILL_CLASS[v],
                    )}
                  >
                    <span aria-hidden="true">{VERDICT_EMOJIS[v]}</span>
                    {VERDICT_LABELS[v]}
                  </span>
                {/if}

                {#if pa.contextTag}
                  {@const t = pa.contextTag as ParticipationContextTag}
                  <span
                    class="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                  >
                    <span aria-hidden="true">{CONTEXT_TAG_EMOJIS[t]}</span>
                    {CONTEXT_TAG_LABELS[t]}
                  </span>
                {/if}

                {#if pa.verdictAuthor}
                  <Tooltip.Provider delayDuration={300}>
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        <Avatar.Root
                          class="h-4 w-4 border border-border shadow-xs"
                        >
                          {#if pa.verdictAuthor.avatar}<Avatar.Image
                              src={''}
                              alt={pa.verdictAuthor.user?.name}
                            />{/if}
                          <Avatar.Fallback
                            class="bg-muted text-[8px] font-bold text-muted-foreground"
                            >{(pa.verdictAuthor.user?.name || 'ST')
                              .substring(0, 2)
                              .toUpperCase()}</Avatar.Fallback
                          >
                        </Avatar.Root>
                      </Tooltip.Trigger>
                      <Tooltip.Content
                        ><p>{pa.verdictAuthor.user?.name}</p></Tooltip.Content
                      >
                    </Tooltip.Root>
                  </Tooltip.Provider>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    {/if}

    {#if p.camperRating}
      <footer class="border-t px-4 py-3">
        <p
          class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          &lt; Ressenti /&gt;
          <span
            class={cn(
              'ml-2',
              p.camperRating === 1
                ? 'text-destructive'
                : p.camperRating === 2
                  ? 'text-epi-blue'
                  : 'text-epi-teal-solid',
            )}
          >
            {#if p.camperRating === 1}
              🤯 Difficile
            {:else if p.camperRating === 2}
              💪 Moyen
            {:else}
              🚀 Facile
            {/if}
          </span>
        </p>
        {#if p.camperFeedback}
          <blockquote
            class="mt-2 border-l-2 border-epi-teal-solid/40 pl-3 text-sm text-foreground/80 italic"
          >
            « {p.camperFeedback} »
          </blockquote>
        {/if}
      </footer>
    {/if}
  </article>
</div>
