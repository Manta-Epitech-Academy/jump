<script lang="ts">
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import XCircle from '@lucide/svelte/icons/x-circle';
  import { cn } from '$lib/utils';

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
        imageRightsSigned: boolean;
      } | null;
    }[];
  };

  let { activeStageParticipations }: Props = $props();

  const state = $derived.by(() => {
    if (activeStageParticipations.length === 0) return null;
    const total = activeStageParticipations.length;
    const ready = activeStageParticipations.filter(
      (p) =>
        p.stageCompliance?.charteSigned && p.stageCompliance?.imageRightsSigned,
    ).length;
    const blocked = activeStageParticipations.filter(
      (p) =>
        !p.stageCompliance?.charteSigned &&
        !p.stageCompliance?.imageRightsSigned,
    ).length;
    if (ready === total) return 'complete' as const;
    if (blocked === total) return 'blocked' as const;
    return 'pending' as const;
  });

  const counts = $derived.by(() => {
    const total = activeStageParticipations.length;
    const ready = activeStageParticipations.filter(
      (p) =>
        p.stageCompliance?.charteSigned && p.stageCompliance?.imageRightsSigned,
    ).length;
    return { total, ready };
  });
</script>

{#if state === 'complete'}
  <div
    class={cn(
      'flex items-center gap-3 rounded-sm border border-green-200 bg-green-50 p-4',
      'dark:border-green-900/40 dark:bg-green-900/20',
    )}
  >
    <CheckCircle2 class="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
    <div class="flex-1">
      <p class="text-sm font-bold text-green-900 dark:text-green-200">
        Dossier complet — peut commencer.
      </p>
      <p class="text-xs text-green-700/80 dark:text-green-300/80">
        Tous les documents administratifs sont validés.
      </p>
    </div>
  </div>
{:else if state === 'blocked'}
  <div
    class={cn(
      'flex items-center gap-3 rounded-sm border border-red-200 bg-red-50 p-4',
      'dark:border-red-900/40 dark:bg-red-900/20',
    )}
  >
    <XCircle class="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
    <div class="flex-1">
      <p class="text-sm font-bold text-red-900 dark:text-red-200">
        Dossier bloqué — relancer.
      </p>
      <p class="text-xs text-red-700/80 dark:text-red-300/80">
        Aucun document signé pour {counts.total > 1
          ? 'les stages en cours'
          : 'le stage en cours'}.
      </p>
    </div>
  </div>
{:else if state === 'pending'}
  <div
    class={cn(
      'flex items-center gap-3 rounded-sm border border-amber-200 bg-amber-50 p-4',
      'dark:border-amber-900/40 dark:bg-amber-900/20',
    )}
  >
    <AlertCircle class="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
    <div class="flex-1">
      <p class="text-sm font-bold text-amber-900 dark:text-amber-200">
        Dossier en attente — {counts.ready}/{counts.total} stage{counts.total >
        1
          ? 's'
          : ''} prêt{counts.ready > 1 ? 's' : ''}.
      </p>
      <p class="text-xs text-amber-700/80 dark:text-amber-300/80">
        Il manque des signatures sur au moins un dossier.
      </p>
    </div>
  </div>
{/if}
