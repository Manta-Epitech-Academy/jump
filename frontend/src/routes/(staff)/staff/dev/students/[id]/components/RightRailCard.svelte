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
  } from '$lib/domain/stageCompliance';
  import {
    IMAGE_RIGHTS_DISPLAY_LABELS,
    imageRightsStatus,
    imageRightsDisplayStatus,
    type ImageRightsDecision,
  } from '$lib/domain/imageRights';
  import type { Communication } from '$lib/domain/communications';
  import type { Infer, SuperValidated } from 'sveltekit-superforms';
  import type { ImageRightsCorrectionSchema } from '$lib/validation/imageRights';
  import ImageRightsCorrectionDialog from './ImageRightsCorrectionDialog.svelte';

  // Decision history row as projected by the page load. Kept loose here (the
  // dialog owns the precise type) — this card only forwards it.
  type ImageRightsRecordVM = {
    id: string;
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
  // tell us by phone). Everything else stays a display; the rest of the actions
  // live in the recommendations list on the left.
  let {
    lastActiveAt,
    firstLoginAt,
    communications,
    rulesSignedAt,
    parentRulesSignedAt,
    charteSigned,
    imageRightsDecision,
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
    charteSigned: boolean | null | undefined;
    imageRightsDecision: ImageRightsDecision | null;
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
  // Reminders (1:1 relances) carry no template, so they read as "Relance".
  function commLabel(c: Communication): string {
    if (c.kind === 'reminder') return 'Relance';
    return c.broadcast.templateName || c.broadcast.name || 'Communication';
  }

  // Open tracking only exists for broadcast emails (reminders/SMS carry none),
  // so the badge shows opened/not only there and stays silent otherwise.
  function openState(c: Communication): 'opened' | 'unopened' | null {
    if (c.kind !== 'broadcast' || c.channel !== 'mail') return null;
    return c.openedAt ? 'opened' : 'unopened';
  }

  // Shared three-state resolver (kept in lockstep with the cohort table); the
  // rail layers an explanatory tooltip and tone on top of the state.
  const rules = $derived(
    rulesStatus(parentRulesSignedAt, charteSigned, rulesSignedAt),
  );

  const rulesDoc = $derived.by<DocStatus>(() => {
    const label = RULES_STATUS_LABELS[rules];
    if (rules === 'signed') {
      return {
        label,
        colorClass: 'text-epi-teal-solid',
        icon: Check,
        tooltip: parentRulesSignedAt
          ? 'Co-signé par le parent et le stagiaire'
          : "Signature attestée manuellement par l'équipe (hors ligne).",
      };
    }
    if (rules === 'awaiting_parent') {
      return {
        label,
        colorClass: 'text-amber-600 dark:text-amber-500',
        icon: Clock,
        tooltip:
          'Le stagiaire a signé le règlement intérieur, la co-signature du parent est en cours.',
      };
    }
    return {
      label,
      colorClass: 'text-destructive',
      icon: Clock,
      tooltip:
        "Le règlement intérieur n'a pas encore été signé par le stagiaire.",
    };
  });

  // Made parallel to the règlement row: an undecided image splits into "awaiting
  // parent" (the student signed, so the parent flow that co-signs both is under
  // way) vs "pending" (nothing signed yet), gated on the student's own signature,
  // not `rules`, whose `signed` state a staff offline attestation can reach
  // without a parent ever being invited.
  const imageDisplay = $derived(
    imageRightsDisplayStatus(
      imageRightsStatus({ imageRightsDecision }),
      rulesSignedAt != null,
    ),
  );

  const imageDoc = $derived.by<DocStatus>(() => {
    if (imageDisplay === 'accepted') {
      return {
        label: IMAGE_RIGHTS_DISPLAY_LABELS.accepted,
        colorClass: 'text-epi-teal-solid',
        icon: Check,
        tooltip:
          "Le parent autorise l'utilisation de l'image du stagiaire par Epitech.",
      };
    }
    if (imageDisplay === 'refused') {
      return {
        label: IMAGE_RIGHTS_DISPLAY_LABELS.refused,
        colorClass: 'text-epi-orange',
        icon: X,
        tooltip:
          'Les photos et les vidéos de ce stagiaire ne doivent pas être utilisées par Epitech.',
      };
    }
    if (imageDisplay === 'awaiting_parent') {
      return {
        label: IMAGE_RIGHTS_DISPLAY_LABELS.awaiting_parent,
        colorClass: 'text-amber-600 dark:text-amber-500',
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
      <h4
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Connexion à Jump
      </h4>
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
      <h4
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
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
                  class="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] tracking-wide text-epi-teal-solid uppercase"
                >
                  <MailOpen class="h-3 w-3" />
                  Ouvert
                </span>
              {:else if open === 'unopened'}
                <span
                  class="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase"
                >
                  <Mail class="h-3 w-3" />
                  Non ouvert
                </span>
              {/if}
              <span
                class="shrink-0 font-mono text-[10px] text-muted-foreground"
              >
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
      <h4
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Documents
      </h4>
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
                class="inline-flex cursor-pointer items-center gap-1 font-mono text-[10px] font-bold tracking-widest uppercase underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-80 {s.colorClass}"
              >
                <Icon class="h-3 w-3" />
                {s.label}
              </button>
            {:else}
              <span
                {...props}
                class="inline-flex cursor-help items-center gap-1 font-mono text-[10px] font-bold tracking-widest uppercase {s.colorClass}"
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
            <p class="mt-1 text-[10px] text-muted-foreground">
              Cliquez pour corriger la décision.
            </p>
          {/if}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  </li>
{/snippet}
