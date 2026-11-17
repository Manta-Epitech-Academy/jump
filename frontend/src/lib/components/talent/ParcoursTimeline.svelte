<script lang="ts">
  import { Card } from '$lib/components/ui/card';
  import CardAction from '$lib/components/talent/CardAction.svelte';
  import SubjectVisual from '$lib/components/talent/SubjectVisual.svelte';
  import Star from '@lucide/svelte/icons/star';
  import { UNCATEGORISED_FILL } from '$lib/design/color';
  import type {
    Parcours,
    ParcoursActivity,
    ParcoursActivityNext,
    ParcoursEvent,
  } from '$lib/domain/talentParcours';
  import { cn } from '$lib/utils';

  // A talent's journey as the 2027 mockup draws it: one step per event down a
  // line, its kind's colour as the marker (a star for a key event), its name
  // and its days, and under it the activities done there. What is running or
  // coming sits on top; what is over follows under the year it began, so a
  // date never has to repeat its year.
  //
  // An activity is drawn by what it is to the talent. Finished, it is a memory:
  // one compact line with the XP it earned. Still to walk, it is an
  // invitation: its cover, its line, how far along, and the way in. That is
  // where every activity offered to the talent can be opened, so it has to
  // make one want to.
  //
  // A journey that has not begun says so, and points to the event the campus
  // puts forward when there is one: the home's hero already invites, so this
  // is one quiet link, not a second hero.
  let {
    parcours,
    invitation,
  }: {
    parcours: Parcours;
    invitation: { name: string; signupUrl: string } | null;
  } = $props();

  const titleId = $props.id();
  const empty = $derived(
    parcours.ahead.length === 0 && parcours.past.length === 0,
  );

  const PHASE_LABEL: Record<ParcoursEvent['phase'], string | null> = {
    live: 'En ce moment',
    upcoming: 'À venir',
    past: null,
  };

  const fr = (n: number) => n.toLocaleString('fr-FR');
  const signed = (n: number) => (n > 0 ? `+${fr(n)}` : fr(n));
  const actionLabel = (next: ParcoursActivityNext) =>
    next.action === 'start' ? 'Commencer' : 'Continuer';
  // How far along, in the words the old list used: steps when the activity
  // counts them, else whether it was opened at all.
  function progressOf({ activity }: ParcoursActivityNext): string {
    if (activity.totalSteps > 0)
      return `${activity.solvedSteps} / ${activity.totalSteps} étapes validées`;
    return activity.startedAt ? 'Commencée' : 'Pas encore commencée';
  }
</script>

