<script lang="ts">
  import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import RowSaveDot from './RowSaveDot.svelte';
  import type { FormEditor, EditorSection } from '../editor.svelte';

  let {
    editor,
    section,
    index,
    total,
    locked,
  }: {
    editor: FormEditor;
    section: EditorSection;
    index: number;
    total: number;
    locked: boolean;
  } = $props();
</script>

<!-- Full-width section banner that owns the question block beneath it. -->
<div class="overflow-hidden rounded-sm border bg-card shadow-sm">
  <div class="h-1.5 bg-epi-teal/70"></div>
  <div class="flex items-start gap-3 p-4">
    <div class="min-w-0 flex-1 space-y-1.5">
      <div
        class="flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase"
      >
        Section {index} sur {total}
        <RowSaveDot state={editor.status_.get(section.id)} />
      </div>
      <input
        value={section.title}
        aria-label="Titre de la section"
        placeholder="Titre de la section"
        class="w-full border-b border-transparent bg-transparent pb-1 text-lg font-semibold outline-none hover:border-border focus:border-foreground"
        onblur={(e) =>
          e.currentTarget.value.trim() &&
          e.currentTarget.value !== section.title &&
          editor.patchSection(section.id, { title: e.currentTarget.value })}
      />
      <Textarea
        value={section.intro ?? ''}
        rows={1}
        aria-label="Description de la section"
        placeholder="Description (optionnelle)"
        class="resize-none border-0 px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
        onblur={(e) =>
          (e.currentTarget.value || null) !== section.intro &&
          editor.patchSection(section.id, {
            intro: e.currentTarget.value || null,
          })}
      />
    </div>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class="cursor-pointer rounded-sm p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        disabled={locked}
        aria-label="Actions de la section"
      >
        <EllipsisVertical class="h-4 w-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-44">
        <DropdownMenu.Item
          disabled={index <= 1}
          onSelect={() => editor.moveSectionBy(section.id, -1)}
        >
          <ChevronUp class="mr-2 h-4 w-4" /> Monter
        </DropdownMenu.Item>
        <DropdownMenu.Item
          disabled={index >= total}
          onSelect={() => editor.moveSectionBy(section.id, 1)}
        >
          <ChevronDown class="mr-2 h-4 w-4" /> Descendre
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          class="text-destructive data-highlighted:text-destructive"
          onSelect={() => editor.deleteSection(section.id)}
        >
          <Trash2 class="mr-2 h-4 w-4" /> Supprimer la section
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
</div>
