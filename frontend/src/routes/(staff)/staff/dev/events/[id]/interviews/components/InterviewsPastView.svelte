<script lang="ts">
  import { resolve } from '$app/paths';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import * as Card from '$lib/components/ui/card';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import EventKpiTile from '../../components/EventKpiTile.svelte';
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
  import XCircle from '@lucide/svelte/icons/x-circle';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import Star from '@lucide/svelte/icons/star';
  import RecommendationChip from './RecommendationChip.svelte';
  import InterviewTable from './InterviewTable.svelte';
  import {
    INTERVIEW_RECOMMENDATIONS,
    recommendationDescriptor,
  } from '$lib/domain/interview';
  import type { InterviewRecommendation, StaffRole } from '@prisma/client';
  import type { InterviewWithRelations } from '../+page.server';

  type Props = {
    event: { id: string; titre: string };
    timezone: string;
    bounds: { startOfDay: string };
    scope: 'all' | 'self';
    interviews: InterviewWithRelations[];
    noInterviewParticipations: any[];
    interviewers: {
      id: string;
      name: string;
      role: StaffRole;
      count: number;
    }[];
    kpis: {
      done: number;
      cancelled: number;
      missed: number;
      noInterview: number;
      dominantReco: InterviewRecommendation | null;
    };
    recoDistribution: Record<InterviewRecommendation | 'unset', number>;
    openGrid: (iv: InterviewWithRelations) => void;
  };

  let {
    event,
    timezone,
    bounds,
    scope,
    interviews,
    noInterviewParticipations,
    interviewers,
    kpis,
    recoDistribution,
    openGrid,
  }: Props = $props();

  let interviewerRoleById = $derived(
    new Map(interviewers.map((i) => [i.id, i.role])),
  );

  let totalReco = $derived(
    Object.values(recoDistribution).reduce((sum, v) => sum + v, 0),
  );

  let recoBars = $derived(
    (Object.keys(INTERVIEW_RECOMMENDATIONS) as InterviewRecommendation[]).map(
      (key) => {
        const desc = INTERVIEW_RECOMMENDATIONS[key];
        const count = recoDistribution[key] ?? 0;
        const pct = totalReco === 0 ? 0 : Math.round((count / totalReco) * 100);
        return { key, label: desc.label, tone: desc.tone, count, pct };
      },
    ),
  );

  let dominant = $derived(recommendationDescriptor(kpis.dominantReco));
</script>

<div class="space-y-6 pb-10">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/dev') },
      {
        label: event.titre,
        href: resolve(`/staff/dev/events/${event.id}`),
      },
      { label: 'Entretiens' },
    ]}
  />

  <PageHeader
    title="Entretiens"
    subtitle={scope === 'self'
      ? `Mes entretiens menés · ${event.titre}`
      : `Bilan · ${event.titre}`}
  />

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
    <EventKpiTile
      label="Menés"
      value={kpis.done}
      icon={CheckCircle2}
      tone="teal"
      sub="Grilles complétées"
    />
    <EventKpiTile
      label="Manqués"
      value={kpis.missed}
      icon={AlertCircle}
      tone={kpis.missed > 0 ? 'orange' : 'neutral'}
      sub="Planifiés non clôturés"
    />
    <EventKpiTile
      label="Annulés"
      value={kpis.cancelled}
      icon={XCircle}
      tone="neutral"
      sub="Statut « cancelled »"
    />
    <EventKpiTile
      label="Sans entretien"
      value={kpis.noInterview}
      icon={AlertCircle}
      tone={kpis.noInterview > 0 ? 'pink' : 'neutral'}
      sub="Inscrits non rencontrés"
    />
  </div>

  <Card.Root class="rounded-sm">
    <Card.Header class="pb-3">
      <Card.Title
        class="flex items-center gap-2 font-heading text-base tracking-wide uppercase"
      >
        <Star class="h-4 w-4 text-epi-orange" />
        Recommandations
      </Card.Title>
      <Card.Description class="text-xs">
        {#if dominant}
          Recommandation dominante : <span class="font-bold"
            >{dominant.label}</span
          >
        {:else}
          Aucune recommandation enregistrée pour le moment.
        {/if}
      </Card.Description>
    </Card.Header>
    <Card.Content class="space-y-3">
      {#each recoBars as bar (bar.key)}
        <div class="space-y-1">
          <div class="flex items-center justify-between gap-2">
            <RecommendationChip value={bar.key} variant="full" />
            <span
              class="font-mono text-[10px] text-muted-foreground tabular-nums"
            >
              {bar.count}{#if totalReco}<span class="opacity-60">
                  · {bar.pct}%</span
                >{/if}
            </span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full bg-epi-blue transition-[width] duration-700"
              style="width: {bar.pct}%"
            ></div>
          </div>
        </div>
      {/each}
      {#if recoDistribution.unset > 0}
        <p
          class="pt-2 text-[10px] tracking-widest text-muted-foreground uppercase"
        >
          {recoDistribution.unset} entretien(s) menés sans recommandation renseignée
        </p>
      {/if}
    </Card.Content>
  </Card.Root>

  <div>
    <h2 class="mb-3 font-heading text-lg tracking-wide uppercase">
      Tous les entretiens
    </h2>
    <InterviewTable
      {interviews}
      {timezone}
      bounds={{ startOfDay: bounds.startOfDay }}
      canMutate={false}
      canReassign={false}
      {interviewerRoleById}
      onOpenGrid={openGrid}
      onOpenReassign={() => undefined}
    />
  </div>

  {#if noInterviewParticipations.length > 0 && scope === 'all'}
    <Card.Root class="rounded-sm border-orange-200">
      <Card.Header class="pb-3">
        <Card.Title
          class="flex items-center gap-2 font-heading text-base tracking-wide uppercase"
        >
          <AlertCircle class="h-4 w-4 text-epi-orange" />
          Inscrits non rencontrés
        </Card.Title>
        <Card.Description class="text-xs">
          {noInterviewParticipations.length} inscrit(s) n'ont pas eu d'entretien
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {#each noInterviewParticipations as p (p.id)}
            <a
              href={resolve(`/staff/dev/students/${p.talent.id}`)}
              class="flex items-center gap-2 rounded-sm border p-2 transition-colors hover:border-epi-orange"
            >
              <TalentAvatar talent={p.talent} size="sm" />
              <span class="truncate text-xs font-bold uppercase">
                {p.talent.nom} <span class="capitalize">{p.talent.prenom}</span>
              </span>
            </a>
          {/each}
        </div>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
