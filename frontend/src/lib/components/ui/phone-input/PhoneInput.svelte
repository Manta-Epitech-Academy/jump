<script lang="ts">
  import { parsePhoneNumber } from 'libphonenumber-js';
  import type { CountryCode } from 'libphonenumber-js';
  import * as Popover from '$lib/components/ui/popover';
  import * as Command from '$lib/components/ui/command';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { COUNTRIES, DEFAULT_COUNTRY } from './countries';

  let {
    name,
    value = '',
    placeholder = '',
    required = false,
    class: className = '',
  }: {
    name: string;
    value?: string;
    placeholder?: string;
    required?: boolean;
    class?: string;
  } = $props();

  // Parse initial E.164 value to extract country + local number
  function parseInitial(e164: string): { country: CountryCode; local: string } {
    if (!e164) return { country: DEFAULT_COUNTRY, local: '' };
    try {
      const parsed = parsePhoneNumber(e164);
      if (parsed) {
        return {
          country: (parsed.country ?? DEFAULT_COUNTRY) as CountryCode,
          local: parsed.nationalNumber,
        };
      }
    } catch {
      // Invalid — fall back
    }
    return { country: DEFAULT_COUNTRY, local: e164 };
  }

  // svelte-ignore state_referenced_locally
  const initial = parseInitial(value);
  let selectedCountry = $state<string>(initial.country);
  let localNumber = $state(initial.local);
  let open = $state(false);

  // Derived: the matching entry from the countries list
  let countryEntry = $derived(
    COUNTRIES.find((c) => c.code === selectedCountry) ?? COUNTRIES[0],
  );

  // Derived: E.164 value to submit — strip spaces/dots/dashes from local
  let e164Value = $derived.by(() => {
    const cleaned = localNumber.replace(/[\s.\-()]/g, '');
    if (!cleaned) return '';
    // Drop leading 0 (national prefix) before prepending dial code
    const withoutLeadingZero = cleaned.startsWith('0')
      ? cleaned.slice(1)
      : cleaned;
    return `${countryEntry.dialCode}${withoutLeadingZero}`;
  });

  function selectCountry(code: string) {
    selectedCountry = code;
    open = false;
  }
</script>

<div class="flex gap-2">
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="outline"
          class="h-9 w-[100px] shrink-0 justify-between rounded-lg border border-slate-200 bg-white/70 text-slate-900 hover:bg-white/90 focus-visible:border-epi-blue/40 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:hover:bg-slate-800/90"
        >
          {countryEntry.label}
          <ChevronDown class="ml-1 size-3.5 opacity-50" />
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-[220px] p-0" align="start">
      <Command.Root class="rounded-lg">
        <Command.Input placeholder="Rechercher un pays..." />
        <Command.List class="max-h-[240px]">
          <Command.Empty>Aucun pays trouvé.</Command.Empty>
          {#each COUNTRIES as entry (entry.code)}
            <Command.Item
              value="{entry.code} {entry.dialCode}"
              onSelect={() => selectCountry(entry.code)}
              class="cursor-pointer"
            >
              <span class="mr-1.5">{entry.flag}</span>
              <span class="text-xs text-muted-foreground">{entry.code}</span>
              <span class="ml-auto font-mono text-sm">{entry.dialCode}</span>
            </Command.Item>
          {/each}
        </Command.List>
      </Command.Root>
    </Popover.Content>
  </Popover.Root>

  <Input
    type="tel"
    bind:value={localNumber}
    {placeholder}
    {required}
    class="flex-1 {className}"
  />

  <input type="hidden" {name} value={e164Value} />
</div>
