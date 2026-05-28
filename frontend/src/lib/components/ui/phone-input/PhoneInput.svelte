<script lang="ts">
  import {
    isValidPhoneNumber,
    parsePhoneNumberFromString,
    type CountryCode,
  } from 'libphonenumber-js';
  import * as Popover from '$lib/components/ui/popover';
  import * as Command from '$lib/components/ui/command';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Check from '@lucide/svelte/icons/check';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import { cn } from '$lib/utils';
  import {
    COUNTRIES,
    DEFAULT_COUNTRY,
    POPULAR_CODES,
    findCountryByDialCode,
  } from './countries';

  let {
    name,
    value = '',
    placeholder = '',
    required = false,
    error = false,
    id,
    'aria-describedby': ariaDescribedBy,
    class: className = '',
  }: {
    name: string;
    value?: string;
    placeholder?: string;
    required?: boolean;
    error?: boolean;
    id?: string;
    'aria-describedby'?: string;
    class?: string;
  } = $props();

  // The user-facing input mainly holds raw digits so editing behaves like any
  // text field: backspace removes one digit, mid-string edits don't shuffle
  // the caret. The one exception is a leading "+": we keep it visible while
  // the user is typing an international prefix, then strip it the moment a
  // known dial code is recognized (so "+44…" auto-switches the country).
  function parseInitial(e164: string): { country: CountryCode; text: string } {
    if (!e164) return { country: DEFAULT_COUNTRY, text: '' };
    const p = parsePhoneNumberFromString(e164);
    if (p) {
      return {
        country: (p.country ?? DEFAULT_COUNTRY) as CountryCode,
        // formatNational() reintroduces the national prefix (leading "0" in
        // FR etc.); strip separators to get the bare digit string.
        text: p.formatNational().replace(/\D/g, ''),
      };
    }
    return { country: DEFAULT_COUNTRY, text: e164.replace(/[^\d+]/g, '') };
  }

  // svelte-ignore state_referenced_locally
  const initial = parseInitial(value);
  let selectedCountry = $state<CountryCode>(initial.country);
  let phoneText = $state(initial.text);
  let open = $state(false);
  let search = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);

  let countryEntry = $derived(
    COUNTRIES.find((c) => c.code === selectedCountry) ?? COUNTRIES[0],
  );

  let parsed = $derived(
    phoneText ? parsePhoneNumberFromString(phoneText, selectedCountry) : null,
  );

  // Use libphonenumber's canonical E.164 output so country-specific quirks
  // (Italy keeping a leading 0, Argentina's "9" mobile prefix, etc.) are
  // handled correctly instead of a hand-rolled "strip leading 0" rule. Falls
  // back so the server returns "invalide" rather than "requis" when the user
  // typed something that did not parse.
  let e164Value = $derived.by(() => {
    if (!phoneText) return '';
    if (parsed?.number) return parsed.number;
    // While the user is still typing an international prefix ("+4"), let the
    // raw text through so server validation reports "invalide" coherently.
    if (phoneText.startsWith('+')) return phoneText;
    const trimmed = phoneText.replace(/^0/, '');
    return trimmed ? `${countryEntry.dialCode}${trimmed}` : '';
  });

  let isValid = $derived.by(() => {
    if (!phoneText) return false;
    try {
      return isValidPhoneNumber(phoneText, selectedCountry);
    } catch {
      return false;
    }
  });

  // Confirmation line under the input: the same digits the user typed,
  // grouped per the selected country's national format. Hidden when the
  // grouped form would carry no extra information over the bare digits.
  let preview = $derived.by(() => {
    if (!phoneText || !parsed) return '';
    const national = parsed.formatNational();
    return national.replace(/\D/g, '') === national ? '' : national;
  });

  // When the user types or pastes a fully-international number ("+33 6…",
  // "0033…"), switch the country selector to match instead of leaving the
  // dial-code digits stuck inside the national field. Dial codes are 1-4
  // digits and not self-delimiting, so we try the longest prefix first and
  // shrink until a known country matches; a greedy regex would over-grab and
  // bail on numbers like +33.
  function detectInternationalPrefix(
    text: string,
  ): { country: CountryCode; rest: string } | null {
    const compact = text.replace(/\s/g, '');
    let body: string;
    if (compact.startsWith('+')) {
      const p = parsePhoneNumberFromString(text);
      if (p?.country) {
        return {
          country: p.country as CountryCode,
          rest: p.formatNational().replace(/\D/g, ''),
        };
      }
      body = compact.slice(1).replace(/\D/g, '');
    } else if (compact.startsWith('00')) {
      body = compact.slice(2).replace(/\D/g, '');
    } else {
      return null;
    }
    if (!body) return null;
    for (let len = Math.min(4, body.length); len >= 1; len--) {
      const c = findCountryByDialCode(`+${body.slice(0, len)}`);
      if (c) return { country: c.code, rest: body.slice(len) };
    }
    return null;
  }

  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    const incoming = e.currentTarget.value;
    const detected = detectInternationalPrefix(incoming);
    if (detected) {
      selectedCountry = detected.country;
      phoneText = detected.rest;
      return;
    }
    // Preserve a leading "+" so the user can type "+44…" into an empty field
    // and watch the country switch the moment the dial code is recognized.
    // Until then the prefix stays visible; we never re-insert it after the
    // fact, so backspacing past it returns straight to national-only mode.
    if (incoming.startsWith('+')) {
      phoneText = '+' + incoming.slice(1).replace(/\D/g, '');
    } else {
      phoneText = incoming.replace(/\D/g, '');
    }
  }

  function selectCountry(code: CountryCode) {
    selectedCountry = code;
    open = false;
    search = '';
    // Hand focus straight to the number field so the lycéen can type their
    // digits without a second tap. requestAnimationFrame waits for the popover
    // close transition to release focus before we steal it.
    requestAnimationFrame(() => inputEl?.focus());
  }

  const popularEntries = $derived(
    POPULAR_CODES.map((code) => COUNTRIES.find((c) => c.code === code)).filter(
      (c): c is (typeof COUNTRIES)[number] => !!c,
    ),
  );
  const otherEntries = $derived(
    COUNTRIES.filter((c) => !POPULAR_CODES.includes(c.code)),
  );
