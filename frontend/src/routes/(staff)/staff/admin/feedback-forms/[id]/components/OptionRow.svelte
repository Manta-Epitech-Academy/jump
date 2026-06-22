<script lang="ts">
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import Circle from '@lucide/svelte/icons/circle';
  import Square from '@lucide/svelte/icons/square';
  import X from '@lucide/svelte/icons/x';
  import { Input } from '$lib/components/ui/input';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import RowSaveDot from './RowSaveDot.svelte';
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
    skip: 'Passer',
  };
</script>

<!-- WYSIWYG option row: the glyph mirrors how the option renders (radio / checkbox
     / numbered scale), the label is edited inline. -->
<div class="group flex items-center gap-2" data-sort-id={option.id}>
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
    class="flex-1 border-b border-transparent bg-transparent py-1 text-sm outline-none hover:border-border focus:border-foreground"
    onblur={(e) =>
      e.currentTarget.value !== option.label &&
      editor.patchOption(qid, option.id, { label: e.currentTarget.value })}
  />

  {#if showKind}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class="rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
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

  <RowSaveDot state={editor.status_.get(option.id)} />

  <button
    type="button"
    class="rounded-sm p-1 text-muted-foreground/60 opacity-0 transition group-hover:opacity-100 hover:bg-muted hover:text-destructive disabled:opacity-0"
    disabled={locked}
    aria-label="Supprimer l'option"
    onclick={() => editor.deleteOption(qid, option.id)}
  >
    <X class="h-4 w-4" />
  </button>
</div>
