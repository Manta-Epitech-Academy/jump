<script lang="ts">
  import { onImageBroken } from '$lib/actions/onImageBroken';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import { Button } from '$lib/components/ui/button';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import { cn } from '$lib/utils';
  import {
    isActivityFinished,
    type WorkshopActivity,
  } from '$lib/domain/workshops';
  import {
    formatHighlightDay,
    type TalentHomeHighlight,
  } from '$lib/domain/talentHome';

  // An activity in the home's hero, in one of two cases `pickHomeHero` decides:
  // the day's activity on its day (`today`), or, on a day with nothing else to
  // suggest, the one the talent started and has not finished, which a Coding
  // Club is designed for them to carry on at home (`continue`). A talent
  // arriving on an event day should have no doubt about where to click, so this
  // is the one full-bleed blue surface of the page and the one neon button, and
  // it looks like nothing else on it: the daily training below is a row in a
  // card.
  //
  // On the day, the campus's highlighted event follows as one compact line at
  // the foot (`next`): an invitation still matters on an event day, but less
  // than the event, so it gets a text link and never a second button.
  //
  // It leads with how the activity presents itself (its tagline, its cover, its
  // mascot), authored over the API and copied into Jump, and with nothing else: the event's name is a Salesforce campaign title more often
  // than not, and being on the page at all already says « today ». Every
  // picture is optional and may fail to load (a seeded environment has no bytes
  // behind its keys): the hero then stands on its label and the brand ground,
  // which has to read as finished, not as broken.
  let {
    activities,
    context,
    next = null,
  }: {
    activities: WorkshopActivity[];
    context: 'today' | 'continue';
    next?: TalentHomeHighlight | null;
  } = $props();

  const title = $derived(
    context === 'today' ? 'Ton activité du jour' : 'À continuer chez toi',
  );
  const overline = $derived(
    context === 'today' ? 'Activité' : 'À continuer chez toi',
  );

  // The one hopeful action: the first activity not yet walked to the end.
  const primarySlug = $derived(
    (activities.find((a) => !isActivityFinished(a)) ?? activities[0])?.slug,
  );

  // Pictures that failed to load, by URL, so a broken one leaves no hole.
  let broken = $state<Record<string, true>>({});
  const loads = (url: string | undefined) => !!url && !broken[url];
  const markBroken = (url: string) => (broken = { ...broken, [url]: true });

  /** The picture to show, or null to stand on the brand ground. */
  function pictureOf(activity: WorkshopActivity) {
    const cover = activity.cover;
    const still = loads(cover.poster?.url) ? cover.poster : null;
    const moving = loads(cover.media?.url) ? cover.media : null;
    const main = moving ?? still;
    return main ? { main, still } : null;
  }

  const started = (a: WorkshopActivity) => a.startedAt !== null;
  const progress = (a: WorkshopActivity) =>
    a.totalSteps > 0 ? Math.round((a.solvedSteps / a.totalSteps) * 100) : 0;
</script>

<section aria-labelledby="activity-hero-title">
  <h2 id="activity-hero-title" class="sr-only">{title}</h2>
  <PageHero
    density="compact"
    pixels={!activities.some((a) => pictureOf(a))}
    class="rounded-xl"
  >
    <div class="grid gap-6">
      {#each activities as activity (activity.slug)}
        {@const picture = pictureOf(activity)}
        {@const mascot = activity.cover.mascot}
        {@const isPrimary = activity.slug === primarySlug}
        <article
          class={cn(
            'flex flex-col gap-5',
            picture && 'sm:flex-row-reverse sm:items-center sm:gap-6',
          )}
        >
          {#if picture}
            <!-- A rectangle, no radius and no shadow (DESIGN.md: images).
                 The still replaces the animation for whoever asked for
                 reduced motion. -->
            <picture class="block shrink-0 sm:w-2/5">
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
                use:onImageBroken={() => markBroken(picture.main.url)}
                class="block h-auto w-full ring-1 ring-white/20"
              />
            </picture>
          {/if}

          <div class="flex min-w-0 flex-1 flex-col gap-3">
            {#if mascot && loads(mascot.url)}
              <!-- The subject's character, above its line. Drawn no larger
                   than a small sprite needs: scaled past its own pixels it
                   reads as low resolution rather than as pixel art.
                   Decorative: the tagline carries the meaning. -->
              <img
                src={mascot.url}
                width={mascot.width}
                height={mascot.height}
                alt=""
                decoding="async"
                use:onImageBroken={() => markBroken(mascot.url)}
                class={cn(
                  'h-12 w-auto self-start',
                  mascot.width < 128 && '[image-rendering:pixelated]',
                )}
              />
            {/if}

            <div>
              <!-- The label is the headline when the subject has no tagline
                   of its own, so it is not repeated above it. -->
              <p class="epi-overline text-white/80">
                {activity.cover.tagline
                  ? `${overline} · ${activity.label}`
                  : overline}
              </p>
              <!-- The visible title is each activity's heading under the
                   section's own (sr-only), so a day with two activities reads
                   as two entries rather than as one run of text. -->
              <h3
                class="mt-2 font-heading text-display-m text-white sm:text-display-l"
              >
                {activity.cover.tagline ?? activity.label}<TitleCursor />
              </h3>
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
                variant={isPrimary ? 'neon' : 'outline'}
                class="w-full sm:w-auto"
              >
                {started(activity) ? 'Reprendre' : 'C’est parti'}
                <ArrowRight class="size-4" aria-hidden="true" />
                <span class="sr-only">(nouvel onglet)</span>
              </Button>
            </form>
          </div>
        </article>
      {/each}

      {#if next}
        <!-- What comes after the day, in a line: the hero already has its
             one button. -->
        <p
          class="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-white/20 pt-4 text-sm text-white/80"
        >
          <span>
            Et après : <span class="font-semibold text-white">{next.title}</span
            >, le {formatHighlightDay(next.date)}
          </span>
          <a
            href={next.url}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex cursor-pointer items-center gap-1 font-semibold text-white underline underline-offset-4 hover:text-epi-tech focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Je m’inscris
            <ExternalLink class="size-3.5" aria-hidden="true" />
            <span class="sr-only">(nouvel onglet)</span>
          </a>
        </p>
      {/if}
    </div>
  </PageHero>
</section>
