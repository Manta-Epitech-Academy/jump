<script lang="ts">
  import type { PageData } from './$types';
  import { dev } from '$app/environment';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { resolve } from '$app/paths';
  import { fly } from 'svelte/transition';
  import { triggerConfetti } from '$lib/actions/confetti';
  import { welcomeRewardToast } from '$lib/components/talent/rewardToast';
  import { WELCOME_XP_BONUS, levelLabelFr } from '$lib/domain/xp';
  import {
    EVENT_TYPE_LABELS,
    minutesToHHMM,
    type EventType,
  } from '$lib/domain/event';
  import Rocket from '@lucide/svelte/icons/rocket';
  import Trophy from '@lucide/svelte/icons/trophy';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Coffee from '@lucide/svelte/icons/coffee';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import LogOut from '@lucide/svelte/icons/log-out';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import Settings from '@lucide/svelte/icons/settings';
  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import NewsFeedCard from '$lib/components/talent/NewsFeedCard.svelte';
  import TalentFooter from '$lib/components/talent/TalentFooter.svelte';
  import XpFloat from '$lib/components/talent/XpFloat.svelte';
  import MinigameRewardCelebration from '$lib/components/talent/MinigameRewardCelebration.svelte';
  import { onMount } from 'svelte';
  import { track, secondsBetween } from '$lib/analytics';
  import { page } from '$app/state';

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

  // Arrival celebration. Onboarding completion redirects here with the one-shot
  // `?welcome=1` signal; we fire the celebration and leave the Actualités card
  // highlighted so it's easy to find. No modal pops — the card surfaces the
  // welcome message inline (the /welcome splash earlier is a separate greeting).
  let welcomeHighlight = $state(false);
  onMount(() => {
    if (!page.url.searchParams.has('welcome')) return;
    // Clean URL without reloading so the celebration can't replay.
    history.replaceState({}, '', page.url.pathname);
    welcomeHighlight = true;

    // The boosted total (base + early-bird) is computed server-side; fall back
    // to the base if the arrival payload is somehow absent.
    const arrival = data.onboardingArrival;
    const totalXp = arrival?.totalXp ?? WELCOME_XP_BONUS;
    const earlyBirdBonus = arrival?.earlyBirdBonus ?? 0;

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
  let activeParticipation = $derived(data.activeParticipation);
  let upcomingParticipation = $derived(data.upcomingParticipation);

  let levelLabel = $derived(levelLabelFr(student?.xp ?? 0));

  let xpProgress = $derived(Math.min(((student?.xp || 0) / 1000) * 100, 100));

  let activeTypeLabel = $derived(
    activeParticipation
      ? (EVENT_TYPE_LABELS[activeParticipation.event?.eventType as EventType] ??
          activeParticipation.event?.titre ??
          'Activité')
      : '',
  );

  let upcomingTypeLabel = $derived(
    upcomingParticipation
      ? (EVENT_TYPE_LABELS[
          upcomingParticipation.event?.eventType as EventType
        ] ??
          upcomingParticipation.event?.titre ??
          'Atelier Epitech')
      : '',
  );

  // Wall-clock start time of the next session ("10:00"), shown only once a dev
  // has *confirmed* it (`startMinutes` set). We deliberately don't fall back to
  // the type default here: a confidently-wrong hour is worse for a student than
  // none, so until it's confirmed the talent sees the date alone (never the SF
  // `date`'s meaningless midnight). Staff see the default + a nag meanwhile.
  let upcomingStartTime = $derived(
    minutesToHHMM(upcomingParticipation?.event?.startMinutes),
  );

  // The daily minigame is the first mission inside the "Mission du jour" card —
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
  // Student-facing name for the daily minigame: the PO frames it as brain
  // training, not a "mini-jeu". Defined once so the played/unplayed branches
  // can't drift.
  const DAILY_TRAINING_LABEL = 'Entraîne ton cerveau';

  function formatChrono(ms: number | null): string {
    return ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`;
  }

  // Long, words-based date ("23 mai 2026") for the upcoming-session copy.
  function formatDateLong(date: Date | string | undefined): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
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

<div class="flex min-h-screen flex-col">
  <div class="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
    <!-- Header wraps on mobile: logo + controls share the top row, the greeting
         drops to its own full-width row below so a long name never truncates.
         From sm up it's a single row (logo · greeting … controls) as before. -->
    <header
      class="mb-6 flex flex-wrap items-center gap-x-3 gap-y-3 sm:flex-nowrap sm:gap-x-4"
      in:fly={{ y: -20, duration: 400, delay: 100 }}
    >
      <a href={resolve('/')} aria-label="Accueil" class="shrink-0">
        <EpitechLogo class="h-8 w-auto" />
      </a>
      <!-- Separates logo from greeting only when they share a row (sm+). -->
      <div
        class="hidden h-8 w-px shrink-0 bg-slate-200 sm:block dark:bg-slate-800"
        aria-hidden="true"
      ></div>
      <h1
        class="order-last w-full min-w-0 truncate font-heading text-2xl tracking-tight text-slate-900 uppercase sm:order-none sm:w-auto sm:text-3xl dark:text-white"
      >
        Salut, <span class="text-epi-blue">{student?.prenom}</span> 👋
      </h1>
      <div class="ml-auto flex shrink-0 items-center gap-1">
        <ModeToggle />
        <Button
          variant="ghost"
          size="icon"
          href={resolve('/settings')}
          class="h-8 w-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <Settings class="h-4 w-4" />
          <span class="sr-only">Paramètres</span>
        </Button>
        <form
          action="{resolve('/logout')}?type=student"
          method="POST"
          onsubmit={() =>
            track('logout', {
              kind: 'talent',
              sessionDurationSec: secondsBetween(
                page.data.session?.createdAt as Date | string | undefined,
              ),
            })}
        >
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            class="h-8 w-8 text-slate-400 hover:text-destructive"
          >
            <LogOut class="h-4 w-4" />
            <span class="sr-only">Déconnexion</span>
          </Button>
        </form>
      </div>
    </header>

    <!-- The daily minigame as the first "mission" of the day: same row language
         as the activities below, but accented (gamepad, colour) so it reads as
         a distinct kind of mission. Pre-play it's a "Commencer" CTA; once played
         it links to the campus leaderboard on the game's own page. -->
    {#snippet minigameMission()}
      {#if hasMinigame && minigamePublication}
        <div class="relative">
          {#if minigamePlayed}
            <a
              href={resolve(`/minigames/${minigamePublication.id}/leaderboard`)}
              class="flex flex-col gap-3 rounded-2xl border border-epi-teal-solid/30 bg-epi-teal-solid/5 p-4 transition-all hover:bg-epi-teal-solid/10 active:scale-[0.99] sm:flex-row sm:items-center sm:gap-4"
            >
              <!-- icon + text stay a row on mobile; `sm:contents` dissolves this
                   wrapper on desktop so the CTA rejoins them on one line -->
              <div class="flex items-center gap-4 sm:contents">
                <div
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-epi-teal-solid/15"
                >
                  <Gamepad2 class="h-5 w-5 text-epi-teal-solid" />
                </div>
                <div class="min-w-0 flex-1">
                  <div
                    class="flex flex-wrap items-center gap-x-2 text-xs font-bold uppercase"
                  >
                    <span class="text-epi-teal-solid"
                      >{DAILY_TRAINING_LABEL}</span
                    >
                    <span class="text-slate-300 dark:text-slate-700">•</span>
                    <span class="text-slate-500">
                      {minigamePublication.gameName} · niveau {minigamePublication.level}
                    </span>
                  </div>
                  <p
                    class="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    Défi relevé !
                    {#if minigameAttempt && (minigameAttempt.score !== null || minigameAttempt.chrono !== null)}
                      <span class="font-normal text-slate-500">
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
                class="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-epi-teal-solid/15 px-3 py-1.5 text-xs font-bold text-epi-teal-solid uppercase sm:w-auto"
              >
                <Trophy class="h-4 w-4" /> Voir le classement
              </span>
            </a>
          {:else}
            <a
              href={resolve(`/minigames/${minigamePublication.id}`)}
              class="flex flex-col gap-3 rounded-2xl border border-epi-blue/20 bg-epi-blue/5 p-4 transition-all hover:bg-epi-blue/10 active:scale-[0.99] sm:flex-row sm:items-center sm:gap-4 dark:border-epi-blue/30 dark:bg-epi-blue/10"
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
                    <span class="text-slate-300 dark:text-slate-700">•</span>
                    <span class="text-slate-500">
                      {minigamePublication.gameName} · niveau {minigamePublication.level}
                    </span>
                  </div>
                  <p
                    class="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white"
                  >
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
                class="text-[10px] font-bold tracking-wide text-slate-300 uppercase hover:text-epi-blue dark:text-slate-600"
              >
                {minigamePlayed ? 'dev: reset' : 'dev: joué'}
              </button>
            </form>
          {/if}
        </div>
      {/if}
    {/snippet}

    <div class="grid gap-6 md:grid-cols-12">
      <!-- LEFT COLUMN: profile + "Planning à venir" rail (next session, or a
           preview of tomorrow during a multi-day event).
           On mobile the wrapper collapses (display: contents) so its children
           join the outer grid as siblings and `order-*` can interleave them
           with the right column — keeping Actualités right under the profile
           card. `order` is inert on desktop (block children, not flex/grid
           items), so the two-column layout is untouched. -->
      <div
        class="contents md:col-span-4 md:block md:space-y-6"
        in:fly={{ x: -20, duration: 400, delay: 200 }}
      >
        <div
          class="relative order-1 overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
        >
          <!-- Decorative background blur -->
          <div
            class="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-epi-orange/10 blur-2xl"
          ></div>

          <div class="relative z-10 flex flex-col items-center text-center">
            <div
              class="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 dark:bg-orange-950/30"
            >
              <Trophy class="h-7 w-7 text-epi-orange" />
            </div>

            <Badge
              variant="outline"
              class="mb-3 border-orange-200 bg-orange-50 px-3 py-1 text-[10px] font-black tracking-widest text-orange-600 uppercase dark:border-orange-900/50 dark:bg-orange-900/20"
            >
              {levelLabel}
            </Badge>

            <div class="mb-4">
              <span
                class="text-5xl font-black tracking-tighter text-slate-900 dark:text-white"
              >
                {student?.xp || 0}
              </span>
              <span class="text-lg font-bold text-epi-orange">XP</span>
            </div>

            <!-- Custom Thick Progress Bar -->
            <div class="w-full space-y-2">
              <div
                class="flex justify-between text-[10px] font-bold text-slate-400 uppercase"
              >
                <span>Progression</span>
                <span>{Math.round(xpProgress)}%</span>
              </div>
              <div
                class="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
              >
                <div
                  class="h-full rounded-full bg-epi-orange transition-all duration-1000 ease-out"
                  style="width: {xpProgress}%"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Planning à venir: tomorrow's activities during a multi-day event,
             else the next upcoming session, else a quiet rest state. order-4
             keeps it last on mobile (after the mission card + history). -->
        <div
          class="order-4 overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
        >
          <div
            class="flex items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <CalendarClock class="h-4 w-4 shrink-0 text-epi-blue" />
            <h2
              class="font-heading text-base tracking-wider text-slate-800 uppercase dark:text-slate-200"
            >
              Planning à venir<span class="text-epi-teal">_</span>
            </h2>
          </div>

          <div class="p-6">
            {#if activeParticipation}
              <div
                class="flex flex-col items-center justify-center text-center"
              >
                <div
                  class="mb-4 rounded-full bg-blue-50 p-4 dark:bg-blue-900/20"
                >
                  <CalendarClock class="h-8 w-8 text-epi-blue" />
                </div>
                <h3 class="text-lg font-bold text-slate-900 dark:text-white">
                  {activeTypeLabel}
                </h3>
                <p class="mt-1 text-sm font-semibold text-epi-blue">En cours</p>
                <a
                  href={resolve('/calendar')}
                  class="mt-4 inline-flex items-center gap-1 text-xs font-bold text-epi-blue uppercase hover:underline"
                >
                  Voir le planning <ArrowRight class="h-3 w-3 shrink-0" />
                </a>
              </div>
            {:else if upcomingParticipation}
              <div
                class="flex flex-col items-center justify-center text-center"
              >
                <div
                  class="mb-4 rounded-full bg-blue-50 p-4 dark:bg-blue-900/20"
                >
                  <Rocket class="h-8 w-8 text-epi-blue" />
                </div>
                <h3 class="text-lg font-bold text-slate-900 dark:text-white">
                  {upcomingTypeLabel}
                </h3>
                <p class="mt-2 text-sm text-slate-500">
                  Ta prochaine session est prévue le<br /><strong
                    class="text-slate-700 dark:text-slate-300"
                    >{formatDateLong(upcomingParticipation.event?.date)}</strong
                  >{#if upcomingStartTime}{' '}à
                    <strong class="text-slate-700 dark:text-slate-300"
                      >{upcomingStartTime}</strong
                    >{/if}.
                </p>

                <a
                  href={resolve('/calendar')}
                  class="mt-4 inline-flex items-center gap-1 text-xs font-bold text-epi-blue uppercase hover:underline"
                >
                  Voir le planning <ArrowRight class="h-3 w-3 shrink-0" />
                </a>
              </div>
            {:else}
              <div
                class="flex flex-col items-center justify-center text-center"
              >
                <div
                  class="mb-4 rounded-full bg-slate-200/50 p-4 dark:bg-slate-800"
                >
                  <Coffee class="h-8 w-8 text-slate-400" />
                </div>
                <h3
                  class="text-base font-bold text-slate-700 uppercase dark:text-slate-300"
                >
                  Rien de prévu
                </h3>
                <p class="mt-2 text-sm text-slate-500">
                  Aucune session à venir pour le moment. On te préviendra ici
                  dès qu'il y a du nouveau !
                </p>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN: the day's missions (minigame first, then the event's
           activities), then the Actualités feed as the second element. -->
      <div
        class="contents md:col-span-8 md:block md:space-y-6"
        in:fly={{ x: 20, duration: 400, delay: 300 }}
      >
        <!-- order-3: sits below Actualités on mobile, with its history link -->
        <div
          class="order-3 overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
        >
          <div
            class="flex items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <Rocket class="h-4 w-4 shrink-0 text-epi-blue" />
            <h2
              class="font-heading text-base tracking-wider text-slate-800 uppercase dark:text-slate-200"
            >
              Mission du jour<span class="text-epi-teal">_</span>
            </h2>
          </div>

          <div class="space-y-4 p-6">
            {@render minigameMission()}

            {#if !hasMinigame}
              <!-- No event and no minigame: nothing to do today -->
              <div
                class="flex flex-col items-center justify-center py-8 text-center"
              >
                <div
                  class="mb-4 rounded-full bg-slate-200/50 p-4 dark:bg-slate-800"
                >
                  <Coffee class="h-8 w-8 text-slate-400" />
                </div>
                <h3
                  class="text-lg font-bold text-slate-700 uppercase dark:text-slate-300"
                >
                  Repos aujourd'hui
                </h3>
                <p class="mt-2 max-w-sm text-sm text-slate-500">
                  Aucun atelier n'est planifié pour toi. Profites-en pour te
                  reposer ou revoir tes anciens projets dans ton portfolio !
                </p>
              </div>
            {/if}
          </div>
        </div>

        {#if data.welcome}
          <!-- order-2: sits right under the profile card on mobile -->
          <div class="order-2">
            <NewsFeedCard
              welcomeContent={data.welcome.content}
              highlight={welcomeHighlight}
            />
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Footer: what Jump is — pinned to the bottom of the page -->
  <TalentFooter />
</div>
