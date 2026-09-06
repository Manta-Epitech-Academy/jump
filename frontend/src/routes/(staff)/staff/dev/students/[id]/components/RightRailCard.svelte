<script lang="ts">
  import { page } from '$app/state';
  import { can } from '$lib/domain/permissions';
  import Mail from '@lucide/svelte/icons/mail';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import MailOpen from '@lucide/svelte/icons/mail-open';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import Clock from '@lucide/svelte/icons/clock';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import { Separator } from '$lib/components/ui/separator';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { formatDateFr } from '$lib/utils';
  import {
    rulesStatus,
    RULES_STATUS_LABELS,
  } from '$lib/domain/dossierCompliance';
  import {
    IMAGE_RIGHTS_DISPLAY_LABELS,
    IMAGE_RIGHTS_STANCE_LABELS,
    imageRightsStatus,
    imageRightsDisplayStatus,
    imageRightsStance,
    type ImageRightsDecision,
  } from '$lib/domain/imageRights';
  import type { Communication } from '$lib/domain/communications';
  import type { Infer, SuperValidated } from 'sveltekit-superforms';
  import type { ImageRightsCorrectionSchema } from '$lib/validation/imageRights';
  import ImageRightsCorrectionDialog from './ImageRightsCorrectionDialog.svelte';

  // Decision history row as projected by the page load. Kept loose here (the
  // dialog owns the precise type), this card only forwards it.
  type ImageRightsRecordVM = {
    id: string;
    schoolYear: string;
    decision: ImageRightsDecision;
    decidedAt: Date | string;
    signerPrenom: string | null;
    signerNom: string | null;
    source: 'parent_portal' | 'staff_correction';
    note: string | null;
    recordedByName: string | null;
  };

  // One document-status badge: a label + icon in a tone colour, plus the
  // hover tooltip that explains what the state means and what's still expected.
  type DocStatus = {
    label: string;
    colorClass: string;
    icon: typeof Check;
    tooltip: string;
  };

  // The sticky synthesis rail: last connection, recent communications (one line
  // each), and the two stage documents (RI + DI) at a glance. Read-only, with a
  // single gated exception: the image-rights row carries a "Corriger" action so
  // staff can record a guardian's offline change of mind (the decision is a
  // legal artifact a guardian can revoke "à tout moment", and they sometimes
  // tell us by phone). Everything else stays a display.
  let {
    lastActiveAt,
    firstLoginAt,
    communications,
    rulesSignedAt,
    parentRulesSignedAt,
    imageRightsDecision,
    lastImageRightsDecision,
    imageRightsSchoolYear,
    imageRightsForm,
    imageRightsRecords = [],
    studentName = '',
    timezone,
  }: {
    lastActiveAt: Date | string | null;
    firstLoginAt: Date | string | null;
    communications: Communication[];
    rulesSignedAt: Date | string | null;
    parentRulesSignedAt: Date | string | null;
    /** The decision for the dossier in hand, or null when this year is open. */
    imageRightsDecision: ImageRightsDecision | null;
    /**
     * The last decision ever taken and the year it answered for. Required, not
     * optional: it is what keeps a standing refusal on screen once its year has
     * closed, and a caller that forgot to pass it would quietly downgrade an
     * interdiction to "En attente".
     */
    lastImageRightsDecision: {
      decision: ImageRightsDecision;
      schoolYear: string;
    } | null;
    /** The dossier year a correction recorded from here would be filed against. */
    imageRightsSchoolYear: string;
    imageRightsForm?: SuperValidated<Infer<ImageRightsCorrectionSchema>>;
    imageRightsRecords?: ImageRightsRecordVM[];
    studentName?: string;
    timezone: string;
  } = $props();

  // The droit-à-l'image verdict doubles as the trigger for the correction
  // dialog, but only for staff allowed to edit it (devMember) and only when the
  // form was provided. Everyone else sees a plain, non-interactive badge.
  let imageRightsDialogOpen = $state(false);
  const canCorrectImageRights = $derived(
    imageRightsForm != null &&
      can('devMember', page.data.staffProfile?.staffRole),
  );

  function relativeLabel(date: Date | string | null): string {
    if (!date) return 'Jamais';
    const diff = Date.now() - new Date(date).getTime();
    const day = 86_400_000;
    // Clamp future timestamps (clock skew, bad data) to today rather than
    // letting a negative diff leak through the buckets below.
    if (diff < day) return "Aujourd'hui";
    if (diff < 2 * day) return 'Hier';
    if (diff < 7 * day) return `Il y a ${Math.floor(diff / day)} j`;
    if (diff < 30 * day) return `Il y a ${Math.floor(diff / (7 * day))} sem`;
    if (diff < 365 * day) return `Il y a ${Math.floor(diff / (30 * day))} mois`;
    const years = Math.floor(diff / (365 * day));
    return `Il y a ${years} an${years > 1 ? 's' : ''}`;
  }

  // Show the template the message was sent from rather than its subject line.
  function commLabel(c: Communication): string {
    return c.broadcast.templateName || c.broadcast.name || 'Communication';
  }

  // Open tracking only exists for broadcast emails (SMS carry none), so the
  // badge shows opened/not only there and stays silent otherwise.
  function openState(c: Communication): 'opened' | 'unopened' | null {
    if (c.channel !== 'mail') return null;
    return c.openedAt ? 'opened' : 'unopened';
  }

  // Shared three-state resolver, on the talent's own columns: the fiche answers
  // "has this person ever signed, and when", not "is a given year's dossier
  // done". The cohort table asks the second question, against the dossier of the
  // event it is showing, so the two legitimately differ for a talent who signed
  // last year and has not reopened a dossier. The rail layers an explanatory
  // tooltip and tone on top of the state.
  const rules = $derived(rulesStatus(parentRulesSignedAt, rulesSignedAt));

  const rulesDoc = $derived.by<DocStatus>(() => {
    const label = RULES_STATUS_LABELS[rules];
    if (rules === 'signed') {
      return {
        label,
        colorClass: 'text-epi-tech-ink',
        icon: Check,
        // Unconditional: `signed` is reached only through the guardian's
        // co-signature. It used to fork on a staff attestation of an offline
        // signature, which no code path could ever set and which is gone.
        tooltip: 'Co-signé par le participant et son parent.',
      };
    }
    if (rules === 'awaiting_parent') {
      return {
        label,
        colorClass: 'text-warning',
        icon: Clock,
        tooltip:
          'Le participant a signé le règlement intérieur, la co-signature du parent est en cours.',
      };
    }
    return {
      label,
      colorClass: 'text-destructive',
      icon: Clock,
      tooltip:
        "Le règlement intérieur n'a pas encore été signé par le participant.",
    };
  });

  // Made parallel to the règlement row: an undecided image splits into "awaiting
  // parent" (the student signed, so the parent flow that co-signs both is under
  // way) vs "pending" (nothing signed yet), gated on the student's own signature
  // rather than on `rules`, whose `signed` state means the guardian has already
  // co-signed and so would read an asked family as never invited.
  const imageDisplay = $derived(
    imageRightsDisplayStatus(
      imageRightsStatus({ imageRightsDecision }),
      rulesSignedAt != null,
    ),
  );

  // What actually applies to this student right now, which the row above cannot
  // say once the decision is annual: a refusal given in a closed year still
  // forbids, while its dossier row has gone back to "En attente" because the
  // guardian is being asked again. Showing only the dossier state here is how a
  // dev ends up photographing a student whose parent said no.
  const stance = $derived(
    imageRightsStance(
      imageRightsStatus({ imageRightsDecision }),
      lastImageRightsDecision?.decision ?? null,
    ),
  );
  const standingRefusal = $derived(
    stance === 'forbidden' && imageRightsDecision == null
      ? (lastImageRightsDecision?.schoolYear ?? null)
      : null,
  );

  const imageDoc = $derived.by<DocStatus>(() => {
    // A refusal from a closed year outranks the dossier state: the row is read
    // to decide whether to take a photo, so the interdiction is what it must
    // show, with the chase still explained in the tooltip.
    if (standingRefusal) {
      return {
        label: IMAGE_RIGHTS_STANCE_LABELS.forbidden,
        colorClass: 'text-epi-together',
        icon: X,
        tooltip: `Refus donné pour ${standingRefusal} et jamais revu depuis : les photos et vidéos de ce participant ne doivent pas être utilisées. La décision est redemandée au responsable légal pour l'année en cours.`,
      };
    }
    if (imageDisplay === 'accepted') {
      return {
        label: IMAGE_RIGHTS_DISPLAY_LABELS.accepted,
        colorClass: 'text-epi-tech-ink',
        icon: Check,
        tooltip:
          "Le parent autorise l'utilisation de l'image du stagiaire par Epitech.",
      };
    }
    if (imageDisplay === 'refused') {
      return {
        label: IMAGE_RIGHTS_DISPLAY_LABELS.refused,
        colorClass: 'text-epi-together',
        icon: X,
        tooltip:
          'Les photos et les vidéos de ce stagiaire ne doivent pas être utilisées par Epitech.',
      };
    }
    if (imageDisplay === 'awaiting_parent') {
      return {
        label: IMAGE_RIGHTS_DISPLAY_LABELS.awaiting_parent,
        colorClass: 'text-warning',
        icon: Clock,
        tooltip:
          "En attente de la décision des parents sur le droit à l'image.",
      };
    }
    return {
      label: IMAGE_RIGHTS_DISPLAY_LABELS.pending,
      colorClass: 'text-destructive',
      icon: Clock,
      tooltip: "Pas d'information, en attente de signature des parents.",
    };
  });
