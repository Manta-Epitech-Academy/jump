<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import Users from '@lucide/svelte/icons/users';

  let {
    parentNom = '',
    parentPrenom = '',
    parentEmail = '',
    onvalidate,
  }: {
    parentNom?: string;
    parentPrenom?: string;
    parentEmail?: string;
    onvalidate: (data: {
      parentNom: string;
      parentPrenom: string;
      parentEmail: string;
    }) => void;
  } = $props();

  let localParentNom = $state(parentNom);
  let localParentPrenom = $state(parentPrenom);
  let localParentEmail = $state(parentEmail);

  const canSubmit = $derived(
    localParentNom.trim().length >= 2 &&
      localParentPrenom.trim().length >= 2 &&
      localParentEmail.includes('@'),
  );

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (canSubmit) {
      onvalidate({
        parentNom: localParentNom.trim(),
        parentPrenom: localParentPrenom.trim(),
        parentEmail: localParentEmail.trim(),
      });
    }
  }
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <Users class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Ton responsable légal
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Un contact pour ton parent ou représentant légal.
  </p>
</div>

<form onsubmit={handleSubmit} class="mt-6 space-y-3">
  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="parentPrenom"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Prénom <span class="text-red-500">*</span>
    </label>
    <input
      id="parentPrenom"
      type="text"
      bind:value={localParentPrenom}
      placeholder="Marie"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="parentNom"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Nom <span class="text-red-500">*</span>
    </label>
    <input
      id="parentNom"
      type="text"
      bind:value={localParentNom}
      placeholder="Dupont"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="parentEmail"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Email <span class="text-red-500">*</span>
    </label>
    <input
      id="parentEmail"
      type="email"
      bind:value={localParentEmail}
      placeholder="parent@mail.com"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <Button
    type="submit"
    disabled={!canSubmit}
    class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
  >
    Continuer
  </Button>
</form>
