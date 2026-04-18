<script lang="ts">
  import { buttonVariants } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Ellipsis, Pencil, Copy, Trash2, Users } from '@lucide/svelte';
  import { resolve } from '$app/paths';

  let { event, onDuplicate, onDelete } = $props<{
    event: { id: string; titre: string; date: Date };
    onDuplicate: (event: { id: string; titre: string; date: Date }) => void;
    onDelete: (id: string) => void;
  }>();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class={buttonVariants({ variant: 'ghost', size: 'icon' })}
  >
    <Ellipsis class="h-4 w-4" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end">
    <DropdownMenu.Item class="p-0">
      {#snippet child({ props })}
        <a
          {...props}
          href={resolve(`/staff/dev/events/${event.id}/manage`)}
          class="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Users class="mr-2 h-4 w-4 text-muted-foreground" />
          Gérer la campagne
        </a>
      {/snippet}
    </DropdownMenu.Item>

    <DropdownMenu.Separator />

    <DropdownMenu.Item
      class="cursor-pointer"
      onclick={() => onDuplicate(event)}
    >
      <Copy class="mr-2 h-4 w-4 text-muted-foreground" />
      Dupliquer
    </DropdownMenu.Item>

    <DropdownMenu.Separator />

    <DropdownMenu.Item
      class="cursor-pointer text-destructive"
      onclick={() => onDelete(event.id)}
    >
      <Trash2 class="mr-2 h-4 w-4" />
      Supprimer
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
