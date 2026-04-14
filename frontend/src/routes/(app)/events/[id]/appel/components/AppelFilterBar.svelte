<script lang="ts">
  import {
    Search,
    GraduationCap,
    LayoutGrid,
    List as ListIcon,
  } from '@lucide/svelte';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import * as Select from '$lib/components/ui/select';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';

  let {
    searchQuery = $bindable(''),
    filterNiveau = $bindable('all'),
    filterStatus = $bindable('all'),
    viewMode = $bindable('grid' as 'grid' | 'list'),
    uniqueNiveaux,
    helpCount,
  }: {
    searchQuery: string;
    filterNiveau: string;
    filterStatus: string;
    viewMode: 'grid' | 'list';
    uniqueNiveaux: string[];
    helpCount: number;
  } = $props();
</script>

<div
  class="sticky top-0 z-20 border-b border-border bg-background/95 py-3 backdrop-blur-sm transition-all"
>
  <div class="container mx-auto max-w-2xl px-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div class="relative flex-1">
        <Search
          class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground"
        />
        <Input
          placeholder="Rechercher un élève..."
          class="rounded-sm bg-card pl-9"
          bind:value={searchQuery}
        />
      </div>

      <Select.Root type="single" bind:value={filterNiveau}>
        <Select.Trigger class="h-9 w-full text-xs sm:w-45">
          <GraduationCap class="mr-2 h-3 w-3" />
          {filterNiveau === 'all' ? 'Toutes les classes' : filterNiveau}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="all">Toutes les classes</Select.Item>
          {#each uniqueNiveaux as niveau}
            <Select.Item value={niveau}>{niveau}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>

      <div class="hidden rounded-md border bg-card p-1 sm:flex">
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  class={cn(
                    'cursor-pointer rounded-sm p-1.5 transition-all',
                    viewMode === 'grid'
                      ? 'bg-muted text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onclick={() => (viewMode = 'grid')}
                >
                  <LayoutGrid class="h-4 w-4" />
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content><p>Vue Grille</p></Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  class={cn(
                    'cursor-pointer rounded-sm p-1.5 transition-all',
                    viewMode === 'list'
                      ? 'bg-muted text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onclick={() => (viewMode = 'list')}
                >
                  <ListIcon class="h-4 w-4" />
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content><p>Vue Liste</p></Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>
    </div>

    <div class="mt-2 flex items-center justify-between sm:hidden">
      <div class="flex flex-wrap gap-1">
        <Button
          variant={filterStatus === 'all' ? 'default' : 'outline'}
          size="sm"
          class="h-8 text-[10px]"
          onclick={() => (filterStatus = 'all')}>Tous</Button
        >
        <Button
          variant={filterStatus === 'present' ? 'default' : 'outline'}
          size="sm"
          class="h-8 text-[10px]"
          onclick={() => (filterStatus = 'present')}>Présents</Button
        >
        <Button
          variant={filterStatus === 'help' ? 'default' : 'outline'}
          size="sm"
          class="h-8 text-[10px]"
          onclick={() => (filterStatus = 'help')}>Appels ({helpCount})</Button
        >
      </div>
      <div class="flex rounded-md border bg-card p-0.5">
        <button
          class={cn(
            'rounded-sm p-1.5 transition-all',
            viewMode === 'grid'
              ? 'bg-muted text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onclick={() => (viewMode = 'grid')}
          ><LayoutGrid class="h-4 w-4" /></button
        >
        <button
          class={cn(
            'rounded-sm p-1.5 transition-all',
            viewMode === 'list'
              ? 'bg-muted text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onclick={() => (viewMode = 'list')}
          ><ListIcon class="h-4 w-4" /></button
        >
      </div>
    </div>

    <div class="mt-2 hidden gap-1 sm:flex">
      <Button
        variant={filterStatus === 'all' ? 'default' : 'outline'}
        size="sm"
        class="h-8 text-[10px]"
        onclick={() => (filterStatus = 'all')}>Tous</Button
      >
      <Button
        variant={filterStatus === 'present' ? 'default' : 'outline'}
        size="sm"
        class="h-8 text-[10px]"
        onclick={() => (filterStatus = 'present')}>Présents</Button
      >
      <Button
        variant={filterStatus === 'late' ? 'default' : 'outline'}
        size="sm"
        class="h-8 text-[10px]"
        onclick={() => (filterStatus = 'late')}>Retards</Button
      >
      <Button
        variant={filterStatus === 'help' ? 'default' : 'outline'}
        size="sm"
        class="h-8 text-[10px]"
        onclick={() => (filterStatus = 'help')}
      >
        Appels
        {#if helpCount > 0}<span
            class="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white"
            >{helpCount}</span
          >{/if}
      </Button>
    </div>
  </div>
</div>
