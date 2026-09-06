<script lang="ts">
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import Copy from '@lucide/svelte/icons/copy';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Plus from '@lucide/svelte/icons/plus';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import SquareCheck from '@lucide/svelte/icons/square-check';
  import Star from '@lucide/svelte/icons/star';
  import Minus from '@lucide/svelte/icons/minus';
  import AlignLeft from '@lucide/svelte/icons/align-left';
  import Asterisk from '@lucide/svelte/icons/asterisk';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import ContactRound from '@lucide/svelte/icons/contact-round';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import * as Select from '$lib/components/ui/select';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { sortable } from '$lib/actions/sortable';
  import TypePicker from './TypePicker.svelte';
  import OptionRow from './OptionRow.svelte';
  import RowSaveDot from './RowSaveDot.svelte';
  import IdentityBadge from './IdentityBadge.svelte';
  import { createAutosave } from '../autosave';
  import {
    IDENTITY_FIELD_OPTIONS,
    IDENTITY_FIELD_TO_INPUT_KIND,
  } from '$lib/domain/feedbackForms/schema';
  import type {
    FormEditor,
    EditorQuestion,
    EditorSection,
    QuestionType,
    InputKind,
    IdentityField,
  } from '../editor.svelte';

  let {
    editor,
    question: q,
    locked,
    sections,
  }: {
    editor: FormEditor;
    question: EditorQuestion;
    locked: boolean;
    sections: EditorSection[];
  } = $props();

  // The prompt is stored verbatim; the placeholder is optional (empty → null).
  // Both save live while typing and flush on blur.
  const promptField = createAutosave({
    registry: () => editor,
    commit: (value) => {
      if (value !== q.prompt) editor.patchQuestion(q.id, { prompt: value });
    },
  });
  const placeholderField = createAutosave({
    registry: () => editor,
    commit: (value) => {
      const next = value || null;
      if (next !== q.placeholder)
        editor.patchQuestion(q.id, { placeholder: next });
    },
  });

  const active = $derived(editor.activeId === q.id);
  // 1-based rank in the form's flattened order, so each card reads as a numbered
  // question (testers mistook the first question for the section's description).
  const number = $derived(editor.questions.findIndex((x) => x.id === q.id) + 1);

  const TYPE_ICON = {
    single: CircleDot,
    multiple: SquareCheck,
    scale: Star,
    text: Minus,
    textarea: AlignLeft,
  } as const;
  const Icon = $derived(TYPE_ICON[q.type]);

  const INPUT_KINDS = [
    { value: '', label: 'Texte libre' },
    { value: 'email', label: 'E-mail' },
    { value: 'tel', label: 'Téléphone' },
    { value: 'name', label: 'Nom' },
    { value: 'text', label: 'Texte' },
  ];

  // Fields already collected by another question, so we can't pick them here
  // (each identity field is unique per form; the server returns 409 otherwise).
  const usedFields = $derived(editor.usedIdentityFields(q.id));
  // Validation derived from the identity field (the projection forces it, so the
  // manual "Validation" selector is hidden and this read-only note shown instead).
  const derivedKind = $derived(
    q.identityField ? IDENTITY_FIELD_TO_INPUT_KIND[q.identityField] : null,
  );
  const DERIVED_KIND_LABEL: Record<NonNullable<typeof derivedKind>, string> = {
    email: 'Validé comme une adresse e-mail.',
    tel: 'Validé comme un numéro de téléphone.',
    name: 'Saisi comme du texte court.',
    text: 'Saisi comme du texte court.',
  };
  // Identity question that reaches nobody: only public respondents are asked
  // identity questions, so without public access it is never shown.
  const unreachable = $derived(editor.isIdentityUnreachable(q));

  const hasOptions = $derived(q.type !== 'text' && q.type !== 'textarea');
  const showKind = $derived(q.type === 'scale');

  function intOrNull(v: string): number | null {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
</script>

<div
  data-sort-id={q.id}
  class="group relative rounded-sm border bg-card transition-shadow {active
    ? 'border-l-4 border-l-epi-tomorrow shadow-raised'
    : 'cursor-pointer shadow-raised hover:border-foreground/20'} {editor.status_.get(
    q.id,
  ) === 'error'
    ? 'ring-1 ring-destructive'
    : ''}"
