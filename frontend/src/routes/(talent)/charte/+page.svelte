<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';
  import TalentFooter from '$lib/components/talent/TalentFooter.svelte';
  import BrandBackdrop from '$lib/components/layout/BrandBackdrop.svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import { CHARTE_INFORMATIQUE_BODY } from '$lib/content/charteInformatique';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let accepted = $state(false);
  let submitting = $state(false);
</script>

<svelte:head>
  <title>Charte Informatique et Éthique | Jump</title>
</svelte:head>

<div
  class="relative flex min-h-dvh w-full flex-col overflow-hidden bg-background transition-colors duration-320"
>
  <BrandBackdrop />

  <!-- Header: logo in the top bar, matching /welcome and the onboarding pages -->
  <header class="relative z-10 shrink-0 border-b border-border/50 bg-muted">
    <div class="mx-auto flex w-full max-w-lg items-center px-4 py-3">
      <a href={resolve('/')} aria-label="Accueil">
        <EpitechLogo class="h-7 w-auto" />
      </a>
    </div>
  </header>

  <div class="relative z-10 flex flex-1 items-center justify-center p-4">
    <div class="w-full max-w-lg">
      <div class="mb-6 text-center">
        <div
          class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-epi-blue text-white shadow-raised"
        >
          <ShieldCheck class="h-7 w-7" />
        </div>
        <h1 class="font-heading text-display-m text-epi-blue">
          Une dernière chose, {data.prenom}
        </h1>
        <p class="mt-2 text-sm text-foreground-secondary">
          Avant d'utiliser Jump, lis comment on traite tes données.
        </p>
      </div>

      {#if form?.error}
        <p
          class="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
        >
          {form.error}
        </p>
      {/if}

      <form
        method="POST"
        action="?/accept"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            await update();
            submitting = false;
          };
        }}
      >
        <div
          class="rounded-xl border border-border/60 bg-card p-4 shadow-raised"
        >
          <h2
            class="mb-2 text-sm font-semibold tracking-wide text-foreground-secondary uppercase"
          >
            Sécurité des données
          </h2>
          <p class="text-xs leading-relaxed text-muted-foreground">
            {CHARTE_INFORMATIQUE_BODY}
          </p>
        </div>

        <label
          class="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-raised"
        >
          <Checkbox
            bind:checked={accepted}
            name="acceptedCharter"
            value="true"
            class="mt-0.5 size-5 shrink-0 data-[state=checked]:border-epi-tech data-[state=checked]:bg-epi-tech data-[state=checked]:text-black"
          />
          <span class="text-sm font-medium text-foreground-secondary">
            J'ai lu et j'accepte la Charte Informatique et Éthique d'Epitech,
            qui encadre la collecte et le traitement de mes données
            personnelles.
          </span>
        </label>

        <div class="mt-6 flex justify-center">
          <Button
            type="submit"
            disabled={!accepted || submitting}
            class="h-auto cursor-pointer rounded-xl bg-epi-tech px-6 py-3 text-black shadow-raised transition-ui duration-200 hover:bg-epi-tech hover:brightness-110"
          >
            {submitting ? 'Un instant…' : 'Accéder à Jump'}
            <ArrowRight class="ml-2 h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  </div>

  <TalentFooter class="relative z-10" />
</div>
