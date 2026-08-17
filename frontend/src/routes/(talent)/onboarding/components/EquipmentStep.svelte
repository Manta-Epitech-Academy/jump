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
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <Laptop class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-wider text-epi-blue uppercase dark:text-epi-blue"
  >
    Ton matériel
  </h1>
</div>

{#if error}
  <p
    class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
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
      class="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300"
    >
      <Laptop class="h-4 w-4" /> Ton équipement
      <span class="text-red-500">*</span>
    </h2>
    <label
      class={cn(
        'flex cursor-pointer items-center gap-4 rounded-2xl border-2 px-5 py-4 shadow-sm transition-all',
        checked
          ? 'border-epi-teal bg-epi-teal/10 dark:bg-epi-teal/15'
          : 'border-slate-200 bg-white/70 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/80 dark:hover:border-slate-600',
      )}
    >
      <div
        class={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors',
          checked
            ? 'bg-epi-teal text-black'
            : 'bg-slate-100 text-slate-400 dark:bg-slate-800',
        )}
      >
        <Laptop class="h-5 w-5" />
      </div>
      <span
        class="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        Je possède un laptop qui fonctionne pour réaliser mon stage.
      </span>
      <Checkbox
        bind:checked
        name="hasLaptop"
        value="true"
        class="size-6 shrink-0 rounded-full data-[state=checked]:border-epi-teal data-[state=checked]:bg-epi-teal data-[state=checked]:text-black"
      />
    </label>
  </div>

  <!-- Ton setup — optional flavour. Clearly secondary: tagged optionnel. The
       illustration is a small centred wink (gif-sized), not a full-bleed banner
       that would steal focus from the actual question. -->
  <div>
    <h2
      class="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300"
    >
      <Sparkles class="h-4 w-4" /> Ton setup
      <span class="text-xs font-normal text-slate-400 normal-case"
        >optionnel</span
      >
    </h2>
    <div
      class="rounded-xl border border-slate-200/60 bg-white/80 p-4 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
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
          class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
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
          class="resize-none rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-epi-blue/40 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-600"
        />
      </div>
    </div>
  </div>

  <div class="space-y-3">
    {#if !checked}
      <p class="text-center text-xs text-slate-500 dark:text-slate-400">
        Coche « Je possède un laptop qui fonctionne… » pour continuer.
      </p>
    {/if}
    <ContinueButton {submitting} disabled={!checked} />
  </div>
</form>
