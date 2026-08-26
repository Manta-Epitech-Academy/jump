<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import { cn } from '$lib/utils';
  import ParentSignatureForm from '$lib/components/parent/ParentSignatureForm.svelte';
  import { track, errReason } from '$lib/analytics';
  import type { ImageRightsDecision } from '$lib/domain/imageRights';

  interface Props {
    child: {
      id: string;
      prenom: string;
      nom: string;
      parentPrenom?: string | null;
      parentNom?: string | null;
      parentType?: string | null;
      parentCivilite?: string | null;
      /**
       * What this guardian last decided, and the school year it answered for.
       * The decision is taken once per school year, so a returning family meets
       * this question again; recalling their own answer is what keeps a second
       * ask from reading as a first one, and a mis-click from quietly reversing
       * a refusal.
       */
      previousDecision?: {
        decision: ImageRightsDecision;
        schoolYear: string;
      } | null;
    };
    /** Legal body shown once the guardian chooses to authorize. */
    droitImageBody: string;
    /** Legal body shown once the guardian chooses to refuse. */
    droitImageRefusalBody: string;
    error?: string;
  }

  let { child, droitImageBody, droitImageRefusalBody, error }: Props = $props();

  let decision = $state<ImageRightsDecision | ''>('');

  // A refusal is a legitimate, unpressured choice, so both branches carry equal
  // brand weight — never red, never a greyed-out "lesser" state. Authorize uses
  // the brand teal, refuse the brand blue: two distinct but equally vivid
  // options, told apart by colour + icon + label rather than by valence.
  const submitClass = $derived(
    cn(
      'h-auto w-full rounded-xl px-6 py-3 shadow-raised transition-ui duration-200 disabled:opacity-50',
      decision === 'refused'
        ? 'bg-epi-blue text-white hover:bg-epi-blue hover:brightness-110'
        : 'bg-epi-tech text-black hover:bg-epi-tech hover:brightness-110',
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
    <!--
      Scope-free on purpose. The document rendered just below states which
      activities and which school year it covers, and it is the text being
      signed; repeating that here was a second, hand-maintained copy of the
      scope, and it had already fallen out of step (it still said "stage de
      seconde" after the document stopped saying it).
    -->
    , concernant l'utilisation par <strong>Epitech</strong> de l'image de mon
    enfant <strong>{child.prenom} {child.nom}</strong> :
  {/snippet}

  {#snippet artifact()}
    <input type="hidden" name="decision" value={decision} />

    {#if child.previousDecision}
      <!-- One line, stating the fact that changes the decision being taken: an
           answer already exists, and this ask is for a new school year. Neutral
           in tone, because re-deciding either way is legitimate. -->
      <p
        class="rounded-xl border border-border/60 bg-muted/40 px-4 py-2.5 text-sm text-foreground-secondary"
      >
        Pour l'année {child.previousDecision.schoolYear}, vous aviez
        <strong>
          {child.previousDecision.decision === 'refused'
            ? 'refusé'
            : 'autorisé'}
        </strong>
        l'utilisation de l'image de votre enfant. Cette décision est redemandée chaque
        année scolaire.
      </p>
    {/if}

    <!-- Decision: authorize or refuse -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button
        type="button"
        onclick={() => (decision = 'accepted')}
        aria-pressed={decision === 'accepted'}
        class={cn(
          'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-left shadow-raised transition-ui',
          decision === 'accepted'
            ? 'border-epi-tech bg-epi-tech/10 ring-1 ring-epi-tech'
            : 'border-border/60 bg-card hover:border-epi-tech/50',
        )}
      >
        <span
          class={cn(
            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
            decision === 'accepted'
              ? 'border-epi-tech bg-epi-tech text-black'
              : 'border-border',
          )}
        >
          {#if decision === 'accepted'}<Check class="size-3.5" />{/if}
        </span>
        <span class="text-sm font-medium text-foreground-secondary">
          J'autorise l'utilisation de l'image de mon enfant
        </span>
      </button>

      <button
        type="button"
        onclick={() => (decision = 'refused')}
        aria-pressed={decision === 'refused'}
        class={cn(
          'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-left shadow-raised transition-ui',
          decision === 'refused'
            ? 'border-epi-blue bg-epi-blue/10 ring-1 ring-epi-blue'
            : 'border-border/60 bg-card hover:border-epi-blue/50',
        )}
      >
        <span
          class={cn(
            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
            decision === 'refused'
              ? 'border-epi-blue bg-epi-blue text-white'
              : 'border-border',
          )}
        >
          {#if decision === 'refused'}<X class="size-3.5" />{/if}
        </span>
        <span class="text-sm font-medium text-foreground-secondary">
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
