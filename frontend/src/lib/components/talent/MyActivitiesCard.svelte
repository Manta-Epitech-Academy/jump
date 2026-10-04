<script lang="ts">
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import Terminal from '@lucide/svelte/icons/terminal';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { cn } from '$lib/utils';
  import type { WorkshopActivity } from '$lib/domain/workshops';

  // Every activity a talent's events have offered, once its day has passed: a
  // Coding Club is designed never to finish, so these are carried on at home.
  // Quieter than the day's hero on purpose, and shaped unlike the daily
  // training card above it, so the two are never mistaken for one another: a
  // list of subjects with a picture and a count, not a row with a game pad.
  //
  // A row shows the subject's still when it has one, and nothing in its place
  // when it does not: a placeholder icon reads as a missing picture, and every
  // synced subject has one anyway (the sync falls back to its first image).
  // Nor does it name the event, whose name is a Salesforce campaign title more
  // often than not.
  //
  // Its length is decided by the events the talent went to, not by this code,
  // so the list scrolls in its own box from the first row.
  let { activities }: { activities: WorkshopActivity[] } = $props();

  let broken = $state<Record<string, true>>({});

  function thumbnailOf(activity: WorkshopActivity) {
    const image = activity.cover?.poster ?? activity.cover?.media ?? null;
    return image && !broken[image.url] ? image : null;
  }

  function statusOf(activity: WorkshopActivity): string {
    if (activity.totalSteps > 0)
      return `${activity.solvedSteps} / ${activity.totalSteps} étapes validées`;
    return activity.startedAt ? 'Commencée' : 'Pas encore commencée';
  }

  const finished = (a: WorkshopActivity) =>
    a.totalSteps > 0 && a.solvedSteps >= a.totalSteps;
</script>

<section
  class="overflow-hidden rounded-xl border border-border bg-card shadow-raised"
  aria-labelledby="my-activities-title"
>
  <div
    class="flex items-center gap-2 border-b border-border bg-background/50 px-6 py-4"
  >
    <Terminal class="h-4 w-4 shrink-0 text-epi-blue" />
    <h2
      id="my-activities-title"
      class="font-heading text-display-s text-foreground"
    >
      Mes activités<TitleCursor />
    </h2>
  </div>

  <ul class="max-h-[40svh] divide-y divide-border overflow-y-auto">
    {#each activities as activity (activity.slug)}
      {@const thumbnail = thumbnailOf(activity)}
      <li>
        <!-- A form and not a link, for the same reasons as the hero: entering
             mints a ticket, and the new tab keeps this one alive for the XP. -->
        <form
          method="POST"
          action={`/activites/${activity.slug}`}
          target="_blank"
        >
          <button
            type="submit"
            class="group flex w-full cursor-pointer items-center gap-4 px-6 py-4 text-left transition-ui hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            {#if thumbnail}
              <img
                src={thumbnail.url}
                width={thumbnail.width}
                height={thumbnail.height}
                alt=""
                loading="lazy"
                decoding="async"
                onerror={() => (broken = { ...broken, [thumbnail.url]: true })}
                class="h-12 w-20 shrink-0 object-cover"
              />
            {/if}

            <span class="min-w-0 flex-1">
              <span
                class="block truncate text-sm font-semibold text-foreground"
              >
                {activity.label}
              </span>
              <span
                class={cn(
                  'mt-1 block text-xs font-semibold',
                  activity.startedAt
                    ? 'text-epi-tech-ink'
                    : 'text-muted-foreground',
                )}
              >
                {statusOf(activity)}
              </span>
            </span>

            <span
              class="hidden shrink-0 items-center gap-1 text-xs font-bold text-epi-blue uppercase sm:inline-flex"
            >
              {finished(activity)
                ? 'Revoir'
                : activity.startedAt
                  ? 'Reprendre'
                  : 'Commencer'}
              <ArrowRight
                class="size-3.5 transition-transform group-hover:translate-x-0.5"
              />
            </span>
          </button>
        </form>
      </li>
    {/each}
  </ul>
</section>
