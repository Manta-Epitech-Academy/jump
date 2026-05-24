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
      class="h-9 w-[100px] shrink-0 rounded-lg border {className}"
    >
      {countryEntry.label}
    </Select.Trigger>
    <Select.Content class="max-h-[280px]">
      {#each COUNTRIES as entry (entry.code)}
        <Select.Item value={entry.code} label={entry.label}>
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
