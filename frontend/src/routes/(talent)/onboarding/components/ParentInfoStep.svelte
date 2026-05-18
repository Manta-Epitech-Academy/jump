<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import Users from '@lucide/svelte/icons/users';
  import { track } from '$lib/analytics';

  let {
    nom,
    prenom,
    email,
    phone,
    parentNom = '',
    parentPrenom = '',
    parentEmail = '',
    parentPhone = '',
    errors,
  }: {
    nom: string;
    prenom: string;
    email: string;
    phone: string;
    parentNom?: string;
    parentPrenom?: string;
    parentEmail?: string;
    parentPhone?: string;
    errors?: Record<string, string[]>;
  } = $props();

  let localParentNom = $state(parentNom);
  let localParentPrenom = $state(parentPrenom);
  let localParentEmail = $state(parentEmail);
  let localParentPhone = $state(parentPhone);
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
    Allez, promis c'est bientôt fini ! 🙌
  </p>
</div>

{#if errors}
  {#each Object.entries(errors) as [field, msgs]}
    {#each msgs as msg}
      <p
        class="mb-2 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
      >
        {msg}
      </p>
    {/each}
  {/each}
{/if}

<form
  method="POST"
  action="?/validateInfo"
  use:enhance={() => {
    return async ({ result, update }) => {
      if (result.type === 'redirect' || result.type === 'success') {
        track('onboarding_info_validated');
      } else if (result.type === 'failure') {
        track('onboarding_info_validation_failed');
      }
      await update();
    };
  }}
  class="mt-6 space-y-3"
>
  <!-- Hidden fields: accumulated from student step -->
  <input type="hidden" name="nom" value={nom} />
  <input type="hidden" name="prenom" value={prenom} />
  <input type="hidden" name="email" value={email} />
  <input type="hidden" name="phone" value={phone} />

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
      name="parentPrenom"
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
      name="parentNom"
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
      name="parentEmail"
      type="email"
      bind:value={localParentEmail}
      placeholder="parent@mail.com"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="parentPhone"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Téléphone <span class="text-red-500">*</span>
    </label>
    <input
      id="parentPhone"
      name="parentPhone"
      type="tel"
      bind:value={localParentPhone}
      placeholder="06 12 34 56 78"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <Button
    type="submit"
    class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
  >
    Valider et continuer
  </Button>
</form>
