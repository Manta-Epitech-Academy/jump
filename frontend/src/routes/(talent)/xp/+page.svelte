<script lang="ts">
  import type { PageData } from './$types';
  import { fly } from 'svelte/transition';
  import TalentPageHeader from '$lib/components/talent/TalentPageHeader.svelte';
  import TalentFooter from '$lib/components/talent/TalentFooter.svelte';
  import { xpHistoryLabel } from '$lib/domain/xpStory';
  import { toDateKey } from '$lib/domain/eventPresence';
  import Trophy from '@lucide/svelte/icons/trophy';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import Medal from '@lucide/svelte/icons/medal';
  import Award from '@lucide/svelte/icons/award';
  import Wrench from '@lucide/svelte/icons/wrench';
  import PartyPopper from '@lucide/svelte/icons/party-popper';
  import Zap from '@lucide/svelte/icons/zap';
  import type { Component } from 'svelte';

  let { data }: { data: PageData } = $props();

  // -- Source display config --------------------------------------------------

  // Presentation only (icon + colours per source). The human label for each grant
  // is the single shared `xpHistoryLabel`, so the talent timeline and the dev
  // fiche XP story always read the same wording for the same fact.
  type SourceConfig = {
    icon: Component<{ class?: string }>;
    color: string; // tailwind color token (e.g. "epi-together")
    bgClass: string;
    textClass: string;
    borderClass: string;
  };

  const SOURCE_CONFIG: Record<string, SourceConfig> = {
    onboarding: {
      icon: PartyPopper,
      color: 'epi-blue',
      bgClass: 'bg-epi-blue/10 dark:bg-epi-blue/20',
      textClass: 'text-epi-blue',
      borderClass: 'border-epi-blue/20',
    },
    onboarding_early_bird: {
      icon: Zap,
      color: 'amber',
      bgClass: 'bg-warning/10',
      textClass: 'text-warning',
      borderClass: 'border-warning/20',
    },
    minigame: {
      icon: Gamepad2,
      color: 'epi-tech',
      bgClass: 'bg-epi-tech-ink/10 dark:bg-epi-tech-ink/20',
      textClass: 'text-epi-tech-ink',
      borderClass: 'border-epi-tech-ink/20',
    },
    minigame_rank: {
      icon: Medal,
      color: 'purple',
      bgClass: 'bg-epi-tomorrow-ink/10',
      textClass: 'text-epi-tomorrow-ink',
      borderClass: 'border-epi-tomorrow-ink/20',
    },
    reward: {
      icon: Award,
      color: 'emerald',
      bgClass: 'bg-success/10',
      textClass: 'text-success',
      borderClass: 'border-success/20',
    },
    admin_adjustment: {
      icon: Wrench,
      color: 'slate',
      bgClass: 'bg-muted-foreground/10',
      textClass: 'text-muted-foreground',
      borderClass: 'border-border/20',
    },
  };

  const fallbackConfig: SourceConfig = {
    icon: Sparkles,
    color: 'slate',
    bgClass: 'bg-muted',
    textClass: 'text-muted-foreground',
    borderClass: 'border-border',
  };

  function getConfig(source: string): SourceConfig {
    return SOURCE_CONFIG[source] ?? fallbackConfig;
  }

  let totalXp = $derived(data.talent?.xp ?? 0);

  // -- Grouping by date -------------------------------------------------------

  type Grant = (typeof data.grants)[number];
  type GroupedDay = {
    dateKey: string;
    label: string;
    total: number;
    grants: Grant[];
  };

  // Calendar-day key in the talent's timezone (resolved server-side and passed
  // as `data.timeZone`), shared with the rest of the portal via `toDateKey`. An
  // explicit zone keeps SSR and the browser on the same day; an ambient
  // `new Date()` would split a near-midnight grant across a UTC pod and the
  // browser and hydrate with a flash.
  const dayKey = (d: Date): string => toDateKey(d, data.timeZone);

  // "Aujourd'hui" / "Hier" for the two most recent days, full date before that.
  // Recent grants are the common case, so the relative label reads faster than a
  // date the talent has to decode.
  function dayLabel(instant: Date, dateKey: string): string {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateKey === dayKey(now)) return "Aujourd'hui";
    if (dateKey === dayKey(yesterday)) return 'Hier';
    return instant.toLocaleDateString('fr-FR', {
      timeZone: data.timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  let groupedDays = $derived.by(() => {
    const map = new Map<string, Grant[]>();
    for (const g of data.grants) {
      const key = dayKey(new Date(g.createdAt));
      const list = map.get(key);
      if (list) list.push(g);
      else map.set(key, [g]);
    }
    const days: GroupedDay[] = [];
    for (const [dateKey, grants] of map) {
      days.push({
        dateKey,
        // Any grant from this day is a valid instant to render the day label in
        // `data.timeZone`; reconstructing a date from the key would re-introduce
        // an ambient-zone round-trip.
        label: dayLabel(new Date(grants[0].createdAt), dateKey),
        total: grants.reduce((sum, g) => sum + g.amount, 0),
        grants,
      });
    }
    return days;
  });

  // Honest sign: every live source is positive today, but an `admin_adjustment`
  // can be negative (its label already branches on sign), so never hard-print a
  // `+` that would render `+-30`.
  const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

  function formatTime(date: Date | string): string {
    return new Date(date).toLocaleTimeString('fr-FR', {
      timeZone: data.timeZone,
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>

<svelte:head>
  <title>Mon XP</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
  <TalentPageHeader title="Mon XP" icon={Trophy} />

  <div class="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
    <!-- Hero: current XP total + stats -->
    <div
      class="mb-8 overflow-hidden rounded-xl border border-border bg-card shadow-raised"
      in:fly={{ y: -20, duration: 400 }}
    >
      <div class="flex items-center gap-4 px-5 py-4 sm:gap-5 sm:px-6">
        <!-- XP badge -->
        <div
          class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-epi-together/10 ring-2 ring-epi-together/30 dark:bg-epi-together/20"
        >
          <div class="text-center">
            <div class="text-xl font-bold tracking-tighter text-foreground">
              {totalXp}
            </div>
            <div class="epi-overline text-epi-together">XP</div>
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <h2 class="text-base font-bold text-foreground">
            Points d'expérience
          </h2>
          <p class="text-sm text-muted-foreground">
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
          class="absolute top-0 bottom-0 left-5 w-px bg-gradient-to-b from-epi-blue/40 via-epi-together/20 to-transparent sm:left-6"
        ></div>

        <div class="space-y-8">
          {#each groupedDays as day, dayIndex (day.dateKey)}
            <!-- Day header -->
            <div class="relative flex items-center gap-3 pl-10 sm:pl-12">
              <h3
                class="text-xs font-bold tracking-wide text-muted-foreground uppercase"
              >
                {day.label}
              </h3>
              <span class="text-xs font-semibold text-epi-together">
                {signed(day.total)} XP
              </span>
            </div>

            <!-- Grants for this day -->
            <div
              class="ml-[1.125rem] space-y-3 border-l border-transparent pl-8 sm:ml-[1.375rem]"
            >
              {#each day.grants as grant, grantIndex (grant.id)}
                {@const config = getConfig(grant.source)}
                {@const Icon = config.icon}
                {@const label = xpHistoryLabel(
                  grant.source,
                  grant.amount,
                  grant.rewardName,
                  'talent',
                )}
                <div
                  class="group relative overflow-hidden rounded-xl border {config.borderClass} bg-card p-4 shadow-raised transition-ui hover:shadow-raised"
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
                        <span class="text-sm font-semibold text-foreground">
                          {label}
                        </span>
                      </div>
                      <div
                        class="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <span>{formatTime(grant.createdAt)}</span>
                      </div>
                    </div>

                    <!-- XP amount -->
                    <div
                      class="shrink-0 rounded-xl {config.bgClass} px-3 py-1.5 text-center"
                    >
                      <span class="text-lg font-bold {config.textClass}">
                        {signed(grant.amount)}
                      </span>
                      <span class="epi-overline {config.textClass}"> XP </span>
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
            class="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background ring-2 ring-border sm:h-12 sm:w-12"
          >
            <Sparkles class="h-4 w-4 text-muted-foreground" />
          </div>
          <p class="text-sm text-muted-foreground">
            Début de ton aventure Jump
          </p>
        </div>
      </div>
    {:else}
      <!-- Empty state -->
      <div
        class="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-background/50 p-12 text-center"
      >
        <Trophy class="mb-4 h-8 w-8 text-muted-foreground" />
        <h3 class="text-lg font-bold text-foreground-secondary">
          Pas encore d'XP
        </h3>
        <p class="mt-2 max-w-sm text-sm text-muted-foreground">
          Tes premiers gains d'XP apparaîtront ici. Commence par terminer ton
          onboarding !
        </p>
      </div>
    {/if}
  </div>

  <TalentFooter />
</div>
