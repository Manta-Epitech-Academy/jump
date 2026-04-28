<script lang="ts">
  import type { PageData } from './$types';
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { ArrowLeft, Trash2, Calendar } from '@lucide/svelte';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Card from '$lib/components/ui/card';
  import { toast } from 'svelte-sonner';
  import { enhance as kitEnhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import StudentFormDialog from '../components/StudentFormDialog.svelte';
  import TalentCard from './components/TalentCard.svelte';
  import StudentTimeline from '$lib/components/students/StudentTimeline.svelte';
  import OnboardingStatus from './components/OnboardingStatus.svelte';
  import { can } from '$lib/domain/permissions';

  let { data }: { data: PageData } = $props();
  const canDelete = $derived(can('devLead', data.staffProfile?.staffRole));

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

  let xpProgress = $derived(Math.min((data.student.xp / 1000) * 100, 100));

  function openEdit() {
    reset();
    $form.prenom = data.student.prenom;
    $form.nom = data.student.nom;
    $form.email = data.student.user?.email || data.student.email || '';
    $form.phone = data.student.phone ?? '';
    $form.parent_email = data.student.parentEmail ?? '';
    $form.parent_phone = data.student.parentPhone ?? '';
    $form.niveau = (data.student.niveau || '') as any;
    $form.niveau_difficulte = (data.student.niveauDifficulte ||
      'Débutant') as any;
    editOpen = true;
  }
</script>

<div class="space-y-6 pb-12">
  <div class="flex items-center gap-4 border-b pb-4">
    <Button variant="ghost" size="icon" href={resolve('/staff/dev')}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <h1 class="text-3xl font-bold text-epi-blue">
      <span class="uppercase">{data.student.nom}</span>
      <span class="capitalize">{data.student.prenom}</span>
      <span class="text-epi-teal">_</span>
    </h1>
  </div>

  <div class="grid gap-6 md:grid-cols-12">
    <div class="space-y-6 md:col-span-4 lg:col-span-3">
      <TalentCard
        student={data.student}
        stats={data.stats}
        {xpProgress}
        onOpenEdit={openEdit}
      />
      <OnboardingStatus student={data.student} />
    </div>

    <div class="space-y-6 md:col-span-8 lg:col-span-9">
      <Card.Root class="rounded-sm border shadow-sm">
        <Card.Header class="border-b bg-muted/30 pt-4 pb-4">
          <Card.Title
            class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
            ><Calendar class="h-4 w-4 text-epi-teal-solid" /> Parcours Pédagogique</Card.Title
          >
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

  <StudentFormDialog
    bind:open={editOpen}
    isEditing={true}
    editId={data.student.id}
    {form}
    {errors}
    {delayed}
    {enhance}
    action="?/update"
  >
    <div
      class="mt-4 space-y-4 rounded-sm border border-destructive/20 bg-destructive/5 p-5"
    >
      <div class="space-y-1">
        <h4
          class="font-sans text-sm font-bold tracking-wide text-destructive uppercase"
        >
          Zone de danger
        </h4>
        <p class="text-xs font-medium text-muted-foreground">
          La suppression est définitive et entraînera la suppression de tout son
          historique.
        </p>
      </div>
      <Button
        type="button"
        variant="destructive"
        class="w-full rounded-sm"
        disabled={!canDelete}
        title={canDelete ? undefined : "Réservé aux responsables de l'espace"}
        onclick={() => {
          if (!canDelete) return;
          editOpen = false;
          deleteDialogOpen = true;
        }}><Trash2 class="mr-2 h-4 w-4" /> Supprimer le dossier</Button
      >
    </div>
  </StudentFormDialog>

  <AlertDialog.Root bind:open={deleteDialogOpen}>
    <AlertDialog.Content class="rounded-sm">
      <AlertDialog.Header>
        <AlertDialog.Title
          class="text-lg font-bold tracking-tight text-destructive uppercase"
          >Confirmer la suppression</AlertDialog.Title
        >
        <AlertDialog.Description class="text-sm font-medium"
          >Êtes-vous sûr de vouloir supprimer définitivement ce Talent du CRM
          Epitech ?</AlertDialog.Description
        >
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel class="rounded-sm">Annuler</AlertDialog.Cancel>
        <form action="?/delete" method="POST" use:kitEnhance>
          <AlertDialog.Action
            type="submit"
            class={buttonVariants({
              variant: 'destructive',
              class: 'rounded-sm',
            })}>Supprimer définitivement</AlertDialog.Action
          >
        </form>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
</div>
