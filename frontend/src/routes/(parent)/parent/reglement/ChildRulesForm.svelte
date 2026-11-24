<script lang="ts">
  import { untrack } from 'svelte';
  import {
    superForm,
    type Infer,
    type SuperValidated,
  } from 'sveltekit-superforms';
  import { Checkbox } from '#lib/components/ui/checkbox/index.ts';
  import ParentSignatureForm from '#lib/components/parent/ParentSignatureForm.svelte';
  import { track, errReason } from '#lib/analytics.ts';
  import {
    parentRulesSignatureSchema,
    type ParentRulesSignatureSchema,
  } from '#lib/validation/parentSignature.ts';

  interface Props {
    child: { prenom: string; nom: string };
    /** This child's form, built by the page's `load` under its own id. */
    form: SuperValidated<Infer<ParentRulesSignatureSchema>>;
  }

  let { child, form: initial }: Props = $props();

  const superform = superForm(
    untrack(() => initial),
    {
      resetForm: false,
      onResult: ({ result }) => {
        if (result.type === 'success' || result.type === 'redirect') {
          track('parent_rules_signed');
        } else if (result.type === 'failure') {
          track('parent_rules_signing_failed', { reason: errReason(result) });
        }
      },
    },
  );
  const { form } = superform;
</script>

<ParentSignatureForm
  {superform}
  schema={parentRulesSignatureSchema}
  action="?/sign"
  submitClass="h-auto w-full rounded-xl bg-epi-tech px-6 py-3 text-black shadow-raised transition-ui duration-200 hover:bg-epi-tech hover:brightness-110 disabled:opacity-50"
>
  <!-- Wording follows the règlement's own scope ("toute personne participant à
       une activité organisée par Epitech, quelle qu'en soit la forme"): one
       document signed once a year, for a coding club as much as for a stage. -->
  {#snippet declarationTail()}
    , reconnais avoir pris connaissance du règlement intérieur et m'engage à ce
    que mon enfant <strong>{child.prenom} {child.nom}</strong> le respecte lors des
    activités organisées par Epitech.
  {/snippet}

  {#snippet artifact()}
    <label
      class="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-raised"
    >
      <Checkbox
        name="accepted"
        bind:checked={$form.accepted}
        class="mt-0.5 size-5 shrink-0 cursor-pointer data-[state=checked]:border-epi-tech data-[state=checked]:bg-epi-tech data-[state=checked]:text-black"
      />
      <span class="text-sm font-medium text-foreground-secondary">
        J'ai lu et j'accepte le règlement intérieur d'Epitech.
      </span>
    </label>
  {/snippet}

  {#snippet submitLabel()}
    Signer le règlement
  {/snippet}
</ParentSignatureForm>
