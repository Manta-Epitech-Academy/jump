<script lang="ts">
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { resolve } from '$app/paths';
  import { fly } from 'svelte/transition';
  import { toast } from 'svelte-sonner';
  import { triggerConfetti } from '$lib/actions/confetti';
  import {
    formatDateFr,
    flattenActivityMissions,
    THEME_TIER_CEILING,
  } from '$lib/utils';
  import { activityTypeLabels } from '$lib/validation/templates';
  import Rocket from '@lucide/svelte/icons/rocket';
  import Trophy from '@lucide/svelte/icons/trophy';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Clock from '@lucide/svelte/icons/clock';
  import Coffee from '@lucide/svelte/icons/coffee';
  import Hourglass from '@lucide/svelte/icons/hourglass';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Check from '@lucide/svelte/icons/check';
  import FileDown from '@lucide/svelte/icons/file-down';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import LogOut from '@lucide/svelte/icons/log-out';
  import History from '@lucide/svelte/icons/history';
  import Calendar from '@lucide/svelte/icons/calendar';
  import Target from '@lucide/svelte/icons/target';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import Laptop from '@lucide/svelte/icons/laptop';
  import Monitor from '@lucide/svelte/icons/monitor';
  import Settings from '@lucide/svelte/icons/settings';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import Mail from '@lucide/svelte/icons/mail';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import ActivitySummaryDialog from '$lib/components/talent/ActivitySummaryDialog.svelte';
  import { onMount, untrack } from 'svelte';
  import { track, errReason, secondsBetween } from '$lib/analytics';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  let { data }: { data: PageData } = $props();

  type PreviewActivity = {
    id: string;
    nom: string;
    description?: string | null;
    activityType: string;
    difficulte?: string | null;
    isDynamic: boolean;
  };
  let previewSlot = $state<{
    startTime: Date | string;
    endTime: Date | string;
    activity: PreviewActivity | null;
  } | null>(null);
  let previewOpen = $state(false);
  $effect(() => {
    if (!previewOpen) previewSlot = null;
  });

  // Init from server timestamp so SSR + client hydration match.
  // onMount refreshes to real browser time.
  let nowTime = $state(untrack(() => new Date(data.serverNow)));
  onMount(() => {
    nowTime = new Date();
    const i = setInterval(() => (nowTime = new Date()), 60_000);
    return () => clearInterval(i);
  });

  // Welcome celebration after onboarding completion
  let showXpFloat = $state(false);
  onMount(() => {
    if (page.url.searchParams.has('welcome')) {
      // Clean URL without reloading
      history.replaceState({}, '', page.url.pathname);

      // Sequence: confetti → XP float → toast
      setTimeout(() => {
        triggerConfetti();
        showXpFloat = true;
      }, 300);
      setTimeout(() => {
        showXpFloat = false;
      }, 2500);
      setTimeout(() => {
        toast('Bienvenue sur Jump !', {
          description:
            'Tu gagnes +50 XP pour ton arrivée sur la plateforme. Les XP reflètent ta progression — tu en gagneras en participant aux activités !',
          duration: 12000,
          style:
            'background: var(--color-epi-blue); color: white; border: none; border-radius: 1rem; box-shadow: 0 8px 30px rgb(1 58 251 / 0.2);',
        });
      }, 1000);
    }
  });

  let student = $derived(data.student);
  let participation = $derived(data.participation);
  let upcomingParticipation = $derived(data.upcomingParticipation);
  let hasCompletedEvents = $derived(data.hasCompletedEvents);
  let todayIsMultiDay = $derived(data.todayIsMultiDay);
  let upcomingIsMultiDay = $derived(data.upcomingIsMultiDay);

  function isStageUpcoming(
    event:
      | { eventType?: string | null; date?: string | Date | null }
      | null
      | undefined,
  ) {
    if (!event || event.eventType !== 'stage_seconde' || !event.date)
      return false;
    return new Date(event.date) > nowTime;
  }
  let hideTodayCalendarLink = $derived(isStageUpcoming(participation?.event));
  let hideUpcomingCalendarLink = $derived(
    isStageUpcoming(upcomingParticipation?.event),
  );

  let levelLabel = $derived(
    student?.level === 'Expert'
      ? 'Expert ✦'
      : student?.level === 'Apprentice'
        ? 'Apprenti'
        : 'Novice',
  );

  let xpProgress = $derived(Math.min(((student?.xp || 0) / 1000) * 100, 100));

  let eventTitle = $derived(participation?.event?.titre || 'Atelier Epitech');
  let timeSlots = $derived(participation?.event?.planning?.timeSlots ?? []);
  let completedActivityIds = $derived(new Set(data.completedActivityIds));

  let previewMissions = $derived(
    flattenActivityMissions(data.pastParticipations).slice(0, 2),
  );
  let totalPastMissions = $derived(data.totalPastMissions);

  // RPG Aspect : Top Skills
  let topThemes = $derived(data.topThemes);

  function formatTime(dateString: string | Date | undefined) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const difficultyColors: Record<string, string> = {
    Débutant:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    Intermédiaire:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    Avancé:
      'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  };

  // PDF Download Logic
  let isDownloading = $state(false);

  async function downloadCertificate() {
    const ctx = {
      eventId: participation?.event?.id ?? null,
      eventType: participation?.event?.eventType ?? null,
      xpAtDownload: student?.xp ?? null,
    };
    track('certificate_download_clicked', ctx);
    isDownloading = true;
    try {
      const res = await fetch(resolve('/api/certificate'));
      if (!res.ok) throw new Error(`http_${res.status}`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const disposition = res.headers.get('Content-Disposition');
      let filename = 'Attestation_Jump.pdf';
      if (disposition && disposition.includes('filename=')) {
        filename = disposition.split('filename=')[1].replace(/"/g, '');
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      track('certificate_downloaded', ctx);
      toast.success('Attestation téléchargée !');
      triggerConfetti();
    } catch (e) {
      track('certificate_download_failed', { ...ctx, reason: errReason(e) });
      toast.error("Erreur lors de la génération de l'attestation.");
    } finally {
      isDownloading = false;
    }
  }
</script>

<svelte:head>
  <title>Cockpit</title>
</svelte:head>

{#if showXpFloat}
  <div
    class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
  >
    <div
      class="animate-xp-float text-4xl font-bold text-epi-orange drop-shadow-lg"
    >
      +50 XP
    </div>
  </div>
{/if}

<div class="mx-auto max-w-5xl px-4 py-8 pb-20 sm:py-12">
  <!-- HEADER: Greeting & Context -->
  <header class="mb-8" in:fly={{ y: -20, duration: 400, delay: 100 }}>
    <div class="flex items-center gap-2">
      <div
        class="flex flex-1 flex-col items-center gap-2 text-center sm:flex-row sm:text-left"
      >
        <div
          class="flex h-16 w-16 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-xl shadow-epi-blue/20"
        >
          <Rocket class="h-8 w-8" />
        </div>
        <div class="sm:ml-4">
          <h1
            class="font-heading text-4xl tracking-tight text-slate-900 uppercase dark:text-white"
          >
            Salut, <span class="text-epi-blue">{student?.prenom}</span> 👋
          </h1>
          <p class="font-bold text-slate-500 uppercase">
            Bienvenue dans ton cockpit.
          </p>
          {#if data.hasWelcomePage}
            <a
              href={resolve('/welcome')}
              class="mt-1 inline-flex items-center gap-1 text-sm text-epi-blue hover:underline"
            >
              <Mail class="h-3.5 w-3.5" />
              Revoir le message de bienvenue
            </a>
          {/if}
        </div>
      </div>
      <div class="flex items-center gap-1">
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
    </div>
  </header>

  <div class="grid gap-6 md:grid-cols-12">
    <!-- LEFT COLUMN: Stats & Profile -->
    <div class="md:col-span-4" in:fly={{ x: -20, duration: 400, delay: 200 }}>
      <div
        class="relative overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
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

          <!-- Mini-jeu du jour -->
          {#if data.minigame}
            {@const mg = data.minigame}
            {#if mg.ok || (mg.publication && mg.reason === 'already_played')}
              <div
                class="mt-6 w-full space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800"
              >
                <h3
                  class="flex items-center justify-center gap-2 text-xs font-bold text-slate-400 uppercase"
                >
                  <Gamepad2 class="h-4 w-4 text-epi-teal-solid" />
                  Mini-jeu du jour
                </h3>
                {#if mg.ok}
                  <div class="text-center">
                    <p
                      class="text-sm font-bold text-slate-800 capitalize dark:text-slate-200"
                    >
                      {mg.publication.game} · niveau {mg.publication.level}
                    </p>
                    <Button
                      href={resolve(`/minigames/${mg.publication.id}`)}
                      class="mt-2 w-full bg-epi-teal-solid text-white hover:bg-epi-teal-solid/90"
                    >
                      Jouer
                    </Button>
                  </div>
                {:else if mg.reason === 'already_played' && mg.publication}
                  <div class="space-y-2 text-center">
                    <p
                      class="text-sm font-bold text-slate-800 dark:text-slate-200"
                    >
                      Déjà joué !
                    </p>
                    {#if mg.lastAttempt}
                      <p class="text-xs text-slate-500 dark:text-slate-400">
                        {#if mg.lastAttempt.score !== null && mg.lastAttempt.score !== undefined}
                          Score : {mg.lastAttempt.score}
                        {/if}
                        {#if mg.lastAttempt.chrono}
                          {#if mg.lastAttempt.score !== null && mg.lastAttempt.score !== undefined}·{/if}
                          {(mg.lastAttempt.chrono / 1000).toFixed(1)}s
                        {/if}
                      </p>
                    {/if}
                    <Button
                      variant="outline"
                      href={resolve(
                        `/minigames/${mg.publication.id}/leaderboard`,
                      )}
                      class="w-full"
                    >
                      <Trophy class="mr-2 h-4 w-4" /> Classement
                    </Button>
                  </div>
                {/if}
              </div>
            {/if}
          {/if}

          <!-- RPG Skill Radar / Top Themes -->
          {#if topThemes.length > 0}
            <div
              class="mt-6 w-full space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800"
            >
              <h3
                class="flex items-center justify-center gap-2 text-xs font-bold text-slate-400 uppercase"
              >
                <Target class="h-4 w-4 text-epi-teal-solid" /> Spécialités
              </h3>
              <div class="flex flex-col gap-3">
                {#each topThemes as theme}
                  <div class="space-y-1">
                    <div
                      class="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300"
                    >
                      <span class="truncate pr-2">{theme.name}</span>
                      <span class="shrink-0 text-epi-teal-solid"
                        >{theme.label}</span
                      >
                    </div>
                    <div
                      class="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                      role="progressbar"
                      aria-valuenow={Math.min(theme.count, THEME_TIER_CEILING)}
                      aria-valuemin={0}
                      aria-valuemax={THEME_TIER_CEILING}
                      aria-label="{theme.name} : {theme.label}"
                    >
                      <div
                        class="h-full rounded-full bg-epi-teal-solid transition-all duration-1000 ease-out"
                        style="width: {Math.min(
                          (theme.count / THEME_TIER_CEILING) * 100,
                          100,
                        )}%"
                      ></div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- PDF Download Section -->
          {#if hasCompletedEvents}
            <div
              class="mt-4 w-full space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800"
            >
              <h3 class="text-xs font-bold text-slate-400 uppercase">
                Mes Documents
              </h3>
              <Button
                variant="secondary"
                class="h-auto w-full rounded-xl bg-blue-50/80 py-2.5 text-xs font-bold text-epi-blue transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40"
                onclick={downloadCertificate}
                disabled={isDownloading}
              >
                {#if isDownloading}
                  <LoaderCircle class="mr-2 h-4 w-4 shrink-0 animate-spin" />
                  <span class="truncate">Génération...</span>
                {:else}
                  <FileDown class="mr-2 h-4 w-4 shrink-0" />
                  <span class="truncate">Attestation Parcoursup</span>
                {/if}
              </Button>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- RIGHT COLUMN: Today's Mission & History -->
    <div class="md:col-span-8" in:fly={{ x: 20, duration: 400, delay: 300 }}>
      <!-- Today's Mission -->
      <h2
        class="mb-4 font-heading text-xl text-slate-800 uppercase dark:text-slate-200"
      >
        Mission du jour<span class="text-epi-teal">_</span>
      </h2>

      {#if participation}
        <div
          class="overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
        >
          <div
            class="border-b border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div
              class="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500 uppercase"
            >
              <MapPin class="h-4 w-4 text-epi-blue" />
              <span>{eventTitle}</span>
              <span class="text-slate-300 dark:text-slate-700">•</span>
              <Clock class="h-4 w-4" />
              <span>{formatTime(participation?.event?.date)}</span>
              {#if todayIsMultiDay && !hideTodayCalendarLink}
                <a
                  href={resolve('/calendar')}
                  class="ml-auto inline-flex items-center gap-1 text-xs font-bold text-epi-blue normal-case hover:underline"
                >
                  Voir le calendrier <ArrowRight class="h-3 w-3" />
                </a>
              {/if}
            </div>
          </div>

          <div class="p-6">
            {#if timeSlots.length > 0}
              <!-- Compact Timeline -->
              <div class="space-y-4">
                {#each timeSlots as slot (slot.id)}
                  <div>
                    <div class="mb-2 flex items-center gap-2">
                      <Clock class="h-3.5 w-3.5 shrink-0 text-epi-blue" />
                      <span
                        class="text-[11px] font-bold text-slate-400 uppercase"
                      >
                        {formatTime(slot.startTime)} — {formatTime(
                          slot.endTime,
                        )}
                      </span>
                    </div>

                    <div
                      class="ml-5 space-y-1.5 border-l-2 border-slate-100 pl-3 dark:border-slate-800"
                    >
                      {#if slot.activity}
                        {@const activity = slot.activity}
                        {@const isDone = completedActivityIds.has(activity.id)}
                        {@const hasStarted =
                          new Date(slot.startTime).getTime() <=
                          nowTime.getTime()}
                        {#if hasStarted}
                          <a
                            href={resolve(`/${activity.id}`)}
                            class="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all hover:bg-slate-50 active:scale-[0.99] dark:hover:bg-slate-800/50 {isDone
                              ? 'bg-epi-teal-solid/10'
                              : ''}"
                          >
                            <Badge
                              variant="outline"
                              class="shrink-0 text-[9px] font-bold uppercase"
                            >
                              {activityTypeLabels[activity.activityType] ??
                                activity.activityType}
                            </Badge>
                            <span
                              class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white"
                            >
                              {activity.nom}
                            </span>
                            {#if activity.difficulte}
                              <span
                                class="hidden shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold sm:inline {difficultyColors[
                                  activity.difficulte
                                ] ?? ''}"
                              >
                                {activity.difficulte}
                              </span>
                            {/if}
                            {#if isDone}
                              <Check
                                class="h-4 w-4 shrink-0 text-epi-teal-solid"
                              />
                            {:else}
                              <ArrowRight
                                class="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600"
                              />
                            {/if}
                          </a>
                        {:else}
                          <button
                            type="button"
                            class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left opacity-70 transition-all hover:bg-slate-50 hover:opacity-100 dark:hover:bg-slate-800/50"
                            aria-label="{activity.nom} — aperçu"
                            onclick={() => {
                              previewSlot = {
                                startTime: slot.startTime,
                                endTime: slot.endTime,
                                activity,
                              };
                              previewOpen = true;
                            }}
                          >
                            <Badge
                              variant="outline"
                              class="shrink-0 text-[9px] font-bold uppercase"
                            >
                              {activityTypeLabels[activity.activityType] ??
                                activity.activityType}
                            </Badge>
                            <span
                              class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white"
                            >
                              {activity.nom}
                            </span>
                            {#if activity.difficulte}
                              <span
                                class="hidden shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold sm:inline {difficultyColors[
                                  activity.difficulte
                                ] ?? ''}"
                              >
                                {activity.difficulte}
                              </span>
                            {/if}
                            <span
                              class="shrink-0 text-[9px] font-bold text-slate-400 uppercase"
                            >
                              À venir
                            </span>
                          </button>
                        {/if}
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <!-- Event exists but no planning/activities yet -->
              <div
                class="flex flex-col items-center justify-center py-12 text-center"
              >
                <div
                  class="mb-4 rounded-full bg-slate-100 p-4 dark:bg-slate-800"
                >
                  <Hourglass class="h-8 w-8 animate-pulse text-epi-blue" />
                </div>
                <h3 class="text-lg font-bold text-slate-900 dark:text-white">
                  Le planning arrive...
                </h3>
                <p class="mt-2 max-w-sm text-sm text-slate-500">
                  Le Manta est en train de préparer ta mission. Patiente
                  quelques instants, la page se mettra à jour.
                </p>
              </div>
            {/if}
          </div>
        </div>
      {:else if upcomingParticipation}
        <!-- Upcoming Event -->
        <div
          class="flex min-h-62.5 flex-col overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-xl shadow-blue-900/5 dark:border-blue-900/30 dark:bg-slate-900 dark:shadow-none"
        >
          <div
            class="border-b border-blue-50 bg-blue-50/50 px-6 py-4 dark:border-blue-900/20 dark:bg-blue-950/20"
          >
            <div
              class="flex flex-wrap items-center gap-2 text-xs font-bold text-blue-600 uppercase dark:text-blue-400"
            >
              <CalendarClock class="h-4 w-4" />
              <span>Mission à venir</span>
              {#if upcomingIsMultiDay && !hideUpcomingCalendarLink}
                <a
                  href={resolve('/calendar')}
                  class="ml-auto inline-flex items-center gap-1 text-xs font-bold text-epi-blue normal-case hover:underline"
                >
                  Voir le calendrier <ArrowRight class="h-3 w-3" />
                </a>
              {/if}
            </div>
          </div>
          <div
            class="flex flex-1 flex-col items-center justify-center p-6 text-center"
          >
            <div class="mb-4 rounded-full bg-blue-50 p-4 dark:bg-blue-900/20">
              <Rocket class="h-8 w-8 text-epi-blue" />
            </div>
            <h3 class="text-xl font-bold text-slate-900 dark:text-white">
              {upcomingParticipation.event?.titre || 'Atelier Epitech'}
            </h3>
            <p class="mt-2 max-w-md text-sm text-slate-500">
              Ta prochaine session est prévue le <strong
                class="text-slate-700 dark:text-slate-300"
                >{formatDateFr(upcomingParticipation.event?.date)}</strong
              >
              à
              <strong class="text-slate-700 dark:text-slate-300"
                >{formatTime(upcomingParticipation.event?.date)}</strong
              >.
            </p>

            <div class="mt-6 flex gap-3">
              {#if upcomingParticipation.bringPc}
                <div
                  class="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-bold text-orange-700 dark:border-orange-900/30 dark:bg-orange-900/20 dark:text-orange-400"
                >
                  <Laptop class="h-4 w-4 shrink-0" />
                  <span>N'oublie pas d'apporter ton PC !</span>
                </div>
              {:else}
                <div
                  class="flex items-center gap-2 rounded-xl border border-epi-teal-solid/30 bg-epi-teal-solid/10 px-4 py-2 text-sm font-bold text-epi-teal-solid"
                >
                  <Monitor class="h-4 w-4 shrink-0" />
                  <span>Le matériel sera fourni sur place.</span>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {:else}
        <!-- No event today AND no upcoming event -->
        <div
          class="flex min-h-62.5 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/50"
        >
          <div class="mb-4 rounded-full bg-slate-200/50 p-4 dark:bg-slate-800">
            <Coffee class="h-8 w-8 text-slate-400" />
          </div>
          <h3
            class="text-lg font-bold text-slate-700 uppercase dark:text-slate-300"
          >
            Repos aujourd'hui
          </h3>
          <p class="mt-2 max-w-sm text-sm text-slate-500">
            Aucun atelier n'est planifié pour toi. Profites-en pour te reposer
            ou revoir tes anciens projets dans ton portfolio !
          </p>
        </div>
      {/if}

      <!-- Past Missions (History) - compact preview -->
      {#if previewMissions.length > 0}
        <div class="mt-6 flex items-center justify-between">
          <h2
            class="flex items-center gap-2 font-heading text-sm text-slate-800 uppercase dark:text-slate-200"
          >
            <History class="h-4 w-4 text-epi-blue" />
            Missions précédentes<span class="text-epi-teal">_</span>
          </h2>
          {#if totalPastMissions > 2}
            <Button
              variant="ghost"
              size="sm"
              href={resolve('/history')}
              class="text-xs font-bold text-epi-blue hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              Voir tout ({totalPastMissions})
              <ArrowRight class="ml-1 h-3 w-3" />
            </Button>
          {/if}
        </div>
        <div class="mt-3 grid gap-4 sm:grid-cols-2">
          {#each previewMissions as mission}
            <div
              class="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-epi-blue/30 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div class="mb-4">
                <div
                  class="mb-2 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase"
                >
                  <Calendar class="h-3 w-3" />
                  {formatDateFr(mission.eventDate)}
                </div>
                <h3
                  class="line-clamp-2 font-normal text-slate-900 dark:text-white"
                >
                  {mission.activity.nom}
                </h3>
              </div>
              {#if mission.activity.isDynamic}
                <Button
                  variant="outline"
                  href={resolve(`/${mission.activity.id}`)}
                  class="w-full gap-2 rounded-xl border-slate-200 transition-colors group-hover:border-epi-blue group-hover:bg-epi-blue group-hover:text-white dark:border-slate-800 dark:group-hover:border-epi-blue dark:group-hover:bg-epi-blue dark:group-hover:text-white"
                >
                  <BookOpen class="h-4 w-4" /> Revoir la mission
                </Button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<ActivitySummaryDialog bind:open={previewOpen} slot={previewSlot} />
