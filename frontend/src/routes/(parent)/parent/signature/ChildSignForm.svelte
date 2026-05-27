<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import * as Select from '$lib/components/ui/select';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import { cn } from '$lib/utils';
  import { track, errReason } from '$lib/analytics';
  import type { ImageRightsDecision } from '$lib/domain/imageRights';

  interface Props {
    child: { id: string; prenom: string; nom: string };
    /** Legal body shown once the guardian chooses to authorize. */
    droitImageBody: string;
    /** Legal body shown once the guardian chooses to refuse. */
    droitImageRefusalBody: string;
    error?: string;
  }

  let { child, droitImageBody, droitImageRefusalBody, error }: Props = $props();

  let signerName = $state('');
  let relationship = $state('');
  let city = $state('');
  let decision = $state<ImageRightsDecision | ''>('');
  let submitting = $state(false);

  const canSubmit = $derived(
    decision !== '' &&
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
    action="?/decide"
    use:enhance={() => {
      submitting = true;
      return async ({ result, update }) => {
        if (result.type === 'success' || result.type === 'redirect') {
          track('parent_image_rights_decided', { decision });
        } else if (result.type === 'failure') {
          track('parent_image_rights_decision_failed', {
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
    <input type="hidden" name="decision" value={decision} />

    {#if error}
      <p
        class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
      >
        {error}
      </p>
    {/if}

    <!-- Declaration -->
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
        <input type="hidden" name="relationship" value={relationship} />
        <Select.Root type="single" bind:value={relationship}>
          <Select.Trigger
            class="inline-flex h-auto w-auto gap-1 rounded-lg border-slate-300 bg-white px-2 py-1 align-middle text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {#if relationship}
              {relationship}
            {:else}
              <span class="text-slate-400">(choisir)</span>
            {/if}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="mère" label="mère" />
            <Select.Item value="père" label="père" />
            <Select.Item value="tuteur légal" label="tuteur légal" />
            <Select.Item value="tutrice légale" label="tutrice légale" />
          </Select.Content>
        </Select.Root>, concernant l'utilisation par <strong>Epitech</strong> de
        l'image de mon enfant
        <strong>{child.prenom} {child.nom}</strong> dans le cadre du stage de seconde
        :
      </p>
    </div>

    <!-- Decision: authorize or refuse -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button
        type="button"
        onclick={() => (decision = 'accepted')}
        aria-pressed={decision === 'accepted'}
        class={cn(
          'flex items-start gap-3 rounded-xl border px-4 py-3 text-left shadow-sm backdrop-blur-xl transition-all',
          decision === 'accepted'
            ? 'border-epi-teal bg-epi-teal/10 ring-1 ring-epi-teal'
            : 'border-slate-200/60 bg-white/80 hover:border-epi-teal/50 dark:bg-slate-900/80',
        )}
      >
        <span
          class={cn(
            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
            decision === 'accepted'
              ? 'border-epi-teal bg-epi-teal text-black'
              : 'border-slate-300 dark:border-slate-600',
          )}
        >
          {#if decision === 'accepted'}<Check class="size-3.5" />{/if}
        </span>
        <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
          J'autorise l'utilisation de l'image de mon enfant
        </span>
      </button>

      <button
        type="button"
        onclick={() => (decision = 'refused')}
        aria-pressed={decision === 'refused'}
        class={cn(
          'flex items-start gap-3 rounded-xl border px-4 py-3 text-left shadow-sm backdrop-blur-xl transition-all',
          decision === 'refused'
            ? 'border-red-400 bg-red-50 ring-1 ring-red-400 dark:bg-red-900/20'
            : 'border-slate-200/60 bg-white/80 hover:border-red-300 dark:bg-slate-900/80',
        )}
      >
        <span
          class={cn(
            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
            decision === 'refused'
              ? 'border-red-500 bg-red-500 text-white'
              : 'border-slate-300 dark:border-slate-600',
          )}
        >
          {#if decision === 'refused'}<X class="size-3.5" />{/if}
        </span>
        <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
          Je refuse l'utilisation de l'image de mon enfant
        </span>
      </button>
    </div>

    <!-- Legal note for the chosen decision -->
    {#if decision}
      <div class="prose prose-sm max-w-none prose-slate dark:prose-invert">
        {@html decision === 'refused' ? droitImageRefusalBody : droitImageBody}
      </div>
    {/if}

    <!-- Place + date -->
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

    <!-- Submit -->
    <Button
      type="submit"
      disabled={!canSubmit}
      class={cn(
        'h-auto w-full rounded-2xl px-6 py-3 shadow-lg transition-all duration-200 disabled:opacity-50',
        decision === 'refused'
          ? 'bg-red-500 text-white shadow-red-500/20 hover:bg-red-500 hover:brightness-110'
          : 'bg-epi-teal text-black shadow-epi-teal/20 hover:bg-epi-teal hover:brightness-110',
      )}
    >
      {#if submitting}
        <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
        Enregistrement en cours...
      {:else if decision === 'refused'}
        Enregistrer mon refus
      {:else}
        Signer l'autorisation
      {/if}
    </Button>
  </form>
</div>
