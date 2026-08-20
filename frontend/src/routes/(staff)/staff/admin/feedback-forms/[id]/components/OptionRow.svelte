<script lang="ts">
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import Circle from '@lucide/svelte/icons/circle';
  import Square from '@lucide/svelte/icons/square';
  import X from '@lucide/svelte/icons/x';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import RowSaveDot from './RowSaveDot.svelte';
  import { createAutosave } from '../autosave';
  import { editableInline } from '../editableField';
  import type {
    FormEditor,
    EditorOption,
    QuestionType,
  } from '../editor.svelte';

  let {
    editor,
    qid,
    type,
    option,
    index,
    locked,
    showKind,
  }: {
    editor: FormEditor;
    qid: string;
    type: QuestionType;
    option: EditorOption;
    index: number;
    locked: boolean;
    showKind: boolean;
  } = $props();

  const KIND_LABELS: Record<string, string> = {
    choice: 'Choix',
    extra: 'Extra',
  };

  // Set when a rename was refused as a duplicate, so the row shows a soft inline
  // warning instead of the editor's blocking error toast (cleared on next focus).
  let dupWarning = $state(false);

  // The bot's reaction to this choice. The editor row is shown whenever a reaction
  // exists, or once the author toggles it open on an option that has none yet.
  let showReaction = $state(false);
  const hasReaction = $derived(!!option.reaction);
  const reactionTooltip = $derived(
    hasReaction
      ? 'Réaction de la mascotte'
      : 'Ajouter une réaction de la mascotte',
  );

  // The label stays blur-only (delay 0): it is the answer key and is unique per
  // question, so it is validated and persisted once, on commit, not on every
  // keystroke. A rejected (empty / duplicate) rename snaps the field back to the
  // saved label and a duplicate raises the soft inline warning. Typing still
  // marks the row dirty so the header reads "non enregistré" in the meantime.
  const labelField = createAutosave({
    registry: () => editor,
    delay: 0,
    commit: (value) => {
      const res = editor.renameOption(qid, option.id, value);
      dupWarning = res === 'duplicate';
      if (res !== 'ok') return option.label;
    },
  });
  // The reaction is free text: it saves live while typing, trimming on blur.
  const reactionField = createAutosave({
    registry: () => editor,
    commit: (value, { final }) => {
      const next = (final ? value.trim() : value) || null;
      if (next !== (option.reaction ?? null))
        editor.patchOption(qid, option.id, { reaction: next });
    },
  });
</script>

<!-- WYSIWYG option row: the glyph mirrors how the option renders (radio / checkbox
     / numbered scale), the label is edited inline. An optional second line holds
     the bot's reaction to this choice. -->
<div class="group" data-sort-id={option.id}>
  <div class="flex items-center gap-2">
    <button
      type="button"
      data-drag-handle
      class="cursor-grab text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-0"
      disabled={locked}
      aria-label="Déplacer l'option"
      onkeydown={(e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          editor.nudgeOption(qid, option.id, -1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          editor.nudgeOption(qid, option.id, 1);
        }
      }}
    >
      <GripVertical class="h-4 w-4" />
    </button>

    <span
      class="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground"
    >
      {#if type === 'multiple'}
        <Square class="h-4 w-4" />
      {:else if type === 'scale'}
        <span class="text-xs font-medium tabular-nums">{index + 1}</span>
      {:else}
        <Circle class="h-4 w-4" />
      {/if}
    </span>

    <input
      value={option.label}
      aria-label="Libellé de l'option"
      class={editableInline('flex-1 py-1 text-sm')}
      onfocus={() => (dupWarning = false)}
      oninput={labelField.oninput}
      onblur={labelField.onblur}
    />

    {#if showKind}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="cursor-pointer rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={locked}
        >
          {KIND_LABELS[option.kind] ?? option.kind}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          {#each Object.entries(KIND_LABELS) as [value, label] (value)}
            <DropdownMenu.Item
              onSelect={() =>
                value !== option.kind &&
                editor.patchOption(qid, option.id, {
                  kind: value as EditorOption['kind'],
                })}
            >
              {label}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}

    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            type="button"
            aria-label={reactionTooltip}
            aria-pressed={showReaction || hasReaction}
            class="cursor-pointer rounded-sm p-1 transition hover:bg-muted {hasReaction
              ? 'text-epi-tomorrow'
              : 'text-muted-foreground/60 opacity-0 group-hover:opacity-100'}"
            onclick={() => (showReaction = !showReaction)}
          >
            <MessageCircle class="h-4 w-4" />
          </button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>{reactionTooltip}</Tooltip.Content>
    </Tooltip.Root>

    <RowSaveDot state={editor.status_.get(option.id)} />

    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            type="button"
            class="cursor-pointer rounded-sm p-1 text-muted-foreground/60 opacity-0 transition group-hover:opacity-100 hover:bg-muted hover:text-destructive disabled:opacity-0"
            disabled={locked}
            aria-label="Supprimer l'option"
            onclick={() => editor.deleteOption(qid, option.id)}
          >
            <X class="h-4 w-4" />
          </button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>Supprimer l'option</Tooltip.Content>
    </Tooltip.Root>
  </div>

  {#if dupWarning}
    <p class="mt-1 pl-12 text-[11px] text-amber-600 dark:text-amber-500">
      Ce libellé est déjà utilisé dans cette question.
    </p>
  {/if}

  {#if showReaction || hasReaction}
    <!-- A placed reaction reads as a pink-tinted bot bubble (solid border, normal
         weight); an empty/just-opened row stays a dashed, italic placeholder, so
         "has a reaction" vs "none yet" is obvious at a glance. -->
    <div class="mt-1.5 flex items-start gap-2 pl-12">
      <MessageCircle
        class="mt-1.5 h-3.5 w-3.5 shrink-0 {hasReaction
          ? 'text-epi-tomorrow'
          : 'text-muted-foreground/50'}"
      />
      <input
        value={option.reaction ?? ''}
        aria-label="Réaction de la mascotte à cette option"
        placeholder="Réaction de la mascotte (facultatif), ex. « Ahhh j'adore ! »"
        class="flex-1 cursor-text rounded-xl rounded-bl-sm border px-3 py-1.5 text-xs transition outline-none {hasReaction
          ? 'border-epi-tomorrow/30 bg-epi-tomorrow/10 text-foreground focus:border-epi-tomorrow'
          : 'border-dashed bg-transparent text-muted-foreground italic focus:border-foreground'}"
        oninput={reactionField.oninput}
        onblur={reactionField.onblur}
      />
    </div>
  {/if}
</div>
