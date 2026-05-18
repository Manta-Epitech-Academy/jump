<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import UserCheck from '@lucide/svelte/icons/user-check';

  let {
    prenom = '',
    nom = '',
    email = '',
    phone = '',
    onvalidate,
  }: {
    prenom?: string;
    nom?: string;
    email?: string;
    phone?: string;
    onvalidate: (data: {
      prenom: string;
      nom: string;
      email: string;
      phone: string;
    }) => void;
  } = $props();

  let localPrenom = $state(prenom);
  let localNom = $state(nom);
  let localEmail = $state(email);
  let localPhone = $state(phone);

  const canSubmit = $derived(
    localPrenom.trim().length >= 2 &&
      localNom.trim().length >= 2 &&
      localEmail.includes('@') &&
      localPhone.trim().length >= 10,
  );

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (canSubmit) {
      onvalidate({
        prenom: localPrenom.trim(),
        nom: localNom.trim(),
        email: localEmail.trim(),
        phone: localPhone.trim(),
      });
    }
  }
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <UserCheck class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Faisons connaissance !
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Parle-nous un peu de toi 😊
  </p>
</div>

<form onsubmit={handleSubmit} class="mt-6 space-y-3">
  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="prenom"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Prénom <span class="text-red-500">*</span>
    </label>
    <input
      id="prenom"
      type="text"
      bind:value={localPrenom}
      placeholder="Jean"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="nom"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Nom <span class="text-red-500">*</span>
    </label>
    <input
      id="nom"
      type="text"
      bind:value={localNom}
      placeholder="Dupont"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="email"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Email <span class="text-red-500">*</span>
    </label>
    <input
      id="email"
      type="email"
      bind:value={localEmail}
      placeholder="jean.dupont@mail.com"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="phone"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Ton téléphone <span class="text-red-500">*</span>
    </label>
    <input
      id="phone"
      type="tel"
      bind:value={localPhone}
      placeholder="06 98 76 54 32"
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
