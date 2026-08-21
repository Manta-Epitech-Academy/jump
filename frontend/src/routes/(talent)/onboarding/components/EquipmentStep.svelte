<script lang="ts">
  import { enhance } from '$app/forms';
  import { onboardingSubmit } from '../stepSubmit';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import Laptop from '@lucide/svelte/icons/laptop';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import ContinueButton from './ContinueButton.svelte';
  import { fieldInput } from './fieldSkin';

  let {
    setupDescription = '',
    error,
  }: {
    setupDescription?: string;
    error?: string;
  } = $props();

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
  <!-- Ton setup: informational, never a gate. The laptop requirement itself is
       certified on the règlement step, where the clause it certifies is written
       down; asking it twice would let the two answers disagree. What is left
       here is the free-text description, which staff read on the fiche talent,
       so an empty answer has to let the talent through. -->
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

  <ContinueButton {submitting} />
</form>
