<!--
  « Mon EpiDuck » in the talent's settings (#539), as the mockup draws it: the
  duck in profile and facing the talent with his name under him, and beside
  them (under them on a phone) his name field and three rows of choices.
  A choice applies at once, the name when the field is left or confirmed: it
  is the duck's own state (`MascotController.choose`), so the preview and the
  header wear it together, and the controller saves the changes in the order
  they were made (#552). Every accessory is free: the body is the one thing
  that never changes.
-->
<script lang="ts">
  import { Input } from '#lib/components/ui/input/index.ts';
  import { Label } from '#lib/components/ui/label/index.ts';
  import TitleCursor from '#lib/components/layout/TitleCursor.svelte';
  import {
    MASCOT_DEFAULT_NAME,
    MASCOT_GLASSES,
    MASCOT_HAIRS,
    MASCOT_NAME_MAX,
    MASCOT_SCARVES,
    type MascotChoice,
  } from '#lib/domain/mascot.ts';
  import SettingsSection from '#lib/components/talent/settings/SettingsSection.svelte';
  import EpiDuck from './EpiDuck.svelte';
  import { DUCK } from './art/palette';
  import { useMascot } from './mascotController.svelte.ts';

  const mascotOf = useMascot();
  let mascot = $derived(mascotOf());

  // The name being typed: drawn as it is typed, saved when the field is left
  // or confirmed, and back to the duck's own whenever his changes (a refused
  // save puts the stored one back).
  let chosenName = $derived(mascot?.choice.name ?? '');
  let draft = $derived(chosenName);

  let shownName = $derived(draft.trim() || MASCOT_DEFAULT_NAME);
  let preview = $derived(mascot ? { ...mascot.choice, name: draft } : null);

  type Row = {
    field: Exclude<keyof MascotChoice, 'name'>;
    label: string;
    options: Record<string, string>;
  };
  const ROWS: Row[] = [
    { field: 'glasses', label: 'Lunettes', options: MASCOT_GLASSES },
    { field: 'scarf', label: 'Écharpe', options: MASCOT_SCARVES },
    { field: 'hair', label: 'Coiffure', options: MASCOT_HAIRS },
  ];

  const scarfColour = (value: string) =>
    value in DUCK.scarf
      ? DUCK.scarf[value as keyof typeof DUCK.scarf].base
      : null;
</script>

{#if mascot && preview}
  <SettingsSection title="Mon EpiDuck">
    <div class="flex flex-wrap items-start gap-x-7 gap-y-5">
      <div class="mx-auto flex flex-none flex-col items-center gap-2">
        <div
          class="flex items-end justify-center gap-4 rounded-xl bg-primary/10 px-5 pt-5 pb-4"
        >
          <EpiDuck pose="side" look={preview} class="h-24 w-26" />
          <EpiDuck pose="front" look={preview} class="h-28 w-26" />
        </div>
        <p class="font-heading text-display-s text-primary">
          {shownName.toUpperCase()}<TitleCursor />
        </p>
      </div>

      <!-- Busy while a change is on its way, so a screen reader can wait for
         it. -->
      <div
        aria-busy={mascot.savingLook}
        class="min-w-0 flex-[1_1_16rem] space-y-4"
      >
        <div class="space-y-1.5">
          <Label for="mascot-name" class="epi-overline text-muted-foreground"
            >Nom de ton canard</Label
          >
          <Input
            id="mascot-name"
            bind:value={draft}
            maxlength={MASCOT_NAME_MAX}
            placeholder={MASCOT_DEFAULT_NAME}
            autocomplete="off"
            onchange={() => mascot.choose({ name: draft.trim() })}
          />
        </div>

        {#each ROWS as row (row.field)}
          <fieldset class="space-y-1.5">
            <legend class="mb-1.5 epi-overline text-muted-foreground"
              >{row.label}</legend
            >
            <div class="flex flex-wrap gap-2">
              {#each Object.entries(row.options) as [value, label] (value)}
                {@const on = mascot.choice[row.field] === value}
                {@const colour =
                  row.field === 'scarf' ? scarfColour(value) : null}
                <button
                  type="button"
                  aria-pressed={on}
                  onclick={() => mascot.choose({ [row.field]: value })}
                  class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors {on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted'}"
                >
                  {#if colour}
                    <span
                      class="size-3 rounded-full bg-[var(--dot)] ring-1 ring-border"
                      style:--dot={colour}
                      aria-hidden="true"
                    ></span>
                  {/if}
                  {label}
                </button>
              {/each}
            </div>
          </fieldset>
        {/each}

        <p class="text-sm text-muted-foreground">
          Ton EpiDuck reste toujours bleu Epitech : seuls ses accessoires
          changent.
        </p>
      </div>
    </div>
  </SettingsSection>
{/if}
