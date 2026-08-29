<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import type { ActionResult } from '@sveltejs/kit';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import * as Select from '$lib/components/ui/select';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { parentSignerRelationship } from '$lib/domain/profile';

  // Shared signature shell for the parent flow's two co-signed acts: the
  // règlement intérieur (single accept) and the droit-à-l'image decision
  // (accept *or* refuse). Both surface the same legal frame: "Je soussigné(e),
  // … agissant en qualité de …, Fait à …, le …" plus a per-child signer
  // identity, and differ only in how the declaration sentence ends and which
  // decision artifact the parent ticks. Callers inject those two pieces as
  // snippets along with the form action, submit visuals, and analytics hook,
  // so each act keeps its own colour-coded button without the shell knowing
  // about decisions.

  interface Props {
    child: {
      id: string;
      prenom: string;
      nom: string;
      /**
       * Talent-entered guardian identity from onboarding, used to pre-fill the
       * signer fields below. The guardian can still override (e.g. their legal
       * name differs from what the talent typed in casually).
       */
      parentPrenom?: string | null;
      parentNom?: string | null;
      /**
       * Talent-entered guardian link + civility, mapped to the "en qualité de"
       * select so it pre-fills like the name fields. The guardian can override.
       */
      parentType?: string | null;
      parentCivilite?: string | null;
    };
    /** Form action target, e.g. `?/sign` or `?/decide`. */
    action: string;
    /** Inline form error to surface above the declaration. */
    error?: string;
    /**
     * Caller-owned extra validation gate, AND-ed with the shell's own check on
     * signer prénom + nom + relationship + city (e.g. the accept checkbox for
     * rules, a settled decision for image-rights).
     */
    extraValid: boolean;
    /**
     * Inline tail of the "Je soussigné(e)…" sentence, rendered immediately
     * after the relationship select. Each act terminates the sentence
     * differently (image: "concernant l'utilisation…" / rules: "reconnais
     * avoir pris connaissance…").
     */
    declarationTail: Snippet;
    /**
     * Decision artifact rendered between the declaration and the place+date
     * row: the rules accept checkbox, or the image accept/refuse buttons +
     * legal body. Caller also owns any extra hidden inputs (e.g. `decision`):
     * a `<input type="hidden">` rendered inside this snippet lands inside the
     * <form> and is submitted with the rest.
     */
    artifact?: Snippet;
    /** Tailwind classes for the submit button: caller controls colour. */
    submitClass: string;
    /** Idle label of the submit button. A spinner replaces it while submitting. */
    submitLabel: Snippet;
    /** Notified with the action result so callers can fire analytics. */
    onResult?: (result: ActionResult) => void;
  }

  let {
    child,
    action,
    error,
    extraValid,
    declarationTail,
    artifact,
    submitClass,
    submitLabel,
    onResult,
  }: Props = $props();

  // Pre-fill from the talent-entered guardian identity; the parent can edit if
  // their legal name differs. Structured as prénom + nom so the signed PDF
  // reads symmetrically with the talent's own signature. `untrack` makes the
  // initial-value capture explicit: once the form mounts, the parent's edits
  // own the state, not later changes to the `child` prop.
  let signerPrenom = $state(untrack(() => child.parentPrenom ?? ''));
  let signerNom = $state(untrack(() => child.parentNom ?? ''));
  let relationship = $state(
    untrack(() =>
      parentSignerRelationship(child.parentType, child.parentCivilite),
    ),
  );
  let city = $state('');
  let submitting = $state(false);

  const canSubmit = $derived(
    extraValid &&
      signerPrenom.trim().length >= 1 &&
      signerNom.trim().length >= 1 &&
      relationship !== '' &&
      city.trim().length >= 1 &&
      !submitting,
  );

  const today = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
</script>

<div class="mb-6 space-y-4">
  <form
    method="POST"
    {action}
    use:enhance={() => {
      submitting = true;
      return async ({ result, update }) => {
        onResult?.(result);
        await update();
        submitting = false;
      };
    }}
    class="space-y-4"
  >
    <input type="hidden" name="talentId" value={child.id} />

    {#if error}
      <p
        class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {error}
      </p>
    {/if}

    <!-- Declaration -->
    <div class="prose prose-sm max-w-none prose-slate dark:prose-invert">
      <p>
        Je soussigné(e), Mme/Mr
        <input
          name="signerPrenom"
          type="text"
          bind:value={signerPrenom}
          placeholder="Prénom"
          required
          autocomplete="given-name"
          class="inline-block w-32 rounded-xl border border-border bg-card px-2 py-1 text-center text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:border-epi-blue/40 focus:ring-0"
        />
        <input
          name="signerNom"
          type="text"
          bind:value={signerNom}
          placeholder="Nom"
          required
          autocomplete="family-name"
          class="inline-block w-32 rounded-xl border border-border bg-card px-2 py-1 text-center text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:border-epi-blue/40 focus:ring-0"
        />
        agissant en qualité de
        <input type="hidden" name="relationship" value={relationship} />
        <Select.Root type="single" bind:value={relationship}>
          <Select.Trigger
            class="inline-flex h-auto w-auto gap-1 rounded-xl border-border bg-card px-2 py-1 align-middle text-sm font-semibold text-foreground"
          >
            {#if relationship}
              {relationship}
            {:else}
              <span class="text-muted-foreground">(choisir)</span>
            {/if}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="mère" label="mère" />
            <Select.Item value="père" label="père" />
            <Select.Item value="tuteur légal" label="tuteur légal" />
            <Select.Item value="tutrice légale" label="tutrice légale" />
          </Select.Content>
        </Select.Root>{@render declarationTail()}
      </p>
    </div>

    {#if artifact}{@render artifact()}{/if}

    <!-- Place + date -->
    <div
      class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-raised"
    >
      <span
        class="text-sm font-medium whitespace-nowrap text-foreground-secondary"
        >Fait à</span
      >
      <input
        name="city"
        type="text"
        bind:value={city}
        placeholder="Ville"
        required
        class="w-40 min-w-0 rounded-xl border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-epi-blue/40 focus:ring-0"
      />
      <span
        class="text-sm font-medium whitespace-nowrap text-foreground-secondary"
        >, le {today}</span
      >
    </div>

    <!-- Submit -->
    <Button type="submit" disabled={!canSubmit} class={submitClass}>
      {#if submitting}
        <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
        Enregistrement en cours...
      {:else}
        {@render submitLabel()}
      {/if}
    </Button>
  </form>
</div>
