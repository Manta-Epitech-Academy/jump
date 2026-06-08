<script lang="ts">
  import FlaskConical from '@lucide/svelte/icons/flask-conical';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import {
    INTERVIEW_RECOMMENDATIONS,
    INTERVIEW_RECOMMENDATION_VALUES,
    type RecommendationToneToken,
  } from '$lib/domain/interview';
  import type { InterviewRecommendation } from '@prisma/client';
  import { cn } from '$lib/utils';

  // MOCK ONLY. The real interview grid lives in InterviewGridModal.svelte and
  // persists via the interviews route's ?/saveGrid action. This is the
  // in-fiche "faire l'entretien" preview: same questions and recommendation
  // vocabulary, but it deliberately holds no form / action and saves nothing
  // yet. Wiring it to a real Interview row is a later PR.
  const { talentName }: { talentName: string } = $props();

  let selectedReco = $state<InterviewRecommendation | ''>('');

  const QUESTIONS = [
    'Comment avez-vous pris connaissance de ce stage ?',
    'Qu’est-ce qui vous a motivé à participer à ce stage ?',
    'Souhaitez-vous revenir à Epitech (Coding Club, autre stage, cursus) ?',
    'Spécialités envisagées ?',
    'Centres d’intérêts ?',
    'Plateformes d’apprentissage utilisées ?',
    'Autres métiers envisagés ?',
    'Comment se passe le stage jusqu’à présent ?',
  ];

  const TONE_CLASSES: Record<RecommendationToneToken, string> = {
    'epi-tech':
      'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400 dark:bg-emerald-950/20',
    'epi-blue':
      'bg-blue-50 text-epi-blue border-blue-200 hover:border-epi-blue dark:bg-blue-950/20',
    'epi-tomorrow':
      'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 hover:border-fuchsia-400 dark:bg-fuchsia-950/20',
    'epi-drift':
      'bg-muted text-muted-foreground border-border hover:border-foreground/40',
  };
  const ACTIVE_TONE_CLASSES: Record<RecommendationToneToken, string> = {
    'epi-tech': 'ring-2 ring-emerald-500 border-emerald-500',
    'epi-blue': 'ring-2 ring-epi-blue border-epi-blue',
    'epi-tomorrow': 'ring-2 ring-fuchsia-500 border-fuchsia-500',
    'epi-drift': 'ring-2 ring-foreground/40 border-foreground/40',
  };
</script>

<EpiSection title="Grille d'évaluation" accent="blue">
  {#snippet meta()}
    <span
      class="inline-flex items-center gap-1.5 rounded-full border border-epi-pink/30 bg-epi-pink/10 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-epi-pink uppercase"
    >
      <FlaskConical class="h-3 w-3" />
      Maquette
    </span>
  {/snippet}

  <div class="space-y-5">
    <p class="font-mono text-[11px] text-muted-foreground">
      &lt; Entretien avec {talentName} · la grille n'est pas encore enregistrée /&gt;
    </p>

    {#each QUESTIONS as question, i (i)}
      <div class="space-y-2 rounded-md border bg-muted/20 p-3">
        <Label class="text-xs font-bold text-epi-blue uppercase">
          {i + 1}. {question}
        </Label>
        <Textarea class="h-14 resize-none bg-background" />
      </div>
    {/each}

    <div
      class="space-y-3 rounded-md border-2 border-epi-blue bg-blue-50/50 p-4 dark:bg-blue-950/20"
    >
      <Label
        class="flex items-center gap-2 text-sm font-black text-epi-blue uppercase"
      >
        Recommandation
      </Label>
      <div class="grid grid-cols-2 gap-2">
        {#each INTERVIEW_RECOMMENDATION_VALUES as value (value)}
          {@const desc = INTERVIEW_RECOMMENDATIONS[value]}
          {@const active = selectedReco === value}
          <button
            type="button"
            onclick={() => (selectedReco = active ? '' : value)}
            class={cn(
              'cursor-pointer rounded-sm border px-3 py-2 text-left text-xs font-bold tracking-wide uppercase transition-all',
              TONE_CLASSES[desc.tone],
              active && ACTIVE_TONE_CLASSES[desc.tone],
            )}
            aria-pressed={active}
          >
            {desc.label}
          </button>
        {/each}
      </div>

      <Label class="text-xs font-bold text-epi-blue uppercase">
        Notes complémentaires
      </Label>
      <Textarea
        class="h-24 bg-background font-medium"
        placeholder="Ex : Élève très motivé, à orienter vers le Coding Club."
      />
    </div>

    <div class="flex justify-end">
      <Button type="button" disabled>Valider la grille</Button>
    </div>
  </div>
</EpiSection>
