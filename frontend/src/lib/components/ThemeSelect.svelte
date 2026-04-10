<script lang="ts">
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import {
    Check,
    ChevronsUpDown,
    Plus,
    Tag,
    Globe,
    MapPin,
  } from '@lucide/svelte';
  import { cn, translateTheme } from '$lib/utils';
  import { m } from '$lib/paraglide/messages.js';

  let {
    themes = [],
    value = $bindable(''),
    name = 'theme',
  }: {
    themes: any[];
    value: string | undefined | null;
    name?: string;
  } = $props();

  let open = $state(false);
  let searchValue = $state('');

  // Check if the current search string exactly matches an existing theme
  let exactMatch = $derived(
    themes.find((t) => t.nom.toLowerCase() === searchValue.toLowerCase()),
  );

  // Find selected theme object to display correct icon
  let selectedThemeObj = $derived(themes.find((t) => t.nom === value));

  function selectTheme(val: string) {
    value = val;
    open = false;
    searchValue = '';
  }
</script>

<div class="grid gap-2">
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          class="w-full justify-between rounded-sm font-normal"
          {...props}
        >
          <div class="flex items-center gap-2 truncate">
            {#if selectedThemeObj}
              {#if !selectedThemeObj.campus}
                <Globe class="h-3.5 w-3.5 text-purple-500" />
              {:else}
                <MapPin class="h-3.5 w-3.5 text-epi-teal" />
              {/if}
            {:else}
              <Tag class="h-3.5 w-3.5 text-muted-foreground" />
            {/if}

            {#if value}
              <span class="font-bold">{translateTheme(value)}</span>
            {:else}
              <span class="text-muted-foreground"
                >{m.theme_select_placeholder()}</span
              >
            {/if}
          </div>
          <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-[--bits-popover-anchor-width] p-0" align="start">
      <Command.Root>
        <Command.Input
          placeholder={m.common_search()}
          bind:value={searchValue}
        />
        <Command.List class="max-height-[300px] overflow-y-auto">
          <Command.Empty>
            {#if searchValue.trim().length > 0}
              <Button
                variant="ghost"
                class="flex h-auto w-full items-center justify-start gap-2 px-2 py-3 text-left"
                onclick={() => selectTheme(searchValue)}
              >
                <Plus class="h-4 w-4 text-epi-blue" />
                <div class="flex flex-col">
                  <span class="text-sm font-bold">{m.theme_select_create({ name: searchValue })}</span>
                  <span
                    class="text-[10px] font-black tracking-widest text-muted-foreground uppercase"
                    >{m.multi_theme_new_local()}</span
                  >
                </div>
              </Button>
            {:else}
              <p class="py-6 text-center text-sm text-muted-foreground">
                {m.common_no_result()}
              </p>
            {/if}
          </Command.Empty>

          {#if themes.length > 0}
            <Command.Group heading={m.theme_select_group_existing()}>
              {#each themes as theme}
                <Command.Item
                  value={theme.nom}
                  onSelect={() => selectTheme(theme.nom)}
                >
                  <div class="mr-2 flex h-4 w-4 items-center justify-center">
                    <Check
                      class={cn(
                        'absolute h-4 w-4 transition-all',
                        value === theme.nom
                          ? 'scale-100 opacity-100'
                          : 'scale-0 opacity-0',
                      )}
                    />
                    {#if value !== theme.nom}
                      {#if !theme.campus}
                        <Globe class="h-3.5 w-3.5 text-purple-500 opacity-50" />
                      {:else}
                        <MapPin class="h-3.5 w-3.5 text-epi-teal opacity-50" />
                        /
                      {/if}
                    {/if}
                  </div>
                  <div class="flex flex-col">
                    <span>{translateTheme(theme.nom)}</span>
                    <span class="text-[9px] text-muted-foreground uppercase">
                      {!theme.campus ? m.theme_select_official() : m.theme_select_local()}
                    </span>
                  </div>
                </Command.Item>
              {/each}
            </Command.Group>
          {/if}

          {#if searchValue && !exactMatch}
            <Command.Separator />
            <Command.Group heading={m.theme_select_group_action()}>
              <Command.Item
                value={searchValue}
                onSelect={() => selectTheme(searchValue)}
              >
                <Plus class="mr-2 h-4 w-4 text-epi-blue" />
                {m.theme_select_create({ name: searchValue })}
              </Command.Item>
            </Command.Group>
          {/if}
        </Command.List>
      </Command.Root>
    </Popover.Content>
  </Popover.Root>

  <!-- Hidden input for form submission via Superforms -->
  <input type="hidden" {name} bind:value />
</div>
