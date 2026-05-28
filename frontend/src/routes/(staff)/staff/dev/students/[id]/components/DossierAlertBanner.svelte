<script lang="ts">
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import XCircle from '@lucide/svelte/icons/x-circle';
  import { cn } from '$lib/utils';
  import { isRulesCompliant } from '$lib/domain/stageCompliance';

  /**
   * One-line banner summarising dossier compliance across the talent's active
   * stage participations. Three states: complete (green), pending (amber),
   * blocked (red). Renders nothing when the talent has no active stage —
   * there's nothing to be complete or blocked about.
   */
  type Props = {
    activeStageParticipations: {
      id: string;
      stageCompliance: {
        charteSigned: boolean;
      } | null;
    }[];
    /**
     * Whether the guardian has made an image-rights decision (authorized *or*
     * refused). Talent-level, so it's the same across every participation; a
     * settled decision — even a refusal — is "done" for dossier readiness.
     */
    imageRightsDecided: boolean;
    /**
     * Timestamp of the guardian's online co-signature of the règlement
     * intérieur (talent-level). Canonical "rules compliant" signal; satisfies
     * the gate regardless of the per-participation `charteSigned` toggle.
     */
    parentRulesSignedAt: Date | string | null;
  };

  let {
    activeStageParticipations,
    imageRightsDecided,
    parentRulesSignedAt,
  }: Props = $props();

  // Talent-level signal (`parentRulesSignedAt`) is hoisted from the
  // participations list because every row here belongs to the same talent;
  // the per-event `charteSigned` toggle still varies per row.
  const rulesOk = (p: { stageCompliance: { charteSigned: boolean } | null }) =>
    isRulesCompliant(parentRulesSignedAt, p.stageCompliance?.charteSigned);

  const state = $derived.by(() => {
    if (activeStageParticipations.length === 0) return null;
    const total = activeStageParticipations.length;
    const ready = activeStageParticipations.filter(
      (p) => rulesOk(p) && imageRightsDecided,
    ).length;
    const blocked = activeStageParticipations.filter(
      (p) => !rulesOk(p) && !imageRightsDecided,
    ).length;
    if (ready === total) return 'complete' as const;
    if (blocked === total) return 'blocked' as const;
    return 'pending' as const;
  });

  const counts = $derived.by(() => {
    const total = activeStageParticipations.length;
    const ready = activeStageParticipations.filter(
      (p) => rulesOk(p) && imageRightsDecided,
    ).length;
    return { total, ready };
  });
</script>

{#if state === 'complete'}
  <!-- Epitech charte: success = epi-tech / epi-teal-solid (the "tech"
       keyword), never green Tailwind utilities. -->
  <div
    class={cn(
      'flex items-center gap-3 rounded-sm border border-epi-teal-solid/30 bg-epi-teal-solid/10 p-4',
    )}
  >
    <CheckCircle2 class="h-5 w-5 shrink-0 text-epi-teal-solid" />
    <div class="flex-1">
      <p class="text-sm font-bold text-foreground">
        Dossier complet — peut commencer.
      </p>
      <p class="text-xs text-muted-foreground">
        Tous les documents administratifs sont validés.
      </p>
    </div>
  </div>
{:else if state === 'blocked'}
  <!-- Charte: "Destructive / alert → --epi-together" (orange). No red. -->
  <div
    class={cn(
      'flex items-center gap-3 rounded-sm border border-epi-orange/40 bg-epi-orange/10 p-4',
    )}
  >
    <XCircle class="h-5 w-5 shrink-0 text-epi-orange" />
    <div class="flex-1">
      <p class="text-sm font-bold text-foreground">
        Dossier bloqué — relancer.
      </p>
      <p class="text-xs text-muted-foreground">
        Aucun document signé pour {counts.total > 1
          ? 'les stages en cours'
          : 'le stage en cours'}.
      </p>
    </div>
  </div>
{:else if state === 'pending'}
  <!-- Pending is a neutral "in progress" state, not an alert — neutral muted
       surface with an epi-blue accent (primary / info), per charte. -->
  <div
    class={cn(
      'flex items-center gap-3 rounded-sm border border-epi-blue/30 bg-epi-blue/5 p-4',
    )}
  >
    <AlertCircle class="h-5 w-5 shrink-0 text-epi-blue" />
    <div class="flex-1">
      <p class="text-sm font-bold text-foreground">
        Dossier en attente — {counts.ready}/{counts.total} stage{counts.total >
        1
          ? 's'
          : ''} prêt{counts.ready > 1 ? 's' : ''}.
      </p>
      <p class="text-xs text-muted-foreground">
        Il manque des signatures sur au moins un dossier.
      </p>
    </div>
  </div>
{/if}
