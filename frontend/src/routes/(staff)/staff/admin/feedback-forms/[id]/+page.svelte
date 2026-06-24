<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Lock from '@lucide/svelte/icons/lock';
  import Plus from '@lucide/svelte/icons/plus';
  import Eye from '@lucide/svelte/icons/eye';
  import Rows3 from '@lucide/svelte/icons/rows-3';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
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
  import DiffusionPopover from './components/DiffusionPopover.svelte';
  import SectionBanner from './components/SectionBanner.svelte';
  import QuestionCard from './components/QuestionCard.svelte';
  import SaveStatus from './components/SaveStatus.svelte';
  import PreviewDialog from './components/PreviewDialog.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  function buildInit(d: PageData) {
    return {
      formId: d.form.id,
      slug: d.form.slug,
      locked: d.locked,
      meta: {
        title: d.form.title,
        intro: d.form.intro,
        outro: d.form.outro,
        personaName: d.form.personaName,
        status: d.form.status as FormStatus,
        allowsAuthenticatedAccess: d.form.allowsAuthenticatedAccess,
        allowsPublicAccess: d.form.allowsPublicAccess,
        dashboardNudge: d.form.dashboardNudge,
      },
      sections: d.sections.map((s) => ({
        id: s.id,
        title: s.title,
        intro: s.intro,
        position: s.position,
      })),
      questions: d.questions.map((q) => ({
        id: q.id,
        key: q.key,
        position: q.position,
        sectionId: q.sectionId,
        prompt: q.prompt,
        type: q.type as QuestionType,
        required: q.required,
        identityField: q.identityField,
        inputKind: q.inputKind as InputKind | null,
        minSelections: q.minSelections,
        maxSelections: q.maxSelections,
        placeholder: q.placeholder,
        options: q.options.map((o) => ({
          id: o.id,
          label: o.label,
          kind: o.kind as EditorOptionKind,
          position: o.position,
          reaction: o.reaction,
        })),
      })),
    };
  }

  // Rebuild the controller ONLY when navigating to a different form. SvelteKit
  // reuses this component across the [id] param (e.g. the locked banner's
  // "Dupliquer" redirect lands on the new form's id), so a one-shot `new
  // FormEditor` at mount would keep rendering the old form until a full refresh.
  // The body is untracked so same-form invalidations (polls, optimistic reloads)
  // never clobber in-flight local edits; only the id change recreates it.
  const editor = $derived.by(() => {
    void data.form.id;
    return untrack(() => new FormEditor(buildInit(data)));
  });

  const locked = $derived(editor.locked);
  const sortedSections = $derived(
    [...editor.sections].sort((a, b) => a.position - b.position),
  );

  let previewOpen = $state(false);
  let previewAudience = $state<'public' | 'authenticated'>('authenticated');
  const previewSchema = $derived(
    projectEditorToSchema(
      {
        slug: editor.slug,
        title: editor.title,
        intro: editor.intro,
        outro: editor.outro,
        personaName: editor.personaName,
        sections: editor.sections,
        questions: editor.questions,
      },
      previewAudience,
    ),
  );
  // A connected talent has a known identity (used to interpolate copy); a public
  // respondent does not (they are asked it in-flow).
  const previewIdentity = $derived(
    previewAudience === 'authenticated'
      ? { prenom: 'Marc', campus: 'Lyon' }
      : {},
  );

  function openPreview() {
    // Default to the more surprising experience available: a public-only form
    // previews public, everything else previews the connected-talent flow.
    previewAudience =
      editor.allowsPublicAccess && !editor.allowsAuthenticatedAccess
        ? 'public'
        : 'authenticated';
    previewOpen = true;
  }

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
  <Tooltip.Provider delayDuration={300}>
    <!-- Sticky top chrome: keeps the save status (so testers always see edits
       are being kept), the preview, the tabs, and (when the form is locked)
       the lock notice in view while scrolling a long form. The banner is the
       last child of this one sticky element rather than a second sticky pinned
       below it: a long locked form is effectively read-only, so the reason its
       controls are disabled should stay on screen the whole time, and folding
       it in here avoids coupling a second sticky to this bar's (wrapping)
       height. The negative top offset cancels the admin <main>'s padding
       (p-4 md:p-8) so the bar pins flush at the very top; with plain `top-0` a
       sticky element clamps to the content box and leaks a padding-tall strip
       of content above it. Opaque so dense cards don't ghost through; the tab
       bar's border-b is the seam under the tabs, and the lock banner, when
       shown, is the bottom edge. -->
    <div class="sticky -top-4 z-20 space-y-3 bg-background pt-3 md:-top-8">
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
            onclick={openPreview}
          >
            <Eye class="mr-1.5 h-4 w-4" /> Aperçu
          </Button>
          <DiffusionPopover {editor} />
        </div>
      </div>

      <FormTabs formId={editor.formId} />

      {#if locked}
        <div
          class="flex flex-wrap items-start gap-3 rounded-sm border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <Lock class="mt-0.5 h-4 w-4 shrink-0" />
          <p class="min-w-0 flex-1">
            Ce formulaire a des réponses : seuls les libellés sont modifiables.
            Pour en changer la structure, dupliquez-le.
          </p>
          <form method="POST" action="?/duplicate" use:enhance>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              class="rounded-sm"
            >
              Dupliquer
            </Button>
          </form>
        </div>
      {/if}
    </div>

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
            class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed py-2.5 text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
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
            class="cursor-pointer font-medium text-foreground underline underline-offset-2 disabled:cursor-not-allowed"
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
          class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed py-2.5 text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
          onclick={() => editor.addSection()}
        >
          <Rows3 class="h-4 w-4" /> Ajouter une section
        </button>
      {/if}
    </div>
  </Tooltip.Provider>
</div>

<PreviewDialog
  bind:open={previewOpen}
  bind:audience={previewAudience}
  schema={previewSchema}
  identity={previewIdentity}
/>
