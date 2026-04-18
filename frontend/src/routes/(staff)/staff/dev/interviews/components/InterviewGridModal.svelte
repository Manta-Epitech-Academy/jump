<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';

  let { open = $bindable(false), interview } = $props();

  let saving = $state(false);
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
            >2. Qu'est-ce qui vous motive pour venir vous former dans la tech ?</Label
          >
          <Textarea
            name="motivation"
            value={interview.motivation}
            class="h-14 resize-none bg-background"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2 rounded-md border bg-muted/20 p-3">
            <Label class="text-xs font-bold text-epi-blue uppercase"
              >Prochains événements cibles ?</Label
            >
            <Textarea
              name="nextEventInterest"
              value={interview.nextEventInterest}
              class="h-14 resize-none bg-background"
            />
          </div>
          <div class="space-y-2 rounded-md border bg-muted/20 p-3">
            <Label class="text-xs font-bold text-epi-blue uppercase"
              >Influenceurs & Médias suivis ?</Label
            >
            <Textarea
              name="influencers"
              value={interview.influencers}
              class="h-14 resize-none bg-background"
            />
          </div>
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
            >Satisfaction globale et avis sur le contenu ?</Label
          >
          <Textarea
            name="satisfaction"
            value={interview.satisfaction}
            class="h-14 resize-none bg-background"
          />
        </div>

        <div
          class="space-y-2 rounded-md border-2 border-epi-blue bg-blue-50/50 p-4 shadow-inner dark:bg-blue-950/20"
        >
          <Label
            class="flex items-center gap-2 text-sm font-black text-epi-blue uppercase"
            >Note globale & Recommandation Admission</Label
          >
          <Textarea
            name="globalNote"
            value={interview.globalNote}
            placeholder="Ex: Excellent profil, très motivé par la cybersécurité. À inviter au prochain Hackathon."
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
