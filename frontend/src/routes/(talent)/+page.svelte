<script lang="ts">
  import type { PageData } from './$types';
  import { dev } from '$app/environment';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { invalidateAll } from '$app/navigation';
  import { fly } from 'svelte/transition';
  import { triggerConfetti } from '$lib/actions/confetti';
  import { welcomeRewardToast } from '$lib/components/talent/rewardToast';
  import Trophy from '@lucide/svelte/icons/trophy';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Route from '@lucide/svelte/icons/route';
  import FeedbackBanner from '$lib/components/feedback/FeedbackBanner.svelte';
  import NewsCard from '$lib/components/talent/NewsCard.svelte';
  import TalentHomeHero from '$lib/components/talent/TalentHomeHero.svelte';
  import SessionCard from '$lib/components/talent/SessionCard.svelte';
  import DailyTrainingTile from '$lib/components/talent/DailyTrainingTile.svelte';
  import { showsSessionCard } from '$lib/domain/talentPlanning';
  import TalentPageHeader from '$lib/components/talent/TalentPageHeader.svelte';
  import TalentFooter from '$lib/components/talent/TalentFooter.svelte';
  import XpFloat from '$lib/components/talent/XpFloat.svelte';
  import MinigameRewardCelebration from '$lib/components/talent/MinigameRewardCelebration.svelte';
  import WorkshopRewardCelebration from '$lib/components/talent/WorkshopRewardCelebration.svelte';
  import { onMount } from 'svelte';
  import { cn } from '$lib/utils';

  let { data }: { data: PageData } = $props();

  // "+XP" reward celebration: confetti + a floating amount that fades out.
  // Drives the onboarding arrival below; the minigame finish/rank floats live in
  // MinigameRewardCelebration (shared with the leaderboard).
  const XP_FLOAT_DURATION_MS = 2500;
  let showXpFloat = $state(false);
  let floatAmount = $state(0);
  function celebrateXp(
    amount: number,
    timers: ReturnType<typeof setTimeout>[],
  ) {
    timers.push(
      setTimeout(() => {
        triggerConfetti();
        floatAmount = amount;
        showXpFloat = true;
      }, 300),
    );
    timers.push(setTimeout(() => (showXpFloat = false), XP_FLOAT_DURATION_MS));
  }

  // Arrival celebration. The server arms `data.onboardingArrival` on the first
  // dashboard load after onboarding completes (consuming a one-shot cookie), so
  // its presence is the whole trigger: there is no URL param to read or scrub,
  // and a refresh can't replay it. We fire the XP float + welcome toast; no
  // modal pops (the /welcome splash is a separate earlier greeting).
  onMount(() => {
    const arrival = data.onboardingArrival;
    if (!arrival) return;

    const { totalXp, earlyBirdBonus } = arrival;

    const timers: ReturnType<typeof setTimeout>[] = [];
    celebrateXp(totalXp, timers);
    // Hold the toast until the XP float has faded, so the welcome message lands
    // on a calm page (after the first "stunned" beat) instead of competing with
    // the confetti and the floating number for attention.
    timers.push(
      setTimeout(
        () => welcomeRewardToast(totalXp, earlyBirdBonus),
        XP_FLOAT_DURATION_MS + 400,
      ),
    );
    return () => timers.forEach(clearTimeout);
  });

  let student = $derived(data.student);
  // The talent's own session (server-derived, or a dev preview when an admin
  // impersonates this talent): a small card, and only when it has something to
  // say (`showsSessionCard`).
  let planning = $derived(data.planning);

  // The one thing the blue hero suggests doing now, or null on a day with
  // nothing to suggest (`pickHomeHero`, server-side).
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
    if (minigame.ok)
      return { publication: minigame.publication, attempt: null };
    if (minigame.reason !== 'already_played' || !minigame.lastAttempt)
      return null;
    return { publication: minigame.publication, attempt: minigame.lastAttempt };
  });

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
      if (document.visibilityState === 'visible') void invalidateAll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  });
</script>

<svelte:head>
  <title>Tableau de bord</title>
</svelte:head>

