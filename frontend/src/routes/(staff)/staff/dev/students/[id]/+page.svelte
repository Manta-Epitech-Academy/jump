<script lang="ts">
  import type { PageData } from './$types';
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { enhance as kitEnhance } from '$app/forms';
  import { toast } from 'svelte-sonner';

  import Phone from '@lucide/svelte/icons/phone';
  import Mail from '@lucide/svelte/icons/mail';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Cloud from '@lucide/svelte/icons/cloud';
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import SignalLow from '@lucide/svelte/icons/signal-low';
  import Trophy from '@lucide/svelte/icons/trophy';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Calendar from '@lucide/svelte/icons/calendar';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import Trash2 from '@lucide/svelte/icons/trash-2';

  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Card from '$lib/components/ui/card';
  import * as Tabs from '$lib/components/ui/tabs';

  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import StudentFormDialog from '../components/StudentFormDialog.svelte';
  import StudentTimeline from '$lib/components/students/StudentTimeline.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import TalentName from '$lib/components/students/TalentName.svelte';
  import NewTalentBadge from '$lib/components/students/NewTalentBadge.svelte';

  import OnboardingStatus from './components/OnboardingStatus.svelte';
  import TalentInterestChips from './components/TalentInterestChips.svelte';
  import PresenceHeatmap from './components/PresenceHeatmap.svelte';
  import ContactCard from './components/ContactCard.svelte';
  import ComplianceByEventTable from './components/ComplianceByEventTable.svelte';
  import CommHistoryList from './components/CommHistoryList.svelte';
  import InterviewHistoryList from './components/InterviewHistoryList.svelte';
  import RecommendationChip from '../../events/[id]/interviews/components/RecommendationChip.svelte';
  import RelanceComposeDialog, {
    type ComposeRecipient,
  } from '$lib/components/comms/RelanceComposeDialog.svelte';
  import Send from '@lucide/svelte/icons/send';
  import Gated from '$lib/components/auth/Gated.svelte';
  import { invalidateAll } from '$app/navigation';
  import { defaultRelanceFor } from '$lib/domain/relanceTemplates';
  import {
    classifyRelanceSkip,
    formatTalentVars,
    type RelanceType,
    type RelanceVar,
  } from '$lib/domain/relance';
  import { can } from '$lib/domain/permissions';
  import { salesforceContactUrl } from '$lib/domain/salesforce';
  import { cn } from '$lib/utils';
  import type { FlagKey } from '$lib/domain/featureFlags';

  let { data }: { data: PageData } = $props();

  const canDelete = $derived(can('devLead', data.staffProfile?.staffRole));

  // The /staff/dev/students listing is gated on coding_club, so the
  // breadcrumb can only link there when the campus has the flag.
  let featureFlags = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]),
  );
  let talentsHref = $derived(
    featureFlags.has('coding_club')
      ? resolve('/staff/dev/students')
      : undefined,
  );

  // Latest interview recommendation — surfaced in the identity strip so dev
  // staff see the orientation outcome without opening the history list.
  let latestRecommendation = $derived(
    data.student.interviews?.find(
      (iv: { status: string; recommendation: unknown }) =>
        iv.status === 'completed' && iv.recommendation,
    )?.recommendation ?? null,
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
  let deleteDialogOpen = $state(false);
  let tab = $state<'pedago' | 'admin'>(untrack(() => data.tab));

  $effect(() => {
    tab = data.tab;
  });

  const xpProgress = $derived(Math.min((data.student.xp / 1000) * 100, 100));
  const studentEmail = $derived(data.student.user?.email || data.student.email);
  const isNewTalent = $derived((data.student.eventsCount ?? 0) === 0);
  const interests = $derived(data.student.interests ?? []);
  const lycee = $derived(data.student.highSchoolName);
  const externalId = $derived(data.student.externalId);

  const mostRecentStageParticipation = $derived(
    data.participations.find((p) => p.event.eventType === 'stage_seconde') ??
      null,
  );

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
    navigateWithParams({ tab: next === 'pedago' ? '' : next });
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
    const willSkip = classifyRelanceSkip({
      type: composeType,
      talent: { ...t, email: t.user?.email ?? t.email },
      lastReminderAt: data.reminders.find((r) => r.type === composeType)
        ?.sentAt,
    });
    const label = `${vars.nom} ${vars.prenom}`.trim();
    return [{ id: t.id, label, willSkip }];
  });

  const composePreviewVars = $derived.by<Partial<Record<RelanceVar, string>>>(
    () => formatTalentVars(data.student),
  );

  async function onRelanceSent() {
    await invalidateAll();
  }

  function difficultyClass(diff: string | null | undefined) {
    switch (diff) {
      case 'Débutant':
        return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/30 dark:bg-green-900/20 dark:text-green-400';
      case 'Intermédiaire':
        return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-400';
      case 'Avancé':
        return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/30 dark:bg-purple-900/20 dark:text-purple-400';
      default:
        return 'border-border text-muted-foreground';
    }
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
    $form.niveau_difficulte = (data.student.niveauDifficulte ||
      'Débutant') as never;
    editOpen = true;
  }

  function cleanTel(value: string) {
    return value.replace(/\s+/g, '');
  }
