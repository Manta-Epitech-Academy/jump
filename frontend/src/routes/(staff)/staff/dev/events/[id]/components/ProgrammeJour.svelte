<script lang="ts">
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import { activityTypes } from '$lib/validation/templates';

  type ActivityTypeKey = (typeof activityTypes)[number];

  type TimeSlotRow = {
    id: string;
    startTime: Date | string;
    endTime: Date | string;
    activity: {
      id: string;
      nom: string;
      activityType: ActivityTypeKey;
      activityThemes: { theme: { nom: string } }[];
    } | null;
  };

  type Props = {
    eventId: string;
    timeSlots: TimeSlotRow[];
    timezone: string;
    /** Override the default "Programme du jour" title (e.g. "Programme du J1"). */
    title?: string;
    /** Override the empty-state copy. */
    emptyLabel?: string;
    /** Show the "Planning →" shortcut in the header. Off when the planning page is flag-gated. */
    showPlanningLink?: boolean;
  };

  let {
    eventId,
    timeSlots,
    timezone,
    title = 'Programme du jour',
    emptyLabel = 'Pas de créneau planifié aujourd’hui.',
    showPlanningLink = true,
  }: Props = $props();

  const planningHref = $derived(
    resolve(`/staff/dev/events/${eventId}/planning`),
  );

  const formatTime = (d: Date | string) =>
    new Date(d).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    });

  const typeLabel: Record<ActivityTypeKey, string> = {
    atelier: 'Atelier',
    conference: 'Conférence',
    quiz: 'Quiz',
    orga: 'Orga',
    special: 'Spécial',
    break: 'Pause',
  };

  const typeAccent: Record<ActivityTypeKey, string> = {
    atelier: 'bg-epi-blue/10 text-epi-blue dark:bg-epi-blue/15',
    conference: 'bg-epi-pink/10 text-epi-pink dark:bg-epi-pink/15',
    quiz: 'bg-epi-orange/10 text-epi-orange dark:bg-epi-orange/15',
    orga: 'bg-epi-teal-solid/10 text-epi-teal-solid dark:bg-epi-teal-solid/15',
    special: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    break: 'bg-muted text-muted-foreground',
  };
</script>

<Card.Root class="rounded-sm shadow-sm dark:shadow-none">
  <div
    class="flex flex-row items-center justify-between gap-3 border-b bg-muted/30 px-6 pt-4 pb-3"
  >
    <h3
      class="flex items-center gap-2 font-heading text-2xl tracking-wide text-foreground uppercase"
    >
      <CalendarDays class="h-5 w-5 text-epi-blue" />
      {title}
    </h3>
    {#if showPlanningLink}
      <Button
        variant="ghost"
        size="sm"
        class="text-[10px] font-bold tracking-widest uppercase"
        href={planningHref}
      >
        Planning <ArrowRight class="ml-1 h-3 w-3" />
      </Button>
    {/if}
  </div>
  <Card.Content class="p-0">
    {#if timeSlots.length === 0}
      <div class="px-5 py-10 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    {:else}
      <div class="divide-y divide-border/50">
        {#each timeSlots as slot (slot.id)}
          {@const type = slot.activity?.activityType ?? 'special'}
          <div class="flex items-center gap-4 px-5 py-3">
            <div
              class="shrink-0 font-mono text-xs font-bold whitespace-nowrap text-muted-foreground"
            >
              <span class="text-foreground">{formatTime(slot.startTime)}</span>
              <span class="mx-1">→</span>
              <span>{formatTime(slot.endTime)}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-bold uppercase">
                {slot.activity?.nom ?? 'Créneau libre'}
              </div>
              {#if slot.activity?.activityThemes?.length}
                <div
                  class="mt-0.5 truncate text-[10px] font-medium tracking-wider text-muted-foreground uppercase"
                >
                  {slot.activity.activityThemes
                    .map((t) => t.theme.nom)
                    .join(' · ')}
                </div>
              {/if}
            </div>
            <span
              class={`shrink-0 rounded-sm px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase ${typeAccent[type]}`}
            >
              {typeLabel[type]}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
