<script lang="ts">
  import {
    AsYouType,
    isValidPhoneNumber,
    parsePhoneNumberFromString,
    type CountryCode,
  } from 'libphonenumber-js';
  import { tick } from 'svelte';
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
    value = $bindable(''),
    placeholder = '',
    required = false,
    disabled = false,
    error = false,
    id,
    form,
    'aria-describedby': ariaDescribedBy,
    class: className = '',
    triggerClass = '',
    popoverClass = '',
  }: {
    /** Field name for the hidden input that carries the E.164 value. Omit for
     * controls read straight off `bind:value` (e.g. a one-shot test send). */
    name?: string;
    /** Two-way bindable: seeds the field, then reflects the canonical E.164. */
    value?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    error?: boolean;
    id?: string;
    /** Associates the hidden input with a form elsewhere in the DOM. */
    form?: string;
    'aria-describedby'?: string;
    /** Classes for the number Input (the visible text field). */
    class?: string;
    /** Classes for the country-selector trigger button. */
    triggerClass?: string;
    /** Classes for the country-list popover panel. */
    popoverClass?: string;
  } = $props();

  // The field shows the number grouped the way the user would write it
  // ("06 12 34 56 78"), formatted live as they type so the field always
  // matches the placeholder and the value we store. The grouping is purely
  // visual: only the hidden input below carries the canonical E.164 string to
  // the server. The leading "+" of a typed international prefix is honored —
  // the moment a known dial code is recognized it hops into the country
  // selector and the field keeps only the national part.

  // "Significant" chars = the digits the user meant, plus an optional leading
  // "+". Everything the caret logic and the formatter care about is expressed
  // in these, so spaces inserted by grouping never throw the caret off.
  function extractSignificant(display: string): string {
    const compact = display.replace(/[^\d+]/g, '');
    if (compact.startsWith('+'))
      return '+' + compact.slice(1).replace(/\D/g, '');
    return compact.replace(/\D/g, '');
  }

  function countSignificant(display: string): number {
    return (display.match(/[\d+]/g) ?? []).length;
  }

  // Index just past the n-th significant char in a formatted string, so we can
  // restore the caret to the same logical spot after re-grouping.
  function caretAfterNSignificant(display: string, n: number): number {
    if (n <= 0) return 0;
    let seen = 0;
    for (let i = 0; i < display.length; i++) {
      if (/[\d+]/.test(display[i])) {
        seen += 1;
        if (seen === n) return i + 1;
      }
    }
    return display.length;
  }

  // Group a significant string the way the country writes phone numbers. An
  // international "+..." string is grouped by libphonenumber's own country
  // detection; a national one is grouped for the selected country.
  function formatDisplay(country: CountryCode, sig: string): string {
    if (!sig) return '';
    if (sig.startsWith('+')) return new AsYouType().input(sig);
    const national = new AsYouType(country).input(sig);
    // National grouping only kicks in once the trunk prefix is present (the
    // leading "0" in FR etc.). But the country selector already shows the dial
    // code, so a user may legitimately drop the 0 and type "7 68 25 66 28".
    // When national formatting added no separators, group via the dial code
    // instead and strip it back off, so the digits stay spaced even without
    // the trunk 0. (Returns the bare digits unchanged for short/partial input.)
    if (national.replace(/\D/g, '') === national) {
      const dialCode = COUNTRIES.find((c) => c.code === country)?.dialCode;
      if (dialCode) {
        const grouped = new AsYouType()
          .input(`${dialCode}${sig}`)
          .slice(dialCode.length)
          .trimStart();
        if (grouped) return grouped;
      }
    }
    return national;
  }

  function parseInitial(e164: string): { country: CountryCode; sig: string } {
    if (!e164) return { country: DEFAULT_COUNTRY, sig: '' };
    // Salesforce hands us phones in mixed shapes: full E.164 ("+33607131175")
    // for most, but a bare national number with no country and no leading 0
    // ("765719823") for some. Parse as international first; if that yields
    // nothing, fall back to reading it as a national number for the default
    // country. Without the second pass the bare form would prefill verbatim
    // (no leading 0), displaying differently from the E.164 ones, when every
    // FR number should land identically as "06 12 34 56 78".
    const p =
      parsePhoneNumberFromString(e164) ??
      parsePhoneNumberFromString(e164, DEFAULT_COUNTRY);
    if (p) {
      return {
        country: (p.country ?? DEFAULT_COUNTRY) as CountryCode,
        // formatNational() reintroduces the national prefix (leading "0" in
        // FR etc.); strip separators to get the bare significant digits.
        sig: p.formatNational().replace(/\D/g, ''),
      };
    }
    return { country: DEFAULT_COUNTRY, sig: e164.replace(/[^\d+]/g, '') };
  }

  // svelte-ignore state_referenced_locally
  const initial = parseInitial(value);
  let selectedCountry = $state<CountryCode>(initial.country);
  // svelte-ignore state_referenced_locally
  let phoneText = $state(formatDisplay(initial.country, initial.sig));
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
    const sig = extractSignificant(phoneText);
    if (!sig) return '';
    if (parsed?.number) return parsed.number;
    // While the user is still typing an international prefix ("+4"), let the
    // raw text through so server validation reports "invalide" coherently.
    if (sig.startsWith('+')) return sig;
    const trimmed = sig.replace(/^0/, '');
    return trimmed ? `${countryEntry.dialCode}${trimmed}` : '';
  });

  // Reflect the canonical value back through `bind:value` so a superforms
  // store (or any local state) stays in sync as the user types, mirroring the
  // hidden input. One-way callers (value={...} without bind) are unaffected:
  // the write simply stays local. parseInitial reads `value` once at setup and
  // never reactively re-reads it, so this never feeds back into a re-parse.
  $effect(() => {
    value = e164Value;
  });

  let isValid = $derived.by(() => {
    if (!phoneText) return false;
    try {
      return isValidPhoneNumber(phoneText, selectedCountry);
    } catch {
      return false;
    }
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

  // Push the field's text and caret back to the DOM by hand. The input is
  // one-way bound (value={phoneText}), so when grouping leaves phoneText
  // unchanged Svelte skips the DOM write and a rejected keystroke (a letter,
  // a stray separator) would otherwise linger on screen.
  async function commit(text: string, sigBeforeCaret: number) {
    phoneText = text;
    await tick();
    if (!inputEl) return;
    inputEl.value = text;
    const pos = caretAfterNSignificant(text, sigBeforeCaret);
    inputEl.setSelectionRange(pos, pos);
  }

  async function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    const incoming = e.currentTarget.value;
    const isBackspace =
      (e as unknown as InputEvent).inputType === 'deleteContentBackward';
    const caret = e.currentTarget.selectionStart ?? incoming.length;

    // A complete international number lifts its dial code into the selector;
    // the dial-code digits leave the field, so anchoring the caret at the end
    // is the only sensible spot (this branch fires on paste or once a prefix
    // resolves, never mid-national-typing).
    const detected = detectInternationalPrefix(incoming);
    if (detected) {
      selectedCountry = detected.country;
      const text = formatDisplay(detected.country, detected.rest);
      await commit(text, countSignificant(text));
      return;
    }

    let sig = extractSignificant(incoming);
    let sigBeforeCaret = countSignificant(incoming.slice(0, caret));

    // A backspace that removed only a grouping space (no digit lost) would
    // stall the caret on the separator. Drop the digit just before the caret
    // instead, so one press always deletes one digit.
    const prevSig = extractSignificant(phoneText);
    if (isBackspace && sig.length === prevSig.length && sigBeforeCaret > 0) {
      sig = sig.slice(0, sigBeforeCaret - 1) + sig.slice(sigBeforeCaret);
      sigBeforeCaret -= 1;
    }

    await commit(formatDisplay(selectedCountry, sig), sigBeforeCaret);
  }

  function selectCountry(code: CountryCode) {
    selectedCountry = code;
    open = false;
    search = '';
    // Re-group the digits already entered for the newly chosen country.
    phoneText = formatDisplay(code, extractSignificant(phoneText));
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

<div>
  <div class="flex gap-2">
    <Popover.Root bind:open>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="outline"
            {disabled}
            title={countryEntry.name}
            aria-label="Indicatif pays ({countryEntry.name})"
            class={cn(
              'h-9 w-[112px] shrink-0 justify-between gap-1 px-3 whitespace-nowrap',
              triggerClass,
              error && 'border-destructive/60',
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
        class={cn(
          'w-[min(320px,calc(100vw-2rem))] overflow-hidden p-0',
          popoverClass,
        )}
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
                    <Check class="ml-1 size-4 text-primary" />
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
                    <Check class="ml-1 size-4 text-primary" />
                  {/if}
                </Command.Item>
              {/each}
            </Command.Group>
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>

    <div class="relative flex-1">
      <Input
        bind:ref={inputEl}
        {id}
        type="tel"
        inputmode="tel"
        autocomplete="tel"
        autocapitalize="off"
        autocorrect="off"
        spellcheck={false}
        {disabled}
        value={phoneText}
        oninput={handleInput}
        {placeholder}
        {required}
        aria-invalid={error || undefined}
        aria-describedby={ariaDescribedBy}
        class={cn(
          'w-full pr-9 tabular-nums',
          className,
          error && 'border-destructive focus-visible:border-destructive',
        )}
      />
      {#if isValid}
        <CircleCheck
          aria-hidden="true"
          class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-primary"
        />
      {/if}
    </div>

    {#if name}
      <input type="hidden" {name} {form} value={e164Value} />
    {/if}
  </div>
  <span class="sr-only" aria-live="polite">
    {isValid ? `Numéro valide pour ${countryEntry.name}` : ''}
  </span>
</div>