</script>

<svelte:head>
  <title>{data.student.prenom} {data.student.nom}</title>
</svelte:head>

<div class="space-y-6 pb-12">
  <PageBreadcrumb
    items={[
      { label: 'Talents', href: talentsHref },
      { label: `${data.student.nom} ${data.student.prenom}` },
    ]}
  />

  <!-- Identity strip -->
  <section
    class="flex flex-col gap-4 rounded-sm border bg-card p-5 shadow-sm sm:flex-row sm:items-center dark:border-border/50 dark:shadow-none"
  >
    <TalentAvatar
      talent={{
        id: data.student.id,
        nom: data.student.nom,
        prenom: data.student.prenom,
      }}
      size="lg"
    />
    <div class="min-w-0 flex-1 space-y-2">
      <div class="flex flex-wrap items-baseline gap-2">
        <h1 class="text-2xl font-bold text-epi-blue">
          <TalentName talent={data.student} /><span class="text-epi-teal"
            >_</span
          >
        </h1>
        {#if isNewTalent}
          <NewTalentBadge />
        {/if}
      </div>
      <div class="flex flex-wrap items-center gap-2">
        {#if lycee}
          <Badge
            variant="outline"
            class="rounded-sm border-epi-blue/40 px-2 py-0.5 text-[10px] font-bold uppercase"
          >
            <GraduationCap class="mr-1 h-3 w-3" />
            {lycee}
          </Badge>
        {/if}
        {#if data.student.niveau}
          <Badge
            variant="outline"
            class="rounded-sm border-epi-blue/40 px-2 py-0.5 text-[10px] font-bold tracking-tight text-epi-blue uppercase"
          >
            {data.student.niveau}
          </Badge>
        {/if}
        {#if data.student.niveauDifficulte}
          <Badge
            variant="outline"
            class={cn(
              'rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase',
              difficultyClass(data.student.niveauDifficulte),
            )}
          >
            <SignalLow class="mr-1 h-3 w-3" />
            {data.student.niveauDifficulte}
          </Badge>
        {/if}
        <Badge
          variant="outline"
          class={cn(
            'rounded-sm px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase',
            data.student.xp >= 500
              ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300'
              : 'border-border text-muted-foreground',
          )}
        >
          <Trophy class="mr-1 h-3 w-3 text-epi-orange" />
          {data.student.xp} XP · {data.student.level}
        </Badge>
        {#if latestRecommendation}
          <RecommendationChip
            value={latestRecommendation}
            variant="full"
            size="md"
          />
        {/if}
      </div>
    </div>
  </section>

  <!-- Quick actions row -->
  <section class="flex flex-wrap items-center gap-2">
    {#if data.student.phone}
      <Button
        href={`tel:${cleanTel(data.student.phone)}`}
        variant="outline"
        size="sm"
        class="rounded-sm"
      >
        <Phone class="mr-2 h-3.5 w-3.5" />
        Appeler
      </Button>
    {/if}
    {#if studentEmail}
      <Button
        href={`mailto:${studentEmail}`}
        variant="outline"
        size="sm"
        class="rounded-sm"
      >
        <Mail class="mr-2 h-3.5 w-3.5" />
        Écrire
      </Button>
    {/if}
    {#if data.student.parentPhone}
      <Button
        href={`tel:${cleanTel(data.student.parentPhone)}`}
        variant="outline"
        size="sm"
        class="rounded-sm"
      >
        <Phone class="mr-2 h-3.5 w-3.5" />
        Appeler parent
      </Button>
    {/if}
    {#if data.student.parentEmail}
      <Button
        href={`mailto:${data.student.parentEmail}`}
        variant="outline"
        size="sm"
        class="rounded-sm"
      >
        <Mail class="mr-2 h-3.5 w-3.5" />
        Écrire parent
      </Button>
    {/if}
    {#if externalId}
      <Button
        href={salesforceContactUrl(externalId)}
        target="_blank"
        rel="noopener noreferrer"
        variant="outline"
        size="sm"
        class="rounded-sm"
      >
        <Cloud class="mr-2 h-3.5 w-3.5" />
        Salesforce
      </Button>
    {/if}
    <span class="ml-auto"></span>
    <Button
      type="button"
      variant="default"
      size="sm"
      class="rounded-sm bg-epi-blue text-white hover:bg-epi-blue/90"
      onclick={openEdit}
    >
      <Pencil class="mr-2 h-3.5 w-3.5" />
      Modifier le profil
    </Button>
  </section>

  <Tabs.Root value={tab} onValueChange={changeTab} class="space-y-6">
    <Tabs.List class="grid w-full max-w-md grid-cols-2 rounded-sm">
      <Tabs.Trigger value="pedago" class="rounded-sm">Pédagogie</Tabs.Trigger>
      <Tabs.Trigger value="admin" class="rounded-sm"
        >Administration</Tabs.Trigger
      >
    </Tabs.List>

    <!-- PEDAGOGIE TAB -->
    <Tabs.Content value="pedago" class="space-y-6">
      <div class="grid gap-6 md:grid-cols-12">
        <div class="space-y-6 md:col-span-4 lg:col-span-3">
          <Card.Root class="rounded-sm border shadow-sm dark:shadow-none">
            <Card.Header class="border-b bg-muted/30 pt-4 pb-4">
              <Card.Title
                class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
              >
                <Trophy class="h-4 w-4 text-epi-orange" />
                Progression
              </Card.Title>
            </Card.Header>
            <Card.Content class="space-y-5 pt-5">
              <div class="space-y-2 text-center">
                <span
                  class="text-4xl font-black tracking-tighter text-foreground italic"
                >
                  {data.student.xp}<span
                    class="ml-1 font-heading text-xl text-epi-orange not-italic"
                  >
                    XP
                  </span>
                </span>
                <div
                  class="relative h-3 w-full overflow-hidden rounded-full bg-muted shadow-inner dark:bg-muted/20"
                >
                  <div
                    class="h-full bg-epi-orange transition-all duration-1000 ease-out"
                    style="width: {xpProgress}%;"
                  ></div>
                </div>
              </div>
              <div
                class={cn(
                  'grid gap-2 text-center',
                  data.stats.lateCount > 0 ? 'grid-cols-3' : 'grid-cols-2',
                )}
              >
                <div
                  class="rounded-sm bg-muted/40 p-2 ring-1 ring-border/20 dark:bg-muted/10"
                >
                  <div class="text-lg font-black">{data.stats.totalEvents}</div>
                  <div
                    class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                  >
                    Particip.
                  </div>
                </div>
                <div
                  class="rounded-sm bg-muted/40 p-2 ring-1 ring-border/20 dark:bg-muted/10"
                >
                  <div class="text-lg font-black">
                    {data.stats.presentCount}
                  </div>
                  <div
                    class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                  >
                    Présences
                  </div>
                </div>
                {#if data.stats.lateCount > 0}
                  <div
                    class="rounded-sm bg-orange-50 p-2 ring-1 ring-orange-200/50 dark:bg-orange-950/20 dark:ring-orange-900/30"
                  >
                    <div class="text-lg font-black text-orange-500">
                      {data.stats.lateCount}
                    </div>
                    <div
                      class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                    >
                      Retards
                    </div>
                  </div>
                {/if}
              </div>
              {#if data.stats.favoriteTheme !== 'Aucun'}
                <div class="border-t pt-3 text-center">
                  <p
                    class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                  >
                    Thème favori
                  </p>
                  <p class="mt-1 text-sm font-bold text-epi-teal-solid">
                    #{data.stats.favoriteTheme}
                  </p>
                </div>
              {/if}
            </Card.Content>
          </Card.Root>

          <Card.Root class="rounded-sm border shadow-sm dark:shadow-none">
            <Card.Header class="border-b bg-muted/30 pt-4 pb-4">
              <Card.Title
                class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
              >
                <BookOpen class="h-4 w-4 text-epi-teal-solid" />
                Profil pédagogique
              </Card.Title>
            </Card.Header>
            <Card.Content class="space-y-4 pt-5">
              <TalentInterestChips {interests} />
              <PresenceHeatmap
                participation={mostRecentStageParticipation}
                timezone={data.timezone}
              />
              {#if interests.length === 0 && !mostRecentStageParticipation}
                <p class="text-sm text-muted-foreground italic">
                  Aucune donnée pédagogique pour le moment.
                </p>
              {/if}
            </Card.Content>
          </Card.Root>
        </div>

        <div class="space-y-6 md:col-span-8 lg:col-span-9">
          <Card.Root class="rounded-sm border shadow-sm dark:shadow-none">
            <Card.Header class="border-b bg-muted/30 pt-4 pb-4">
              <Card.Title
                class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
              >
                <Calendar class="h-4 w-4 text-epi-teal-solid" />
                Parcours pédagogique
              </Card.Title>
            </Card.Header>
            <Card.Content class="pt-8">
              <StudentTimeline
                participations={data.participations}
                timezone={data.timezone}
              />
            </Card.Content>
          </Card.Root>
        </div>
      </div>
    </Tabs.Content>

    <!-- ADMIN TAB -->
    <Tabs.Content value="admin" class="space-y-6">
      <Gated group="devLead" mode="hide">
        <div
          class="flex flex-wrap items-center gap-2 rounded-sm border border-dashed border-border bg-muted/30 px-4 py-3"
        >
          <Send class="h-4 w-4 text-muted-foreground" />
          <span class="text-sm text-muted-foreground">Relancer ce talent</span>
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
        <ContactCard student={data.student} />
        <OnboardingStatus student={data.student} timezone={data.timezone} />
      </div>

      {#if data.activeStageParticipations.length > 0}
        <ComplianceByEventTable
          participations={data.activeStageParticipations}
          timezone={data.timezone}
        />
      {/if}

      <div class="grid gap-6 md:grid-cols-2">
        <CommHistoryList reminders={data.reminders} timezone={data.timezone} />
        <InterviewHistoryList
          interviews={data.student.interviews}
          timezone={data.timezone}
        />
      </div>

      <Card.Root
        class="rounded-sm border border-destructive/30 bg-destructive/5 shadow-sm dark:shadow-none"
      >
        <Card.Header class="border-b border-destructive/20 pt-4 pb-4">
          <Card.Title
            class="flex items-center gap-2 text-xs font-bold tracking-widest text-destructive uppercase"
          >
            <ShieldAlert class="h-4 w-4" />
            Zone de danger
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-3 pt-5">
          <p class="text-xs font-medium text-muted-foreground">
            La suppression est définitive et entraînera la suppression de tout
            son historique sur Jump.
          </p>
          <Button
            type="button"
            variant="destructive"
            class="rounded-sm"
            disabled={!canDelete}
            title={canDelete
              ? undefined
              : "Réservé aux responsables de l'espace"}
            onclick={() => {
              if (!canDelete) return;
              deleteDialogOpen = true;
            }}
          >
            <Trash2 class="mr-2 h-4 w-4" />
            Supprimer le dossier
          </Button>
        </Card.Content>
      </Card.Root>
    </Tabs.Content>
  </Tabs.Root>

  {#if composeType}
    <RelanceComposeDialog
      bind:open={composeOpen}
      type={composeType}
      recipients={composeRecipients}
      formAction="?/sendRelance"
      initialForm={data.relanceForm}
      defaultTemplate={defaultRelanceFor(composeType)}
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

  <AlertDialog.Root bind:open={deleteDialogOpen}>
    <AlertDialog.Content class="rounded-sm">
      <AlertDialog.Header>
        <AlertDialog.Title
          class="text-lg font-bold tracking-tight text-destructive uppercase"
        >
          Confirmer la suppression
        </AlertDialog.Title>
        <AlertDialog.Description class="text-sm font-medium">
          Êtes-vous sûr de vouloir supprimer définitivement ce Talent du CRM
          Epitech ?
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel class="rounded-sm">Annuler</AlertDialog.Cancel>
        <form action="?/delete" method="POST" use:kitEnhance>
          <AlertDialog.Action
            type="submit"
            class={buttonVariants({
              variant: 'destructive',
              class: 'rounded-sm',
            })}
          >
            Supprimer définitivement
          </AlertDialog.Action>
        </form>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
</div>
