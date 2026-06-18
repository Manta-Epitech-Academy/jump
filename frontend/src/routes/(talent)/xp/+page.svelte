<script lang="ts">
  import type { PageData } from './$types';
  import { fly } from 'svelte/transition';
  import TalentPageHeader from '$lib/components/talent/TalentPageHeader.svelte';
  import TalentFooter from '$lib/components/talent/TalentFooter.svelte';
  import Trophy from '@lucide/svelte/icons/trophy';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import Medal from '@lucide/svelte/icons/medal';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Wrench from '@lucide/svelte/icons/wrench';
  import Rocket from '@lucide/svelte/icons/rocket';
  import Zap from '@lucide/svelte/icons/zap';
  import type { Component } from 'svelte';

  let { data }: { data: PageData } = $props();

  // -- Source display config --------------------------------------------------

  type SourceConfig = {
    label: string;
    icon: Component<{ class?: string }>;
    color: string; // tailwind color token (e.g. "epi-orange")
    bgClass: string;
    textClass: string;
    borderClass: string;
  };

  const SOURCE_CONFIG: Record<string, SourceConfig> = {
    onboarding: {
      label: 'Onboarding terminé',
      icon: Rocket,
      color: 'epi-blue',
      bgClass: 'bg-epi-blue/10 dark:bg-epi-blue/20',
      textClass: 'text-epi-blue',
      borderClass: 'border-epi-blue/20',
    },
    onboarding_early_bird: {
      label: 'Bonus early bird',
      icon: Zap,
      color: 'amber',
      bgClass: 'bg-amber-500/10 dark:bg-amber-500/20',
      textClass: 'text-amber-500',
      borderClass: 'border-amber-500/20',
    },
    minigame: {
      label: 'Entraînement cérébral',
      icon: Gamepad2,
      color: 'epi-teal',
      bgClass: 'bg-epi-teal-solid/10 dark:bg-epi-teal-solid/20',
      textClass: 'text-epi-teal-solid',
      borderClass: 'border-epi-teal-solid/20',
    },
    minigame_rank: {
      label: 'Bonus classement',
      icon: Medal,
      color: 'purple',
      bgClass: 'bg-purple-500/10 dark:bg-purple-500/20',
      textClass: 'text-purple-500',
      borderClass: 'border-purple-500/20',
    },
    activity_presence: {
      label: 'Activité complétée',
      icon: BookOpen,
      color: 'epi-orange',
      bgClass: 'bg-epi-orange/10 dark:bg-epi-orange/20',
      textClass: 'text-epi-orange',
      borderClass: 'border-epi-orange/20',
    },
    admin_adjustment: {
      label: 'Ajustement',
      icon: Wrench,
      color: 'slate',
      bgClass: 'bg-slate-500/10 dark:bg-slate-500/20',
      textClass: 'text-slate-500',
      borderClass: 'border-slate-500/20',
    },
  };

  const fallbackConfig: SourceConfig = {
    label: 'XP',
    icon: Sparkles,
    color: 'slate',
    bgClass: 'bg-slate-100 dark:bg-slate-800',
    textClass: 'text-slate-500',
    borderClass: 'border-slate-200',
  };

  function getConfig(source: string): SourceConfig {
    return SOURCE_CONFIG[source] ?? fallbackConfig;
  }

  let totalXp = $derived(data.talent?.xp ?? 0);

  // -- Grouping by date -------------------------------------------------------

  type Grant = (typeof data.grants)[number];
  type GroupedDay = {
    dateKey: string;
    dayNumber: number;
    label: string;
    total: number;
    grants: Grant[];
  };

  let groupedDays = $derived.by(() => {
    const map = new Map<string, Grant[]>();
    for (const g of data.grants) {
      // Group by the talent's local calendar day, like the rest of the portal.
      // An ISO/UTC key buckets near-midnight grants onto the wrong day.
      const d = new Date(g.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const list = map.get(key);
      if (list) list.push(g);
      else map.set(key, [g]);
    }
    const days: GroupedDay[] = [];
    for (const [dateKey, grants] of map) {
      const date = new Date(dateKey + 'T12:00:00');
      days.push({
        dateKey,
        dayNumber: date.getDate(),
        label: date.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        total: grants.reduce((sum, g) => sum + g.amount, 0),
        grants,
      });
    }
    return days;
  });

  function formatTime(date: Date | string): string {
    return new Date(date).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>

<svelte:head>
  <title>Mon XP</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
  <TalentPageHeader
    title="Mon XP"
    subtitle="Ton parcours de progression."
    icon={Trophy}
  />

  <div class="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
    <!-- Hero: current XP total + stats -->
    <div
      class="mb-8 overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
      in:fly={{ y: -20, duration: 400 }}
    >
      <div class="flex items-center gap-4 px-5 py-4 sm:gap-5 sm:px-6">
        <!-- XP badge -->
        <div
          class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-epi-orange/10 ring-2 ring-epi-orange/30 dark:bg-epi-orange/20"
        >
          <div class="text-center">
            <div
              class="text-xl font-black tracking-tighter text-slate-900 dark:text-white"
            >
              {totalXp}
            </div>
            <div class="text-[9px] font-bold text-epi-orange uppercase">XP</div>
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <h2 class="text-base font-bold text-slate-900 dark:text-white">
            Points d'expérience
          </h2>
          <p class="text-sm text-slate-500">
            Chaque activité, entraînement et défi te rapproche du sommet.
          </p>
        </div>
      </div>
    </div>

    <!-- Timeline -->
    {#if groupedDays.length > 0}
      <div class="relative" in:fly={{ y: 20, duration: 400, delay: 200 }}>
        <!-- Vertical line -->
        <div
          class="absolute top-0 bottom-0 left-5 w-px bg-gradient-to-b from-epi-blue/40 via-epi-orange/20 to-transparent sm:left-6"
        ></div>

        <div class="space-y-8">
          {#each groupedDays as day, dayIndex (day.dateKey)}
            <!-- Day header -->
            <div class="relative flex items-center gap-4">
              <div
                class="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white ring-2 ring-slate-200 sm:h-12 sm:w-12 dark:bg-slate-900 dark:ring-slate-700"
              >
                <span
                  class="text-sm font-black text-slate-700 dark:text-slate-300"
                >
                  {day.dayNumber}
                </span>
              </div>
              <div>
                <h3
                  class="text-sm font-bold text-slate-700 capitalize dark:text-slate-300"
                >
                  {day.label}
                </h3>
                <span class="text-xs font-semibold text-epi-orange">
                  +{day.total} XP
                </span>
              </div>
            </div>

            <!-- Grants for this day -->
            <div
              class="ml-[1.125rem] space-y-3 border-l border-transparent pl-8 sm:ml-[1.375rem]"
            >
              {#each day.grants as grant, grantIndex (grant.id)}
                {@const config = getConfig(grant.source)}
                {@const Icon = config.icon}
                <div
                  class="group relative overflow-hidden rounded-2xl border {config.borderClass} bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-slate-900"
                  in:fly={{
                    x: -10,
                    duration: 300,
                    delay: Math.min(60 * grantIndex + 120 * dayIndex, 360),
                  }}
                >
                  <!-- Subtle gradient accent on the left -->
                  <div
                    class="absolute inset-y-0 left-0 w-1 {config.bgClass} opacity-60"
                  ></div>

                  <div class="flex items-center gap-3">
                    <!-- Source icon -->
                    <div
                      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl {config.bgClass}"
                    >
                      <Icon class="h-5 w-5 {config.textClass}" />
                    </div>

                    <!-- Label + time -->
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span
                          class="text-sm font-semibold text-slate-900 dark:text-white"
                        >
                          {config.label}
                        </span>
                      </div>
                      <div
                        class="mt-0.5 flex items-center gap-2 text-xs text-slate-400"
                      >
                        <span>{formatTime(grant.createdAt)}</span>
                      </div>
                    </div>

                    <!-- XP amount -->
                    <div
                      class="shrink-0 rounded-xl {config.bgClass} px-3 py-1.5 text-center"
                    >
                      <span class="text-lg font-black {config.textClass}">
                        +{grant.amount}
                      </span>
                      <span
                        class="text-[10px] font-bold {config.textClass} uppercase"
                      >
                        XP
                      </span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/each}
        </div>

        <!-- Timeline end marker -->
        <div class="relative mt-8 flex items-center gap-4">
          <div
            class="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 ring-2 ring-slate-200 sm:h-12 sm:w-12 dark:bg-slate-800 dark:ring-slate-700"
          >
            <Sparkles class="h-4 w-4 text-slate-400" />
          </div>
          <p class="text-sm text-slate-400">Début de ton aventure Jump</p>
        </div>
      </div>
    {:else}
      <!-- Empty state -->
      <div
        class="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/50"
      >
        <Trophy class="mb-4 h-8 w-8 text-slate-400" />
        <h3 class="text-lg font-bold text-slate-700 dark:text-slate-300">
          Pas encore d'XP
        </h3>
        <p class="mt-2 max-w-sm text-sm text-slate-500">
          Tes premiers gains d'XP apparaîtront ici. Commence par terminer ton
          onboarding !
        </p>
      </div>
    {/if}
  </div>

  <TalentFooter />
</div>
