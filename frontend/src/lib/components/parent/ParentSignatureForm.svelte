<script lang="ts" generics="T extends ParentSignerFields">
  import type { Snippet } from 'svelte';
  import type { SuperForm } from 'sveltekit-superforms';
  import { Button } from '#lib/components/ui/button/index.ts';
  import * as Select from '#lib/components/ui/select/index.ts';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { SIGNER_RELATIONSHIPS } from '#lib/domain/profile.ts';
  import type { ParentSignerFields } from '#lib/validation/parentSignature.ts';

  // Shared signature shell for the parent flow's two co-signed acts: the
  // règlement intérieur (single accept) and the droit-à-l'image decision
  // (accept *or* refuse). Both surface the same legal frame: "Je soussigné(e),
  // … agissant en qualité de …, Fait à …, le …" plus a per-child signer
  // identity, and differ only in how the declaration sentence ends and which
  // decision artifact the parent ticks. Callers own the superform (its schema
  // adds the act's own field) and inject those two pieces as snippets along
  // with the form action and submit visuals, so each act keeps its own
  // colour-coded button without the shell knowing about decisions.

  interface Props {
    /**
     * The caller's superform over this child's form. Its initial values carry
     * the signer the talent entered for their guardian during onboarding, which
     * the guardian can still override (their legal name may differ from what the
     * talent typed in casually).
     */
    superform: SuperForm<T>;
    /** The caller's schema, which decides when the form can be sent. */
    schema: { safeParse(data: unknown): { success: boolean } };
    /** Form action target, e.g. `?/sign` or `?/decide`. */
    action: string;
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
     * legal body. Its inputs carry their `name`, so they post with the rest.
     */
    artifact?: Snippet;
    /** Tailwind classes for the submit button: caller controls colour. */
    submitClass: string;
    /** Idle label of the submit button. A spinner replaces it while submitting. */
    submitLabel: Snippet;
  }

  let {
    superform,
    schema,
    action,
    declarationTail,
    artifact,
    submitClass,
    submitLabel,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  const { form, errors, message, submitting, enhance } = superform;

  const canSubmit = $derived(schema.safeParse($form).success && !$submitting);

  // What the server refused, in one line: a refusal it states itself, else the
  // first field it rejected. A success message is the page's to announce.
  const problem = $derived(
    typeof $message === 'string'
      ? $message
      : Object.values($errors as Record<string, unknown>)
          .flat()
          .find((e): e is string => typeof e === 'string'),
  );

  const today = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
</script>

<div class="mb-6 space-y-4">
  <form method="POST" {action} use:enhance class="space-y-4">
    <input type="hidden" name="talentId" value={$form.talentId} />

    {#if problem}
      <p
        class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {problem}
      </p>
    {/if}

    <!-- Declaration -->
    <div class="prose prose-sm max-w-none prose-slate dark:prose-invert">
      <p>
        Je soussigné(e), Mme/Mr
        <input
          name="signerPrenom"
          type="text"
          bind:value={$form.signerPrenom}
          placeholder="Prénom"
          required
          autocomplete="given-name"
          class="inline-block w-32 rounded-xl border border-border bg-card px-2 py-1 text-center text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:border-epi-blue/40 focus:ring-0"
        />
        <input
          name="signerNom"
          type="text"
          bind:value={$form.signerNom}
          placeholder="Nom"
          required
          autocomplete="family-name"
          class="inline-block w-32 rounded-xl border border-border bg-card px-2 py-1 text-center text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:border-epi-blue/40 focus:ring-0"
        />
        agissant en qualité de
        <input
          type="hidden"
          name="relationship"
          value={$form.relationship ?? ''}
        />
        <Select.Root
          type="single"
          value={$form.relationship ?? ''}
          onValueChange={(value) =>
            ($form.relationship = (value || null) as T['relationship'])}
        >
          <Select.Trigger
            class="inline-flex h-auto w-auto cursor-pointer gap-1 rounded-xl border-border bg-card px-2 py-1 align-middle text-sm font-semibold text-foreground"
          >
            {#if $form.relationship}
              {$form.relationship}
            {:else}
              <span class="text-muted-foreground">(choisir)</span>
            {/if}
          </Select.Trigger>
          <Select.Content>
            {#each SIGNER_RELATIONSHIPS as relationship (relationship)}
              <Select.Item
                value={relationship}
                label={relationship}
                class="cursor-pointer"
              />
            {/each}
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
        bind:value={$form.city}
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
      {#if $submitting}
        <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
        Enregistrement en cours...
      {:else}
        {@render submitLabel()}
      {/if}
    </Button>
  </form>
</div>
