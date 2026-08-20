<script lang="ts">
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Clock from '@lucide/svelte/icons/clock';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import * as Card from '$lib/components/ui/card';

  // Static how-to card. Shown on the cohort entretiens list as a quick reminder
  // on timing and tone before staff open a fiche to conduct an interview.
</script>

<Card.Root class="rounded-sm shadow-sm dark:shadow-none">
  <div
    class="flex flex-row items-center gap-2 border-b bg-muted/30 px-6 pt-4 pb-3"
  >
    <BookOpen class="h-5 w-5 text-epi-blue" />
    <h3 class="font-heading text-display-m text-foreground">Guide</h3>
  </div>

  <Card.Content class="space-y-3.5 p-4 text-xs leading-relaxed">
    <div class="flex gap-3">
      <Clock class="mt-0.5 h-4 w-4 shrink-0 text-epi-blue" />
      <p class="text-muted-foreground">
        <span class="font-semibold text-foreground"
          >Une dizaine de minutes, rythme tranquille.</span
        >
        Un point d'orientation, pas un interrogatoire. Vous saisissez en mots-clés
        et cases cochées, peu de rédaction.
      </p>
    </div>

    <div class="flex gap-3">
      <MessageCircle class="mt-0.5 h-4 w-4 shrink-0 text-epi-blue" />
      <p class="text-muted-foreground">
        <span class="font-semibold text-foreground"
          >Ton bienveillant, tutoiement.</span
        >
        Accroche : « On prend 10 min ensemble pour faire le point sur ton orientation
        et avoir ton retour sur la semaine. » L'avis de l'équipe se remplit à chaud,
        après l'entretien.
      </p>
    </div>
  </Card.Content>
</Card.Root>
