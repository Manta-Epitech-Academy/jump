<script lang="ts">
  import type { Component } from 'svelte';
  import FileText from '@lucide/svelte/icons/file-text';
  import Camera from '@lucide/svelte/icons/camera';
  import Laptop from '@lucide/svelte/icons/laptop';
  import CohortHealthBar from './CohortHealthBar.svelte';
  import KpiTile, { type KpiTone } from '$lib/components/staff/KpiTile.svelte';
  import type { DocFilterKey, OnboardingFilterKey } from '../filters';

  let {
    total,
    ready,
    incomplete,
    none,
    charteCount,
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
    imageCount: number;
    pcCount: number;
    activeFilter: OnboardingFilterKey;
    onDocCardClick: (key: DocFilterKey) => void;
  } = $props();

  type CardSpec = {
    key: DocFilterKey;
    label: string;
    Icon: Component<{ class?: string }>;
    value: number;
    /** When unset, the tile renders the bare number; otherwise `value/total`. */
    total?: number;
    progressPct: number;
    sub: string;
    tone: KpiTone;
    helpText?: string;
  };

  // Charte / Droit à l'image are validation docs (signed = good,
  // headline = ok/total). PC is logistics — "X PC à préparer" — not a
  // missing doc; a talent without their own laptop isn't blocked, we just
  // need to plan for it. The PC card keeps the click-to-filter behaviour
  // (?filter=pc-missing) so staff can still slice the list to "who needs a
  // PC".
  const docCard = (spec: Omit<CardSpec, 'sub' | 'progressPct'>): CardSpec => {
    const ok = spec.value;
    const t = spec.total ?? total;
    const missing = Math.max(0, t - ok);
    const complete = t > 0 && ok === t;
    return {
      ...spec,
      progressPct: t === 0 ? 0 : (ok / t) * 100,
      sub: complete ? 'Tous validés' : `${missing} à finaliser`,
    };
  };

  const pcCard = $derived<CardSpec>({
    key: 'pc-missing',
    label: 'PC à préparer',
    Icon: Laptop,
    value: total - pcCount,
    progressPct: total === 0 ? 0 : (pcCount / total) * 100,
    sub:
      total === 0
        ? '—'
        : pcCount === total
          ? 'Toute la cohorte est autonome'
          : `${pcCount}/${total} apporteront leur PC`,
    tone: 'teal',
  });

  const cards: CardSpec[] = $derived([
    docCard({
      key: 'charte-missing',
      label: 'Règlement intérieur',
      Icon: FileText,
      value: charteCount,
      total,
      tone: 'blue',
      helpText:
        'Signé en ligne par le talent depuis son espace personnel, à la dernière étape de son onboarding. Cochez manuellement uniquement en cas de signature papier.',
    }),
    docCard({
      key: 'image-rights-missing',
      label: "Droit à l'image",
      Icon: Camera,
      value: imageCount,
      total,
      tone: 'pink',
      helpText:
        'Autorisation parentale pour les photos/vidéos du stage. Demandée automatiquement par email aux parents à la création du compte. Cochez manuellement uniquement en cas de retour papier.',
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

  <div class="grid grid-cols-2 gap-3 lg:grid-cols-3">
    {#each cards as card (card.key)}
      <KpiTile
        label={card.label}
        helpText={card.helpText}
        value={card.value}
        total={card.total}
        icon={card.Icon}
        progress={card.progressPct}
        sub={card.sub}
        tone={card.tone}
        onclick={() => onDocCardClick(card.key)}
        pressed={activeFilter === card.key}
      />
    {/each}
  </div>
</section>
