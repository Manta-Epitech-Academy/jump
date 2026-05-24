<script lang="ts">
  import { parsePhoneNumber } from 'libphonenumber-js';
  import type { CountryCode } from 'libphonenumber-js';
  import * as Select from '$lib/components/ui/select';
  import { Input } from '$lib/components/ui/input';
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
</script>

<div class="flex gap-2">
  <Select.Root type="single" bind:value={selectedCountry}>
    <Select.Trigger
      class="h-9 w-[100px] shrink-0 rounded-lg border border-slate-200 bg-white/70 text-slate-900 hover:bg-white/90 focus-visible:border-epi-blue/40 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:hover:bg-slate-800/90"
    >
      {countryEntry.label}
    </Select.Trigger>
    <Select.Content
      class="max-h-[280px] rounded-xl border-slate-200 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/80"
    >
      {#each COUNTRIES as entry (entry.code)}
        <Select.Item
          value={entry.code}
          label={entry.label}
          class="cursor-pointer gap-3 rounded-none border-t border-slate-100 px-4 py-2.5 transition-all first:border-t-0 hover:bg-epi-blue/5 hover:pl-5 aria-selected:bg-epi-blue/5 dark:border-slate-800 dark:hover:bg-epi-blue/10 dark:aria-selected:bg-epi-blue/10"
        >
          {entry.label}
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>

  <Input
    type="tel"
    bind:value={localNumber}
    {placeholder}
    {required}
    class="flex-1 {className}"
  />

  <input type="hidden" {name} value={e164Value} />
</div>
