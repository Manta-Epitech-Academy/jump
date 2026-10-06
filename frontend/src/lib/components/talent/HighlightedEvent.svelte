<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import { cn } from '$lib/utils';
  import {
    formatHighlightDay,
    type TalentHomeHighlight,
  } from '$lib/domain/talentHome';

  // The event the talent's campus invites them to, at the foot of « Planning à
  // venir ». It is an invitation, not one of the talent's sessions, and it reads
  // as one: aligned left under its own overline where the sessions above are
  // centred, and its button leaves Jump for the outside sign-up form, which the
  // trailing glyph says before the click does.
  let {
    highlight,
    class: extraClass,
  }: { highlight: TalentHomeHighlight; class?: string } = $props();
</script>

<section aria-labelledby="highlighted-event-title" class={cn(extraClass)}>
  <p class="epi-overline text-muted-foreground">À ne pas manquer</p>
  <h3
    id="highlighted-event-title"
    class="mt-2 text-lg font-bold text-foreground"
  >
    {highlight.title}
  </h3>
  <p
    class="mt-1 flex items-center gap-1.5 text-sm font-semibold text-foreground-secondary"
  >
    <CalendarDays class="size-4 shrink-0 text-epi-blue" aria-hidden="true" />
    Le {formatHighlightDay(highlight.date)}
  </p>
  <p class="mt-2 text-sm text-muted-foreground">{highlight.summary}</p>
  <Button
    href={highlight.url}
    target="_blank"
    rel="noopener noreferrer"
    class="mt-4 w-full rounded-xl"
  >
    Je m’inscris
    <ExternalLink aria-hidden="true" />
    <span class="sr-only">(nouvel onglet)</span>
  </Button>
</section>
