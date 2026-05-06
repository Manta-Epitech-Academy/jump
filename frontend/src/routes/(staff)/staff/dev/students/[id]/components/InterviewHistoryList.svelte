<script lang="ts">
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Calendar from '@lucide/svelte/icons/calendar';
  import { resolve } from '$app/paths';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { cn, formatDateFr } from '$lib/utils';
  import {
    INTERVIEW_DISPLAY_LABELS,
    getInterviewDisplayStatus,
  } from '$lib/domain/interview';
  import { getLifecycleBounds } from '$lib/domain/eventLifecycle';

  type Interview = {
    id: string;
    date: Date | string;
    status: 'planned' | 'completed' | 'cancelled';
    globalNote?: string | null;
    staff: { user: { name: string | null } | null } | null;
    participation: { event: { id: string; titre: string } } | null;
  };

  let { interviews, timezone }: { interviews: Interview[]; timezone: string } =
    $props();

  const bounds = $derived(getLifecycleBounds(timezone));

  function chipClass(state: ReturnType<typeof getInterviewDisplayStatus>) {
    return {
      none: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300',
      planned:
        'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300',
      overdue:
        'border-destructive/40 bg-destructive/10 text-destructive dark:border-destructive/40 dark:bg-destructive/15',
      done: 'border-green-300 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300',
      cancelled: 'border-border bg-muted text-muted-foreground line-through',
    }[state];
  }
</script>

<Card.Root class="rounded-sm border shadow-sm dark:shadow-none">
  <Card.Header class="border-b bg-muted/30 pt-4 pb-4">
    <Card.Title
      class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
    >
      <MessageSquare class="h-4 w-4 text-epi-blue" />
      Entretiens
    </Card.Title>
  </Card.Header>
  <Card.Content class="pt-5">
    {#if interviews.length === 0}
      <p class="text-sm text-muted-foreground italic">
        Aucun entretien enregistré.
      </p>
    {:else}
      <ul class="space-y-3">
        {#each interviews as iv (iv.id)}
          {@const state = getInterviewDisplayStatus(
            { date: new Date(iv.date), status: iv.status },
            bounds,
          )}
          <li class="space-y-2 rounded-sm border border-border bg-card p-3">
            <div class="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                class={cn(
                  'rounded-sm px-1.5 py-0 text-[10px] font-bold uppercase',
                  chipClass(state),
                )}
              >
                {INTERVIEW_DISPLAY_LABELS[state]}
              </Badge>
              <span
                class="inline-flex items-center gap-1 text-xs text-muted-foreground"
              >
                <Calendar class="h-3 w-3" />
                {formatDateFr(iv.date, timezone)}
              </span>
              {#if iv.staff?.user?.name}
                <span class="text-xs text-muted-foreground">
                  · Mené par <span class="font-medium text-foreground"
                    >{iv.staff.user.name}</span
                  >
                </span>
              {/if}
            </div>
            {#if iv.participation?.event}
              <p class="text-[11px] text-muted-foreground">
                <a
                  href={resolve(
                    `/staff/dev/events/${iv.participation.event.id}`,
                  )}
                  class="font-bold uppercase transition-colors hover:text-epi-blue"
                >
                  {iv.participation.event.titre}
                </a>
              </p>
            {/if}
            {#if iv.globalNote}
              <p
                class="rounded-sm border border-yellow-200 bg-yellow-50 p-2 text-xs leading-relaxed text-yellow-900 italic dark:border-yellow-900/30 dark:bg-yellow-950/20 dark:text-yellow-200"
              >
                « {iv.globalNote} »
              </p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </Card.Content>
</Card.Root>
