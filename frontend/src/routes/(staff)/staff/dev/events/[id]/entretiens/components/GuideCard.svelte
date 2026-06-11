<script lang="ts">
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Clock from '@lucide/svelte/icons/clock';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Star from '@lucide/svelte/icons/star';
  import * as Card from '$lib/components/ui/card';
  import { INTERVIEW_BLOCS } from '$lib/domain/interview';

  // Static how-to card. The déroulé list is generated from the questionnaire
  // catalogue so the durations here can never drift from the grid the staff
  // actually fills on the fiche.
</script>

<Card.Root class="rounded-sm shadow-sm dark:shadow-none">
  <div
    class="flex flex-row items-center gap-2 border-b bg-muted/30 px-6 pt-4 pb-3"
  >
    <BookOpen class="h-5 w-5 text-epi-blue" />
    <h3 class="font-heading text-2xl tracking-wide text-foreground uppercase">
      Guide de l'entretien
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

    <div class="border-t pt-3">
      <p
        class="mb-2 font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Déroulé
      </p>
      <ol class="space-y-1.5">
        {#each INTERVIEW_BLOCS as bloc, i (bloc.key)}
          <li class="flex items-baseline justify-between gap-3">
            <span class="text-foreground">
              <span class="text-muted-foreground tabular-nums">{i + 1}.</span>
              {bloc.title}
            </span>
            <span
              class="shrink-0 font-mono text-[10px] font-bold tracking-wider text-muted-foreground tabular-nums"
            >
              {bloc.duration}
            </span>
          </li>
        {/each}
      </ol>
    </div>
  </Card.Content>
</Card.Root>
