<script lang="ts">
  import type { PageData } from './$types';
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { ArrowLeft, Clock, Trash2 } from '@lucide/svelte';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { Badge } from '$lib/components/ui/badge';
  import { Separator } from '$lib/components/ui/separator';
  import { toast } from 'svelte-sonner';
  import { enhance as kitEnhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import StudentFormDialog from '../components/StudentFormDialog.svelte';
  import StudentProfileCard from './components/StudentProfileCard.svelte';
  import StudentTimeline from './components/StudentTimeline.svelte';
  import { m } from '$lib/paraglide/messages.js';

  let { data }: { data: PageData } = $props();


  const { form, errors, delayed, enhance, reset } = superForm(
    untrack(() => data.form),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          editOpen = false;
          toast.success(m.student_detail_update_success());
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
    $form.email = data.student.user?.email ?? '';
    $form.phone = data.student.phone ?? '';
    $form.parent_email = data.student.parentEmail ?? '';
    $form.parent_phone = data.student.parentPhone ?? '';
    $form.niveau = (data.student.niveau || '') as any;
    $form.niveau_difficulte = (data.student.niveauDifficulte || 'Débutant') as any;
    editOpen = true;
  }
</script>

<div class="space-y-6 pb-10">
  <div class="flex items-center gap-4">
    <Button variant="ghost" size="icon" href={resolve('/students')}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <h1 class="text-3xl font-bold text-epi-blue uppercase">
      {m.student_detail_title()}<span class="text-epi-teal">_</span>
    </h1>
  </div>

  <div class="grid gap-6 md:grid-cols-12">
    <div class="space-y-6 md:col-span-4 lg:col-span-3">
      <StudentProfileCard
        student={data.student}
        stats={data.stats}
        {xpProgress}
        onOpenEdit={openEdit}
      />
    </div>

    <div class="space-y-6 md:col-span-8 lg:col-span-9">
      <div class="flex items-center justify-between">
        <h2 class="flex items-center gap-2 text-xl font-bold uppercase">
          <Clock class="h-5 w-5 text-muted-foreground" /> {m.student_detail_history_title()}
        </h2>
        <Badge variant="secondary">{m.student_detail_sessions_count({ count: data.participations.length })}</Badge>
      </div>

      <StudentTimeline participations={data.participations} />
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
          {m.student_detail_danger_zone()}
        </h4>
        <p class="text-xs text-muted-foreground">
          {m.student_detail_danger_warning()}
        </p>
      </div>
      <Button
        type="button"
        variant="destructive"
        class="w-full"
        onclick={() => {
          editOpen = false;
          deleteDialogOpen = true;
        }}><Trash2 class="mr-2 h-4 w-4" /> {m.student_detail_delete_button()}</Button
      >
    </div>
  </StudentFormDialog>

  <AlertDialog.Root bind:open={deleteDialogOpen}>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>{m.student_detail_delete_confirm_title()}</AlertDialog.Title>
        <AlertDialog.Description
          >{m.student_detail_delete_confirm_description()}</AlertDialog.Description
        >
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
        <form action="?/delete" method="POST" use:kitEnhance>
          <AlertDialog.Action
            type="submit"
            class={buttonVariants({ variant: 'destructive' })}
            >{m.camper_settings_delete_definitive()}</AlertDialog.Action
          >
        </form>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
</div>

<style>
  @keyframes sheen {
    0% {
      background-position: 200% center;
    }
    100% {
      background-position: -200% center;
    }
  }
  :global(.shiny-badge) {
    background-image: linear-gradient(
      120deg,
      transparent 30%,
      rgba(255, 255, 255, 0.6) 50%,
      transparent 70%
    );
    background-size: 200% auto;
    animation: sheen 3s infinite linear;
    position: relative;
    overflow: hidden;
  }
  :global(.dark .shiny-badge) {
    background-image: linear-gradient(
      120deg,
      transparent 30%,
      rgba(255, 255, 255, 0.15) 50%,
      transparent 70%
    );
  }
</style>
