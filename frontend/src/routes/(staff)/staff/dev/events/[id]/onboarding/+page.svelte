<script lang="ts">
  import { untrack } from 'svelte';
  import Send from '@lucide/svelte/icons/send';
  import X from '@lucide/svelte/icons/x';
  import { resolve } from '$app/paths';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import EventSalesforceButton from '$lib/components/events/EventSalesforceButton.svelte';
  import Gated from '$lib/components/auth/Gated.svelte';
  import { cn } from '$lib/utils';
  import OnboardingTable from './components/OnboardingTable.svelte';
  import OnboardingHero from './components/OnboardingHero.svelte';
  import RelanceComposeDialog from '$lib/components/comms/RelanceComposeDialog.svelte';
  import {
    DOC_FILTER_KEYS,
    DOC_FILTER_LABELS,
    type DocFilterKey,
    type OnboardingFilterKey,
  } from './filters';
  import { countSignedDocs, isReady, TOTAL_DOCS } from './progress';
  import { defaultRelanceFor } from '$lib/domain/relanceTemplates';
  import {
    classifyRelanceSkip,
    formatTalentVars,
    type RelanceType,
    type RelanceVar,
  } from '$lib/domain/relance';
  import type { ComposeRecipient } from '$lib/components/comms/RelanceComposeDialog.svelte';
  import { track } from '$lib/analytics';

  let { data }: { data: PageData } = $props();

  let participations = $state(untrack(() => data.participations));
  $effect(() => {
    participations = data.participations;
  });

  let total = $derived(participations.length);
  let ready = $derived(participations.filter(isReady).length);
  let noneCount = $derived(
    participations.filter((p) => countSignedDocs(p) === 0).length,
  );
  let incompleteCount = $derived(total - ready - noneCount);
  let toComplete = $derived(total - ready);

  let charteCount = $derived(
    participations.filter((p) => p.stageCompliance?.charteSigned).length,
  );
  let imageCount = $derived(
    participations.filter((p) => p.stageCompliance?.imageRightsSigned).length,
  );
  let pcCount = $derived(participations.filter((p) => p.bringPc).length);

  let filter = $derived(data.filter);

  let isUpcoming = $derived(new Date(data.event.date).getTime() > Date.now());
  const proseDateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
  let openDateLabel = $derived(proseDateFmt.format(new Date(data.event.date)));

  const filteredParticipations = $derived.by(() => {
    if (filter === 'all') return participations;
    if (filter === 'incomplete')
      return participations.filter((p) => countSignedDocs(p) < TOTAL_DOCS);
    if (filter === 'charte-missing')
      return participations.filter((p) => !p.stageCompliance?.charteSigned);
    if (filter === 'image-rights-missing')
      return participations.filter(
        (p) => !p.stageCompliance?.imageRightsSigned,
      );
    if (filter === 'pc-missing')
      return participations.filter((p) => !p.bringPc);
    return participations;
  });

  let activeDocFilter = $derived(
    (DOC_FILTER_KEYS as readonly string[]).includes(filter)
      ? (filter as DocFilterKey)
      : null,
  );

  function changeFilter(next: OnboardingFilterKey) {
    const url = new URL(page.url);
    if (next === 'all') url.searchParams.delete('filter');
    else url.searchParams.set('filter', next);
    goto(url.toString(), { keepFocus: true, noScroll: true });
  }

  function onDocCardClick(key: DocFilterKey) {
    changeFilter(filter === key ? 'all' : key);
  }

  // Optimistic toggles
  const optimisticAdminToggle = (id: string, docType: string) => {
    return () => {
      const index = participations.findIndex((p) => p.id === id);
      if (index !== -1) {
        const compliance = (participations[index].stageCompliance ??= {
          charteSigned: false,
          imageRightsSigned: false,
          participationId: id,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        if (docType === 'charte')
          compliance.charteSigned = !compliance.charteSigned;
        if (docType === 'image')
          compliance.imageRightsSigned = !compliance.imageRightsSigned;
      }
      return async ({ update }: { update: () => Promise<void> }) => {
        await update();
      };
    };
  };

  const optimisticPcToggle = (id: string) => {
    return () => {
      const index = participations.findIndex((p) => p.id === id);
      if (index !== -1)
        participations[index].bringPc = !participations[index].bringPc;
      return async ({ update }: { update: () => Promise<void> }) => {
        await update();
      };
    };
  };

  // Selection (bulk) + relance composer state
  let selectedTalentIds = $state<Set<string>>(new Set());
  type ComposeState = {
    type: RelanceType;
    talentIds: string[];
  };
  let compose = $state<ComposeState | null>(null);
  let composeOpen = $state(false);

  function openCompose(type: RelanceType, talentIds: string[]) {
    if (talentIds.length === 0) return;
    compose = { type, talentIds };
    composeOpen = true;
  }

  function onRowRelance(talentId: string, type: RelanceType) {
    openCompose(type, [talentId]);
  }

  function buildRecipients(state: ComposeState): ComposeRecipient[] {
    const lookup = new Map(participations.map((p) => [p.talent.id, p]));
    return state.talentIds.map((id) => {
      const t = lookup.get(id)?.talent;
      if (!t) return { id, label: id };
      const vars = formatTalentVars(t);
      const willSkip = classifyRelanceSkip({
        type: state.type,
        talent: { ...t, email: t.email ?? t.user?.email ?? null },
        lastReminderAt: t.reminders?.[0]?.sentAt,
      });
      const label = `${vars.nom} ${vars.prenom}`.trim();
      return { id, label, willSkip };
    });
  }

  function buildPreviewVars(
    state: ComposeState,
  ): Partial<Record<RelanceVar, string>> {
    const first = participations.find(
      (p) => p.talent.id === state.talentIds[0],
    )?.talent;
    return first ? formatTalentVars(first) : {};
  }

  function toggleAllTalents() {
    const visibleIds = filteredParticipations.map((p) => p.talent.id);
    const allSelected = visibleIds.every((id) => selectedTalentIds.has(id));
    if (allSelected) {
      const next = new Set(selectedTalentIds);
      for (const id of visibleIds) next.delete(id);
      selectedTalentIds = next;
    } else {
      const next = new Set(selectedTalentIds);
      for (const id of visibleIds) next.add(id);
      selectedTalentIds = next;
    }
  }

  function toggleTalent(talentId: string) {
    const next = new Set(selectedTalentIds);
    if (next.has(talentId)) next.delete(talentId);
    else next.add(talentId);
    selectedTalentIds = next;
  }

  async function onSent() {
    if (compose) {
      track('adm_reminders_sent', {
        type: compose.type,
        count: compose.talentIds.length,
      });
    }
    selectedTalentIds = new Set();
    await invalidateAll();
  }
</script>

<svelte:head>
  <title>{data.event.titre} — Onboarding</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <PageBreadcrumb
    items={[
      {
        label: data.event.titre,
        href: resolve(`/staff/dev/events/${data.event.id}`),
      },
      { label: 'Onboarding' },
    ]}
  />
  <PageHeader title="Onboarding">
    <EventSalesforceButton externalId={data.event.externalId} />
  </PageHeader>

  {#if total === 0}
    <p class="text-sm text-muted-foreground">
      Aucun inscrit pour cet événement.
    </p>
  {:else}
    <p class="text-sm text-muted-foreground">
      <span class="font-bold text-foreground">
        <span class="font-mono">{ready}</span>
        / <span class="font-mono">{total}</span> dossier{total > 1 ? 's' : ''} prêt{ready >
        1
          ? 's'
          : ''}
      </span>
      {#if isUpcoming && toComplete > 0}
        — <span class="font-mono font-bold text-epi-orange">{toComplete}</span>
        à finaliser avant le {openDateLabel}.
      {:else if toComplete > 0}
        — <span class="font-mono font-bold text-epi-orange">{toComplete}</span> restent
        à compléter.
      {:else}
        — cohorte complète.
      {/if}
      {#if total - pcCount > 0}
        <span class="font-mono font-bold text-epi-teal-solid"
          >{total - pcCount}</span
        > PC à préparer.
      {/if}
    </p>

    <OnboardingHero
      {total}
      {ready}
      incomplete={incompleteCount}
      none={noneCount}
      {charteCount}
      {imageCount}
      {pcCount}
      activeFilter={filter}
      {onDocCardClick}
    />

    <!-- Reminder bulk actions -->
    <Gated group="devLead" mode="hide">
      <div
        class="flex items-center gap-3 rounded-sm border border-dashed border-border bg-muted/30 px-4 py-3"
      >
        <Send class="h-4 w-4 text-muted-foreground" />
        <span class="text-sm text-muted-foreground">
          {selectedTalentIds.size} sélectionné{selectedTalentIds.size > 1
            ? 's'
            : ''}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={selectedTalentIds.size === 0}
          onclick={() => openCompose('student', [...selectedTalentIds])}
        >
          <Send class="mr-2 h-3.5 w-3.5" />
          Relancer étudiants
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={selectedTalentIds.size === 0}
          onclick={() => openCompose('parent', [...selectedTalentIds])}
        >
          <Send class="mr-2 h-3.5 w-3.5" />
          Relancer parents
        </Button>
      </div>
    </Gated>

    <!-- Filter chips -->
    <div class="flex flex-wrap items-center gap-2">
      {#each [{ key: 'all' as const, label: 'Tous', count: total }, { key: 'incomplete' as const, label: 'Incomplet', count: total - ready }] as chip (chip.key)}
        {@const active = filter === chip.key}
        <button
          type="button"
          onclick={() => changeFilter(chip.key)}
          class={cn(
            'inline-flex cursor-pointer items-center gap-2 rounded-sm border px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase transition-colors',
            active
              ? 'border-epi-blue bg-epi-blue text-white'
              : 'border-border bg-card text-muted-foreground hover:border-epi-blue/50 hover:text-foreground',
          )}
          aria-pressed={active}
        >
          <span>{chip.label}</span>
          <span
            class={cn(
              'inline-flex min-w-5 justify-center rounded-sm px-1 font-mono text-[10px] tabular-nums',
              active
                ? 'bg-white/20 text-white'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {chip.count}
          </span>
        </button>
      {/each}

      {#if activeDocFilter}
        <span
          class="inline-flex items-center gap-2 rounded-sm border border-epi-blue/40 bg-epi-blue/10 px-2.5 py-1 text-[10px] font-bold tracking-widest text-epi-blue uppercase"
        >
          Filtre · {DOC_FILTER_LABELS[activeDocFilter]}
          <button
            type="button"
            onclick={() => changeFilter('all')}
            class="cursor-pointer rounded-sm hover:bg-epi-blue/20"
            aria-label="Retirer le filtre"
          >
            <X class="h-3 w-3" />
          </button>
        </span>
      {/if}
    </div>

    {#if filteredParticipations.length === 0}
      <div
        class="flex flex-col items-center justify-center gap-3 rounded-sm border border-dashed bg-muted/10 p-12 text-center"
      >
        <h3
          class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          Aucun résultat pour ce filtre
        </h3>
        <Button
          variant="outline"
          size="sm"
          onclick={() => changeFilter('all')}
          class="rounded-sm"
        >
          Réinitialiser le filtre
        </Button>
      </div>
    {:else}
      <OnboardingTable
        participations={filteredParticipations}
        {optimisticAdminToggle}
        {optimisticPcToggle}
        {selectedTalentIds}
        onToggleTalent={toggleTalent}
        onToggleAll={toggleAllTalents}
        {onRowRelance}
      />
    {/if}
  {/if}
</div>

{#if compose}
  <RelanceComposeDialog
    bind:open={composeOpen}
    type={compose.type}
    recipients={buildRecipients(compose)}
    formAction="?/sendRelance"
    initialForm={data.relanceForm}
    defaultTemplate={defaultRelanceFor(compose.type)}
    previewVars={buildPreviewVars(compose)}
    {onSent}
  />
{/if}
