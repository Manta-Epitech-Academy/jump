<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import { cn } from '$lib/utils';
  import ParentSignatureForm from '$lib/components/parent/ParentSignatureForm.svelte';
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

  let decision = $state<ImageRightsDecision | ''>('');

  // Submit colour tracks the chosen branch: teal for an authorization, red for
  // a refusal — same visual contract as the radio buttons above.
  const submitClass = $derived(
    cn(
      'h-auto w-full rounded-2xl px-6 py-3 shadow-lg transition-all duration-200 disabled:opacity-50',
      decision === 'refused'
        ? 'bg-red-500 text-white shadow-red-500/20 hover:bg-red-500 hover:brightness-110'
        : 'bg-epi-teal text-black shadow-epi-teal/20 hover:bg-epi-teal hover:brightness-110',
    ),
  );
</script>

<ParentSignatureForm
  {child}
  action="?/decide"
  {error}
  extraValid={decision !== ''}
  {submitClass}
  onResult={(result) => {
    if (result.type === 'success' || result.type === 'redirect') {
      track('parent_image_rights_decided', { decision });
    } else if (result.type === 'failure') {
      track('parent_image_rights_decision_failed', {
        reason: errReason(result),
      });
    }
  }}
>
  {#snippet declarationTail()}
    , concernant l'utilisation par <strong>Epitech</strong> de l'image de mon
    enfant <strong>{child.prenom} {child.nom}</strong> dans le cadre du stage de seconde
    :
  {/snippet}

  {#snippet artifact()}
    <input type="hidden" name="decision" value={decision} />

    <!-- Decision: authorize or refuse -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button
        type="button"
        onclick={() => (decision = 'accepted')}
        aria-pressed={decision === 'accepted'}
        class={cn(
          'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-left shadow-sm backdrop-blur-xl transition-all',
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
          'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-left shadow-sm backdrop-blur-xl transition-all',
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
  {/snippet}

  {#snippet submitLabel()}
    {#if decision === 'refused'}
      Enregistrer mon refus
    {:else}
      Signer l'autorisation
    {/if}
  {/snippet}
</ParentSignatureForm>
