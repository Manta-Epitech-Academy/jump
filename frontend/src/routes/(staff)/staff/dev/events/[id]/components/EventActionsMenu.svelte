<script lang="ts">
  import MoreVertical from '@lucide/svelte/icons/more-vertical';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import Gated from '$lib/components/auth/Gated.svelte';

  type Props = {
    onEdit: () => void;
    onDelete: () => void;
  };

  let { onEdit, onDelete }: Props = $props();
</script>

<Gated group="devLead" mode="hide">
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="outline"
          size="icon"
          class="h-9 w-9 rounded-sm"
        >
          <MoreVertical class="h-4 w-4" />
          <span class="sr-only">Actions sur l’événement</span>
        </Button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="w-48 rounded-sm">
      <DropdownMenu.Item class="cursor-pointer" onclick={onEdit}>
        <Pencil class="mr-2 h-4 w-4" />
        Modifier l’événement
      </DropdownMenu.Item>
      <DropdownMenu.Separator />
      <DropdownMenu.Item
        class="cursor-pointer text-destructive focus:text-destructive"
        onclick={onDelete}
      >
        <Trash2 class="mr-2 h-4 w-4" />
        Supprimer
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
</Gated>
