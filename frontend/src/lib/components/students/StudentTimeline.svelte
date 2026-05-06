<script lang="ts">
  import Calendar from '@lucide/svelte/icons/calendar';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import Clock from '@lucide/svelte/icons/clock';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import MessageCircleReply from '@lucide/svelte/icons/message-circle-reply';
  import * as Card from '$lib/components/ui/card';
  import * as Avatar from '$lib/components/ui/avatar';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { formatDateFr, cn } from '$lib/utils';
  import { resolve } from '$app/paths';
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

  let {
    participations,
    timezone,
  }: { participations: any[]; timezone: string } = $props();

  const VERDICT_PILL_CLASS: Record<ParticipationVerdict, string> = {
    comfortable:
      'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-200',
    progressing:
      'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-200',
    struggling:
      'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800/50 dark:bg-orange-950/30 dark:text-orange-200',
  };

  const VERDICT_HISTOGRAM_TEXT_CLASS: Record<ParticipationVerdict, string> = {
    comfortable: 'text-emerald-700 dark:text-emerald-300',
    progressing: 'text-blue-700 dark:text-blue-300',
    struggling: 'text-orange-700 dark:text-orange-300',
  };
</script>

<div
  class="relative space-y-4 before:absolute before:inset-0 before:ml-5 before:h-full before:w-0.5 before:-translate-x-px before:bg-linear-to-b before:from-transparent before:via-slate-300 before:to-transparent md:before:mx-auto md:before:translate-x-0"
