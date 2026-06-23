<script lang="ts">
  import { Textarea } from '$lib/components/ui/textarea';
  import type { FormEditor } from '../editor.svelte';

  let { editor }: { editor: FormEditor } = $props();
</script>

<!-- Google-Forms header card: the form title + intro are the document's heading,
     edited in place. Brand accent bar on top. Auto-saves on blur. -->
<div class="overflow-hidden rounded-sm border bg-card shadow-sm">
  <div class="h-2.5 bg-epi-pink"></div>
  <div class="space-y-2 p-5">
    <input
      value={editor.title}
      aria-label="Titre du formulaire"
      placeholder="Titre du formulaire"
      class="w-full border-b border-transparent bg-transparent pb-1 text-2xl font-semibold tracking-tight outline-none focus:border-border"
      onblur={(e) =>
        e.currentTarget.value.trim() &&
        e.currentTarget.value !== editor.title &&
        editor.patchForm({ title: e.currentTarget.value })}
    />
    <Textarea
      value={editor.intro}
      rows={2}
      aria-label="Message d'introduction"
      placeholder="Message d'introduction"
      class="resize-none border-0 px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
      onblur={(e) =>
        e.currentTarget.value.trim() &&
        e.currentTarget.value !== editor.intro &&
        editor.patchForm({ intro: e.currentTarget.value })}
    />
    <div class="border-t pt-2">
      <Textarea
        value={editor.outro ?? ''}
        rows={2}
        aria-label="Message de fin"
        placeholder={'Message de fin (facultatif), ex. « Merci {prenom} ! »'}
        class="resize-none border-0 px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
        onblur={(e) => {
          const next = e.currentTarget.value.trim() || null;
          if (next !== (editor.outro ?? null))
            editor.patchForm({ outro: next });
        }}
      />
    </div>
  </div>
</div>
