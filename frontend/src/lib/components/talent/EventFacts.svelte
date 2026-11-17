<script lang="ts">
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import { toDateKey } from '$lib/domain/planningTime';
  import { arrivalLabel, eventDaysLabel } from '$lib/domain/talentHome';
  import { dateKeyParts } from '$lib/domain/eventPresence';
  import { eventPlace } from '$lib/domain/eventHero';
  import type { HeroEvent } from '$lib/domain/talentHome';

  // When and where an event takes place, the two lines the mockup draws under
  // its name in the hero: its days (« Du 27 au 30 octobre ») with, once the
  // talent is enrolled, the time they are expected, and its campus. Read on
  // the event's own campus clock.
  let {
    event,
    withArrival = false,
  }: { event: HeroEvent; withArrival?: boolean } = $props();

  const days = $derived(
    eventDaysLabel(event.date, event.endDate, {
      knownYear: dateKeyParts(toDateKey(new Date(), event.timezone)).year,
      weekday: true,
    }),
  );
  // The arrival time only when the event has one; the day alone otherwise.
  const arrival = $derived(
    withArrival ? arrivalLabel(event.startMinutes) : null,
  );
</script>

<ul class="flex flex-col gap-1 text-sm text-white/80">
  <li class="flex items-center gap-1.5">
    <CalendarDays class="size-4 shrink-0" aria-hidden="true" />
    <span>{arrival ? `${days} · accueil à ${arrival}` : days}</span>
  </li>
  <li class="flex items-center gap-1.5">
    <MapPin class="size-4 shrink-0" aria-hidden="true" />
    <span>{eventPlace(event.campusName)}</span>
  </li>
</ul>
