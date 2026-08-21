<script lang="ts">
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import Check from '@lucide/svelte/icons/check';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Cloud from '@lucide/svelte/icons/cloud';
  import type { FormEditor } from '../editor.svelte';

  let { editor }: { editor: FormEditor } = $props();
</script>

<!-- Quiet, persistent feedback that inline edits actually land (the old editor
     saved silently on blur). Saving spinner while any request is in flight, an
     error once a save has failed (so it never falsely reads "Enregistré"), a
     "non enregistré" note while a field holds typed-but-unsaved input (so it
     never claims "Enregistré" over pending edits), "Enregistré" once something
     saved, otherwise a standing "Enregistrement automatique" so the builder
     reads as auto-saving from the very first edit (testers couldn't tell whether
     their changes were being kept). -->
<div
  class="flex h-6 items-center gap-1.5 text-xs text-muted-foreground"
  aria-live="polite"
>
  {#if editor.inflight > 0}
    <Loader2 class="h-3.5 w-3.5 animate-spin" />
    <span>Enregistrement…</span>
  {:else if editor.hasError}
    <CircleAlert class="h-3.5 w-3.5 text-destructive" />
    <span class="text-destructive">Échec de l'enregistrement</span>
  {:else if editor.isDirty}
    <Pencil class="h-3.5 w-3.5" />
    <span>Modifications non enregistrées</span>
  {:else if editor.lastSavedAt}
    <Check class="h-3.5 w-3.5 text-success" />
    <span>Enregistré</span>
  {:else}
    <Cloud class="h-3.5 w-3.5" />
    <span>Enregistrement automatique</span>
  {/if}
</div>