</script>

<div class="space-y-1">
  <div class="flex gap-2">
    <Popover.Root bind:open>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="outline"
            title={countryEntry.name}
            aria-label="Indicatif pays ({countryEntry.name})"
            class={cn(
              'h-9 w-[112px] shrink-0 justify-between gap-1 rounded-lg border bg-white/70 px-3 whitespace-nowrap text-slate-900 hover:bg-white/90 focus-visible:border-epi-blue/40 focus-visible:ring-0 dark:bg-slate-900/80 dark:text-white dark:hover:bg-slate-800/90',
              error
                ? 'border-destructive/60'
                : 'border-slate-200 dark:border-slate-700',
            )}
          >
            <span class="truncate">
              {countryEntry.flag}
              {countryEntry.dialCode}
            </span>
            <ChevronDown class="size-3.5 shrink-0 opacity-50" />
          </Button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content
        class="w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white/80 p-0 shadow-lg backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/80"
        align="start"
      >
        <Command.Root>
          <Command.Input
            placeholder="Rechercher un pays..."
            bind:value={search}
          />
          <Command.List class="max-h-72">
            <Command.Empty>Aucun pays trouvé.</Command.Empty>
            <Command.Group heading="Fréquents">
              {#each popularEntries as entry (entry.code)}
                <Command.Item
                  value="{entry.name} {entry.dialCode} {entry.code}"
                  onSelect={() => selectCountry(entry.code)}
                  class="cursor-pointer py-2.5"
                >
                  <span class="text-base">{entry.flag}</span>
                  <span class="grow truncate">{entry.name}</span>
                  <span class="ml-3 shrink-0 text-xs text-muted-foreground">
                    {entry.dialCode}
                  </span>
                  {#if entry.code === selectedCountry}
                    <Check class="ml-1 size-4 text-epi-blue" />
                  {/if}
                </Command.Item>
              {/each}
            </Command.Group>
            <Command.Separator />
            <Command.Group heading="Tous les pays">
              {#each otherEntries as entry (entry.code)}
                <Command.Item
                  value="{entry.name} {entry.dialCode} {entry.code}"
                  onSelect={() => selectCountry(entry.code)}
                  class="cursor-pointer py-2.5"
                >
                  <span class="text-base">{entry.flag}</span>
                  <span class="grow truncate">{entry.name}</span>
                  <span class="ml-3 shrink-0 text-xs text-muted-foreground">
                    {entry.dialCode}
                  </span>
                  {#if entry.code === selectedCountry}
                    <Check class="ml-1 size-4 text-epi-blue" />
                  {/if}
                </Command.Item>
              {/each}
            </Command.Group>
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>

    <Input
      bind:ref={inputEl}
      {id}
      type="tel"
      inputmode="tel"
      autocomplete="tel"
      autocapitalize="off"
      autocorrect="off"
      spellcheck={false}
      value={phoneText}
      oninput={handleInput}
      {placeholder}
      {required}
      aria-invalid={error || undefined}
      aria-describedby={ariaDescribedBy}
      class={cn(
        'flex-1',
        className,
        error && 'border-destructive focus-visible:border-destructive',
      )}
    />

    <input type="hidden" {name} value={e164Value} />
  </div>
  {#if preview}
    <p
      class={cn(
        'flex items-center gap-1.5 px-1 text-sm font-medium tabular-nums transition-colors',
        isValid
          ? 'text-epi-blue dark:text-epi-blue'
          : 'text-slate-500 dark:text-slate-400',
      )}
      aria-live="polite"
    >
      {#if isValid}
        <CircleCheck aria-hidden="true" class="size-4 shrink-0" />
      {/if}
      <span>{preview}</span>
      <span class="text-xs font-normal text-slate-400 dark:text-slate-500">
        · {countryEntry.name}
      </span>
    </p>
  {/if}
</div>
