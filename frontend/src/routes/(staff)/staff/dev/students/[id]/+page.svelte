<script lang="ts">
  import type { PageData } from './$types';
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { toast } from 'svelte-sonner';

  import Send from '@lucide/svelte/icons/send';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import FileText from '@lucide/svelte/icons/file-text';

  import { Button } from '$lib/components/ui/button';
  import * as Tabs from '$lib/components/ui/tabs';

  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import GroupedTalentTimeline from '$lib/components/students/GroupedTalentTimeline.svelte';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import Gated from '$lib/components/auth/Gated.svelte';
  import TalentOtpDialog from '$lib/components/students/TalentOtpDialog.svelte';

  import StudentFormDialog from '../components/StudentFormDialog.svelte';
  import TalentProfileHero from './components/TalentProfileHero.svelte';
  import TalentStatStrip from './components/TalentStatStrip.svelte';
  import BadgesPanel from './components/BadgesPanel.svelte';
  import ProjectsRow from './components/ProjectsRow.svelte';
  import InterviewRecoCard from './components/InterviewRecoCard.svelte';
  import TalentPlatformAccountCard from './components/TalentPlatformAccountCard.svelte';
  import DossierAlertBanner from './components/DossierAlertBanner.svelte';
  import TalentInterestChips from './components/TalentInterestChips.svelte';
  import PresenceHeatmap from './components/PresenceHeatmap.svelte';
  import ContactCard from './components/ContactCard.svelte';
  import ComplianceDocsTable from './components/ComplianceDocsTable.svelte';
  import CommunicationsTimeline from './components/CommunicationsTimeline.svelte';
  import InterviewHistoryList from './components/InterviewHistoryList.svelte';

  import RelanceComposeDialog, {
    type ComposeRecipient,
  } from '$lib/components/dev/RelanceComposeDialog.svelte';
  import {
    classifyRelanceSkip,
    formatTalentVars,
    type RelanceType,
    type RelanceVar,
  } from '$lib/domain/relance';
  import { cn } from '$lib/utils';
  import type { FlagKey } from '$lib/domain/featureFlags';

  let { data }: { data: PageData } = $props();

  // The /staff/dev/students listing is gated on coding_club, so the
  // breadcrumb can only link there when the campus has the flag.
  const featureFlags = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]),
  );
  const talentsHref = $derived(
    featureFlags.has('coding_club')
      ? resolve('/staff/dev/students')
      : undefined,
  );

  // Most recent completed interview drives the dark reco card in the
  // Pédagogie tab — staff want the headline orientation outcome up top,
  // without scrolling into the admin history list.
  const latestInterviewWithReco = $derived(
    data.student.interviews?.find(
      (iv: { status: string; recommendation: unknown }) =>
        iv.status === 'completed' && iv.recommendation,
    ) ?? null,
  );

  const { form, errors, delayed, enhance, reset } = superForm(
    untrack(() => data.form),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          editOpen = false;
          toast.success('Profil mis à jour');
        }
      },
    },
  );

  let editOpen = $state(false);
  type Tab = 'pedago' | 'admin';
  let tab = $state<Tab>(untrack(() => data.tab as Tab));

  $effect(() => {
    tab = data.tab as Tab;
  });

  const studentEmail = $derived(data.student.user?.email || data.student.email);
  const isNewTalent = $derived((data.student.eventsCount ?? 0) === 0);

  const mostRecentStageParticipation = $derived(
    data.participations.find((p) => p.event.eventType === 'stage_seconde') ??
      null,
  );

  // Compliance is stage-specific — only the most recent active stage's
  // dossier is surfaced. Historical stages don't need to re-litigate their
  // (already-archived) documents from this page.
  const primaryComplianceParticipation = $derived(
    data.activeStageParticipations[0] ?? null,
  );

  const badgeCounts = $derived({
    earned: data.badges.filter((b) => b.earned).length,
    total: data.badges.length,
  });

  function navigateWithParams(params: Record<string, string>) {
    const url = new URL(page.url);
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    goto(url.toString(), {
      keepFocus: true,
      replaceState: true,
      noScroll: true,
    });
  }

  function changeTab(next: string) {
    if (next !== 'pedago' && next !== 'admin') return;
    tab = next;
    // Reset comms pagination when switching tabs — `?page=N` only drives the
    // communications timeline on the admin tab.
    navigateWithParams({ tab: next === 'pedago' ? '' : next, page: '' });
  }

  function goToCommunicationsPage(p: number) {
    navigateWithParams({ tab: 'admin', page: String(p) });
  }

  // Relance compose state — shared between the étudiant + parent buttons.
  let composeType = $state<RelanceType | null>(null);
  let composeOpen = $state(false);

  function openCompose(type: RelanceType) {
    composeType = type;
    composeOpen = true;
  }

  const composeRecipients = $derived.by<ComposeRecipient[]>(() => {
    if (!composeType) return [];
    const t = data.student;
    const vars = formatTalentVars(t);
    const elig = { ...t, email: t.user?.email ?? t.email };
    const rem = data.reminders.filter((r) => r.audience === composeType);
    const lastEmailAt = rem.find((r) => r.channel === 'email')?.sentAt;
    const lastSmsAt = rem.find((r) => r.channel === 'sms')?.sentAt;
    const hasPriorEmail = rem.some((r) => r.channel === 'email');
    const willSkip = {
      email: classifyRelanceSkip({
        type: composeType,
        channel: 'email',
        talent: elig,
        lastReminderAt: lastEmailAt,
      }),
      sms: classifyRelanceSkip({
        type: composeType,
        channel: 'sms',
        talent: elig,
        lastReminderAt: lastSmsAt,
        hasPriorEmail,
      }),
    };
    const label = `${vars.nom} ${vars.prenom}`.trim();
    return [{ id: t.id, label, willSkip }];
  });

  const composePreviewVars = $derived.by<Partial<Record<RelanceVar, string>>>(
    () => {
      const t = data.student;
      const mailbox =
        composeType === 'parent'
          ? (t.parentEmail ?? '')
          : (t.user?.email ?? t.email ?? '');
      return {
        ...formatTalentVars(t),
        email: mailbox,
        campus: data.campus.name,
        email_contact_campus: data.campus.contactEmail ?? '',
        ...(data.joursRestants != null
          ? { jours_restants: String(data.joursRestants) }
          : {}),
      };
    },
  );

  async function onRelanceSent() {
    await invalidateAll();
  }

  function openEdit() {
    reset();
    $form.prenom = data.student.prenom;
    $form.nom = data.student.nom;
    $form.email = studentEmail || '';
    $form.phone = data.student.phone ?? '';
    $form.parent_email = data.student.parentEmail ?? '';
    $form.parent_phone = data.student.parentPhone ?? '';
    $form.parent_nom = data.student.parentNom ?? '';
    $form.parent_prenom = data.student.parentPrenom ?? '';
    $form.niveau = (data.student.niveau || '') as never;
    editOpen = true;
  }

  // Shared trigger style — mockup-style icon + uppercase label + mono
  // sub-label with a 2px bottom-border activation indicator. Overrides the
  // shadcn Tabs.Trigger defaults so we keep the bits-ui primitive (focus
  // rings, keyboard nav) without inheriting its pill-tab look.
  const triggerClass = cn(
    'group/tab flex h-auto flex-none cursor-pointer items-center gap-3 rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-4 py-3 text-left text-muted-foreground shadow-none transition-colors',
    'hover:bg-muted/30 hover:text-foreground',
    'data-[state=active]:border-b-epi-blue data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none',
  );
