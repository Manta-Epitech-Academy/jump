<script lang="ts">
  import * as Command from '$lib/components/ui/command';
  import { goto } from '$app/navigation';
  import {
    Calendar,
    LayoutDashboard,
    History,
    Users,
    LifeBuoy,
    Phone,
    ArrowRight,
  } from '@lucide/svelte';
  import { onMount, onDestroy } from 'svelte';
  import { resolve } from '$app/paths';
  import * as Avatar from '$lib/components/ui/avatar';
  import { Skeleton } from '$lib/components/ui/skeleton';

  let {
    open = $bindable(false),
    basePath = '/staff/dev',
  }: { open?: boolean; basePath?: '/staff/dev' | '/staff/pedago' } = $props();

  const isPedago = $derived(basePath === '/staff/pedago');

  let inputValue = $state('');
  let searchResults = $state<any[]>([]);
  let searching = $state(false);
  let searchTimeout: ReturnType<typeof setTimeout>;

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
    inputValue = ''; // Reset on navigate
    goto(url);
  }

  $effect(() => {
    const query = inputValue.toLowerCase().trim();

    let searchTerm = query;
    if (query.startsWith('call '))
      searchTerm = query.replace('call ', '').trim();
    if (query.startsWith('appeler '))
      searchTerm = query.replace('appeler ', '').trim();

    if (searchTerm.length < 2) {
      searchResults = [];
      return;
    }

    searching = true;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `${resolve('/api/students')}?q=${encodeURIComponent(searchTerm)}`,
        );
        if (res.ok) {
          searchResults = await res.json();
        }
      } finally {
        searching = false;
      }
    }, 300);
  });

  let showHelpShortcut = $derived(
    ['help', 'aide', 'urgence', 'cockpit'].some((kw) =>
      inputValue.toLowerCase().includes(kw),
    ),
  );
  let isCallAction = $derived(
    inputValue.toLowerCase().startsWith('call ') ||
      inputValue.toLowerCase().startsWith('appeler '),
  );
</script>

<!-- shouldFilter={false} prevents Shadcn from filtering our remote results -->
<Command.Dialog bind:open shouldFilter={false}>
  <Command.Input
    placeholder="Tapez une commande (ex: 'call Léo', 'help') ou cherchez..."
    bind:value={inputValue}
    class="font-medium"
  />
  <Command.List class="max-h-[350px] overflow-y-auto">
    <Command.Empty class="py-12">
      {#if searching}
        <div class="space-y-4 p-4">
          {#each Array(3) as _}
            <div class="flex items-center gap-3">
              <Skeleton class="h-10 w-10 rounded-full" />
              <div class="space-y-2">
                <Skeleton class="h-4 w-40" />
                <Skeleton class="h-3 w-24" />
              </div>
            </div>
          {/each}
        </div>
      {:else if inputValue.length > 0}
        <p class="text-center text-sm text-muted-foreground italic">
          Aucun Talent ne correspond à cette recherche.
        </p>
      {/if}
    </Command.Empty>

    {#if showHelpShortcut}
      <Command.Group heading="Urgence & Live Ops">
        <Command.Item
          onSelect={() => runCommand(resolve('/staff/pedago'))}
          class="py-3 text-epi-orange"
        >
          <LifeBuoy class="mr-3 h-5 w-5" />
          <span class="font-bold">Ouvrir le Dashboard Pédago (Cockpit)</span>
        </Command.Item>
      </Command.Group>
    {/if}

    {#if searchResults.length > 0}
      <Command.Group heading={isCallAction ? 'Appeler un Talent' : 'Talents'}>
        {#each searchResults as student}
          <Command.Item
            onSelect={() =>
              runCommand(resolve(`${basePath}/students/${student.id}`))}
            class="px-4 py-3"
          >
            <Avatar.Root class="mr-3 h-8 w-8">
              <Avatar.Fallback
                class="bg-primary/10 text-xs font-bold text-primary"
              >
                {student.nom[0]}{student.prenom[0]}
              </Avatar.Fallback>
            </Avatar.Root>
            <div class="flex flex-col">
              <div class="flex items-center">
                <span class="text-sm font-black tracking-tight uppercase"
                  >{student.nom}</span
                >&nbsp;<span class="text-sm font-bold capitalize"
                  >{student.prenom}</span
                >
              </div>
              <span
                class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                >{student.niveau}</span
              >
            </div>

            {#if isCallAction}
              <div
                class="ml-auto flex items-center gap-2 rounded-sm bg-blue-50 px-2 py-1 text-epi-blue dark:bg-blue-900/30"
              >
                <Phone class="h-3.5 w-3.5" />
                <span class="text-xs font-black"
                  >{student.phone ||
                    student.parentPhone ||
                    'Aucun numéro'}</span
                >
              </div>
            {:else}
              <ArrowRight
                class="ml-auto h-4 w-4 text-muted-foreground opacity-30 transition-opacity group-hover:opacity-100"
              />
            {/if}
          </Command.Item>
        {/each}
      </Command.Group>
    {/if}

    {#if !inputValue || (!showHelpShortcut && searchResults.length === 0 && !searching)}
      <Command.Group heading="Navigation">
        <Command.Item
          onSelect={() => runCommand(resolve(basePath))}
          class="py-3"
        >
          <LayoutDashboard class="mr-3 h-5 w-5 text-epi-blue" />
          <span class="font-bold"
            >{isPedago ? 'Dashboard Pédago' : 'Dashboard ADM'}</span
          >
        </Command.Item>
        {#if !isPedago}
          <Command.Item
            onSelect={() => runCommand(resolve(`${basePath}/students`))}
            class="py-3"
          >
            <Users class="mr-3 h-5 w-5 text-epi-teal" />
            <span class="font-bold">Annuaire des Talents</span>
          </Command.Item>
          <Command.Item
            onSelect={() => runCommand(resolve(`${basePath}/events/history`))}
            class="py-3"
          >
            <History class="mr-3 h-5 w-5 text-muted-foreground" />
            <span class="font-bold">Historique & Archives</span>
          </Command.Item>
        {/if}
      </Command.Group>

      {#if !isPedago}
        <Command.Separator />

        <Command.Group heading="Actions Rapides">
          <Command.Item
            onSelect={() => runCommand(resolve(`${basePath}/events/import`))}
            class="py-3"
          >
            <Calendar class="mr-3 h-5 w-5 text-epi-pink" />
            <span class="font-bold">Importer un événement Salesforce</span>
          </Command.Item>
        </Command.Group>
      {/if}
    {/if}
  </Command.List>
</Command.Dialog>