{#snippet memory(activity: ParcoursActivity)}
  <li
    class="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-1.5"
  >
    <span class="min-w-0 text-sm text-foreground">{activity.label}</span>
    {#if activity.xp !== null}
      <span class="shrink-0 text-sm font-bold text-success">
        {signed(activity.xp)} XP
      </span>
    {/if}
  </li>
{/snippet}

{#snippet invitationCard(
  activity: ParcoursActivity,
  next: ParcoursActivityNext,
  color: string | null,
)}
  <li
    class="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-start sm:gap-4"
  >
    <!-- Stacked on a phone, beside the words from `sm`, as the hero's
         choice tiles are: the visual keeps the width its name needs. -->
    <div class="sm:w-40 sm:shrink-0">
      <SubjectVisual
        activity={next.activity}
        categoryColor={color}
        layout="tile"
      />
    </div>
    <div class="flex min-w-0 flex-1 flex-col items-start gap-1.5">
      <span class="text-sm font-semibold text-foreground">
        {activity.label}
      </span>
      {#if next.activity.cover.tagline}
        <span class="line-clamp-2 text-sm text-muted-foreground">
          {next.activity.cover.tagline}
        </span>
      {/if}
      <span class="text-xs font-semibold text-muted-foreground">
        {progressOf(next)}{#if activity.xp !== null}
          · <span class="text-success">{signed(activity.xp)} XP</span>{/if}
      </span>
      <!-- A form and not a link: entering mints a ticket, and the new tab
           keeps this one alive for the XP. -->
      <form
        method="POST"
        action={`/activites/${activity.slug}`}
        target="_blank"
        class="mt-1"
      >
        <CardAction submit>
          {actionLabel(next)}<span class="sr-only">
            {activity.label} (nouvel onglet)</span
          >
        </CardAction>
      </form>
    </div>
  </li>
{/snippet}

{#snippet steps(events: ParcoursEvent[])}
  <ol class="flex flex-col">
    {#each events as step, index (step.id)}
      {@const phase = PHASE_LABEL[step.phase]}
      <li
        class="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4"
        style:--marker={step.color ?? UNCATEGORISED_FILL.color}
      >
        <span class="flex flex-col items-center" aria-hidden={!step.keyEvent}>
          {#if step.keyEvent}
            <Star
              class="mt-0.5 size-5.5 shrink-0 fill-(--marker) text-(--marker)"
              role="img"
              aria-label="Événement clé"
            />
          {:else}
            <span class="mt-1 size-3.5 shrink-0 rounded-xs bg-(--marker)"
            ></span>
          {/if}
          {#if index < events.length - 1}
            <span class="my-1 w-0.5 flex-1 bg-border"></span>
          {/if}
        </span>

        <div class="flex min-w-0 flex-col gap-2 pb-6">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h4 class="text-base font-semibold text-foreground">
                {step.name}
              </h4>
              <p class="text-sm text-muted-foreground">{step.days}</p>
            </div>
            {#if phase}
              <span
                class={cn(
                  'shrink-0 rounded-full px-2 py-0.5 epi-chip',
                  step.phase === 'live'
                    ? 'bg-epi-tech/20 text-epi-tech-ink'
                    : 'bg-primary/10 text-primary',
                )}
              >
                {phase}
              </span>
            {/if}
          </div>

          {#if step.activities.length > 0}
            <ul class="flex flex-col gap-2">
              {#each step.activities as activity (activity.slug)}
                {#if activity.next}
                  {@render invitationCard(activity, activity.next, step.color)}
                {:else}
                  {@render memory(activity)}
                {/if}
              {/each}
            </ul>
          {/if}
        </div>
      </li>
    {/each}
  </ol>
{/snippet}

<Card class="gap-5 p-6" role="region" aria-labelledby={titleId}>
  <h2 id={titleId} class="epi-overline text-muted-foreground">
    Tes événements
  </h2>

  {#if empty}
    <div class="flex flex-col items-start gap-3 py-2">
      <p class="font-heading text-display-s text-foreground">
        Ton parcours commence ici
      </p>
      <p class="max-w-prose text-sm text-muted-foreground">
        À ton premier événement, il prendra sa place ici, avec les activités que
        tu y feras et les XP que tu y gagneras.
      </p>
      {#if invitation}
        <CardAction href={invitation.signupUrl} external>
          Découvrir {invitation.name}
        </CardAction>
      {/if}
    </div>
  {:else}
    <!-- Not bounded in a box of its own (`ui.md`, lists whose length data
         decides): that rule keeps a list from pushing the controls after it
         off the screen, and nothing follows this one. The journey is the
         page, so the page scrolls; a box inside it would cut an activity in
         half on a phone and scroll inside a scroll. -->
    <div class="flex flex-col gap-2">
      {#if parcours.ahead.length > 0}
        <section aria-label="À venir">
          {@render steps(parcours.ahead)}
        </section>
      {/if}
      {#each parcours.past as stretch (stretch.year)}
        {@const yearId = `${titleId}-${stretch.year}`}
        <section aria-labelledby={yearId} class="flex flex-col gap-3">
          <h3 id={yearId} class="font-heading text-display-s text-foreground">
            {stretch.year}
          </h3>
          {@render steps(stretch.events)}
        </section>
      {/each}
    </div>
  {/if}
</Card>
