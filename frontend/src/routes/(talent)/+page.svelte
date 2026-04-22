<script lang="ts">
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { resolve } from '$app/paths';
  import { fly } from 'svelte/transition';
  import { toast } from 'svelte-sonner';
  import { page } from '$app/state';
  import { triggerConfetti } from '$lib/actions/confetti';
  import {
    formatDateFr,
    flattenActivityMissions,
    THEME_TIER_CEILING,
  } from '$lib/utils';
  import { activityTypeLabels } from '$lib/validation/templates';
  import {
    Rocket,
    Trophy,
    BookOpen,
    ArrowRight,
    Clock,
    Coffee,
    Hourglass,
    MapPin,
    Share2,
    ExternalLink,
    Check,
    FileDown,
    LoaderCircle,
    LogOut,
    History,
    Calendar,
    Target,
    CalendarClock,
    Laptop,
    Monitor,
    Settings,
  } from '@lucide/svelte';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import DiscordLinkBanner from '$lib/components/DiscordLinkBanner.svelte';
  import ProfileCompletionBanner from '$lib/components/ProfileCompletionBanner.svelte';

  let { data }: { data: PageData } = $props();

  let student = $derived(data.student);
  let participation = $derived(data.participation);
  let upcomingParticipation = $derived(data.upcomingParticipation);
  let hasCompletedEvents = $derived(data.hasCompletedEvents);

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

  // Sharing Logic
  let copied = $state(false);
  let shareUrl = $derived(`${page.url.origin}${resolve(`/p/${student?.id}`)}`);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
      toast.success('Lien copié dans le presse-papier !');
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (err) {
      toast.error('Erreur lors de la copie du lien.');
    }
  }

  // PDF Download Logic
  let isDownloading = $state(false);

  async function downloadCertificate() {
    isDownloading = true;
    try {
      const res = await fetch(resolve('/api/certificate'));
      if (!res.ok) throw new Error('Erreur réseau');

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
      toast.success('Attestation téléchargée !');
      triggerConfetti();
    } catch (e) {
      toast.error("Erreur lors de la génération de l'attestation.");
    } finally {
      isDownloading = false;
    }
  }
</script>

<svelte:head>
  <title>Cockpit</title>
</svelte:head>

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
        <form action="{resolve('/logout')}?type=student" method="POST">
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

  {#if !student?.discordId}
    <div
      class="fixed right-4 bottom-4 left-4 z-50 mx-auto max-w-lg"
      in:fly={{ y: 20, duration: 300, delay: 150 }}
    >
      <DiscordLinkBanner />
    </div>
  {/if}

  {#if !student?.phone}
    <div class="mb-6" in:fly={{ y: -10, duration: 300, delay: 175 }}>
      <ProfileCompletionBanner />
    </div>
  {/if}

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

          <!-- Public Profile Share Section -->
          <div
            class="mt-6 w-full space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800"
          >
            <h3 class="text-xs font-bold text-slate-400 uppercase">
              Mon Profil Public
            </h3>
            <div class="flex flex-col gap-2">
              <Button
                variant="outline"
                class="w-full justify-between rounded-xl border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300"
                onclick={copyLink}
              >
                <span class="truncate text-xs">{shareUrl}</span>
                {#if copied}
                  <Check class="ml-2 h-4 w-4 shrink-0 text-epi-teal-solid" />
                {:else}
                  <Share2 class="ml-2 h-4 w-4 shrink-0" />
                {/if}
              </Button>
              <Button
                variant="ghost"
                href={resolve(`/p/${student?.id}`)}
                target="_blank"
                class="w-full rounded-xl text-xs font-bold text-epi-blue hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                <ExternalLink class="mr-2 h-4 w-4" />
                Voir la page
              </Button>
            </div>
          </div>

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
              class="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase"
            >
              <MapPin class="h-4 w-4 text-epi-blue" />
              <span>{eventTitle}</span>
              <span class="text-slate-300 dark:text-slate-700">•</span>
              <Clock class="h-4 w-4" />
              <span>{formatTime(participation?.event?.date)}</span>
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
              class="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase dark:text-blue-400"
            >
              <CalendarClock class="h-4 w-4" />
              <span>Mission à venir</span>
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