{#if showXpFloat}
  <XpFloat amount={floatAmount} />
{/if}

<!-- Minigame finish + rank-bonus floats, shared with the leaderboard so the
     celebration follows the player to whichever page they open after a game. -->
<MinigameRewardCelebration
  baseReward={data.minigameReward}
  rankReward={data.minigameRankReward}
/>

<!-- Activity XP, celebrated when the talent comes back to this tab. One float for
     everything that arrived since the last acknowledgement, which may well be an
     evening's worth of steps. -->
<WorkshopRewardCelebration reward={data.workshopReward} />

<div class="flex min-h-screen flex-col">
  <!-- Same app bar as every talent page; the greeting is the only thing the
       dashboard adds to it (it drops to its own line on mobile via the lead
       slot's wrapping rules). -->
  <TalentPageHeader>
    {#snippet lead()}
      <h1
        class="truncate font-heading text-display-s text-foreground sm:text-display-m"
      >
        Salut, <span class="text-epi-blue">{student?.prenom}</span> 👋
      </h1>
    {/snippet}
  </TalentPageHeader>

  <div class="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
    {#each data.pendingFeedback as pf (pf.formId)}
      <div class="mb-4">
        <FeedbackBanner
          eventId={pf.eventId}
          formId={pf.formId}
          personaIconUrl={pf.personaIconUrl}
        />
      </div>
    {/each}

    {#snippet dailyTraining()}
      {#if training}
        <div class="order-3">
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
           parcours », the day's training that feeds it, their next session).
           RIGHT COLUMN: what Jump suggests (the hero, the campus's news).
           Two columns from `lg` only: at a tablet's width a third of the
           page is too narrow for the XP card.
           On a day Jump suggests nothing, there is no right column: the
           talent's cards take the width, the XP card beside the training and
           the session, rather than a column left empty.
           Below `lg` every wrapper collapses (display: contents) so the cards
           join the outer grid as siblings and `order-*` interleaves them:
           hero, XP, training, Actualités, session. `order` is inert in two
           columns (block children, not flex/grid items). -->
      <div
        class={cn(
          'contents',
          suggestsSomething
            ? 'lg:col-span-4 lg:block lg:space-y-6'
            : 'lg:col-span-12 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6',
        )}
        in:fly={{ x: -20, duration: 400, delay: 200 }}
      >
        <a
          href={resolve('/parcours')}
          class="group order-2 block cursor-pointer rounded-xl border border-border bg-card p-6 shadow-raised transition-ui active:scale-[0.98] lg:col-span-4"
        >
          <div class="flex flex-col items-center text-center">
            <div
              class="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-epi-together-ink/10"
            >
              <Trophy class="h-7 w-7 text-epi-together" />
            </div>

            <div>
              <span class="text-5xl font-bold tracking-tighter text-foreground">
                {student?.xp || 0}
              </span>
              <span class="text-lg font-bold text-epi-together">XP</span>
            </div>
            <!-- The way into everything the home no longer lists: the
                 activities left to do (counted here), the finished ones, the
                 events attended, the XP history. -->
            <span
              class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground transition-ui group-hover:bg-epi-blue/10 group-hover:text-epi-blue dark:group-hover:bg-epi-blue/20"
            >
              <Route class="h-3 w-3" />
              Mon parcours
              {#if data.toDoCount > 0}
                <span
                  class="inline-flex min-w-5 items-center justify-center rounded-full bg-epi-blue px-1.5 text-xs font-bold text-white"
                  aria-hidden="true">{data.toDoCount}</span
                >
                <span class="sr-only">
                  , {data.toDoCount}
                  {data.toDoCount > 1 ? 'activités' : 'activité'} à faire
                </span>
              {/if}
              <ArrowRight
                class="h-3 w-3 transition-transform group-hover:translate-x-0.5"
              />
            </span>
          </div>
        </a>

        {#if training || showsSessionCard(planning)}
          <div
            class={cn(
              'contents lg:block lg:space-y-6',
              !suggestsSomething && 'lg:col-span-8',
            )}
          >
            {@render dailyTraining()}

            {#if showsSessionCard(planning)}
              <!-- The talent's own next session, or the way into a running
                   stage's schedule. Last on a phone: the hero already says
                   what to do today. -->
              <div class="order-5">
                <SessionCard {planning} timeZone={data.timeZone} />
              </div>
            {/if}
          </div>
        {/if}
      </div>

      {#if suggestsSomething}
        <div
          class="contents lg:col-span-8 lg:block lg:space-y-6"
          in:fly={{ x: 20, duration: 400, delay: 300 }}
        >
          {#if hero}
            <!-- Where Jump says what to do now: the head of the right column,
                 level with the XP card, and first of all on a phone. -->
            <div class="order-1">
              <TalentHomeHero {hero} />
            </div>
          {/if}

          {#if data.note}
            <div class="order-4">
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
