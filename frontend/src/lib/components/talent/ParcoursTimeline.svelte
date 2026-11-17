<script lang="ts">
  import { Card } from '$lib/components/ui/card';
  import CardAction from '$lib/components/talent/CardAction.svelte';
  import Star from '@lucide/svelte/icons/star';
  import { UNCATEGORISED_FILL } from '$lib/design/color';
  import type {
    Parcours,
    ParcoursActivity,
    ParcoursEvent,
  } from '$lib/domain/talentParcours';
  import { cn } from '$lib/utils';

  // A talent's journey as the 2027 mockup draws it: one step per event down a
  // line, its kind's colour as the marker (a star for a key event), its days,
  // its name, and under it the activities done there with the XP each earned.
  // What is running or coming sits on top, marked as such; then what is over,
  // newest first. An activity not finished yet carries its way back in, so
  // this is where every activity offered to the talent can be opened.
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

  const steps = $derived([...parcours.ahead, ...parcours.past]);
  const titleId = $props.id();

  const PHASE_LABEL: Record<ParcoursEvent['phase'], string | null> = {
    live: 'En ce moment',
    upcoming: 'À venir',
    past: null,
  };

  const fr = (n: number) => n.toLocaleString('fr-FR');
  const signed = (n: number) => (n > 0 ? `+${fr(n)}` : fr(n));
  const actionLabel = (activity: ParcoursActivity) =>
    activity.action === 'start' ? 'Commencer' : 'Continuer';
</script>

<Card class="gap-5 p-6" role="region" aria-labelledby={titleId}>
  <h2 id={titleId} class="epi-overline text-muted-foreground">
    Tes événements
  </h2>

  {#if steps.length === 0}
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
    <!-- A journey only grows, so it scrolls in its own box (`ui.md`): a
         generous one, since it is what the page is for. -->
    <ol class="-mr-2 flex max-h-[70svh] flex-col overflow-y-auto pr-2">
      {#each steps as step, index (step.id)}
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
              <span class="mt-1 size-3.5 shrink-0 rounded-sm bg-(--marker)"
              ></span>
            {/if}
            {#if index < steps.length - 1}
              <span class="my-1 w-0.5 flex-1 bg-border"></span>
            {/if}
          </span>

          <div class="flex min-w-0 flex-col gap-2 pb-6">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span class="font-mono text-xs font-bold text-muted-foreground">
                {step.days}
              </span>
              <h3
                class="min-w-0 flex-1 text-base font-semibold text-foreground"
              >
                {step.name}
              </h3>
              {#if phase}
                <span
                  class={cn(
                    'rounded-full px-2 py-0.5 epi-chip',
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
              <ul class="flex flex-col gap-1">
                {#each step.activities as activity (activity.slug)}
                  <li
                    class="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-muted/60 px-3 py-1.5"
                  >
                    <span class="min-w-0 text-sm text-foreground">
                      {activity.label}
                    </span>
                    <span class="flex shrink-0 items-center gap-3">
                      {#if activity.xp !== null}
                        <span class="text-sm font-bold text-success">
                          {signed(activity.xp)} XP
                        </span>
                      {:else}
                        <span
                          class="text-xs font-semibold text-muted-foreground"
                        >
                          À faire
                        </span>
                      {/if}
                      {#if activity.action}
                        <!-- A form and not a link: entering mints a ticket,
                             and the new tab keeps this one alive for the XP. -->
                        <form
                          method="POST"
                          action={`/activites/${activity.slug}`}
                          target="_blank"
                        >
                          <CardAction submit>
                            {actionLabel(activity)}<span class="sr-only">
                              {activity.label} (nouvel onglet)</span
                            >
                          </CardAction>
                        </form>
                      {/if}
                    </span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  {/if}
</Card>
