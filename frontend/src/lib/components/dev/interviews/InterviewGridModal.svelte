<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import {
    INTERVIEW_RECOMMENDATIONS,
    INTERVIEW_RECOMMENDATION_VALUES,
    type RecommendationToneToken,
  } from '$lib/domain/interview';
  import type { InterviewRecommendation } from '@prisma/client';
  import { cn } from '$lib/utils';

  let { open = $bindable(false), interview } = $props();

  let saving = $state(false);
  let selectedReco = $state<InterviewRecommendation | ''>('');

  $effect(() => {
    if (interview) {
      selectedReco =
        (interview.recommendation as InterviewRecommendation) ?? '';
    }
  });

  const TONE_CLASSES: Record<RecommendationToneToken, string> = {
    'epi-tech':
      'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400',
    'epi-blue':
      'bg-blue-50 text-epi-blue border-blue-200 hover:border-epi-blue',
    'epi-tomorrow':
      'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 hover:border-fuchsia-400',
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

<Dialog.Root bind:open>
  <Dialog.Content
    class="max-h-[90vh] overflow-y-auto border-t-4 border-t-epi-blue sm:max-w-2xl"
  >
    <Dialog.Header>
      <Dialog.Title class="font-heading text-xl tracking-wide uppercase"
        >Grille d'évaluation</Dialog.Title
      >
      <Dialog.Description class="font-bold text-foreground">
        Entretien avec {interview?.talent?.nom}
        {interview?.talent?.prenom}
      </Dialog.Description>
    </Dialog.Header>

    {#if interview}
      <form
        action="?/saveGrid"
        method="POST"
        class="space-y-5 py-4"
        use:enhance={() => {
          saving = true;
          return async ({ result, update }) => {
            saving = false;
            if (result.type === 'success') {
              toast.success('Évaluation enregistrée avec succès');
              open = false;
              await update();
            } else {
              toast.error('Erreur lors de la sauvegarde');
            }
          };
        }}
      >
        <input type="hidden" name="id" value={interview.id} />
        <input type="hidden" name="recommendation" value={selectedReco} />

        <div class="space-y-2 rounded-md border bg-muted/20 p-3">
          <Label class="text-xs font-bold text-epi-blue uppercase"
            >1. Comment avez-vous pris connaissance de ce stage ?</Label
          >
          <Textarea
            name="discoveryReason"
            value={interview.discoveryReason}
            class="h-14 resize-none bg-background"
          />
        </div>

        <div class="space-y-2 rounded-md border bg-muted/20 p-3">
          <Label class="text-xs font-bold text-epi-blue uppercase"
            >2. Qu'est-ce qui vous a motivé à participer à ce stage ?</Label
          >
          <Textarea
            name="motivation"
            value={interview.motivation}
            class="h-14 resize-none bg-background"
          />
        </div>

        <div class="space-y-2 rounded-md border bg-muted/20 p-3">
          <Label class="text-xs font-bold text-epi-blue uppercase"
            >Souhaitez-vous revenir à Epitech (Coding Club, autre stage, cursus)
            ?</Label
          >
          <Textarea
            name="nextEventInterest"
            value={interview.nextEventInterest}
            class="h-14 resize-none bg-background"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2 rounded-md border bg-muted/20 p-3">
            <Label class="text-xs font-bold text-epi-blue uppercase"
              >Spécialités envisagées ?</Label
            >
            <Textarea
              name="specialties"
              value={interview.specialties}
              class="h-14 resize-none bg-background"
            />
          </div>
          <div class="space-y-2 rounded-md border bg-muted/20 p-3">
            <Label class="text-xs font-bold text-epi-blue uppercase"
              >Centres d'intérêts ?</Label
            >
            <Textarea
              name="interests"
              value={interview.interests}
              class="h-14 resize-none bg-background"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2 rounded-md border bg-muted/20 p-3">
            <Label class="text-xs font-bold text-epi-blue uppercase"
              >Plateformes d'apprentissage utilisées ?</Label
            >
            <Textarea
              name="platforms"
              value={interview.platforms}
              class="h-14 resize-none bg-background"
            />
          </div>
          <div class="space-y-2 rounded-md border bg-muted/20 p-3">
            <Label class="text-xs font-bold text-epi-blue uppercase"
              >Autres métiers envisagés ?</Label
            >
            <Textarea
              name="otherJobs"
              value={interview.otherJobs}
              class="h-14 resize-none bg-background"
            />
          </div>
        </div>

        <div class="space-y-2 rounded-md border bg-muted/20 p-3">
          <Label class="text-xs font-bold text-epi-blue uppercase"
            >Comment se passe le stage jusqu'à présent ?</Label
          >
          <Textarea
            name="satisfaction"
            value={interview.satisfaction}
            class="h-14 resize-none bg-background"
          />
        </div>

        <div
          class="space-y-3 rounded-md border-2 border-epi-blue bg-blue-50/50 p-4 shadow-inner dark:bg-blue-950/20"
        >
          <Label
            class="flex items-center gap-2 text-sm font-black text-epi-blue uppercase"
            >Recommandation</Label
          >
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
            name="globalNote"
            value={interview.globalNote}
            placeholder="Ex: Élève très motivé, à orienter vers le Coding Club. Ou : intéressé par le design, à réorienter hors Epitech."
            class="h-24 bg-background font-medium"
          />
        </div>

        <Dialog.Footer class="pt-4">
          <Button type="button" variant="outline" onclick={() => (open = false)}
            >Annuler</Button
          >
          <Button
            type="submit"
            disabled={saving}
            class="bg-epi-blue text-white shadow-md hover:bg-epi-blue/90"
          >
            {saving ? 'Enregistrement...' : 'Valider la grille'}
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>
