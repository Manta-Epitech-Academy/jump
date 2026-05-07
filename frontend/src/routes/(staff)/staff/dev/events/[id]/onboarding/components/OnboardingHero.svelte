<script lang="ts">
  import type { Component } from 'svelte';
  import FileText from '@lucide/svelte/icons/file-text';
  import ScrollText from '@lucide/svelte/icons/scroll-text';
  import Camera from '@lucide/svelte/icons/camera';
  import Laptop from '@lucide/svelte/icons/laptop';
  import CohortHealthBar from './CohortHealthBar.svelte';
  import OnboardingKpiCard, {
    KPI_THEMES,
    type KpiThemeKey,
  } from './OnboardingKpiCard.svelte';
  import type { DocFilterKey, OnboardingFilterKey } from '../filters';

  let {
    total,
    ready,
    incomplete,
    none,
    charteCount,
    conventionCount,
    imageCount,
    pcCount,
    activeFilter,
    onDocCardClick,
  }: {
    total: number;
    ready: number;
    incomplete: number;
    none: number;
    charteCount: number;
    conventionCount: number;
    imageCount: number;
    pcCount: number;
    activeFilter: OnboardingFilterKey;
    onDocCardClick: (key: DocFilterKey) => void;
  } = $props();

  type CardSpec = {
    key: DocFilterKey;
    label: string;
    Icon: Component<{ class?: string }>;
    headlineValue: number;
    headlineTotal?: number;
    progressPct: number;
    complete: boolean;
    subLabel: string;
    themeKey: KpiThemeKey;
  };

  // Tryptique TECH/TOGETHER/TOMORROW + brand blue, one accent per card:
  //   Charte           → blue   (admin paperwork)
  //   Convention       → orange (epi-together · parent / collab signature)
  //   Droit à l'image  → pink   (epi-tomorrow · vision / future-facing rights)
  //   PC personnel     → teal   (epi-tech · technical readiness)
  //
  // The first three are validation docs (signed = good, headline = ok/total).
  // PC is reframed as "X PC à préparer" — logistics, not a missing doc; a
  // talent without their own laptop isn't blocked, we just need to plan
  // for it. The PC card keeps the click-to-filter behaviour (?filter=
  // pc-missing) so staff can still slice the list to "who needs a PC".
  const docCard = (
    spec: Omit<CardSpec, 'subLabel' | 'complete' | 'progressPct'>,
  ): CardSpec => {
    const ok = spec.headlineValue;
    const t = spec.headlineTotal ?? total;
    const missing = Math.max(0, t - ok);
    const complete = t > 0 && ok === t;
    return {
      ...spec,
      complete,
      progressPct: t === 0 ? 0 : (ok / t) * 100,
      subLabel: complete ? 'Tous validés' : `${missing} à finaliser`,
    };
  };

  const pcCard = $derived<CardSpec>({
    key: 'pc-missing',
    label: 'PC à préparer',
    Icon: Laptop,
    headlineValue: total - pcCount,
    progressPct: total === 0 ? 0 : (pcCount / total) * 100,
    complete: total > 0 && pcCount === total,
    subLabel:
      total === 0
        ? '—'
        : pcCount === total
          ? 'Toute la cohorte est autonome'
          : `${pcCount}/${total} apporteront leur PC`,
    themeKey: 'teal',
  });

  const cards: CardSpec[] = $derived([
    docCard({
      key: 'charte-missing',
      label: 'Charte',
      Icon: FileText,
      headlineValue: charteCount,
      headlineTotal: total,
      themeKey: 'blue',
    }),
    docCard({
      key: 'convention-missing',
      label: 'Convention de stage',
      Icon: ScrollText,
      headlineValue: conventionCount,
      headlineTotal: total,
      themeKey: 'orange',
    }),
    docCard({
      key: 'image-rights-missing',
      label: "Droit à l'image",
      Icon: Camera,
      headlineValue: imageCount,
      headlineTotal: total,
      themeKey: 'pink',
    }),
    pcCard,
  ]);
</script>

<section
  class="space-y-4 rounded-sm border border-border bg-card p-4 shadow-sm sm:p-5 dark:shadow-none"
>
  <div class="space-y-3">
    <h2
      class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
    >
      Cohorte
    </h2>
    <CohortHealthBar {ready} {incomplete} {none} />
  </div>

  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {#each cards as card (card.key)}
      <OnboardingKpiCard
        label={card.label}
        Icon={card.Icon}
        headlineValue={card.headlineValue}
        headlineTotal={card.headlineTotal}
        progressPct={card.progressPct}
        complete={card.complete}
        subLabel={card.subLabel}
        theme={KPI_THEMES[card.themeKey]}
        active={activeFilter === card.key}
        onToggle={() => onDocCardClick(card.key)}
      />
    {/each}
  </div>
</section>