>
  <!-- Drag handle: centered on the top edge, revealed on hover. -->
  <button
    type="button"
    data-drag-handle
    class="absolute -top-0 left-1/2 z-10 -translate-x-1/2 cursor-grab rounded-b-sm px-3 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground active:cursor-grabbing disabled:opacity-0"
    disabled={locked}
    aria-label="Déplacer la question"
    title="Glisser pour déplacer (ou ↑ / ↓)"
    onkeydown={(e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        editor.nudgeQuestion(q.id, -1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        editor.nudgeQuestion(q.id, 1);
      }
    }}
  >
    <GripVertical class="h-4 w-4 rotate-90" />
  </button>

  {#if !active}
    <!-- Compact summary -->
    <button
      type="button"
      class="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
      onclick={() => editor.setActive(q.id)}
    >
      <span
        class="w-4 shrink-0 text-center text-xs font-medium text-muted-foreground"
        >{number}</span
      >
      <Icon class="h-4 w-4 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate text-sm font-medium">
        {q.prompt || 'Question sans intitulé'}
      </span>
      {#if q.identityField}
        <IdentityBadge field={q.identityField} />
      {/if}
      {#if q.required}
        <Asterisk class="h-3.5 w-3.5 shrink-0 text-epi-tomorrow" />
      {/if}
      <RowSaveDot state={editor.status_.get(q.id)} />
    </button>
  {:else}
    <!-- Active editor -->
    <div class="space-y-4 p-5 pt-6">
      <div class="flex items-center justify-between">
        <span class="epi-overline text-muted-foreground">
          Question {number}
        </span>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                class="cursor-pointer rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Réduire la question"
                onclick={() => editor.setActive(null)}
              >
                <ChevronUp class="h-4 w-4" />
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>Réduire</Tooltip.Content>
        </Tooltip.Root>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Textarea
          value={q.prompt}
          rows={2}
          aria-label="Intitulé de la question"
          placeholder="Question"
          class="flex-1 cursor-text resize-none rounded-none border-0 border-b bg-muted/30 px-3 py-2 text-base shadow-none focus-visible:border-foreground focus-visible:outline-none"
          oninput={promptField.oninput}
          onblur={promptField.onblur}
        />
        <TypePicker
          value={q.type}
          disabled={locked}
          exclude={q.identityField ? ['multiple'] : []}
          onChange={(t) => editor.patchQuestion(q.id, { type: t })}
        />
      </div>

      <!-- Dead-question consequence: an identity question is only ever shown to
           public respondents, so without public access it reaches nobody. Shown
           inline (not just in the footer menu) so the misconfig can't be missed.
           Only renders on the rare misconfigured card, never on normal ones. -->
      {#if unreachable}
        <div
          class="flex items-start gap-2 rounded-sm border border-warning/30 bg-warning/10 p-2 text-xs leading-snug text-warning"
        >
          <TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p class="min-w-0 flex-1">
            Cette donnée d'identité n'est demandée qu'aux répondants publics, or
            l'accès public est désactivé : cette question n'est affichée à
            personne.
          </p>
        </div>
      {/if}

      <!-- Body: mirrors the rendered answer control -->
      {#if hasOptions}
        <div
          class="space-y-1"
          use:sortable={{
            disabled: locked,
            onStart: () => editor.snapshotOptions(q.id),
            onMove: (f, o) => editor.moveOption(q.id, f, o),
            onCommit: () => editor.commitOptions(q.id),
          }}
        >
          {#each q.options as o, i (o.id)}
            <OptionRow
              {editor}
              qid={q.id}
              type={q.type}
              option={o}
              index={i}
              {locked}
              {showKind}
            />
          {/each}
        </div>
        <button
          type="button"
          class="ml-7 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={locked}
          onclick={() => editor.addOption(q.id)}
        >
          <Plus class="h-4 w-4" /> Ajouter une option
        </button>

        {#if q.type === 'multiple'}
          <div class="flex flex-wrap items-center gap-4 pt-1 text-sm">
            <label class="flex items-center gap-2 text-muted-foreground">
              Min.
              <Input
                type="number"
                min="0"
                value={q.minSelections ?? ''}
                disabled={locked}
                class="h-8 w-16 rounded-sm"
                onchange={(e) =>
                  editor.patchQuestion(q.id, {
                    minSelections: intOrNull(e.currentTarget.value),
                  })}
              />
            </label>
            <label class="flex items-center gap-2 text-muted-foreground">
              Max.
              <Input
                type="number"
                min="0"
                value={q.maxSelections ?? ''}
                disabled={locked}
                class="h-8 w-16 rounded-sm"
                onchange={(e) =>
                  editor.patchQuestion(q.id, {
                    maxSelections: intOrNull(e.currentTarget.value),
                  })}
              />
            </label>
          </div>
        {/if}
      {:else}
        <!-- Text / paragraph: faux input preview + config -->
        <div class="space-y-3">
          <div
            class="rounded-sm border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
          >
            {q.type === 'textarea'
              ? 'Réponse longue du stagiaire'
              : 'Réponse courte du stagiaire'}
          </div>
          <div class="flex flex-wrap items-center gap-4">
            {#if q.identityField}
              <!-- Identity questions derive their validation from the field; the
                   manual selector is hidden and the derived rule shown read-only. -->
              {#if derivedKind}
                <span class="text-xs text-muted-foreground"
                  >{DERIVED_KIND_LABEL[derivedKind]}</span
                >
              {/if}
            {:else if q.type === 'text'}
              <label
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                Validation
                <Select.Root
                  type="single"
                  value={q.inputKind ?? ''}
                  disabled={locked}
                  onValueChange={(v) =>
                    editor.patchQuestion(q.id, {
                      inputKind: (v || null) as InputKind | null,
                    })}
                >
                  <Select.Trigger class="h-8 w-40 rounded-sm">
                    {INPUT_KINDS.find((k) => k.value === (q.inputKind ?? ''))
                      ?.label}
                  </Select.Trigger>
                  <Select.Content>
                    {#each INPUT_KINDS as k (k.value)}
                      <Select.Item value={k.value}>{k.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </label>
            {/if}
            <Input
              value={q.placeholder ?? ''}
              placeholder="Placeholder (optionnel)"
              disabled={locked}
              class="h-8 w-56 rounded-sm"
              oninput={placeholderField.oninput}
              onblur={placeholderField.onblur}
            />
          </div>
        </div>
      {/if}

      <!-- Footer toolbar -->
      <div
        class="flex flex-wrap items-center justify-between gap-2 border-t pt-3"
      >
        <!-- Identity property: a compact, top-level labelled control (not a body
             block, so the ~80% of normal questions stay clean; not buried in the
             overflow menu, so it stays discoverable). The trigger shows the teal
             badge when set, a muted button otherwise. -->
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            disabled={locked}
            class="cursor-pointer rounded-sm disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Donnée d'identité"
          >
            {#if q.identityField}
              <IdentityBadge field={q.identityField} />
            {:else}
              <span
                class="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <ContactRound class="h-3.5 w-3.5" /> Donnée d'identité
              </span>
            {/if}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="w-64">
            <DropdownMenu.RadioGroup
              value={q.identityField ?? ''}
              onValueChange={(v) =>
                editor.setIdentityField(
                  q.id,
                  (v || null) as IdentityField | null,
                )}
            >
              <DropdownMenu.RadioItem value="">
                Question normale
              </DropdownMenu.RadioItem>
              <DropdownMenu.Separator />
              {#each IDENTITY_FIELD_OPTIONS as o (o.value)}
                <DropdownMenu.RadioItem
                  value={o.value}
                  disabled={usedFields.has(o.value)}
                >
                  {o.label}
                  {#if usedFields.has(o.value)}
                    <span class="ml-auto pl-2 text-xs text-muted-foreground"
                      >déjà utilisée</span
                    >
                  {/if}
                </DropdownMenu.RadioItem>
              {/each}
            </DropdownMenu.RadioGroup>
            <DropdownMenu.Separator />
            <p class="px-2 py-1.5 text-xs leading-snug text-muted-foreground">
              Demandée aux répondants publics et toujours obligatoire. Les
              talents connectés ne la voient pas : Jump connaît déjà leur
              identité.
            </p>
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <div class="flex items-center gap-1">
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  class="cursor-pointer rounded-sm p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={locked}
                  aria-label="Dupliquer la question"
                  onclick={() => editor.duplicateQuestion(q.id)}
                >
                  <Copy class="h-4 w-4" />
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Dupliquer la question</Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  class="cursor-pointer rounded-sm p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={locked}
                  aria-label="Supprimer la question"
                  onclick={() => editor.deleteQuestion(q.id)}
                >
                  <Trash2 class="h-4 w-4" />
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Supprimer la question</Tooltip.Content>
          </Tooltip.Root>
          <div class="mx-1 h-5 w-px bg-border"></div>
          {#if q.identityField}
            <!-- Identity fields are always required (no anonymous respondents);
               the switch is locked on so the invariant reads at a glance. -->
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <span
                    {...props}
                    class="flex items-center gap-2 px-1 text-sm text-muted-foreground"
                  >
                    Obligatoire
                    <Switch checked disabled />
                  </span>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content>
                Toujours obligatoire pour une donnée d'identité.
              </Tooltip.Content>
            </Tooltip.Root>
          {:else}
            <label class="flex items-center gap-2 px-1 text-sm">
              Obligatoire
              <Switch
                checked={q.required}
                disabled={locked}
                onCheckedChange={(v) =>
                  v !== q.required &&
                  editor.patchQuestion(q.id, { required: v })}
              />
            </label>
          {/if}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class="cursor-pointer rounded-sm p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Plus d'options"
            >
              <EllipsisVertical class="h-4 w-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" class="w-56">
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger disabled={locked}>
                  Déplacer vers…
                </DropdownMenu.SubTrigger>
                <DropdownMenu.SubContent>
                  <DropdownMenu.Item
                    onSelect={() => editor.moveQuestionToSection(q.id, null)}
                  >
                    Aucune section
                  </DropdownMenu.Item>
                  {#each sections as s (s.id)}
                    <DropdownMenu.Item
                      onSelect={() => editor.moveQuestionToSection(q.id, s.id)}
                    >
                      {s.title}
                    </DropdownMenu.Item>
                  {/each}
                </DropdownMenu.SubContent>
              </DropdownMenu.Sub>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>
    </div>

    <!-- Floating add-rail beside the active card (xl+) -->
    <div
      class="absolute top-4 -right-12 hidden flex-col gap-1 rounded-sm border bg-card p-1 shadow-raised xl:flex"
    >
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              class="cursor-pointer rounded-sm p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              disabled={locked}
              aria-label="Ajouter une question ici"
              onclick={() => editor.addQuestion({ afterId: q.id })}
            >
              <Plus class="h-4 w-4" />
            </button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="right">Ajouter une question</Tooltip.Content>
      </Tooltip.Root>
    </div>
  {/if}
</div>
