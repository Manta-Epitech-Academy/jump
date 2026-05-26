<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { track, errReason } from '$lib/analytics';

  interface Props {
    child: { id: string; prenom: string; nom: string };
    droitImageBody: string;
    error?: string;
  }

  let { child, droitImageBody, error }: Props = $props();

  let signerName = $state('');
  let relationship = $state('');
  let city = $state('');
  let accepted = $state(false);
  let submitting = $state(false);

  const canSign = $derived(
    accepted &&
      signerName.trim().length >= 2 &&
      relationship !== '' &&
      city.trim().length >= 1 &&
      !submitting,
  );
</script>

<div class="mb-6 space-y-4">
  <!-- Child name header -->
  <div
    class="rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <h2 class="text-base font-bold text-slate-900 dark:text-white">
      {child.prenom}
      {child.nom}
    </h2>
  </div>

  <form
    method="POST"
    action="?/sign"
    use:enhance={() => {
      submitting = true;
      return async ({ result, update }) => {
        if (result.type === 'success' || result.type === 'redirect') {
          track('parent_image_rights_signed');
        } else if (result.type === 'failure') {
          track('parent_image_rights_signing_failed', {
            reason: errReason(result),
          });
        }
        await update();
        submitting = false;
      };
    }}
    class="space-y-4"
  >
    <input type="hidden" name="talentId" value={child.id} />

    {#if error}
      <p
        class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
      >
        {error}
      </p>
    {/if}

    <!-- Document content -->
    <div class="prose prose-sm max-w-none prose-slate dark:prose-invert">
      <p>
        Je soussigné(e), Mme/Mr
        <input
          name="signerName"
          type="text"
          bind:value={signerName}
          placeholder="Nom complet"
          required
          class="inline-block w-44 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-600"
        />
        agissant en qualité de
        <select
          name="relationship"
          bind:value={relationship}
          required
          class="inline-block w-auto rounded-lg border border-slate-300 bg-white px-2 py-1 text-center text-sm font-semibold text-slate-900 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        >
          <option value="" disabled class="text-slate-400">(choisir)</option>
          <option value="mère">mère</option>
          <option value="père">père</option>
          <option value="tuteur légal">tuteur légal</option>
          <option value="tutrice légale">tutrice légale</option>
        </select>, autorise <strong>Epitech</strong> à utiliser l'image de mon
        enfant
        <strong>{child.prenom} {child.nom}</strong> dans le cadre du stage de seconde.
      </p>
      {@html droitImageBody}
    </div>

    <!-- Signature — card glass -->
    <div
      class="flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <span class="text-sm font-medium text-slate-700 dark:text-slate-300"
        >Fait à</span
      >
      <input
        name="city"
        type="text"
        bind:value={city}
        placeholder="Ville"
        required
        class="w-40 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-600"
      />
      <span class="text-sm font-medium text-slate-700 dark:text-slate-300"
        >, le {new Date().toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}</span
      >
    </div>

    <!-- Checkbox -->
    <label
      class="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <Checkbox
        bind:checked={accepted}
        class="mt-0.5 size-5 shrink-0 data-[state=checked]:border-epi-teal data-[state=checked]:bg-epi-teal data-[state=checked]:text-black"
      />
      <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
        En tant que représentant légal, j'autorise l'utilisation de l'image de
        mon enfant
      </span>
    </label>

    <!-- Submit -->
    <Button
      type="submit"
      disabled={!canSign}
      class="h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110 disabled:opacity-50"
    >
      {#if submitting}
        <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
        Signature en cours...
      {:else}
        Signer pour {child.prenom}
      {/if}
    </Button>
  </form>
</div>
