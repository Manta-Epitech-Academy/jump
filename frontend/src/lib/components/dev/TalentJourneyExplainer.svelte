<script lang="ts">
  import Route from '@lucide/svelte/icons/route';
  import Check from '@lucide/svelte/icons/check';
  import {
    TALENT_JOURNEY_STEPS,
    TALENT_JOURNEY_ACTOR_LABEL,
    type TalentJourneyActor,
  } from '$lib/domain/talentJourney';
  import { cn } from '$lib/utils';

  // Icon + accent colours per actor. `ring` masks the spine where the badge sits.
  const actorBadge: Record<TalentJourneyActor, string> = {
    staff: 'bg-muted text-muted-foreground ring-card',
    talent: 'bg-epi-blue text-white ring-card',
    parent: 'bg-epi-pink text-white ring-card',
    auto: 'bg-epi-teal-solid text-white ring-card',
  };

  const actorAccent: Record<TalentJourneyActor, string> = {
    staff: 'text-muted-foreground',
    talent: 'text-epi-blue',
    parent: 'text-epi-pink',
    auto: 'text-epi-teal-solid',
  };

  const actorRail: Record<TalentJourneyActor, string> = {
    staff: 'bg-muted-foreground/30',
    talent: 'bg-epi-blue/30',
    parent: 'bg-epi-pink/30',
    auto: 'bg-epi-teal-solid/30',
  };

  // Small numbered chip sits at the icon's top-right; matches actor colour.
  const actorChip: Record<TalentJourneyActor, string> = {
    staff: 'bg-muted-foreground text-card',
    talent: 'bg-epi-blue text-white',
    parent: 'bg-epi-pink text-white',
    auto: 'bg-epi-teal-solid text-white',
  };
</script>

<section
  class="overflow-hidden rounded-sm border border-border bg-card shadow-sm dark:shadow-none"
>
  <header class="flex items-center gap-3 border-b border-border px-4 py-3">
    <div
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-epi-blue/10 text-epi-blue"
    >
      <Route class="h-4 w-4" />
    </div>
    <div class="min-w-0 space-y-0.5">
      <p
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Parcours du stagiaire avant le 15 juin
      </p>
      <p class="text-sm font-bold text-foreground">
        Les 6 étapes pour finaliser son inscription
      </p>
    </div>
  </header>

  <div class="bg-muted/10 px-4 py-5 sm:px-6">
    <ol class="grid auto-rows-fr grid-cols-[2.75rem_1fr] gap-x-4 gap-y-5">
      {#each TALENT_JOURNEY_STEPS as step, i (step.key)}
        {@const Icon = step.icon}
        {@const isLast = i === TALENT_JOURNEY_STEPS.length - 1}
        <li class="contents">
          <div class="relative">
            <div
              class={cn(
                'relative z-10 flex h-11 w-11 items-center justify-center rounded-full ring-4',
                actorBadge[step.actor],
              )}
            >
              <Icon class="h-5 w-5" />
              <span
                class={cn(
                  'absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ring-2 ring-card',
                  actorChip[step.actor],
                )}
                aria-hidden="true"
              >
                {#if isLast}
                  <Check class="h-3 w-3" strokeWidth={3} />
                {:else}
                  {i + 1}
                {/if}
              </span>
            </div>
            {#if !isLast}
              <div
                class={cn(
                  'absolute top-[3.25rem] -bottom-1 left-1/2 w-px -translate-x-1/2',
                  actorRail[step.actor],
                )}
                aria-hidden="true"
              ></div>
            {/if}
          </div>

          <div class="min-w-0 space-y-1 pt-1.5">
            <p
              class={cn(
                'font-mono text-[10px] font-bold tracking-widest uppercase',
                actorAccent[step.actor],
              )}
            >
              {isLast ? 'Succès' : `Étape ${i + 1}`} · {step.actorLabel ??
                TALENT_JOURNEY_ACTOR_LABEL[step.actor]}
            </p>
            <p class="text-sm font-bold text-foreground">{step.title}</p>
            <p class="text-sm leading-relaxed text-muted-foreground">
              {step.description}
            </p>
          </div>
        </li>
      {/each}
    </ol>
  </div>
</section>
