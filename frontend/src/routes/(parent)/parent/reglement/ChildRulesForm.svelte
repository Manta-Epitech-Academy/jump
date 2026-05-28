<script lang="ts">
  import { Checkbox } from '$lib/components/ui/checkbox';
  import ParentSignatureForm from '$lib/components/parent/ParentSignatureForm.svelte';
  import { track, errReason } from '$lib/analytics';

  interface Props {
    child: { id: string; prenom: string; nom: string };
    error?: string;
  }

  let { child, error }: Props = $props();

  let accepted = $state(false);
</script>

<ParentSignatureForm
  {child}
  action="?/sign"
  {error}
  extraValid={accepted}
  submitClass="h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110 disabled:opacity-50"
  onResult={(result) => {
    if (result.type === 'success' || result.type === 'redirect') {
      track('parent_rules_signed');
    } else if (result.type === 'failure') {
      track('parent_rules_signing_failed', { reason: errReason(result) });
    }
  }}
>
  {#snippet declarationTail()}
    , reconnais avoir pris connaissance du règlement intérieur et m'engage à ce
    que mon enfant <strong>{child.prenom} {child.nom}</strong> le respecte dans le
    cadre du stage de seconde.
  {/snippet}

  {#snippet artifact()}
    <label
      class="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <Checkbox
        bind:checked={accepted}
        class="mt-0.5 size-5 shrink-0 data-[state=checked]:border-epi-teal data-[state=checked]:bg-epi-teal data-[state=checked]:text-black"
      />
      <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
        J'ai lu et j'accepte le règlement intérieur d'Epitech.
      </span>
    </label>
  {/snippet}

  {#snippet submitLabel()}
    Signer le règlement
  {/snippet}
</ParentSignatureForm>
