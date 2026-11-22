<!--
  « Mon EpiDuck » in the talent's settings (#539), as the mockup draws it: the
  duck in profile and facing the talent with his name under him, and beside
  them (under them on a phone) his name field and three rows of choices.
  A choice applies at once, the name when the field is left or confirmed; the
  preview follows the form before the server has answered, the header once it
  has. Every accessory is free: the body is the one thing that never changes.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import { Input } from '#lib/components/ui/input/index.ts';
  import { Label } from '#lib/components/ui/label/index.ts';
  import TitleCursor from '#lib/components/layout/TitleCursor.svelte';
  import {
    MASCOT_DEFAULT_NAME,
    MASCOT_GLASSES,
    MASCOT_HAIRS,
    MASCOT_NAME_MAX,
    MASCOT_SCARVES,
  } from '#lib/domain/mascot.ts';
  import type { MascotLookForm } from '#lib/validation/mascot.ts';
  import SettingsSection from '#lib/components/talent/settings/SettingsSection.svelte';
  import EpiDuck from './EpiDuck.svelte';
  import { DUCK } from './art/palette';

  let { form: initial }: { form: SuperValidated<MascotLookForm> } = $props();

  // Initialised once, on purpose: superforms keeps its store in step with the
  // page afterwards, and re-creating it would drop a name being typed.
  // svelte-ignore state_referenced_locally
  const { form, errors, enhance, submit } = superForm(initial, {
    resetForm: false,
    // Each submit carries the whole look, so a choice made while the last one
    // is on its way replaces it rather than being dropped.
    multipleSubmits: 'abort',
    onError() {
      toast.error("Ton canard n'a pas pu être enregistré. Réessaie.");
    },
  });

  let shownName = $derived($form.name.trim() || MASCOT_DEFAULT_NAME);

  type Row = {
    field: 'glasses' | 'scarf' | 'hair';
    label: string;
    options: Record<string, string>;
  };
  const ROWS: Row[] = [
    { field: 'glasses', label: 'Lunettes', options: MASCOT_GLASSES },
    { field: 'scarf', label: 'Écharpe', options: MASCOT_SCARVES },
    { field: 'hair', label: 'Coiffure', options: MASCOT_HAIRS },
  ];

  const scarfColour = (value: string) =>
    value in DUCK.scarf ? DUCK.scarf[value as keyof typeof DUCK.scarf] : null;

  // The form posts what its fields hold, so the hidden field has to carry the
  // choice before it is sent.
  async function choose(field: Row['field'], value: string): Promise<void> {
    if ($form[field] === value) return;
    ($form as Record<string, string>)[field] = value;
    await tick();
    submit();
  }
</script>

<SettingsSection title="Mon EpiDuck">
  <div class="flex flex-wrap items-start gap-x-7 gap-y-5">
    <div class="mx-auto flex flex-none flex-col items-center gap-2">
      <div
        class="flex items-end justify-center gap-4 rounded-xl bg-primary/10 px-5 pt-5 pb-4"
      >
        <EpiDuck pose="side" look={$form} class="h-24 w-26" />
        <EpiDuck pose="front" look={$form} class="h-28 w-26" />
      </div>
      <p class="font-heading text-display-s text-primary">
        {shownName.toUpperCase()}<TitleCursor />
      </p>
    </div>

    <form
      method="POST"
      action="?/saveMascot"
      use:enhance
      class="min-w-0 flex-[1_1_16rem] space-y-4"
    >
      <div class="space-y-1.5">
        <Label for="mascot-name" class="epi-overline text-muted-foreground"
          >Nom de ton canard</Label
        >
        <Input
          id="mascot-name"
          name="name"
          bind:value={$form.name}
          maxlength={MASCOT_NAME_MAX}
          placeholder={MASCOT_DEFAULT_NAME}
          autocomplete="off"
          onchange={() => submit()}
          aria-invalid={$errors.name ? 'true' : undefined}
        />
        {#if $errors.name}
          <p class="text-sm text-destructive">{$errors.name}</p>
        {/if}
      </div>

      {#each ROWS as row (row.field)}
        <input type="hidden" name={row.field} value={$form[row.field]} />
        <fieldset class="space-y-1.5">
          <legend class="mb-1.5 epi-overline text-muted-foreground"
            >{row.label}</legend
          >
          <div class="flex flex-wrap gap-2">
            {#each Object.entries(row.options) as [value, label] (value)}
              {@const on = $form[row.field] === value}
              {@const colour =
                row.field === 'scarf' ? scarfColour(value) : null}
              <button
                type="button"
                aria-pressed={on}
                onclick={() => choose(row.field, value)}
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
    </form>
  </div>
</SettingsSection>
