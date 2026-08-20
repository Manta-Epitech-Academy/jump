<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import { track, errReason, secondsBetween } from '$lib/analytics';
  import { WELCOME_XP_BONUS } from '$lib/domain/xp';
  import { DATA_RETENTION_MONTHS } from '$lib/domain/retention';
  import { renderMarkdown } from '$lib/markdown';
  import reglementMd from '$lib/content/reglement-interieur.md?raw';
  import ContinueButton from './ContinueButton.svelte';

  // Single source of truth for the règlement body — same text the PDF embeds
  // and the parent reads on /parent/reglement. Inline paraphrases would let
  // the student agree to text A while signing PDF text B.
  const reglementBody = renderMarkdown(reglementMd);

  let { error: formError }: { error?: string } = $props();
  const seenAt = Date.now();
  let submitting = $state(false);
  let city = $state('');
  let acceptedRules = $state(false);
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
  <div class="mt-8">
    <h2
      class="mb-2 text-sm font-semibold tracking-wide text-foreground-secondary uppercase"
    >
      Sécurité des données
    </h2>
    <p class="text-xs leading-relaxed text-muted-foreground">
      On collecte ton nom, ton prénom et ta progression (participations aux
      événements, présence, XP) pour suivre ton parcours et générer tes
      certifications. Ces données sont conservées {DATA_RETENTION_MONTHS}
      mois après ta dernière activité, puis automatiquement anonymisées. Tu peux à
      tout moment les consulter, les modifier ou les supprimer depuis ton espace personnel,
      et demander la suppression complète de ton compte. Tout est stocké en France,
      sur un serveur géré par l'équipe Epitech.
    </p>
  </div>

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
  <!-- Order mirrors the document order above (règlement intérieur, then sécurité
       des données) so each checkbox sits right after the text it confirms. -->
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
        bind:checked={acceptedCharter}
        name="acceptedCharter"
        value="true"
        class="mt-0.5 size-5 shrink-0 data-[state=checked]:border-epi-tech data-[state=checked]:bg-epi-tech data-[state=checked]:text-black"
      />
      <span class="text-sm font-medium text-foreground-secondary">
        J'ai lu et j'accepte la politique de confidentialité d'Epitech
        concernant la collecte et le traitement de mes données personnelles.
      </span>
    </label>

    <ContinueButton
      {submitting}
      disabled={!acceptedRules || !acceptedCharter || !city.trim()}
    >
      <Sparkles class="h-4 w-4 shrink-0" />
      Signer et obtenir mes {WELCOME_XP_BONUS} XP de bienvenue
    </ContinueButton>
  </div>
</form>
