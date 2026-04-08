<script lang="ts">
  import * as Command from '$lib/components/ui/command';
  import { goto } from '$app/navigation';
  import {
    Calendar,
    LayoutDashboard,
    History,
    Users,
    Cuboid,
  } from '@lucide/svelte';
  import { onMount, onDestroy } from 'svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { i18nHref } from '$lib/utils';

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
  <Command.Input placeholder={m.nav_command_placeholder()} />
  <Command.List>
    <Command.Empty>{m.common_no_result()}</Command.Empty>
    <Command.Group heading={m.nav_navigation()}>
      <Command.Item onSelect={() => runCommand(i18nHref('/'))}>
        <LayoutDashboard class="mr-2 h-4 w-4" />
        {m.nav_dashboard()}
      </Command.Item>
      <Command.Item onSelect={() => runCommand(i18nHref('/students'))}>
        <Users class="mr-2 h-4 w-4" />
        {m.nav_students()}
      </Command.Item>
      <Command.Item onSelect={() => runCommand(i18nHref('/subjects'))}>
        <Cuboid class="mr-2 h-4 w-4" />
        {m.nav_subjects()}
      </Command.Item>
      <Command.Item onSelect={() => runCommand(i18nHref('/events/history'))}>
        <History class="mr-2 h-4 w-4" />
        {m.nav_history()}
      </Command.Item>
    </Command.Group>

    <Command.Separator />

    <Command.Group heading={m.nav_quick_actions()}>
      <Command.Item onSelect={() => runCommand(i18nHref('/events/new'))}>
        <Calendar class="mr-2 h-4 w-4" />
        {m.nav_new_event()}
      </Command.Item>
    </Command.Group>
  </Command.List>
</Command.Dialog>
