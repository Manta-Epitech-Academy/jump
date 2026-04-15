<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { UserCheck } from '@lucide/svelte';

  let {
    profile,
    errors,
  }: {
    profile: {
      nom: string;
      prenom: string;
      email: string;
      parentNom: string;
      parentPrenom: string;
      parentEmail: string;
      parentPhone: string;
      phone: string;
    };
    errors?: Record<string, string[]>;
  } = $props();
</script>

<!-- Header -->
<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <UserCheck class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Vérification de tes informations
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Vérifie que ces informations sont correctes. Tu peux les modifier si
    nécessaire.
  </p>
</div>

<form method="POST" action="?/validateInfo" use:enhance class="mt-6 space-y-3">
  <!-- Nom -->
  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="nom"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
      >Nom <span class="text-red-500">*</span></label
    >
    <input
      id="nom"
      name="nom"
      type="text"
      value={profile.nom}
      placeholder="Dupont"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
    {#if errors?.nom}
      <p class="mt-1 text-xs text-red-500">{errors.nom[0]}</p>
    {/if}
  </div>

  <!-- Prénom -->
  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="prenom"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
      >Prénom <span class="text-red-500">*</span></label
    >
    <input
      id="prenom"
      name="prenom"
      type="text"
      value={profile.prenom}
      placeholder="Jean"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
    {#if errors?.prenom}
      <p class="mt-1 text-xs text-red-500">{errors.prenom[0]}</p>
    {/if}
  </div>

  <!-- Email -->
  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="email"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
      >Email <span class="text-red-500">*</span></label
    >
    <input
      id="email"
      name="email"
      type="email"
      value={profile.email}
      placeholder="jean.dupont@mail.com"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
    {#if errors?.email}
      <p class="mt-1 text-xs text-red-500">{errors.email[0]}</p>
    {/if}
  </div>

  <div class="pt-2">
    <p class="text-xs font-medium text-slate-500 dark:text-slate-400">
      Informations du parent / représentant légal
    </p>
  </div>

  <!-- Parent Nom -->
  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="parentNom"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
      >Nom du parent <span class="text-red-500">*</span></label
    >
    <input
      id="parentNom"
      name="parentNom"
      type="text"
      value={profile.parentNom}
      placeholder="Dupont"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
    {#if errors?.parentNom}
      <p class="mt-1 text-xs text-red-500">{errors.parentNom[0]}</p>
    {/if}
  </div>

  <!-- Parent Prénom -->
  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="parentPrenom"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
      >Prénom du parent <span class="text-red-500">*</span></label
    >
    <input
      id="parentPrenom"
      name="parentPrenom"
      type="text"
      value={profile.parentPrenom}
      placeholder="Marie"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
    {#if errors?.parentPrenom}
      <p class="mt-1 text-xs text-red-500">{errors.parentPrenom[0]}</p>
    {/if}
  </div>

  <!-- Parent Email -->
  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="parentEmail"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
      >Email du parent <span class="text-red-500">*</span></label
    >
    <input
      id="parentEmail"
      name="parentEmail"
      type="email"
      value={profile.parentEmail}
      placeholder="parent@mail.com"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
    {#if errors?.parentEmail}
      <p class="mt-1 text-xs text-red-500">{errors.parentEmail[0]}</p>
    {/if}
  </div>

  <!-- Parent Phone -->
  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="parentPhone"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
      >Téléphone du parent (optionnel)</label
    >
    <input
      id="parentPhone"
      name="parentPhone"
      type="tel"
      value={profile.parentPhone}
      placeholder="06 12 34 56 78"
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <!-- Phone -->
  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="phone"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
      >Ton téléphone (optionnel)</label
    >
    <input
      id="phone"
      name="phone"
      type="tel"
      value={profile.phone}
      placeholder="06 98 76 54 32"
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