>
  {#each participations as p (p.id)}
    {@const eventDate = new Date(p.event?.date ?? '')}
    {@const now = new Date()}
    {@const isUpcoming = eventDate > now}
    {@const isPresent = p.isPresent}
    {@const isLate = isPresent && (p.delay || 0) > 0}

    <div
      class="group is-active relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse"
    >
      <div
        class={cn(
          'z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-background shadow-sm md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2',
          isPresent
            ? isLate
              ? 'bg-orange-200 text-orange-800'
              : 'bg-epi-teal-solid text-white'
            : isUpcoming
              ? 'bg-blue-100 text-epi-blue dark:bg-blue-900/30 dark:text-blue-400'
              : 'bg-gray-200 text-gray-400 dark:bg-gray-800 dark:text-gray-600',
        )}
      >
        {#if isPresent}{#if isLate}<Clock class="h-5 w-5" />{:else}<CircleCheck
              class="h-5 w-5"
            />{/if}{:else if isUpcoming}<CalendarClock
            class="h-5 w-5"
          />{:else}<CircleX class="h-5 w-5" />{/if}
      </div>

      <Card.Root
        class="w-[calc(100%-4rem)] shadow-sm transition-shadow hover:shadow-md md:w-[calc(50%-2.5rem)]"
      >
        <Card.Header class="p-4 pb-2">
          <div class="flex items-start justify-between">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <Badge
                  variant="outline"
                  class="h-5 px-1.5 text-[10px] font-normal"
                  >{formatDateFr(p.event?.date, timezone)}</Badge
                >
                {#if isPresent}
                  <Badge
                    variant="default"
                    class={cn(
                      'h-5 px-1.5 text-[10px] font-bold uppercase',
                      isLate
                        ? 'bg-orange-200 text-orange-900 hover:bg-orange-300'
                        : 'bg-epi-teal-solid text-white hover:bg-epi-teal-solid/90',
                    )}>Présent</Badge
                  >
                  {#if isLate}<Badge
                      variant="outline"
                      class="h-5 border-orange-200 bg-orange-50 px-1.5 text-[10px] font-bold text-orange-600 uppercase dark:border-orange-900/30 dark:bg-orange-900/20 dark:text-orange-400"
                      >Retard: {p.delay >= 60 ? '+60' : p.delay} min</Badge
                    >{/if}
                {:else if isUpcoming}
                  <Badge
                    variant="secondary"
                    class="h-5 border-blue-200 bg-blue-100 px-1.5 text-[10px] text-blue-700 uppercase"
                    >Inscrit</Badge
                  >
                {:else}
                  <Badge
                    variant="destructive"
                    class="h-5 px-1.5 text-[10px] uppercase">Absent</Badge
                  >
                {/if}
              </div>
              <Card.Title
                class="text-base leading-tight font-bold uppercase transition-colors hover:text-epi-blue"
              >
                {#if p.event?.id}<a
                    href={resolve(`/staff/dev/events/${p.event.id}`)}
                    >{p.event.titre}</a
                  >{:else}Événement inconnu{/if}
              </Card.Title>
            </div>

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
                      <Tooltip.Content
                        ><p>{staff?.user?.name}</p></Tooltip.Content
                      >
                    </Tooltip.Root>
                  </Tooltip.Provider>
                {/each}
              </div>
            {/if}
          </div>
        </Card.Header>
        <Card.Content class="space-y-3 p-4 pt-2">
          {#if p.activities && p.activities.length > 0}
            {@const displayActivities = p.activities.filter(
              (pa: any) =>
                pa.activity.activityType !== 'orga' ||
                pa.verdict ||
                pa.contextTag,
            )}
            {@const histogram = tallyVerdicts(
              displayActivities.map((pa: any) => pa.verdict),
            )}
            {@const verdictTotal =
              histogram.comfortable +
              histogram.progressing +
              histogram.struggling}
            <!-- Histogram is a multi-slot summary; with 0 or 1 verdict the
                 inline pill on the activity row already says everything. -->
            {#if verdictTotal > 1}
              <div
                class="flex flex-wrap items-center gap-2 text-[11px] font-bold"
              >
                <span class="text-muted-foreground uppercase"
                  >Verdict encadrants :</span
                >
                {#each VERDICT_VALUES as v (v)}
                  {#if histogram[v] > 0}
                    <span class={VERDICT_HISTOGRAM_TEXT_CLASS[v]}
                      >{VERDICT_EMOJIS[v]} ×{histogram[v]}</span
                    >
                  {/if}
                {/each}
              </div>
            {/if}
            {#if displayActivities.length > 0}
              <div class="flex flex-col gap-2">
                {#each displayActivities as pa}
                  {@const activity = pa.activity}
                  <div
                    class="flex items-start justify-between gap-2 rounded-sm bg-muted/50 p-2"
                  >
                    <div class="flex items-start gap-2">
                      <BookOpen
                        class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      />
                      <div>
                        <p class="text-sm font-bold">
                          {#if activity.link}<a
                              href={activity.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="transition-colors hover:text-epi-blue hover:underline"
                              >{activity.nom}</a
                            >{:else}{activity.nom}{/if}
                        </p>
                        {#if activity.activityThemes && activity.activityThemes.length > 0}
                          <div class="mt-1 flex flex-wrap gap-1">
                            {#each activity.activityThemes as at}
                              <span
                                class="text-[9px] font-bold tracking-wider text-epi-teal-solid uppercase"
                                >#{at.theme.nom}</span
                              >
                            {/each}
                          </div>
                        {/if}
                        {#if pa.verdict || pa.contextTag}
                          <div class="mt-1.5 flex flex-wrap items-center gap-1">
                            {#if pa.verdict}
                              {@const v = pa.verdict as ParticipationVerdict}
                              <span
                                class={cn(
                                  'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold',
                                  VERDICT_PILL_CLASS[v],
                                )}
                              >
                                <span aria-hidden="true"
                                  >{VERDICT_EMOJIS[v]}</span
                                >
                                <span>{VERDICT_LABELS[v]}</span>
                              </span>
                            {/if}
                            {#if pa.contextTag}
                              {@const t =
                                pa.contextTag as ParticipationContextTag}
                              <span
                                class="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
                              >
                                <span aria-hidden="true"
                                  >{CONTEXT_TAG_EMOJIS[t]}</span
                                >
                                <span>{CONTEXT_TAG_LABELS[t]}</span>
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
                                    ><p>
                                      {pa.verdictAuthor.user?.name}
                                    </p></Tooltip.Content
                                  >
                                </Tooltip.Root>
                              </Tooltip.Provider>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    </div>
                    {#if activity.link}
                      <Tooltip.Provider delayDuration={300}>
                        <Tooltip.Root>
                          <Tooltip.Trigger>
                            {#snippet child({ props })}
                              <Button
                                {...props}
                                variant="ghost"
                                size="icon"
                                href={activity.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="h-6 w-6 shrink-0 text-epi-blue hover:text-epi-blue/80"
                                ><ExternalLink class="h-3.5 w-3.5" /></Button
                              >
                            {/snippet}
                          </Tooltip.Trigger>
                          <Tooltip.Content
                            ><p>Voir le support</p></Tooltip.Content
                          >
                        </Tooltip.Root>
                      </Tooltip.Provider>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          {/if}

          <!-- CAMPER FEEDBACK (COMMENT BUBBLE STYLE) -->
          {#if p.camperRating}
            <div class="flex items-start gap-3 pt-2">
              <div
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
              >
                <MessageCircleReply class="h-3.5 w-3.5 text-slate-500" />
              </div>
              <div class="flex-1 pt-0.5">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-bold text-slate-400 uppercase">
                    Ressenti du Talent :
                  </span>
                  <div class="flex items-center gap-1">
                    {#if p.camperRating === 1}
                      <span class="text-sm leading-none">🤯</span>
                      <span
                        class="text-xs font-bold text-red-600 dark:text-red-400"
                        >Difficile</span
                      >
                    {:else if p.camperRating === 2}
                      <span class="text-sm leading-none">💪</span>
                      <span
                        class="text-xs font-bold text-blue-600 dark:text-blue-400"
                        >Moyen</span
                      >
                    {:else if p.camperRating === 3}
                      <span class="text-sm leading-none">🚀</span>
                      <span class="text-xs font-bold text-epi-teal-solid"
                        >Facile</span
                      >
                    {/if}
                  </div>
                </div>
                {#if p.camperFeedback}
                  <p
                    class="mt-1 text-sm text-slate-600 italic dark:text-slate-300"
                  >
                    « {p.camperFeedback} »
                  </p>
                {/if}
              </div>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    </div>
  {:else}
    <div class="py-12 text-center">
      <div
        class="inline-flex items-center justify-center mb-4 h-16 w-16 rounded-full bg-muted"
      >
        <Calendar class="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 class="text-lg font-bold text-muted-foreground uppercase">
        Aucun historique
      </h3>
      <p class="text-sm text-muted-foreground">
        Ce Talent n'a pas encore participé à un événement.
      </p>
    </div>
  {/each}
</div>
