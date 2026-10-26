<script lang="ts">
  import { cn } from '$lib/utils';
  import type { CalendarEvent } from '$lib/domain/campusCalendar';

  // Where an event stands, as the 2027 mockup writes it: the countdown to its
  // first day, then « en cours », then « terminé ». One pill for the list and
  // the year view's tooltip, which sits on the inverted tooltip surface and so
  // takes the `inverse` tones.
  let {
    event,
    inverse = false,
  }: {
    event: Pick<CalendarEvent, 'status' | 'daysUntilStart'>;
    inverse?: boolean;
  } = $props();

  const label = $derived(
    event.status === 'upcoming'
      ? `J-${event.daysUntilStart}`
      : event.status === 'ongoing'
        ? 'En cours'
        : 'Terminé',
  );

  const tone = $derived(
    inverse
      ? 'bg-background/15 text-background'
      : event.status === 'upcoming'
        ? 'bg-primary/10 text-primary'
        : event.status === 'ongoing'
          ? 'bg-success/10 text-success'
          : 'bg-muted text-muted-foreground',
  );
</script>

<span class={cn('w-fit shrink-0 rounded-full px-2 py-0.5 epi-chip', tone)}>
  {label}
</span>
