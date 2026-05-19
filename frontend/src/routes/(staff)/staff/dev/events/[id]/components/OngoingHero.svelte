<script lang="ts">
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import { STAGE_SECONDE_LABEL } from '$lib/domain/event';

  type Props = {
    dayN: number;
    totalDays: number;
    startDate: Date;
    endDate: Date;
    timezone: string;
  };

  let { dayN, totalDays, startDate, endDate, timezone }: Props = $props();

  const intro = $derived(
    dayN === totalDays
      ? 'Dernier jour. Voici ce qui se passe sur le campus aujourd’hui, qui doit encore être appelé, et les derniers entretiens à mener avant la clôture.'
      : dayN === 1
        ? 'Premier jour. Cette vue suit le programme du jour, l’émargement, et les actions à mener pour bien lancer la cohorte.'
        : `Jour ${dayN} sur ${totalDays}. Ici, vous voyez ce qui se passe aujourd’hui, qui est présent, et les actions qui vous attendent — alertes en retard, entretiens à mener, dossiers à finaliser.`,
  );

  const datesLabel = $derived(
    `${startDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      timeZone: timezone,
    })} → ${endDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      timeZone: timezone,
    })}`,
  );

  const todayLabel = $derived(
    new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: timezone,
    }),
  );
</script>

<PageHero>
  <div class="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
    <div class="animate-in duration-300 fade-in slide-in-from-left-4">
      <div class="flex flex-wrap items-center gap-3">
        <span
          class="rounded-sm bg-epi-teal/15 px-2 py-1 font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
        >
          <span class="relative mr-2 inline-flex h-2 w-2">
            <span
              class="absolute inline-flex h-full w-full animate-ping rounded-full bg-epi-teal/60"
            ></span>
            <span class="relative inline-flex h-2 w-2 rounded-full bg-epi-teal"
            ></span>
          </span>
          <span class="opacity-60">&lt;</span> Stage en cours · {datesLabel}
          <span class="opacity-60">/&gt;</span>
        </span>
      </div>
      <h1
        class="mt-3 font-heading text-4xl tracking-wide uppercase md:text-5xl"
      >
        {STAGE_SECONDE_LABEL}<span class="text-epi-teal">_</span>
      </h1>
      <p class="mt-2 text-sm font-medium text-blue-100 first-letter:capitalize">
        {todayLabel}
      </p>
      <p
        class="mt-5 max-w-2xl text-sm leading-relaxed font-medium text-blue-100"
      >
        {intro}
      </p>
    </div>
    <div
      class="animate-in text-left duration-300 fade-in slide-in-from-bottom-2 lg:pr-6 lg:text-right"
    >
      <div
        class="font-heading text-7xl leading-none text-white [text-shadow:_2px_2px_0_rgba(0,0,0,0.25)] md:text-8xl lg:text-[9rem]"
      >
        J{dayN}
      </div>
      <div
        class="mt-2 font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
      >
        sur {totalDays} jours
      </div>
    </div>
  </div>
</PageHero>
