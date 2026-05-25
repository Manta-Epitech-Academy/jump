<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import Laptop from '@lucide/svelte/icons/laptop';
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
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
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
  use:enhance={() => {
    submitting = true;
    return async ({ result, update }) => {
      if (result.type === 'success') {
        await invalidateAll();
        return;
      }
      await update();
      submitting = false;
    };
  }}
  class="space-y-4"
>
  <input type="hidden" name="hasLaptop" value={checked ? 'true' : 'false'} />

  <label
    class="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-4 py-4 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <Checkbox
      bind:checked
      class="size-5 shrink-0 data-[state=checked]:border-epi-teal data-[state=checked]:bg-epi-teal data-[state=checked]:text-black"
    />
    <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
      Je possède un laptop qui fonctionne pour réaliser mon stage.
    </span>
  </label>

  <div
    class="rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <Label
      for="setupDescription"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Tu as un setup particulier à la maison ? Décris-nous ta configuration : PC
      fixe, GPU, écrans, casque VR, etc.
    </Label>
    <Textarea
      id="setupDescription"
      name="setupDescription"
      rows={4}
      maxlength={1000}
      value={setupDescription}
      placeholder="Mon PC gaming, mes écrans, ma config..."
      class="resize-none rounded-lg border-slate-300 bg-white/80 text-slate-900 placeholder:text-slate-400 focus-visible:border-epi-blue/40 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <ContinueButton {submitting} class="mt-4" />
</form>
