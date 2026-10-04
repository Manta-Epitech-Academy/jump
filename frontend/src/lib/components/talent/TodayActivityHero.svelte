<script lang="ts">
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import { Button } from '$lib/components/ui/button';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { cn } from '$lib/utils';
  import type {
    TalentWorkshops,
    WorkshopActivity,
  } from '$lib/domain/workshops';

  // The day's activity, on the day and only then, above everything else on the
  // dashboard. A talent arriving on an event day should have no doubt about
  // where to click, so this is the one full-bleed blue surface of the page and
  // the one neon button, and it looks like nothing else on it: the daily
  // training below is a row in a card.
  //
  // It leads with what the subject says about itself (its tagline, its cover,
  // its mascot), copied from the instance when an admin declared it. Every
  // picture is optional and may also fail to load (a seeded environment has no
  // bytes behind its keys): the hero then stands on its label and the brand
  // ground alone, which has to read as finished, not as broken.
  let { today }: { today: NonNullable<TalentWorkshops['today']> } = $props();

  const single = $derived(today.activities.length === 1);
  // The one hopeful action: the first activity not yet walked to the end.
  const primarySlug = $derived(
    (
      today.activities.find(
        (a) => a.totalSteps === 0 || a.solvedSteps < a.totalSteps,
      ) ?? today.activities[0]
    )?.slug,
  );
  const mascot = $derived(today.activities[0]?.cover?.mascot ?? null);

  // Pictures that failed to load, by URL, so a broken one leaves no hole.
  let broken = $state<Record<string, true>>({});
  const loads = (url: string | undefined) => !!url && !broken[url];
  const markBroken = (url: string) => (broken = { ...broken, [url]: true });

  /** The picture to show, or null to stand on the brand ground. */
  function pictureOf(activity: WorkshopActivity) {
    const cover = activity.cover;
    const still = loads(cover?.poster?.url) ? cover!.poster : null;
    const moving = loads(cover?.media?.url) ? cover!.media : null;
    const main = moving ?? still;
    return main ? { main, still } : null;
  }

  const started = (a: WorkshopActivity) => a.startedAt !== null;
  const progress = (a: WorkshopActivity) =>
    a.totalSteps > 0 ? Math.round((a.solvedSteps / a.totalSteps) * 100) : 0;
</script>

<!-- Room above the frame only when the mascot breaks out of it. -->
<section
  aria-labelledby="today-activity-title"
  class={cn('relative', loads(mascot?.url) && 'sm:pt-14 md:pt-20')}
>
  <PageHero
    pixels={!loads(mascot?.url)}
    density="compact"
    class="rounded-xl sm:px-8 sm:py-8"
  >
    {#if mascot && loads(mascot.url)}
      <!-- The subject's character, standing on the frame's top edge, clear of
           the cover below it: decorative, the tagline carries the meaning. -->
      <img
        src={mascot.url}
        width={mascot.width}
        height={mascot.height}
        alt=""
        decoding="async"
        onerror={() => markBroken(mascot.url)}
        class={cn(
          'pointer-events-none absolute -top-14 right-6 hidden h-20 w-auto sm:block md:-top-20 md:h-28',
          // A sprite drawn at a few dozen pixels is pixel art: scaled up,
          // it keeps its pixels instead of blurring.
          mascot.width < 128 && '[image-rendering:pixelated]',
        )}
      />
    {/if}

    <p class="flex items-center gap-2 epi-overline text-white">
      <span class="relative flex size-2" aria-hidden="true">
        <span
          class="absolute inline-flex size-full rounded-full bg-epi-tech opacity-75 motion-safe:animate-ping"
        ></span>
        <span class="relative inline-flex size-2 rounded-full bg-epi-tech"
        ></span>
      </span>
      Aujourd'hui · {today.eventName}
    </p>
    <h2 id="today-activity-title" class="sr-only">Ton activité du jour</h2>

    <div class={cn('mt-5 grid gap-8', !single && 'md:grid-cols-2')}>
      {#each today.activities as activity (activity.slug)}
        {@const picture = pictureOf(activity)}
        {@const isPrimary = activity.slug === primarySlug}
        <article
          class={cn(
            'flex flex-col gap-5',
            single && picture && 'md:flex-row-reverse md:items-center md:gap-8',
          )}
        >
          {#if picture}
            <!-- A rectangle, no radius and no shadow (DESIGN.md: images).
                 The still replaces the animation for whoever asked for
                 reduced motion. -->
            <picture class={cn('block shrink-0', single && 'md:w-1/2')}>
              {#if picture.still && picture.still !== picture.main}
                <source
                  media="(prefers-reduced-motion: reduce)"
                  srcset={picture.still.url}
                />
              {/if}
              <img
                src={picture.main.url}
                width={picture.main.width}
                height={picture.main.height}
                alt=""
                decoding="async"
                onerror={() => markBroken(picture.main.url)}
                class="block h-auto w-full ring-1 ring-white/20"
              />
            </picture>
          {/if}

          <div class="flex min-w-0 flex-1 flex-col gap-4">
            <div>
              <!-- The label is the headline when the subject has no tagline
                   of its own, so it is not repeated above it. -->
              <p class="epi-overline text-white/80">
                {activity.cover?.tagline
                  ? `Activité · ${activity.label}`
                  : 'Activité'}
              </p>
              <p
                class={cn(
                  'mt-2 font-heading text-white',
                  single
                    ? 'text-display-l sm:text-display-xl'
                    : 'text-display-l',
                )}
              >
                {activity.cover?.tagline ?? activity.label}<TitleCursor />
              </p>
            </div>

            {#if activity.totalSteps > 0}
              <div class="max-w-sm">
                <div
                  class="h-2 w-full bg-white/20"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={activity.totalSteps}
                  aria-valuenow={activity.solvedSteps}
                  aria-label="Étapes validées"
                >
                  <div
                    class="h-full bg-epi-tech transition-ui duration-300"
                    style:width="{progress(activity)}%"
                  ></div>
                </div>
                <p class="mt-2 text-sm font-semibold text-white">
                  {activity.solvedSteps} / {activity.totalSteps} étapes validées
                </p>
              </div>
            {:else}
              <p class="text-sm text-white/80">
                {started(activity)
                  ? 'Reprends là où tu t’es arrêté.'
                  : 'Avance à ton rythme : chaque étape te rapporte des XP.'}
              </p>
            {/if}

            <!-- A form and not a link: entering mints a ticket and opens a
                 participation, and `load` runs on speculative hover-preload.
                 `target="_blank"` leaves this tab alive for the talent to come
                 back to, which is where the XP are celebrated. -->
            <form
              method="POST"
              action={`/activites/${activity.slug}`}
              target="_blank"
            >
              <Button
                type="submit"
                size="lg"
                variant={isPrimary ? 'neon' : 'outline'}
                class="h-11 w-full sm:w-auto"
              >
                {started(activity) ? 'Reprendre' : 'C’est parti'}
                <ArrowRight class="size-4" />
              </Button>
            </form>
          </div>
        </article>
      {/each}
    </div>
  </PageHero>
</section>
