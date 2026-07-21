<script lang="ts">
  import * as Avatar from '$lib/components/ui/avatar';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { buttonVariants } from '$lib/components/ui/button';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import { getInitials } from '$lib/avatar';
  import { cn } from '$lib/utils';
  import type { SerializedNote } from '$lib/domain/talentNotes';

  let {
    note,
    timezone,
    onEdit,
    onDelete,
  }: {
    note: SerializedNote;
    // Campus IANA timezone for the byline date/time. Required, never an ambient
    // default: the feed is SSR-rendered on the fiche, where the server process
    // runs UTC, so an implicit local timezone would print the wrong wall clock
    // (and, near midnight, the wrong day). The caller passes its campus tz.
    timezone: string;
    onEdit: () => void;
    onDelete: () => void;
  } = $props();

  // The byline stays light and on ONE line: who, when, and which event, condensed
  // and muted above the note. The time shows (the matin/après-midi créneau makes
  // the hour meaningful), no year since the feed is recent and stage-scoped; the
  // event collapses to its type ("Stage de Seconde"), and an edit adds a quiet
  // "modifié" marker (never a second date inline; the date + editor live in its
  // tooltip). Date and time are formatted apart so the line reads "17 juin, 14:35"
  // (no locale "à"), shaving width. Both read the campus tz so the hour matches
  // the créneau it was taken on, not the viewer's (or the server's) clock.
  const dateFmt = $derived(
    new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      timeZone: timezone,
    }),
  );
  const timeFmt = $derived(
    new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }),
  );
  const when = (iso: string) => {
    const d = new Date(iso);
    return `${dateFmt.format(d)}, ${timeFmt.format(d)}`;
  };

  // Separator with NON-BREAKING spaces around the middot, so it survives every
  // trim: Svelte drops literal whitespace at `{#if}` boundaries, and CSS strips a
  // leading space at the start of the metadata flex item (which rendered "Fevre·"
  // with no space). A real expression of nbsp dodges both.
  const SEP = ' · ';

  // The modification date + editor live in the "modifié" tooltip, so "quand / par
  // qui" is one hover away without a second date on the line. Empty when never
  // edited. Null editor = the editing staff account was later removed.
  const editedTitle = $derived(
    note.edited
      ? `Modifié le ${when(note.updatedAt)}${note.editedBy?.name ? ` par ${note.editedBy.name}` : ''}`
      : '',
  );
</script>

<div class="group/note rounded-sm border bg-card px-3 py-2.5">
  <!-- Byline lead, mirroring the Centres d'intérêt pull-quotes beside it: small
       and muted above the note (the hero below). Kept to one line: the date /
       event type / "modifié" marker always stay whole (the metadata that earns its
       place), the actions collapse into a single "⋯" menu so they reserve one
       icon's width and never overlap the text, and the author name is the only
       part that truncates when the rail is tight. -->
  <div class="flex items-center text-[11px] text-muted-foreground">
    {#if note.author}
      <Avatar.Root class="mr-1.5 h-5 w-5 shrink-0">
        <Avatar.Image
          src={note.author.image ?? undefined}
          alt={note.author.name ?? 'Staff'}
          class="object-cover"
        />
        <Avatar.Fallback
          class="bg-epi-blue/10 text-[9px] font-bold text-epi-blue"
        >
          {getInitials(note.author.name)}
        </Avatar.Fallback>
      </Avatar.Root>
    {/if}
    <span class="flex min-w-0 flex-1 items-center">
      <!-- Null author = a note migrated from the old single `Talent.note` field,
           or one whose author's staff account was later deleted: labelled as such,
           never a fake "Staff" name. -->
      <span
        class="min-w-0 truncate {note.author
          ? 'font-medium text-foreground'
          : 'italic'}"
      >
        {note.author ? (note.author.name ?? 'Staff') : 'Auteur inconnu'}
      </span>
      <span class="shrink-0 whitespace-nowrap">
        {SEP}{when(note.createdAt)}{#if note.event}{SEP}{note.event
            .name}{/if}{#if note.edited}{SEP}<Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <span
                  {...props}
                  class="cursor-help underline decoration-dotted underline-offset-2"
                  >modifié</span
                >
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>{editedTitle}</Tooltip.Content>
          </Tooltip.Root>{/if}
      </span>
    </span>
    <!-- Actions in a single "⋯" menu (any dev member may edit/delete any note, no
         ownership gate). Hover/focus reveals it, and it stays shown while open. -->
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'ml-1 h-7 w-7 shrink-0 rounded-sm text-muted-foreground opacity-0 transition-opacity group-focus-within/note:opacity-100 group-hover/note:opacity-100 data-[state=open]:opacity-100',
        )}
        aria-label="Actions sur la note"
      >
        <Ellipsis class="h-3.5 w-3.5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        <DropdownMenu.Item class="cursor-pointer" onclick={onEdit}>
          <Pencil class="mr-2 h-4 w-4 text-muted-foreground" />
          Modifier
        </DropdownMenu.Item>
        <DropdownMenu.Item
          class="cursor-pointer text-destructive focus:text-destructive"
          onclick={onDelete}
        >
          <Trash2 class="mr-2 h-4 w-4" />
          Supprimer
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>

  <!-- The note itself, the hero: bumped to the quote scale at full contrast, with
       a quiet left rule so it reads as a quote block. Neutral (not teal/blue) to
       keep the dev rail sober and avoid competing with the trigger colour. -->
  <p
    class="mt-2 border-l-2 border-muted-foreground/25 pl-3 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-foreground"
  >
    {note.body}
  </p>
</div>
