<script lang="ts">
  import type { PageData } from './$types';
  import { dev } from '$app/env';
  import { enhance } from '$app/forms';
  import { refreshAll } from '$app/navigation';
  import { enter, stagger } from '#lib/motion/index.ts';
  import FeedbackBanner from '#lib/components/feedback/FeedbackBanner.svelte';
  import NewsCard from '#lib/components/talent/NewsCard.svelte';
  import XpCard from '#lib/components/talent/XpCard.svelte';
  import TalentHomeHero from '#lib/components/talent/TalentHomeHero.svelte';
  import DailyTrainingTile from '#lib/components/talent/DailyTrainingTile.svelte';
  import TalentPageHeader from '#lib/components/talent/TalentPageHeader.svelte';
  import TalentFooter from '#lib/components/talent/TalentFooter.svelte';
  import MascotStage from '#lib/components/mascot/MascotStage.svelte';
  import { cn } from '#lib/utils.ts';
  import { useMascot } from '#lib/components/mascot/mascotController.svelte.ts';
  import { DEFAULT_MASCOT_LOOK } from '#lib/domain/mascot.ts';

  let { data }: { data: PageData } = $props();

  let student = $derived(data.student);
  const mascot = useMascot();

  // The one thing the blue hero suggests doing now, with the talent's own
  // enrolment reflected in it (« Tu es inscrit », « En ce moment »), or null
  // on a day with nothing to suggest (`pickHomeHero`, server-side). It took
  // over the « Ta prochaine session » card (#501): the hero says it whole.
  let hero = $derived(data.hero);
  // Whether Jump has anything to suggest (the hero, the campus's news). When
  // it has not, the talent's own cards take the whole width rather than leave
  // a column empty beside them.
  let suggestsSomething = $derived(!!hero || !!data.note);

  // The daily brain training, one tile among the talent's own cards, or
  // nothing on a day without one. Today's attempt is passed once it is
  // finished (`already_played`); a pending one is not an attempt yet.
  let training = $derived.by(() => {
    const minigame = data.minigame;
    if (!minigame?.publication) return null;
    const preview = data.trainingPreview;
    if (minigame.ok)
      return { publication: minigame.publication, attempt: null, preview };
    if (minigame.reason !== 'already_played' || !minigame.lastAttempt)
      return null;
    return {
      publication: minigame.publication,
      attempt: minigame.lastAttempt,
      preview,
    };
  });

  // Whether the talent has a card of their own beside the XP one. Without
  // one, the XP card is alone in its row and takes the whole of it.
  let ownCards = $derived(!!training);

  // An activity is walked in a SECOND TAB, so coming back here reloads nothing on
  // its own and the XP earned meanwhile would only appear on the next navigation.
  //
  // Armed as soon as an activity is OFFERED, not once one has been entered, and
  // the difference is the whole first visit: the hero is what sends the talent
  // to the other tab, so on the return that matters most nothing had been
  // entered when this page was rendered. Waiting for `startedAt` armed the
  // listener only from the second visit onwards, which is the one nobody
  // demonstrates.
  $effect(() => {
    if (!data.hasActivities) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshAll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  });
</script>

<svelte:head>
  <title>Tableau de bord</title>
</svelte:head>

<!-- What the talent earned and has not seen celebrated: XP, and the level they
     reached, played by the duck in the middle of the screen (#540). Activity XP
     arrive when the talent comes back to this tab, which revalidates the page
     (the visibility listener above). -->
<MascotStage pending={data.celebrations} />

<div class="flex min-h-screen flex-col">
  <!-- Same app bar as every talent page, unchanged: the duck in it says
       hello when the talent arrives (#539). The page still needs its own
       heading for whoever navigates by them. -->
  <TalentPageHeader />
  <h1 class="sr-only">Accueil</h1>

  <div class="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
    {#each data.pendingFeedback as pf (pf.formId)}
      <div class="mb-4">
        <FeedbackBanner
          eventId={pf.eventId}
          formId={pf.formId}
          personaIconUrl={pf.personaIconUrl}
          mascot={mascot()?.look ?? DEFAULT_MASCOT_LOOK}
        />
      </div>
    {/each}

    {#snippet dailyTraining()}
      {#if training}
        <div class="max-lg:order-3">
          <DailyTrainingTile {...training} />
          {#if dev}
            <!-- Dev-only: flips today's attempt; stripped in prod. -->
            <form
              method="POST"
              action="?/devToggleMinigame"
              use:enhance
              class="mt-2 flex justify-end"
            >
              <button
                type="submit"
                title="Dev : basculer l'état de l'entraînement du jour"
                class="cursor-pointer epi-overline text-muted-foreground hover:text-epi-blue"
              >
                {training.attempt ? 'dev: reset' : 'dev: joué'}
              </button>
            </form>
          {/if}
        </div>
      {/if}
    {/snippet}

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <!-- LEFT COLUMN: what is the talent's own (XP and the way into « Mon
           parcours », the day's training that feeds it).
           RIGHT COLUMN: what Jump suggests (the hero, the campus's news).
           Two columns from `lg` only: at a tablet's width a third of the
           page is too narrow for the XP card.
           On a day Jump suggests nothing, there is no right column: the
           talent's cards take the width, the XP card beside the training,
           or alone across the page, rather than a column left empty.
           Below `lg` every wrapper collapses (display: contents) so the cards
           join the outer grid as siblings and `max-lg:order-*` interleaves
           them: hero, XP, training, Actualité. From `lg` the columns
           read in source order, which is why every `order` stops there. -->
      <div
        class={cn(
          'contents',
          suggestsSomething
            ? 'lg:col-span-4 lg:block lg:space-y-6'
            : 'lg:col-span-12 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6',
        )}
        in:enter={{ x: -12 }}
      >
        <div
          class={cn(
            'max-lg:order-2',
            ownCards ? 'lg:col-span-4' : 'lg:col-span-12',
          )}
        >
          <XpCard xp={student?.xp ?? 0} toDoCount={data.toDoCount} />
        </div>

        {#if ownCards}
          <div
            class={cn(
              'contents lg:block lg:space-y-6',
              !suggestsSomething && 'lg:col-span-8',
            )}
          >
            {@render dailyTraining()}
          </div>
        {/if}
      </div>

      {#if suggestsSomething}
        <div
          class="contents lg:col-span-8 lg:block lg:space-y-6"
          in:enter={{ x: 12, delay: stagger(1) }}
        >
          {#if hero}
            <!-- Where Jump says what to do now: the head of the right column,
                 level with the XP card, and first of all on a phone. -->
            <div class="max-lg:order-1">
              <TalentHomeHero {hero} />
            </div>
          {/if}

          {#if data.note}
            <div class="max-lg:order-4">
              <NewsCard html={data.note} />
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Footer: what Jump is, pinned to the bottom of the page -->
  <TalentFooter />
</div>
