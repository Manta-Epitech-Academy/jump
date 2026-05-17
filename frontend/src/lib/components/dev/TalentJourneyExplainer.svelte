<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Route from '@lucide/svelte/icons/route';
  import {
    TALENT_JOURNEY_STEPS,
    TALENT_JOURNEY_ACTOR_LABEL,
    type TalentJourneyActor,
  } from '$lib/domain/talentJourney';
  import { cn } from '$lib/utils';

  const STORAGE_KEY = 'jump.dev.talent-journey-expanded';

  let expanded = $state(false);

  onMount(() => {
    if (!browser) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) expanded = stored === 'true';
  });

  function toggle() {
    expanded = !expanded;
    if (browser) localStorage.setItem(STORAGE_KEY, expanded ? 'true' : 'false');
  }

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
    staff: 'bg-muted',
    talent: 'bg-epi-blue/30',
    parent: 'bg-epi-pink/30',
    auto: 'bg-epi-teal-solid/30',
  };
</script>

<section
  class="overflow-hidden rounded-sm border border-border bg-card shadow-sm dark:shadow-none"
>
  <button
    type="button"
    onclick={toggle}
    class="group flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
    aria-expanded={expanded}
  >
    <div class="flex min-w-0 items-center gap-3">
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-epi-blue/10 text-epi-blue"
      >
        <Route class="h-4 w-4" />
      </div>
      <div class="min-w-0 space-y-0.5">
        <p
          class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Parcours du talent
        </p>
        <p class="text-sm font-bold text-foreground">
          {#if expanded}
            5 étapes — de l'inscription au premier jour de stage
          {:else}
            Compte, premier login, signature du règlement, droit à l'image…
          {/if}
        </p>
      </div>
    </div>
    <ChevronDown
      class={cn(
        'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
        expanded && 'rotate-180',
      )}
    />
  </button>

  {#if expanded}
    <div class="border-t border-border bg-muted/10 px-4 py-6 sm:px-6">
      <ol class="relative grid gap-6 lg:grid-cols-5 lg:gap-x-2 lg:gap-y-0">
        <!-- horizontal spine, desktop only -->
        <div
          class="absolute top-5 right-[10%] left-[10%] hidden h-px bg-border lg:block"
          aria-hidden="true"
        ></div>

        {#each TALENT_JOURNEY_STEPS as step, i (step.key)}
          {@const Icon = step.icon}
          {@const isLast = i === TALENT_JOURNEY_STEPS.length - 1}
          <li
            class="relative flex gap-4 lg:flex-col lg:items-center lg:gap-3 lg:text-center"
          >
            <!-- icon column (with mobile vertical rail) -->
            <div class="relative flex shrink-0 flex-col items-center">
              <div
                class={cn(
                  'relative z-10 flex h-10 w-10 items-center justify-center rounded-full ring-4',
                  actorBadge[step.actor],
                )}
              >
                <Icon class="h-5 w-5" />
                <span
                  class="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card font-mono text-[10px] font-bold text-foreground"
                >
                  {i + 1}
                </span>
              </div>
              {#if !isLast}
                <div
                  class={cn(
                    'mt-2 w-px flex-1 lg:hidden',
                    actorRail[step.actor],
                  )}
                  aria-hidden="true"
                ></div>
              {/if}
            </div>

            <div class="min-w-0 flex-1 space-y-1 pb-2 lg:pt-1 lg:pb-0">
              <p
                class={cn(
                  'font-mono text-[10px] font-bold tracking-widest uppercase',
                  actorAccent[step.actor],
                )}
              >
                {TALENT_JOURNEY_ACTOR_LABEL[step.actor]}
              </p>
              <p class="text-sm font-bold text-foreground">{step.title}</p>
              <p class="text-xs leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          </li>
        {/each}
      </ol>
    </div>
  {/if}
</section>
