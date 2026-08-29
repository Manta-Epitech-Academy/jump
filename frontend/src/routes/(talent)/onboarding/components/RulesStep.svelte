<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import { track, errReason, secondsBetween } from '$lib/analytics';
  import { WELCOME_XP_BONUS } from '$lib/domain/xp';
  import { CHARTE_INFORMATIQUE_BODY } from '$lib/content/charteInformatique';
  import { renderMarkdown } from '$lib/markdown';
  import {
    reglementTextFor,
    CURRENT_REGLEMENT_VERSION,
  } from '$lib/content/reglement';
  import ContinueButton from './ContinueButton.svelte';

  // Single source of truth for the règlement body: same text the PDF embeds
  // and the parent reads on /parent/reglement. Inline paraphrases would let
  // the student agree to text A while signing PDF text B.
  //
  // A signature taken now commits to the current version, and the action pins
  // that same constant on the row, so what is read here and what the PDF
  // renders can't drift apart later.
  const reglementBody = renderMarkdown(
    reglementTextFor(CURRENT_REGLEMENT_VERSION),
  );

  let {
    error: formError,
    charterAccepted = false,
    welcomeBonusGranted = false,
  }: {
    error?: string;
    /** Charte already consented to on a previous year's dossier: not re-asked,
     * and its date is not restamped (see the `signRules` action). */
    charterAccepted?: boolean;
    /** The arrival bonus is already in the XP ledger, so this signature grants
     * nothing and the button must not promise it. */
    welcomeBonusGranted?: boolean;
  } = $props();
  const seenAt = Date.now();
  let submitting = $state(false);
  let city = $state('');
  let acceptedRules = $state(false);
  let acceptedEquipment = $state(false);
  let acceptedCharter = $state(false);
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-epi-blue text-white shadow-raised"
  >
    <BookOpen class="h-7 w-7" />
  </div>
  <h1 class="font-heading text-display-m text-epi-blue">Dernière étape</h1>
</div>

{#if formError}
  <p
    class="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
  >
    {formError}
  </p>
{/if}

<form
  method="POST"
  action="?/signRules"
  use:enhance={() => {
    submitting = true;
    return async ({ result, update }) => {
      if (result.type === 'redirect') {
        track('rules_signed', { secondsToSign: secondsBetween(seenAt) });
        track('onboarding_completed', { step: 'rules' });
        goto(result.location, { invalidateAll: true });
        return;
      }
      if (result.type === 'failure') {
        track('rules_signing_failed', { reason: errReason(result) });
      }
      await update();
      submitting = false;
    };
  }}
>
  <!-- ═══ Règlement intérieur ═══ -->
  <div class="prose prose-sm max-w-none prose-slate dark:prose-invert">
    {@html reglementBody}
  </div>

  <!-- ═══ Sécurité des données (police réduite) ═══ -->
  <!-- Only for a talent who has not consented yet. The charte is signed once per
       account, so re-reading it belongs to /settings/documents, not to the act of
       signing this year's règlement. -->
  {#if !charterAccepted}
    <div class="mt-8">
      <h2
        class="mb-2 text-sm font-semibold tracking-wide text-foreground-secondary uppercase"
      >
        Sécurité des données
      </h2>
      <p class="text-xs leading-relaxed text-muted-foreground">
        {CHARTE_INFORMATIQUE_BODY}
      </p>
    </div>
  {/if}

  <!-- ═══ Signature ═══ -->
  <div
    class="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-raised"
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
      class="w-40 min-w-0 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-epi-blue/40 focus:ring-0"
    />
    <span
      class="text-sm font-medium whitespace-nowrap text-foreground-secondary"
      >, le {new Date().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })}</span
    >
  </div>

  <!-- ═══ Checkboxes ═══ -->
  <!-- Order mirrors the document order above (règlement intérieur, whose
       "Matériel et responsabilité" section carries the laptop clause, then
       sécurité des données) so each checkbox sits right after the text it
       confirms. -->
  <div class="mt-6 space-y-3">
    <label
      class="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-raised"
    >
      <Checkbox
        bind:checked={acceptedRules}
        name="acceptedRules"
        value="true"
        class="mt-0.5 size-5 shrink-0 data-[state=checked]:border-epi-tech data-[state=checked]:bg-epi-tech data-[state=checked]:text-black"
      />
      <span class="text-sm font-medium text-foreground-secondary">
        Je m'engage à respecter le règlement intérieur d'Epitech.
      </span>
    </label>

    <label
      class="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-raised"
    >
      <Checkbox
        bind:checked={acceptedEquipment}
        name="acceptedEquipment"
        value="true"
        class="mt-0.5 size-5 shrink-0 data-[state=checked]:border-epi-tech data-[state=checked]:bg-epi-tech data-[state=checked]:text-black"
      />
      <span class="text-sm font-medium text-foreground-secondary">
        Je certifie posséder un ordinateur portable en état de marche. Si ce
        n'est pas le cas, je préviens l'équipe de mon campus.
      </span>
    </label>

    {#if !charterAccepted}
      <label
        class="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-raised"
      >
        <Checkbox
          bind:checked={acceptedCharter}
          name="acceptedCharter"
          value="true"
          class="mt-0.5 size-5 shrink-0 data-[state=checked]:border-epi-tech data-[state=checked]:bg-epi-tech data-[state=checked]:text-black"
        />
        <span class="text-sm font-medium text-foreground-secondary">
          J'ai lu et j'accepte la Charte Informatique et Éthique d'Epitech, qui
          encadre la collecte et le traitement de mes données personnelles.
        </span>
      </label>
    {/if}

    <ContinueButton
      {submitting}
      disabled={!acceptedRules ||
        !acceptedEquipment ||
        (!charterAccepted && !acceptedCharter) ||
        !city.trim()}
    >
      <Sparkles class="h-4 w-4 shrink-0" />
      {#if welcomeBonusGranted}
        Signer le règlement de cette année
      {:else}
        Signer et obtenir mes {WELCOME_XP_BONUS} XP de bienvenue
      {/if}
    </ContinueButton>
  </div>
</form>
