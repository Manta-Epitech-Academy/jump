<script lang="ts">
  import type { PageData } from './$types';
  import { dev } from '$app/environment';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { invalidateAll } from '$app/navigation';
  import { fly } from 'svelte/transition';
  import { triggerConfetti } from '$lib/actions/confetti';
  import { welcomeRewardToast } from '$lib/components/talent/rewardToast';
  import Rocket from '@lucide/svelte/icons/rocket';
  import Trophy from '@lucide/svelte/icons/trophy';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Route from '@lucide/svelte/icons/route';
  import Coffee from '@lucide/svelte/icons/coffee';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import FeedbackBanner from '$lib/components/feedback/FeedbackBanner.svelte';
  import NewsFeedCard, {
    type NewsFeedItem,
  } from '$lib/components/talent/NewsFeedCard.svelte';
  import TalentHomeHero from '$lib/components/talent/TalentHomeHero.svelte';
  import ActivitiesCard from '$lib/components/talent/ActivitiesCard.svelte';
  import SessionCard from '$lib/components/talent/SessionCard.svelte';
  import { showsSessionCard } from '$lib/domain/talentPlanning';
  import TalentPageHeader from '$lib/components/talent/TalentPageHeader.svelte';
  import TalentFooter from '$lib/components/talent/TalentFooter.svelte';
  import XpFloat from '$lib/components/talent/XpFloat.svelte';
  import MinigameRewardCelebration from '$lib/components/talent/MinigameRewardCelebration.svelte';
  import WorkshopRewardCelebration from '$lib/components/talent/WorkshopRewardCelebration.svelte';
  import { onMount } from 'svelte';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';

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
  // and a refresh can't replay it. We fire the XP float + welcome toast and
  // highlight the Actualités card so it's easy to find. No modal pops: the card
  // surfaces the welcome message inline (the /welcome splash is a separate
  // earlier greeting).
  let welcomeHighlight = $state(false);
  onMount(() => {
    const arrival = data.onboardingArrival;
    if (!arrival) return;
    welcomeHighlight = true;

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

  // The campus's note and the event's welcome, in the Actualités feed.
  let newsItems = $derived<NewsFeedItem[]>([
    ...(data.note ? [{ kind: 'campus' as const, html: data.note }] : []),
    ...(data.welcome
      ? [{ kind: 'welcome' as const, html: data.welcome.content }]
      : []),
  ]);

  // The daily minigame is the row inside the "Entraînement du jour" card:
  // a distinct, accented row, playable or already-played, independent of any
  // event. The rich campus leaderboard now lives on the game's own page.
  let hasMinigame = $derived(
    !!data.minigame &&
      (data.minigame.ok || data.minigame.reason === 'already_played'),
  );
  let minigamePublication = $derived(data.minigame?.publication ?? null);
  let minigamePlayed = $derived(
    !!data.minigame &&
      !data.minigame.ok &&
      data.minigame.reason === 'already_played',
  );
  let minigameAttempt = $derived(
    data.minigame && !data.minigame.ok ? data.minigame.lastAttempt : null,
  );
  // A finalized attempt is either a win (`done`: ranked on the board, earned
  // XP) or a loss (`invalid`: played, but no XP and absent from the board).
  // The played card must tell these apart: a loss shown as "Défi relevé !"
  // reads as a win the talent never actually got.
  let minigameWon = $derived(minigameAttempt?.status === 'done');
  // Student-facing name for the daily minigame: the PO frames it as brain
  // training, not a "mini-jeu". Defined once so the played/unplayed branches
  // can't drift.
  const DAILY_TRAINING_LABEL = 'Entraîne ton cerveau';

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

  function formatChrono(ms: number | null): string {
    return ms === null ? '-' : `${(ms / 1000).toFixed(1)}s`;
  }
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

    <!-- The daily training, the one row of "Entraînement du jour": accented
         (gamepad, colour) and shaped as a row, nothing like the activities.
         Pre-play it's a "Commencer" CTA; once played it links to the campus
         leaderboard on the game's own page. -->
    {#snippet dailyTraining()}
      {#if hasMinigame && minigamePublication}
        <div class="relative">
          {#if minigamePlayed && minigameWon}
            <a
              href={resolve(`/minigames/${minigamePublication.id}/leaderboard`)}
              class="flex flex-col gap-3 rounded-xl border border-epi-tech-ink/30 bg-epi-tech-ink/5 p-4 transition-ui hover:bg-epi-tech-ink/10 active:scale-[0.99] sm:flex-row sm:items-center sm:gap-4"
            >
              <!-- icon + text stay a row on mobile; `sm:contents` dissolves this
                   wrapper on desktop so the CTA rejoins them on one line -->
              <div class="flex items-center gap-4 sm:contents">
                <div
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-epi-tech-ink/15"
                >
                  <Gamepad2 class="h-5 w-5 text-epi-tech-ink" />
                </div>
                <div class="min-w-0 flex-1">
                  <div
                    class="flex flex-wrap items-center gap-x-2 text-xs font-bold uppercase"
                  >
                    <span class="text-epi-tech-ink">{DAILY_TRAINING_LABEL}</span
                    >
                    <span class="text-muted-foreground">•</span>
                    <span class="text-muted-foreground">
                      {minigamePublication.gameName} · niveau {minigamePublication.level}
                    </span>
                  </div>
                  <p class="mt-0.5 text-sm font-semibold text-foreground">
                    Défi relevé !
                    {#if minigameAttempt && (minigameAttempt.score !== null || minigameAttempt.chrono !== null)}
                      <span class="font-normal text-muted-foreground">
                        {#if minigameAttempt.score !== null}{minigameAttempt.score}
                          pts{/if}{#if minigameAttempt.score !== null && minigameAttempt.chrono !== null}
                          ·
                        {/if}{#if minigameAttempt.chrono !== null}{formatChrono(
                            minigameAttempt.chrono,
                          )}{/if}
                      </span>
                    {/if}
                  </p>
                </div>
              </div>
              <span
                class="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-epi-tech-ink/15 px-3 py-1.5 text-xs font-bold text-epi-tech-ink uppercase sm:w-auto"
              >
                <Trophy class="h-4 w-4" /> Voir le classement
              </span>
            </a>
          {:else if minigamePlayed}
            <!-- Played but didn't validate the run: no XP, not on the board. Say
                 so honestly (amber, not the teal "win" treatment) rather than
                 congratulating a "Défi relevé !" that never happened. The attempt
                 is still spent, so the link goes to the board, not back to play. -->
            <a
              href={resolve(`/minigames/${minigamePublication.id}/leaderboard`)}
              class="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 transition-ui hover:bg-warning/10 active:scale-[0.99] sm:flex-row sm:items-center sm:gap-4"
            >
              <div class="flex items-center gap-4 sm:contents">
                <div
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-warning/15"
                >
                  <Gamepad2 class="h-5 w-5 text-warning" />
                </div>
                <div class="min-w-0 flex-1">
                  <div
                    class="flex flex-wrap items-center gap-x-2 text-xs font-bold uppercase"
                  >
                    <span class="text-warning">{DAILY_TRAINING_LABEL}</span>
                    <span class="text-muted-foreground">•</span>
                    <span class="text-muted-foreground">
                      {minigamePublication.gameName} · niveau {minigamePublication.level}
                    </span>
                  </div>
                  <p class="mt-0.5 text-sm font-semibold text-foreground">
                    Pas validé cette fois
                    <span class="font-normal text-muted-foreground"
                      >· retente demain</span
                    >
                  </p>
                </div>
              </div>
              <span
                class="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-warning/15 px-3 py-1.5 text-xs font-bold text-warning uppercase sm:w-auto"
              >
                <Trophy class="h-4 w-4" /> Voir le classement
              </span>
            </a>
          {:else}
            <a
              href={resolve(`/minigames/${minigamePublication.id}`)}
              class="flex flex-col gap-3 rounded-xl border border-epi-blue/20 bg-epi-blue/5 p-4 transition-ui hover:bg-epi-blue/10 active:scale-[0.99] sm:flex-row sm:items-center sm:gap-4 dark:border-epi-blue/30 dark:bg-epi-blue/10"
            >
              <div class="flex items-center gap-4 sm:contents">
                <div
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-epi-blue/10 dark:bg-epi-blue/20"
                >
                  <Gamepad2 class="h-5 w-5 text-epi-blue" />
                </div>
                <div class="min-w-0 flex-1">
                  <div
                    class="flex flex-wrap items-center gap-x-2 text-xs font-bold uppercase"
                  >
                    <span class="text-epi-blue">{DAILY_TRAINING_LABEL}</span>
                    <span class="text-muted-foreground">•</span>
                    <span class="text-muted-foreground">
                      {minigamePublication.gameName} · niveau {minigamePublication.level}
                    </span>
                  </div>
                  <p class="mt-0.5 text-sm font-semibold text-foreground">
                    Relève le défi du jour et grimpe au classement !
                  </p>
                </div>
              </div>
              <span
                class="inline-flex w-full shrink-0 items-center justify-center gap-1 rounded-xl bg-epi-blue px-3 py-1.5 text-sm font-bold text-white sm:w-auto"
              >
                Commencer <ArrowRight class="h-4 w-4" />
              </span>
            </a>
          {/if}
          {#if dev}
            <!-- Dev-only: flips today's attempt; out of flow, stripped in prod -->
            <form
              method="POST"
              action="?/devToggleMinigame"
              use:enhance
              class="absolute top-1.5 right-2"
            >
              <button
                type="submit"
                title="Dev : basculer l'état de l'entraînement du jour"
                class="epi-overline text-muted-foreground hover:text-epi-blue"
              >
                {minigamePlayed ? 'dev: reset' : 'dev: joué'}
              </button>
            </form>
          {/if}
        </div>
      {/if}
    {/snippet}

    <div class="grid grid-cols-1 gap-6 md:grid-cols-12">
      <!-- LEFT COLUMN: the talent's own standing (XP, the way into « Mon
           parcours ») and their next session when there is one.
           On mobile the wrapper collapses (display: contents) so its children
           join the outer grid as siblings and `order-*` can interleave them
           with the right column: hero, XP, Actualités, training, activities,
           session. `order` is inert on desktop (block children, not flex/grid
           items), so the two-column layout is untouched. -->
      <div
        class="contents md:col-span-4 md:block md:space-y-6"
        in:fly={{ x: -20, duration: 400, delay: 200 }}
      >
        <a
          href={resolve('/xp')}
          class="group relative order-2 block overflow-hidden rounded-xl border border-border bg-card p-6 shadow-raised transition-ui hover:shadow-raised active:scale-[0.98]"
        >
          <!-- Decorative background blur -->
          <div
            class="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-epi-together/10 blur-2xl"
          ></div>

          <div class="relative z-10 flex flex-col items-center text-center">
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
            <span
              class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground transition-ui group-hover:bg-epi-blue/10 group-hover:text-epi-blue dark:group-hover:bg-epi-blue/20"
            >
              <Route class="h-3 w-3" />
              Mon parcours
              <ArrowRight
                class="h-3 w-3 transition-transform group-hover:translate-x-0.5"
              />
            </span>
          </div>
        </a>

        {#if showsSessionCard(planning)}
          <!-- The talent's own next session, or the way into a running
               stage's schedule. Last on a phone: the hero already says what
               to do today. -->
          <div class="order-6">
            <SessionCard {planning} timeZone={data.timeZone} />
          </div>
        {/if}
      </div>

      <!-- RIGHT COLUMN: the hero, the Actualités feed, the daily training,
           then the activities left to do. -->
      <div
        class="contents md:col-span-8 md:block md:space-y-6"
        in:fly={{ x: 20, duration: 400, delay: 300 }}
      >
        {#if hero}
          <!-- Where Jump says what to do now: the head of the right column,
               level with the XP card, and first of all on a phone. -->
          <div class="order-1">
            <TalentHomeHero {hero} />
          </div>
        {/if}

        {#if newsItems.length > 0}
          <!-- The campus's word and the event's welcome, under the hero and
               above the training. -->
          <div class="order-3">
            <NewsFeedCard items={newsItems} highlight={welcomeHighlight} />
          </div>
        {/if}

        <!-- order-4: below Actualités, on a phone as on a desktop -->
        <div
          class="order-4 overflow-hidden rounded-xl border border-border bg-card shadow-raised"
        >
          <div
            class="flex items-center gap-2 border-b border-border bg-background/50 px-6 py-4"
          >
            <Rocket class="h-4 w-4 shrink-0 text-epi-blue" />
            <h2 class="font-heading text-display-s text-foreground">
              Entraînement du jour<TitleCursor />
            </h2>
          </div>

          <div class="space-y-4 p-6">
            {@render dailyTraining()}

            {#if !hasMinigame && hero}
              <!-- No training today, but the hero above has something to do:
                   say so in a line rather than « repos » under a suggestion. -->
              <p class="py-2 text-sm text-muted-foreground">
                Pas d’entraînement aujourd’hui : ce qui t’attend est en haut de
                la page.
              </p>
            {:else if !hasMinigame}
              <!-- Nothing at all today: no training, and nothing in the hero. -->
              <div
                class="flex flex-col items-center justify-center py-8 text-center"
              >
                <div class="mb-4 rounded-full bg-muted/50 p-4">
                  <Coffee class="h-8 w-8 text-muted-foreground" />
                </div>
                <h3
                  class="text-lg font-bold text-foreground-secondary uppercase"
                >
                  Repos aujourd’hui
                </h3>
                <p class="mt-2 max-w-sm text-sm text-muted-foreground">
                  Pas d’entraînement aujourd’hui. Profites-en pour souffler, on
                  remet ça bientôt !
                </p>
              </div>
            {/if}
          </div>
        </div>

        {#if data.toDo.length > 0}
          <!-- What is left to do, carried on at home. Finished activities are
               history, and live in « Mon parcours ». -->
          <div class="order-5">
            <ActivitiesCard title="Mes activités" activities={data.toDo} />
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Footer: what Jump is, pinned to the bottom of the page -->
  <TalentFooter />
</div>
