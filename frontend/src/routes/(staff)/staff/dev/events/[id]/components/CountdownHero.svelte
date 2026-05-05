<script lang="ts">
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import PageHero from '$lib/components/layout/PageHero.svelte';

  type Props = {
    titre: string;
    daysToStart: number;
    openDate: Date;
    timezone: string;
  };

  let { titre, daysToStart, openDate, timezone }: Props = $props();

  const openDateLabel = $derived(
    openDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: timezone,
    }),
  );

  const openTimeLabel = $derived(
    openDate.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }),
  );

  const ribbon = $derived(
    daysToStart === 0
      ? 'Ouverture aujourd’hui'
      : daysToStart === 1
        ? 'Ouverture demain'
        : `J–${daysToStart} avant l’ouverture`,
  );

  const intro = $derived(
    daysToStart === 0
      ? 'C’est aujourd’hui. Les inscrits arrivent dans quelques heures — un dernier passage sur les dossiers en attente et l’équipe est prête.'
      : daysToStart === 1
        ? 'Le stage démarre demain. Cette vue regroupe l’onboarding plateforme, les dossiers admin et les actions à finaliser ce soir.'
        : `Le stage démarre dans ${daysToStart} jours. Ici, on suit qui s’est inscrit, qui a activé son compte, où en sont les dossiers admin, et ce qu’il reste à faire d’ici J1.`,
  );
</script>

<PageHero decorationIcon={CalendarDays}>
  <div class="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
    <div>
      <p
        class="font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
      >
        Préparation · {ribbon}
      </p>
      <h1
        class="mt-3 font-heading text-4xl tracking-wide uppercase md:text-5xl"
      >
        {titre}<span class="text-epi-teal">_</span>
      </h1>
      <p class="mt-2 text-sm font-medium text-blue-100">
        Ouverture le <span class="text-epi-teal">{openDateLabel}</span> à
        <span class="text-epi-teal">{openTimeLabel}</span>
      </p>
      <p
        class="mt-5 max-w-2xl text-sm leading-relaxed font-medium text-blue-100"
      >
        {intro}
      </p>
    </div>
    <div class="text-left lg:pr-6 lg:text-right">
      <div
        class="font-heading text-6xl leading-none text-white md:text-7xl lg:text-8xl"
      >
        {String(daysToStart).padStart(2, '0')}
      </div>
      <div
        class="mt-2 font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
      >
        {daysToStart > 1 ? 'jours' : 'jour'} restants
      </div>
    </div>
  </div>
</PageHero>
