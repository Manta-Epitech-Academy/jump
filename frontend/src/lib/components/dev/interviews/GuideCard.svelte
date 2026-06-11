<script lang="ts">
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Clock from '@lucide/svelte/icons/clock';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Star from '@lucide/svelte/icons/star';
  import * as Card from '$lib/components/ui/card';

  // Static how-to card. Shown on the cohort entretiens list and on the fiche
  // while in interview mode: quick reminders on timing, tone and the ★ convention.
</script>

<Card.Root class="rounded-sm shadow-sm dark:shadow-none">
  <div
    class="flex flex-row items-center gap-2 border-b bg-muted/30 px-6 pt-4 pb-3"
  >
    <BookOpen class="h-5 w-5 text-epi-blue" />
    <h3 class="font-heading text-2xl tracking-wide text-foreground uppercase">
      Guide
    </h3>
  </div>

  <Card.Content class="space-y-3.5 p-4 text-xs leading-relaxed">
    <div class="flex gap-3">
      <Clock class="mt-0.5 h-4 w-4 shrink-0 text-epi-blue" />
      <p class="text-muted-foreground">
        <span class="font-semibold text-foreground"
          >10 minutes, rythme soutenu.</span
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
        et avoir ton retour sur la semaine. »
      </p>
    </div>

    <div class="flex gap-3">
      <Star class="mt-0.5 h-4 w-4 shrink-0 text-epi-teal-solid" />
      <p class="text-muted-foreground">
        <span class="font-semibold text-foreground">★ = incontournable.</span>
        Si le temps déborde, vous sautez les questions non marquées. L'avis de l'interviewer
        se remplit à chaud, après l'entretien.
      </p>
    </div>
  </Card.Content>
</Card.Root>
