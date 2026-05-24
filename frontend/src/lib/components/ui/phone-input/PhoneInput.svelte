<script lang="ts">
  import { parsePhoneNumber } from 'libphonenumber-js';
  import type { CountryCode } from 'libphonenumber-js';
  import * as Popover from '$lib/components/ui/popover';
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

  let countryEntry = $derived(
    COUNTRIES.find((c) => c.code === selectedCountry) ?? COUNTRIES[0],
  );

  let e164Value = $derived.by(() => {
    const cleaned = localNumber.replace(/[\s.\-()]/g, '');
    if (!cleaned) return '';
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
          class="h-9 w-[100px] shrink-0 rounded-lg border border-slate-200 bg-white/70 text-slate-900 hover:bg-white/90 focus-visible:border-epi-blue/40 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:hover:bg-slate-800/90"
        >
          {countryEntry.label}
          <ChevronDown class="ml-1 size-3.5 opacity-50" />
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content
      class="w-[180px] overflow-hidden rounded-xl border border-slate-200 bg-white/70 p-0 shadow-sm backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/80"
      align="start"
    >
      <div class="max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto">
        {#each COUNTRIES as entry (entry.code)}
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-3 rounded-none border-t border-slate-100 px-4 py-2.5 text-sm transition-all first:border-t-0 hover:bg-epi-blue/5 hover:pl-5 dark:border-slate-800 dark:hover:bg-epi-blue/10 {entry.code ===
            selectedCountry
              ? 'bg-epi-blue/5 font-medium dark:bg-epi-blue/10'
              : ''}"
            onclick={() => selectCountry(entry.code)}
          >
            <span>{entry.flag}</span>
            <span class="text-xs text-muted-foreground">{entry.code}</span>
            <span class="ml-auto font-mono text-sm">{entry.dialCode}</span>
          </button>
        {/each}
      </div>
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
