<script lang="ts">
  import Info from '@lucide/svelte/icons/info';
  import QrCode from '@lucide/svelte/icons/qr-code';
  import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';
  import Lock from '@lucide/svelte/icons/lock';
  import FileDown from '@lucide/svelte/icons/file-down';
  import * as Card from '$lib/components/ui/card';
  import { cohortNounForms } from '$lib/domain/event';

  let { cohortNoun }: { cohortNoun: string | null } = $props();
  const noun = $derived(cohortNounForms(cohortNoun));

  // Static how-it-works card. Each line names the actual on-screen control
  // ("Afficher le QR code", "Pointage manuel", "Clôturer", "Tout exporter") so
  // the help maps onto the page: the QR + export buttons sit in the header, the
  // clôture / réouverture control in the Synthèse card just above. The bulk
  // "Tout présent" action is left out on purpose, the Synthèse card already
  // captions it next to its button so repeating it here would only duplicate.
</script>

<Card.Root class="rounded-sm shadow-raised">
  <div
    class="flex flex-row items-center gap-2 border-b bg-muted/30 px-6 pt-4 pb-3"
  >
    <Info class="h-5 w-5 text-epi-blue" />
    <h3 class="font-heading text-display-m text-foreground">Aide</h3>
  </div>

  <Card.Content class="space-y-3.5 p-4 text-xs leading-relaxed">
    <div class="flex gap-3">
      <QrCode class="mt-0.5 h-4 w-4 shrink-0 text-epi-blue" />
      <p class="text-muted-foreground">
        <span class="font-semibold text-foreground">Afficher le QR code.</span>
        Projetez-le : les {noun.plural} le scannent pour pointer eux-mêmes, en direct.
        Téléchargeable en PDF pour l'afficher en salle.
      </p>
    </div>

    <div class="flex gap-3">
      <MousePointerClick class="mt-0.5 h-4 w-4 shrink-0 text-epi-blue" />
      <p class="text-muted-foreground">
        <span class="font-semibold text-foreground">Pointage manuel.</span>
        Sur sa ligne, cliquez présent, en retard, absent ou justifié ; recliquez le
        même état pour revenir en attente.
      </p>
    </div>

    <div class="flex gap-3">
      <Lock class="mt-0.5 h-4 w-4 shrink-0 text-epi-blue" />
      <p class="text-muted-foreground">
        <span class="font-semibold text-foreground"
          >Clôture et réouverture.</span
        >
        « Clôturer » coupe le QR code et passe absents les « en attente » ; automatique
        à 11h et 15h. Un créneau fermé à la main se rouvre, pas un créneau passé l'heure.
      </p>
    </div>

    <div class="flex gap-3">
      <FileDown class="mt-0.5 h-4 w-4 shrink-0 text-epi-blue" />
      <p class="text-muted-foreground">
        <span class="font-semibold text-foreground">Tout exporter.</span>
        Téléchargez tout l'émargement de l'événement (tous les créneaux) en XLSX.
      </p>
    </div>
  </Card.Content>
</Card.Root>
