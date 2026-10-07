<script lang="ts">
  import { onImageBroken } from '$lib/actions/onImageBroken';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import Terminal from '@lucide/svelte/icons/terminal';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { cn } from '$lib/utils';
  import {
    isActivityFinished,
    type WorkshopActivity,
  } from '$lib/domain/workshops';

  // A list of activities a talent's events have offered, each one a way back
  // in. Two hosts: the home's « Mes activités », what is left to do (a Coding
  // Club is designed never to finish, so these are carried on at home), and
  // « Mon parcours », what is done. Quieter than the hero on purpose, and shaped
  // unlike the daily training card, so the two are never mistaken for one
  // another: a list of subjects with a picture and a count, not a row with a
  // game pad.
  //
  // A row shows the subject's still when it has one, and a brand tile when it
  // has none, so the rows stay aligned. It does not name the event, whose name
  // is a Salesforce campaign title more often than not.
  //
  // Its length is decided by the events the talent went to, not by this code,
  // so the list scrolls in its own box from the first row.
  let { title, activities }: { title: string; activities: WorkshopActivity[] } =
    $props();

  const titleId = $props.id();

  let broken = $state<Record<string, true>>({});

  function thumbnailOf(activity: WorkshopActivity) {
    const image = activity.cover.poster ?? activity.cover.media ?? null;
    return image && !broken[image.url] ? image : null;
  }

  function statusOf(activity: WorkshopActivity): string {
    if (isActivityFinished(activity))
      return `Terminée : ${activity.totalSteps} étapes validées`;
    if (activity.totalSteps > 0)
      return `${activity.solvedSteps} / ${activity.totalSteps} étapes validées`;
    return activity.startedAt ? 'Commencée' : 'Pas encore commencée';
  }
</script>

<section
  class="overflow-hidden rounded-xl border border-border bg-card shadow-raised"
  aria-labelledby={titleId}
>
  <div
    class="flex items-center gap-2 border-b border-border bg-background/50 px-6 py-4"
  >
    <Terminal class="h-4 w-4 shrink-0 text-epi-blue" />
    <h2 id={titleId} class="font-heading text-display-s text-foreground">
      {title}<TitleCursor />
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
                use:onImageBroken={() =>
                  (broken = { ...broken, [thumbnail.url]: true })}
                class="h-12 w-20 shrink-0 object-cover"
              />
            {:else}
              <span
                class="flex h-12 w-20 shrink-0 items-center justify-center bg-epi-blue"
                aria-hidden="true"
              >
                <Terminal class="size-5 text-white" />
              </span>
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
              class="hidden shrink-0 items-center gap-1 text-xs font-bold text-primary uppercase sm:inline-flex"
            >
              {isActivityFinished(activity)
                ? 'Revoir'
                : activity.startedAt
                  ? 'Reprendre'
                  : 'Commencer'}
              <ArrowRight
                class="size-3.5 transition-transform group-hover:translate-x-0.5"
              />
            </span>
            <!-- Outside the action word, which a phone does not show. -->
            <span class="sr-only">(nouvel onglet)</span>
          </button>
        </form>
      </li>
    {/each}
  </ul>
</section>
