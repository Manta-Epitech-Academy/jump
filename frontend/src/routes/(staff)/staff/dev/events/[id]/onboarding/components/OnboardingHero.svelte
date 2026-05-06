<script lang="ts">
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

  // Tryptique TECH/TOGETHER/TOMORROW + brand blue, one accent per doc:
  //   Charte           → blue  (admin paperwork)
  //   Convention       → orange (epi-together · parent / collab signature)
  //   Droit à l'image  → pink   (epi-tomorrow · vision / future-facing rights)
  //   PC personnel     → teal   (epi-tech · technical readiness)
  const cards: {
    key: DocFilterKey;
    label: string;
    Icon: typeof FileText;
    ok: number;
    themeKey: KpiThemeKey;
  }[] = $derived([
    {
      key: 'charte-missing',
      label: 'Charte',
      Icon: FileText,
      ok: charteCount,
      themeKey: 'blue',
    },
    {
      key: 'convention-missing',
      label: 'Convention de stage',
      Icon: ScrollText,
      ok: conventionCount,
      themeKey: 'orange',
    },
    {
      key: 'image-rights-missing',
      label: "Droit à l'image",
      Icon: Camera,
      ok: imageCount,
      themeKey: 'pink',
    },
    {
      key: 'pc-missing',
      label: 'PC personnel',
      Icon: Laptop,
      ok: pcCount,
      themeKey: 'teal',
    },
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
        ok={card.ok}
        {total}
        theme={KPI_THEMES[card.themeKey]}
        active={activeFilter === card.key}
        onToggle={() => onDocCardClick(card.key)}
      />
    {/each}
  </div>
</section>
