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
  />
  <Command.List class="max-h-[300px] overflow-y-auto">
    <Command.Empty>
      {#if searching}
        <!-- SKELETON LOADERS -->
        <div class="space-y-3 p-4">
          {#each Array(3) as _}
            <div class="flex items-center gap-3">
              <Skeleton class="h-8 w-8 rounded-full" />
              <div class="space-y-1.5">
                <Skeleton class="h-4 w-32" />
                <Skeleton class="h-3 w-20" />
              </div>
            </div>
          {/each}
        </div>
      {:else if inputValue.length > 0}
        Aucun résultat trouvé.
      {/if}
    </Command.Empty>

    {#if showHelpShortcut}
      <Command.Group heading="Urgence & Live Ops">
        <Command.Item
          onSelect={() => runCommand(resolve('/staff/pedago'))}
          class="text-epi-orange"
        >
          <LifeBuoy class="mr-2 h-4 w-4" />
          Ouvrir le Dashboard Pédago (Cockpit)
        </Command.Item>
      </Command.Group>
    {/if}

    {#if searchResults.length > 0}
      <Command.Group heading={isCallAction ? 'Appeler un Talent' : 'Talents'}>
        {#each searchResults as student}
          <Command.Item
            onSelect={() =>
              runCommand(resolve(`${basePath}/students/${student.id}`))}
          >
            <Avatar.Root class="mr-2 h-6 w-6">
              <Avatar.Fallback
                class="bg-primary/10 text-[10px] font-bold text-primary"
              >
                {student.nom[0]}{student.prenom[0]}
              </Avatar.Fallback>
            </Avatar.Root>
            <span class="font-bold uppercase">{student.nom}</span>&nbsp;<span
              class="capitalize">{student.prenom}</span
            >
            <span class="ml-2 text-xs text-muted-foreground"
              >- {student.niveau}</span
            >

            {#if isCallAction}
              <div class="ml-auto flex items-center gap-2 text-epi-blue">
                <Phone class="h-3 w-3" />
                <span class="text-xs font-bold"
                  >{student.phone ||
                    student.parentPhone ||
                    'Aucun numéro'}</span
                >
              </div>
            {:else}
              <ArrowRight
                class="ml-auto h-4 w-4 text-muted-foreground opacity-50"
              />
            {/if}
          </Command.Item>
        {/each}
      </Command.Group>
    {/if}

    {#if !inputValue || (!showHelpShortcut && searchResults.length === 0 && !searching)}
      <Command.Group heading="Navigation">
        <Command.Item onSelect={() => runCommand(resolve(basePath))}>
          <LayoutDashboard class="mr-2 h-4 w-4" />
          {isPedago ? 'Dashboard Pédago' : 'Dashboard ADM'}
        </Command.Item>
        {#if !isPedago}
          <Command.Item
            onSelect={() => runCommand(resolve(`${basePath}/students`))}
          >
            <Users class="mr-2 h-4 w-4" />
            Talents
          </Command.Item>
          <Command.Item
            onSelect={() => runCommand(resolve(`${basePath}/events/history`))}
          >
            <History class="mr-2 h-4 w-4" />
            Historique
          </Command.Item>
        {/if}
      </Command.Group>

      {#if !isPedago}
        <Command.Separator />

        <Command.Group heading="Actions Rapides">
          <Command.Item
            onSelect={() => runCommand(resolve(`${basePath}/events/import`))}
          >
            <Calendar class="mr-2 h-4 w-4" />
            Importer une campagne
          </Command.Item>
        </Command.Group>
      {/if}
    {/if}
  </Command.List>
</Command.Dialog>
