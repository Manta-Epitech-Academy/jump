<script lang="ts">
  import { enhance } from '$app/forms';
  import { onboardingSubmit } from '../stepSubmit';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { cn } from '$lib/utils';
  import Laptop from '@lucide/svelte/icons/laptop';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import ContinueButton from './ContinueButton.svelte';
  import { fieldInput } from './fieldSkin';

  let {
    hasLaptop = false,
    setupDescription = '',
    error,
  }: {
    hasLaptop?: boolean;
    setupDescription?: string;
    error?: string;
  } = $props();

  // svelte-ignore state_referenced_locally
  let checked = $state(hasLaptop);
  let submitting = $state(false);
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-epi-blue text-white shadow-raised"
  >
    <Laptop class="h-7 w-7" />
  </div>
  <h1 class="font-heading text-display-m text-epi-blue">Ton matériel</h1>
</div>

{#if error}
  <p
    class="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
  >
    {error}
  </p>
{/if}

<form
  method="POST"
  action="?/validateEquipment"
  use:enhance={onboardingSubmit((v) => (submitting = v))}
  class="space-y-6"
>
  <!-- Ton équipement — the one input that matters operationally (do they have a
       usable machine for the stage). Promoted to a stateful selectable card so
       it reads as the primary choice, not an afterthought. -->
  <div>
    <h2
      class="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-foreground-secondary uppercase"
    >
      <Laptop class="h-4 w-4" /> Ton équipement
      <span class="text-destructive">*</span>
    </h2>
    <label
      class={cn(
        'flex cursor-pointer items-center gap-4 rounded-xl border-2 px-5 py-4 shadow-raised transition-ui',
        checked
          ? 'border-epi-tech bg-epi-tech/10 dark:bg-epi-tech/15'
          : 'border-border bg-card hover:border-border',
      )}
    >
      <div
        class={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors',
          checked ? 'bg-epi-tech text-black' : 'bg-muted text-muted-foreground',
        )}
      >
        <Laptop class="h-5 w-5" />
      </div>
      <span class="flex-1 text-sm font-medium text-foreground-secondary">
        Je possède un laptop qui fonctionne pour réaliser mon stage.
      </span>
      <Checkbox
        bind:checked
        name="hasLaptop"
        value="true"
        class="size-6 shrink-0 rounded-full data-[state=checked]:border-epi-tech data-[state=checked]:bg-epi-tech data-[state=checked]:text-black"
      />
    </label>
  </div>

  <!-- Ton setup — optional flavour. Clearly secondary: tagged optionnel. The
       illustration is a small centred wink (gif-sized), not a full-bleed banner
       that would steal focus from the actual question. -->
  <div>
    <h2
      class="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-foreground-secondary uppercase"
    >
      <Sparkles class="h-4 w-4" /> Ton setup
      <span class="text-xs font-normal text-muted-foreground normal-case"
        >optionnel</span
      >
    </h2>
    <div class="rounded-xl border border-border/60 bg-card p-4 shadow-raised">
      <img
        src="/onboarding-setup.jpg"
        alt="Un chat installé devant un setup gaming"
        loading="lazy"
        decoding="async"
        class="mx-auto mb-3 h-42 w-auto rounded-lg object-cover"
      />
      <div>
        <Label
          for="setupDescription"
          class="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Tu as un setup particulier à la maison ? Décris-nous ta configuration
          : PC fixe, GPU, écrans, casque VR, etc.
        </Label>
        <Textarea
          id="setupDescription"
          name="setupDescription"
          rows={4}
          maxlength={1000}
          value={setupDescription}
          placeholder="Mon PC gaming, mes écrans, ma config..."
          class="resize-none border {fieldInput}"
        />
      </div>
    </div>
  </div>

  <div class="space-y-3">
    {#if !checked}
      <p class="text-center text-xs text-muted-foreground">
        Coche « Je possède un laptop qui fonctionne… » pour continuer.
      </p>
    {/if}
    <ContinueButton {submitting} disabled={!checked} />
  </div>
</form>
