<script lang="ts">
  import { AsYouType, parsePhoneNumber } from 'libphonenumber-js';
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
          // Nationally formatted (e.g. "06 12 34 56 78") so AsYouType has the
          // national prefix it needs to group digits on first render.
          local: parsed.formatNational(),
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
  // `phoneText` is the *displayed* value: digits grouped per the selected
  // country (e.g. "6 12 34 56 78"). The separators are cosmetic — `e164Value`
  // strips them, so the DB only ever sees a clean E.164 number.
  let phoneText = $state(
    new AsYouType(initial.country as CountryCode).input(initial.local),
  );
  let open = $state(false);

  let countryEntry = $derived(
    COUNTRIES.find((c) => c.code === selectedCountry) ?? COUNTRIES[0],
  );

  let e164Value = $derived.by(() => {
    const cleaned = phoneText.replace(/[\s.\-()]/g, '');
    if (!cleaned) return '';
    const withoutLeadingZero = cleaned.startsWith('0')
      ? cleaned.slice(1)
      : cleaned;
    return `${countryEntry.dialCode}${withoutLeadingZero}`;
  });

  function reformat(input: string): string {
    return new AsYouType(selectedCountry as CountryCode).input(input);
  }

  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    const incoming = e.currentTarget.value;
    const incomingDigits = incoming.replace(/\D/g, '');
    const currentDigits = phoneText.replace(/\D/g, '');
    // Backspacing over an auto-inserted separator leaves the digits unchanged
    // but shortens the text; drop the trailing digit so deletion makes progress
    // instead of AsYouType re-inserting the space and trapping the caret.
    const digits =
      incoming.length < phoneText.length && incomingDigits === currentDigits
        ? incomingDigits.slice(0, -1)
        : incomingDigits;
    phoneText = reformat(digits);
  }

  function selectCountry(code: string) {
    selectedCountry = code;
    // Re-group the existing digits under the newly selected country's pattern.
    phoneText = reformat(phoneText);
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
          class="h-9 w-[106px] shrink-0 justify-between gap-1 rounded-lg border border-slate-200 bg-white/70 px-3 whitespace-nowrap text-slate-900 hover:bg-white/90 focus-visible:border-epi-blue/40 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:hover:bg-slate-800/90"
        >
          <span class="truncate">{countryEntry.label}</span>
          <ChevronDown class="size-3.5 shrink-0 opacity-50" />
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
            {entry.label}
          </button>
        {/each}
      </div>
    </Popover.Content>
  </Popover.Root>

  <!-- Cap the width so a phone number fills the field instead of floating in a
       stretched box; `flex-1` still lets it shrink on narrow screens. -->
  <Input
    type="tel"
    inputmode="tel"
    value={phoneText}
    oninput={handleInput}
    {placeholder}
    {required}
    class="max-w-48 flex-1 {className}"
  />

  <input type="hidden" {name} value={e164Value} />
</div>
