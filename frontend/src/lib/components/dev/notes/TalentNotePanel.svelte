<script lang="ts">
  import Pencil from '@lucide/svelte/icons/pencil';
  import Plus from '@lucide/svelte/icons/plus';
  import { Button } from '$lib/components/ui/button';
  import TalentNoteEditor from './TalentNoteEditor.svelte';

  // Read-first wrapper around the shared TalentNoteEditor for the talent fiche,
  // where the note is consulted far more often than edited. Shows a quiet read
  // view (or an "add" prompt when empty) and only mounts the editor on demand.
  // The editor stays the single editing surface, used directly in the émargement
  // modal where opening it straight away is the intent.
  let {
    talentId,
    note = null,
  }: {
    talentId: string;
    note?: string | null;
  } = $props();

  // The panel owns the displayed note after mount, refreshing it from the
  // editor's save callback; capturing the initial prop value is intentional.
  // svelte-ignore state_referenced_locally
  let current = $state(note);
  let editing = $state(false);
</script>

{#if editing}
  <TalentNoteEditor
    {talentId}
    note={current}
    onSaved={(saved) => {
      current = saved;
      editing = false;
    }}
    onCancel={() => (editing = false)}
  />
{:else if current?.trim()}
  <div class="space-y-3">
    <!-- Render the note as a tinted callout, not bare body copy, so it reads as
         a deliberate staff annotation rather than more dossier data. Epi-blue
         left accent ties it to the note identity used on the émargement table. -->
    <div
      class="rounded-sm border-l-2 border-epi-blue bg-epi-blue/5 px-3 py-2.5"
    >
      <p class="text-sm whitespace-pre-wrap">{current}</p>
    </div>
    <div class="flex items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground">
        Visible uniquement par le staff.
      </p>
      <Button size="sm" variant="outline" onclick={() => (editing = true)}>
        <Pencil class="mr-1.5 h-3.5 w-3.5" />
        Modifier
      </Button>
    </div>
  </div>
{:else}
  <div class="flex flex-col items-start gap-3">
    <p class="text-sm text-muted-foreground italic">
      Aucune note pour le moment.
    </p>
    <Button size="sm" variant="outline" onclick={() => (editing = true)}>
      <Plus class="mr-1.5 h-3.5 w-3.5" />
      Ajouter une note
    </Button>
  </div>
{/if}
