<script lang="ts">
  import type { PageData } from './$types';
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import {
    ArrowLeft,
    Trash2,
    MessageSquare,
    CheckCircle2,
    Clock,
  } from '@lucide/svelte';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Separator } from '$lib/components/ui/separator';
  import { toast } from 'svelte-sonner';
  import { enhance as kitEnhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import StudentFormDialog from '../components/StudentFormDialog.svelte';
  import TalentCard from './components/TalentCard.svelte';
  import StudentTimeline from '$lib/components/students/StudentTimeline.svelte';
  import ScheduleInterviewPopover from '$lib/components/interviews/ScheduleInterviewPopover.svelte';
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

<div class="space-y-6 pb-10">
  <div class="flex items-center gap-4">
    <Button variant="ghost" size="icon" href={resolve('/staff/dev/students')}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <h1 class="text-3xl font-bold text-epi-blue uppercase">
      Dossier Talent<span class="text-epi-teal">_</span>
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
    </div>

    <div class="space-y-6 md:col-span-8 lg:col-span-9">
      <Tabs.Root value="crm" class="w-full">
        <Tabs.List class="grid w-full max-w-md grid-cols-2">
          <Tabs.Trigger value="crm">Suivi ADM & Entretiens</Tabs.Trigger>
          <Tabs.Trigger value="pedago">Historique Pédagogique</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="crm" class="space-y-6 pt-4">
          <Card.Root>
            <Card.Header class="flex flex-row items-center justify-between">
              <Card.Title class="flex items-center gap-2 text-lg uppercase"
                ><MessageSquare class="h-5 w-5 text-epi-blue" /> Entretiens</Card.Title
              >
              <ScheduleInterviewPopover
                action="?/scheduleInterview"
                timezone={data.timezone}
                label="Planifier un appel"
              />
            </Card.Header>
            <Card.Content>
              <div class="space-y-3">
                {#each data.student.interviews as interview}
                  <div
                    class="flex items-center justify-between rounded-md border p-3 {interview.status ===
                    'completed'
                      ? 'bg-green-50/30'
                      : 'bg-muted/10'}"
                  >
                    <div class="flex flex-col">
                      <div class="flex items-center gap-2 font-bold">
                        {new Date(interview.date).toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })} à {new Date(interview.date).toLocaleTimeString(
                          'fr-FR',
                          { hour: '2-digit', minute: '2-digit' },
                        )}
                        {#if interview.status === 'completed'}
                          <Badge
                            variant="outline"
                            class="border-green-200 bg-green-100 text-green-700"
                            >Terminé</Badge
                          >
                        {:else if interview.status === 'planned'}
                          <Badge
                            variant="outline"
                            class="border-blue-200 bg-blue-100 text-blue-700"
                            >Planifié</Badge
                          >
                        {:else}
                          <Badge variant="secondary">Annulé</Badge>
                        {/if}
                      </div>
                      <div class="mt-1 text-xs text-muted-foreground">
                        Géré par {interview.staff?.user?.name || 'Inconnu'}
                      </div>
                    </div>
                    {#if interview.status === 'completed' && interview.globalNote}
                      <div
                        class="max-w-sm border-l-2 border-epi-blue pl-2 text-xs text-muted-foreground italic"
                      >
                        "{interview.globalNote}"
                      </div>
                    {/if}
                  </div>
                {:else}
                  <p class="text-sm text-muted-foreground text-center py-4">
                    Aucun entretien enregistré.
                  </p>
                {/each}
              </div>
            </Card.Content>
          </Card.Root>

          <Card.Root>
            <Card.Header>
              <Card.Title class="flex items-center gap-2 text-lg uppercase"
                ><CheckCircle2 class="h-5 w-5 text-epi-teal" /> Dernier statut administratif</Card.Title
              >
            </Card.Header>
            <Card.Content>
              {#if data.participations.length > 0}
                {@const lastP = data.participations[0]}
                <div class="grid grid-cols-3 gap-4 text-center">
                  <div class="rounded-md border p-3">
                    <div
                      class="mb-1 text-[10px] font-bold text-muted-foreground uppercase"
                    >
                      Charte Informatique
                    </div>
                    <Badge
                      variant={lastP.stageCompliance?.charteSigned
                        ? 'outline'
                        : 'secondary'}
                      class={lastP.stageCompliance?.charteSigned
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'bg-amber-100 text-amber-700'}
                      >{lastP.stageCompliance?.charteSigned
                        ? 'Signée'
                        : 'En attente'}</Badge
                    >
                  </div>
                  <div class="rounded-md border p-3">
                    <div
                      class="mb-1 text-[10px] font-bold text-muted-foreground uppercase"
                    >
                      Convention
                    </div>
                    <Badge
                      variant={lastP.stageCompliance?.conventionSigned
                        ? 'outline'
                        : 'secondary'}
                      class={lastP.stageCompliance?.conventionSigned
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'bg-amber-100 text-amber-700'}
                      >{lastP.stageCompliance?.conventionSigned
                        ? 'Signée'
                        : 'En attente'}</Badge
                    >
                  </div>
                  <div class="rounded-md border p-3">
                    <div
                      class="mb-1 text-[10px] font-bold text-muted-foreground uppercase"
                    >
                      Droit à l'image
                    </div>
                    <Badge
                      variant={lastP.stageCompliance?.imageRightsSigned
                        ? 'outline'
                        : 'secondary'}
                      class={lastP.stageCompliance?.imageRightsSigned
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'bg-red-100 text-red-700'}
                      >{lastP.stageCompliance?.imageRightsSigned
                        ? 'Signé'
                        : 'Manquant'}</Badge
                    >
                  </div>
                </div>
                <p class="mt-4 text-center text-xs text-muted-foreground">
                  Basé sur la dernière participation : <strong
                    >{lastP.event.titre}</strong
                  >
                </p>
              {:else}
                <p class="py-4 text-center text-sm text-muted-foreground">
                  Aucune participation passée.
                </p>
              {/if}
            </Card.Content>
          </Card.Root>
        </Tabs.Content>

        <Tabs.Content value="pedago" class="pt-4">
          <StudentTimeline
            participations={data.participations}
            timezone={data.timezone}
          />
        </Tabs.Content>
      </Tabs.Root>
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
    <Separator class="my-2" />
    <div
      class="space-y-4 rounded-sm border border-destructive/20 bg-destructive/5 p-4"
    >
      <div class="space-y-1">
        <h4 class="text-sm font-bold text-destructive uppercase">
          Zone de danger
        </h4>
        <p class="text-xs text-muted-foreground">
          La suppression est définitive et entraînera la suppression de tout son
          historique.
        </p>
      </div>
      <Button
        type="button"
        variant="destructive"
        class="w-full"
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
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>Confirmer la suppression</AlertDialog.Title>
        <AlertDialog.Description
          >Êtes-vous sûr de vouloir supprimer définitivement ce Talent ?</AlertDialog.Description
        >
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
        <form action="?/delete" method="POST" use:kitEnhance>
          <AlertDialog.Action
            type="submit"
            class={buttonVariants({ variant: 'destructive' })}
            >Supprimer définitivement</AlertDialog.Action
          >
        </form>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
</div>
