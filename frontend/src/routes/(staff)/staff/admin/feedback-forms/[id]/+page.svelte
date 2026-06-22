<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Lock from '@lucide/svelte/icons/lock';
  import Plus from '@lucide/svelte/icons/plus';
  import Eye from '@lucide/svelte/icons/eye';
  import Rows3 from '@lucide/svelte/icons/rows-3';
  import { Button } from '$lib/components/ui/button';
  import { sortable } from '$lib/actions/sortable';
  import { projectEditorToSchema } from '$lib/domain/feedbackForms/projectToSchema';
  import {
    FormEditor,
    type QuestionType,
    type InputKind,
    type EditorOptionKind,
    type FormStatus,
  } from './editor.svelte';
  import FormTabs from './components/FormTabs.svelte';
  import HeaderCard from './components/HeaderCard.svelte';
  import SectionBanner from './components/SectionBanner.svelte';
  import QuestionCard from './components/QuestionCard.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import SaveStatus from './components/SaveStatus.svelte';
  import PreviewDialog from './components/PreviewDialog.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const editor = new FormEditor(
    untrack(() => ({
      formId: data.form.id,
      slug: data.form.slug,
      locked: data.locked,
      meta: {
        title: data.form.title,
        intro: data.form.intro,
        personaName: data.form.personaName,
        status: data.form.status as FormStatus,
        allowsAuthenticatedAccess: data.form.allowsAuthenticatedAccess,
        allowsPublicAccess: data.form.allowsPublicAccess,
        dashboardNudge: data.form.dashboardNudge,
      },
      sections: data.sections.map((s) => ({
        id: s.id,
        title: s.title,
        intro: s.intro,
        position: s.position,
      })),
      questions: data.questions.map((q) => ({
        id: q.id,
        key: q.key,
        position: q.position,
        sectionId: q.sectionId,
        prompt: q.prompt,
        type: q.type as QuestionType,
        required: q.required,
        identity: q.identity,
        inputKind: q.inputKind as InputKind | null,
        minSelections: q.minSelections,
        maxSelections: q.maxSelections,
        skipsIdentity: q.skipsIdentity,
        placeholder: q.placeholder,
        options: q.options.map((o) => ({
          id: o.id,
          label: o.label,
          kind: o.kind as EditorOptionKind,
          position: o.position,
        })),
      })),
    })),
  );

  const locked = $derived(editor.locked);
  const tab = $derived(
    page.url.searchParams.get('tab') === 'settings' ? 'settings' : 'questions',
  );
  const sortedSections = $derived(
    [...editor.sections].sort((a, b) => a.position - b.position),
  );

  let previewOpen = $state(false);
  const previewSchema = $derived(
    projectEditorToSchema({
      slug: editor.slug,
      title: editor.title,
      intro: editor.intro,
      sections: editor.sections,
      questions: editor.questions,
    }),
  );

  // One shared set of drag handlers for every per-section question list (only one
  // drag runs at a time; the controller snapshots/commits the whole flat order).
  const dragHandlers = {
    onStart: () => editor.snapshotQuestions(),
    onMove: (f: string, o: string) => editor.moveQuestion(f, o),
    onCommit: () => editor.commitQuestions(),
  };
</script>

<svelte:head><title>Éditer le formulaire</title></svelte:head>

<div class="space-y-5 pb-24">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <a
      href={resolve('/staff/admin/feedback-forms')}
      class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="h-4 w-4" /> Tous les formulaires
    </a>
    <div class="flex items-center gap-3">
      <SaveStatus {editor} />
      <Button
        variant="outline"
        size="sm"
        class="rounded-sm"
        onclick={() => (previewOpen = true)}
      >
        <Eye class="mr-1.5 h-4 w-4" /> Aperçu
      </Button>
    </div>
  </div>

  <FormTabs formId={editor.formId} />

  {#if locked}
    <div
      class="flex flex-wrap items-start gap-3 rounded-sm border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
    >
      <Lock class="mt-0.5 h-4 w-4 shrink-0" />
      <p class="min-w-0 flex-1">
        Ce formulaire a des réponses : seuls les libellés sont modifiables. Pour
        en changer la structure, dupliquez-le.
      </p>
      <form method="POST" action="?/duplicate" use:enhance>
        <Button type="submit" variant="outline" size="sm" class="rounded-sm">
          Dupliquer
        </Button>
      </form>
    </div>
  {/if}

  {#if tab === 'settings'}
    <SettingsPanel {editor} />
  {:else}
    <div class="mx-auto max-w-2xl space-y-4">
      <HeaderCard {editor} />

      {#each editor.groups as group (group.section?.id ?? '__none__')}
        {#if group.section}
          {@const s = group.section}
          <SectionBanner
            {editor}
            section={s}
            index={sortedSections.findIndex((x) => x.id === s.id) + 1}
            total={sortedSections.length}
            {locked}
          />
        {/if}

        <div
          class="space-y-4"
          use:sortable={{ disabled: locked, ...dragHandlers }}
        >
          {#each group.questions as q (q.id)}
            <QuestionCard
              {editor}
              question={q}
              {locked}
              sections={editor.sections}
            />
          {/each}
        </div>

        {#if !locked}
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-sm border border-dashed py-2.5 text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
            onclick={() =>
              editor.addQuestion({
                afterId: group.questions.at(-1)?.id,
                sectionId: group.section?.id ?? null,
              })}
          >
            <Plus class="h-4 w-4" /> Ajouter une question
          </button>
        {/if}
      {/each}

      {#if editor.groups.length === 0}
        <div
          class="rounded-sm border border-dashed bg-muted/10 p-12 text-center text-sm text-muted-foreground"
        >
          Formulaire vide.
          <button
            type="button"
            class="font-medium text-foreground underline underline-offset-2"
            disabled={locked}
            onclick={() => editor.addQuestion()}
          >
            Ajouter une première question
          </button>.
        </div>
      {/if}

      {#if !locked}
        <button
          type="button"
          class="flex w-full items-center justify-center gap-2 rounded-sm border border-dashed py-2.5 text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
          onclick={() => editor.addSection()}
        >
          <Rows3 class="h-4 w-4" /> Ajouter une section
        </button>
      {/if}
    </div>
  {/if}
</div>

<PreviewDialog bind:open={previewOpen} schema={previewSchema} />