</script>

<EpiSection title="Synthèse" accent="blue">
  <div class="space-y-4">
    <!-- Connexion -->
    <section class="space-y-2">
      <h4 class="epi-overline text-muted-foreground">Connexion à Jump</h4>
      <dl class="space-y-1.5 text-sm">
        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-muted-foreground">Dernière connexion</dt>
          <dd class="font-mono text-xs font-bold">
            {relativeLabel(lastActiveAt)}
          </dd>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-muted-foreground">Première connexion</dt>
          <dd class="font-mono text-xs">
            {firstLoginAt ? formatDateFr(firstLoginAt, timezone) : 'Jamais'}
          </dd>
        </div>
      </dl>
    </section>

    <Separator />

    <!-- Communications -->
    <section class="space-y-2">
      <h4 class="epi-overline text-muted-foreground">
        Dernières communications
      </h4>
      {#if communications.length === 0}
        <p class="text-sm text-muted-foreground italic">
          Aucune communication.
        </p>
      {:else}
        <ul class="space-y-1.5">
          {#each communications as c (c.id)}
            {@const open = openState(c)}
            <li class="flex items-center gap-2 text-sm">
              {#if c.channel === 'sms'}
                <MessageSquare
                  class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                />
              {:else}
                <Mail class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {/if}
              <span class="min-w-0 flex-1 truncate">{commLabel(c)}</span>
              {#if open === 'opened'}
                <span
                  class="inline-flex shrink-0 items-center gap-1 epi-overline text-epi-tech-ink"
                >
                  <MailOpen class="h-3 w-3" />
                  Ouvert
                </span>
              {:else if open === 'unopened'}
                <span
                  class="inline-flex shrink-0 items-center gap-1 epi-overline text-muted-foreground"
                >
                  <Mail class="h-3 w-3" />
                  Non ouvert
                </span>
              {/if}
              <span class="shrink-0 font-mono text-xs text-muted-foreground">
                {formatDateFr(c.sentAt, timezone)}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <Separator />

    <!-- Documents -->
    <section class="space-y-2">
      <h4 class="epi-overline text-muted-foreground">Documents</h4>
      <ul class="space-y-1.5 text-sm">
        {@render docRow('Règlement intérieur', rulesDoc)}
        {@render docRow(
          "Droit à l'image",
          imageDoc,
          canCorrectImageRights
            ? () => (imageRightsDialogOpen = true)
            : undefined,
        )}
      </ul>
    </section>
  </div>
</EpiSection>

<!-- Correction dialog, opened by clicking the droit-à-l'image verdict above.
     Controlled + rendered only for staff allowed to edit, so the verdict is a
     plain badge for everyone else. -->
{#if canCorrectImageRights && imageRightsForm}
  <ImageRightsCorrectionDialog
    bind:open={imageRightsDialogOpen}
    form={imageRightsForm}
    records={imageRightsRecords}
    {studentName}
    targetSchoolYear={imageRightsSchoolYear}
  />
{/if}

{#snippet docRow(name: string, s: DocStatus, onTrigger?: () => void)}
  {@const Icon = s.icon}
  <li class="flex items-center justify-between gap-3">
    <span class="text-muted-foreground">{name}</span>
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            {#if onTrigger}
              <!-- The verdict itself is the edit affordance: clicking it opens
                   the correction dialog. -->
              <button
                {...props}
                type="button"
                onclick={onTrigger}
                class="inline-flex cursor-pointer items-center gap-1 epi-overline underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-80 {s.colorClass}"
              >
                <Icon class="h-3 w-3" />
                {s.label}
              </button>
            {:else}
              <span
                {...props}
                class="inline-flex cursor-help items-center gap-1 epi-overline {s.colorClass}"
              >
                <Icon class="h-3 w-3" />
                {s.label}
              </span>
            {/if}
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content class="max-w-60">
          <p class="text-xs">{s.tooltip}</p>
          {#if onTrigger}
            <p class="mt-1 text-xs text-muted-foreground">
              Cliquez pour corriger la décision.
            </p>
          {/if}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  </li>
{/snippet}
