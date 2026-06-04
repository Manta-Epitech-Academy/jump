<script lang="ts">
  import type { PageData } from './$types';
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { resolve } from '$app/paths';
  import { toast } from 'svelte-sonner';

  import MessageSquare from '@lucide/svelte/icons/message-square';
  import X from '@lucide/svelte/icons/x';

  import { Button } from '$lib/components/ui/button';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';

  import StudentFormDialog from '../components/StudentFormDialog.svelte';
  import TalentProfileHero from './components/TalentProfileHero.svelte';
  import TalentInterestChips from './components/TalentInterestChips.svelte';
  import TalentTodoList from './components/TalentTodoList.svelte';
  import ContactCard from './components/ContactCard.svelte';
  import RightRailCard from './components/RightRailCard.svelte';
  import InterviewGridMock from './components/InterviewGridMock.svelte';

  import type { FlagKey } from '$lib/domain/featureFlags';

  let { data }: { data: PageData } = $props();

  // Navigation is flat in stage-only mode; the breadcrumb only earns its keep
  // (and a link back to the listing) once coding_club adds depth.
  const featureFlags = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]),
  );
  const hasCodingClub = $derived(featureFlags.has('coding_club'));
  const talentsHref = $derived(
    hasCodingClub ? resolve('/staff/dev/students') : undefined,
  );

  const isNewTalent = $derived((data.student.eventsCount ?? 0) === 0);
  const studentEmail = $derived(data.student.user?.email || data.student.email);

  const charteSigned = $derived(
    data.primaryComplianceParticipation?.stageCompliance?.charteSigned,
  );

  // Contacts surfaced (copyable) next to the todos that need a call/email.
  const contacts = $derived({
    parentEmail: data.student.parentEmail,
    parentPhone: data.student.parentPhone,
    studentEmail: data.student.user?.email ?? data.student.email,
    studentPhone: data.student.phone,
  });

  // "Faire l'entretien" swaps the dossier tools (todo + contact) for the
  // interview grid, keeping the talent context (hero, interests, right rail).
  let interviewMode = $state(false);

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
</script>

<svelte:head>
  <title>{data.student.prenom} {data.student.nom}</title>
</svelte:head>

<div class="space-y-6 pb-12">
  {#if hasCodingClub}
    <PageBreadcrumb
      items={[
        { label: 'Stagiaires', href: talentsHref },
        { label: `${data.student.nom} ${data.student.prenom}` },
      ]}
    />
  {/if}

  <TalentProfileHero student={data.student} {isNewTalent} />

  <div class="grid gap-6 lg:grid-cols-10">
    <!-- Left 70% — the talent is the star. -->
    <div class="space-y-6 lg:col-span-7">
      <EpiSection title="Centres d'intérêt" accent="tech">
        {#if (data.student.interests ?? []).length > 0}
          <TalentInterestChips interests={data.student.interests ?? []} />
        {:else}
          <p class="text-sm text-muted-foreground italic">
            Aucun centre d'intérêt renseigné.
          </p>
        {/if}
      </EpiSection>

      {#if interviewMode}
        <InterviewGridMock
          talentName={`${data.student.prenom} ${data.student.nom}`}
        />
      {:else}
        <EpiSection title="À faire" accent="together">
          <TalentTodoList todos={data.todos} {contacts} />
        </EpiSection>

        <ContactCard student={data.student} onEdit={openEdit} />
      {/if}
    </div>

    <!-- Right 30% — prominent interview toggle + sticky synthesis. Kept out of
         any overflow-x ancestor so the viewport-sticky positioning holds while
         the left column scrolls. -->
    <div class="lg:col-span-3">
      <div class="space-y-3 lg:sticky lg:top-6">
        <Button
          onclick={() => (interviewMode = !interviewMode)}
          variant={interviewMode ? 'outline' : 'default'}
          size="lg"
          class="w-full justify-center gap-2"
        >
          {#if interviewMode}
            <X class="h-4 w-4" />
            Quitter l'entretien
          {:else}
            <MessageSquare class="h-4 w-4" />
            Faire l'entretien
          {/if}
        </Button>

        <RightRailCard
          lastActiveAt={data.student.lastActiveAt}
          firstLoginAt={data.firstLoginAt}
          communications={data.communications}
          parentRulesSignedAt={data.student.parentRulesSignedAt}
          {charteSigned}
          imageRightsDecision={data.student.imageRightsDecision}
          timezone={data.timezone}
        />
      </div>
    </div>
  </div>

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
