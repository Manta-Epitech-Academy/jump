<script lang="ts">
  import * as Command from '$lib/components/ui/command';
  import { goto } from '$app/navigation';
  import {
    Calendar,
    LayoutDashboard,
    History,
    Users,
    Cuboid,
  } from 'lucide-svelte';
  import { onMount, onDestroy } from 'svelte';
  import { resolve } from '$app/paths';

  let { open = $bindable(false) } = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      open = !open;
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleKeydown);
    }
  });

  function runCommand(url: string) {
    open = false;
    goto(url);
  }
</script>

<Command.Dialog bind:open>
  <Command.Input placeholder="Tapez une commande ou cherchez..." />
  <Command.List>
    <Command.Empty>Aucun résultat.</Command.Empty>
    <Command.Group heading="Navigation">
      <Command.Item onSelect={() => runCommand(resolve('/'))}>
        <LayoutDashboard class="mr-2 h-4 w-4" />
        Dashboard
      </Command.Item>
      <Command.Item onSelect={() => runCommand(resolve('/students'))}>
        <Users class="mr-2 h-4 w-4" />
        Élèves
      </Command.Item>
      <Command.Item onSelect={() => runCommand(resolve('/subjects'))}>
        <Cuboid class="mr-2 h-4 w-4" />
        Sujets
      </Command.Item>
      <Command.Item onSelect={() => runCommand(resolve('/events/history'))}>
        <History class="mr-2 h-4 w-4" />
        Historique
      </Command.Item>
    </Command.Group>

    <Command.Separator />

    <Command.Group heading="Actions Rapides">
      <Command.Item onSelect={() => runCommand(resolve('/events/new'))}>
        <Calendar class="mr-2 h-4 w-4" />
        Nouvel Événement
      </Command.Item>
    </Command.Group>
  </Command.List>
</Command.Dialog>
