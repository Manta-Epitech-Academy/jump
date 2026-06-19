<script lang="ts">
  import * as Avatar from '$lib/components/ui/avatar';
  import { Button } from '$lib/components/ui/button';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import { getInitials } from '$lib/avatar';
  import type { SerializedNote } from '$lib/domain/talentNotes';

  let {
    note,
    onEdit,
    onDelete,
  }: {
    note: SerializedNote;
    onEdit: () => void;
    onDelete: () => void;
  } = $props();

  const fmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const when = (iso: string) => fmt.format(new Date(iso));

  const authorName = $derived(note.author?.name ?? 'Staff');
</script>

<div class="group/note rounded-sm border bg-card px-3 py-2.5">
  <div class="flex items-start justify-between gap-2">
    <p class="min-w-0 flex-1 text-sm whitespace-pre-wrap">{note.body}</p>
    <!-- Any dev member may edit/delete any note (no ownership gate). -->
    <div
      class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within/note:opacity-100 group-hover/note:opacity-100"
    >
      <Button
        size="icon"
        variant="ghost"
        class="h-7 w-7 rounded-sm"
        onclick={onEdit}
        aria-label="Modifier la note"
      >
        <Pencil class="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        class="h-7 w-7 rounded-sm text-muted-foreground hover:text-destructive"
        onclick={onDelete}
        aria-label="Supprimer la note"
      >
        <Trash2 class="h-3.5 w-3.5" />
      </Button>
    </div>
  </div>

  {#if note.event}
    <p class="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
      <CalendarDays class="h-3.5 w-3.5" />
      {note.event.titre}
    </p>
  {/if}

  <div class="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
    <Avatar.Root class="h-5 w-5">
      <Avatar.Image
        src={note.author?.image ?? undefined}
        alt={authorName}
        class="object-cover"
      />
      <Avatar.Fallback
        class="bg-epi-blue/10 text-[9px] font-bold text-epi-blue"
      >
        {getInitials(authorName)}
      </Avatar.Fallback>
    </Avatar.Root>
    <span>
      <span class="font-medium text-foreground">{authorName}</span>
      · {when(note.createdAt)}
      {#if note.edited}
        · modifié{note.editedBy?.name ? ` par ${note.editedBy.name}` : ''}
        le {when(note.updatedAt)}
      {/if}
    </span>
  </div>
</div>