</script>

<svelte:head>
  <title>{data.student.prenom} {data.student.nom}</title>
</svelte:head>

<div class="space-y-6 pb-12">
  <PageBreadcrumb
    items={[
      { label: 'Stagiaires', href: talentsHref },
      { label: `${data.student.nom} ${data.student.prenom}` },
    ]}
  />

  <Tabs.Root value={tab} onValueChange={changeTab} class="space-y-6">
    <Tabs.List
      class="sticky top-0 z-20 h-auto w-full justify-start gap-0 rounded-none border-b bg-background p-0"
    >
      <Tabs.Trigger value="pedago" class={triggerClass}>
        <Sparkles
          class="h-4 w-4 shrink-0 text-muted-foreground group-data-[state=active]/tab:text-epi-blue"
        />
        <span class="flex flex-col items-start gap-0.5">
          <span class="text-sm font-bold tracking-wide uppercase"
            >Stagiaire</span
          >
          <span
            class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
          >
            Profil &amp; parcours
          </span>
        </span>
      </Tabs.Trigger>
      <Tabs.Trigger value="admin" class={triggerClass}>
        <FileText
          class="h-4 w-4 shrink-0 text-muted-foreground group-data-[state=active]/tab:text-epi-blue"
        />
        <span class="flex flex-col items-start gap-0.5">
          <span class="text-sm font-bold tracking-wide uppercase">
            Administratif
          </span>
          <span
            class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
          >
            Dossier &amp; communications
          </span>
        </span>
      </Tabs.Trigger>
    </Tabs.List>

    <!-- PÉDAGOGIE -->
    <Tabs.Content value="pedago" class="space-y-6">
      <TalentProfileHero student={data.student} {isNewTalent} />

      <TalentStatStrip
        student={data.student}
        presentCount={data.stats.presentCount}
        totalEvents={data.stats.totalEvents}
        lastActiveAt={data.student.lastActiveAt}
        {badgeCounts}
        timezone={data.timezone}
      />

      <div class="grid gap-6 lg:grid-cols-12">
        <div class="space-y-6 lg:col-span-8">
          <EpiSection
            overline="Parcours"
            title="Frise pédagogique"
            accent="tech"
          >
            <GroupedTalentTimeline
              groups={data.timelineGroups}
              timezone={data.timezone}
            />
          </EpiSection>

          <EpiSection overline="Réalisations" title="Livrables" accent="blue">
            <ProjectsRow items={data.portfolioItems} timezone={data.timezone} />
          </EpiSection>
        </div>

        <div class="space-y-6 lg:col-span-4">
          <EpiSection
            overline="Affinités"
            title="Centres d'intérêt"
            accent="tech"
          >
            <TalentInterestChips interests={data.student.interests ?? []} />
            {#if (data.student.interests ?? []).length === 0}
              <p class="text-sm text-muted-foreground italic">
                Aucun centre d'intérêt renseigné.
              </p>
            {/if}
          </EpiSection>

          <EpiSection overline="Trophées" title="Badges" accent="together">
            {#snippet meta()}
              <span
                class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
              >
                {badgeCounts.earned}/{badgeCounts.total}
              </span>
            {/snippet}

            <BadgesPanel badges={data.badges} />
          </EpiSection>

          <InterviewRecoCard
            interview={latestInterviewWithReco}
            timezone={data.timezone}
          />
        </div>
      </div>
    </Tabs.Content>

    <!-- ADMINISTRATION -->
    <Tabs.Content value="admin" class="space-y-6">
      <DossierAlertBanner
        activeStageParticipations={data.activeStageParticipations}
        imageRightsDecided={data.student.imageRightsDecision !== null}
        parentRulesSignedAt={data.student.parentRulesSignedAt}
      />

      <Gated group="devLead" mode="hide">
        <div
          class="flex flex-wrap items-center gap-2 rounded-sm border border-dashed border-border bg-muted/30 px-4 py-3"
        >
          <Send class="h-4 w-4 text-muted-foreground" />
          <span class="text-sm text-muted-foreground"
            >Relancer ce stagiaire</span
          >
          <Button
            size="sm"
            variant="outline"
            disabled={!(data.student.user?.email || data.student.email)}
            onclick={() => openCompose('student')}
          >
            <Send class="mr-2 h-3.5 w-3.5" />
            Étudiant
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!data.student.parentEmail}
            onclick={() => openCompose('parent')}
          >
            <Send class="mr-2 h-3.5 w-3.5" />
            Parent
          </Button>
        </div>
      </Gated>

      <div class="grid gap-6 md:grid-cols-2">
        <ContactCard student={data.student} onEdit={openEdit} />
        {#if primaryComplianceParticipation}
          <ComplianceDocsTable
            participation={primaryComplianceParticipation}
            imageRightsDecision={data.student.imageRightsDecision}
            parentRulesSignedAt={data.student.parentRulesSignedAt}
            parentRulesSignerName={data.student.parentRulesSignerPrenom &&
            data.student.parentRulesSignerNom
              ? `${data.student.parentRulesSignerPrenom} ${data.student.parentRulesSignerNom}`
              : (data.student.parentRulesSignerNom ??
                data.student.parentRulesSignerPrenom)}
            timezone={data.timezone}
          />
        {/if}
      </div>

      <div class="grid gap-6 md:grid-cols-2">
        <CommunicationsTimeline
          items={data.communications}
          total={data.communicationsTotal}
          page={data.communicationsPage}
          pageSize={data.communicationsPageSize}
          talentId={data.student.id}
          timezone={data.timezone}
          onPageChange={goToCommunicationsPage}
        />

        <EpiSection overline="Assiduité" title="Présence stage" accent="tech">
          <PresenceHeatmap
            participation={mostRecentStageParticipation}
            timezone={data.timezone}
          />
        </EpiSection>
      </div>

      <TalentPlatformAccountCard
        student={data.student}
        firstLoginAt={data.firstLoginAt}
        timezone={data.timezone}
      />

      <Gated group="devMember" mode="hide">
        <div
          class="flex flex-wrap items-center gap-3 rounded-sm border border-dashed border-border bg-muted/30 px-4 py-3"
        >
          <span class="text-sm text-muted-foreground">
            Connexion en présentiel
          </span>
          <span class="ml-auto"></span>
          <TalentOtpDialog
            action="?/generateOtp"
            talentName={`${data.student.prenom} ${data.student.nom}`}
            subjectLabel="le stagiaire"
            disabled={!data.student.user?.email}
            disabledReason="Le stagiaire n'a pas encore de compte (aucune connexion enregistrée)."
          />
        </div>
      </Gated>

      <InterviewHistoryList
        interviews={data.student.interviews}
        timezone={data.timezone}
      />
    </Tabs.Content>
  </Tabs.Root>

  {#if composeType}
    <RelanceComposeDialog
      bind:open={composeOpen}
      type={composeType}
      recipients={composeRecipients}
      formAction="?/sendRelance"
      initialForm={data.relanceForm}
      defaultTemplate={data.relanceDefaults[composeType].template}
      hasMapping={data.relanceDefaults[composeType].hasMapping}
      smsEnabled={data.smsEnabled}
      previewVars={composePreviewVars}
      onSent={onRelanceSent}
    />
  {/if}

  <StudentFormDialog
    bind:open={editOpen}
    isEditing={true}
    editId={data.student.id}
    {form}
    {errors}
    {delayed}
    {enhance}
    action="?/update"
  />
</div>
