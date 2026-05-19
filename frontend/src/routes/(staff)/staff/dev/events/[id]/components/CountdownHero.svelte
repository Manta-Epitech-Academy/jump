<script lang="ts">
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import { onMount } from 'svelte';
  import { STAGE_SECONDE_LABEL } from '$lib/domain/event';

  type Props = {
    daysToStart: number;
    openDate: Date;
    timezone: string;
  };

  let { daysToStart, openDate, timezone }: Props = $props();

  let now = $state(Date.now());

  onMount(() => {
    const id = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(id);
  });

  const remaining = $derived(Math.max(0, openDate.getTime() - now));
  const days = $derived(Math.floor(remaining / 86_400_000));
  const hours = $derived(Math.floor((remaining % 86_400_000) / 3_600_000));
  const minutes = $derived(Math.floor((remaining % 3_600_000) / 60_000));

  const pad = (n: number) => String(n).padStart(2, '0');

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

  const intro = $derived(
    daysToStart === 0
      ? 'C’est aujourd’hui. Les inscrits arrivent dans quelques heures — un dernier passage sur les dossiers en attente et l’équipe est prête.'
      : daysToStart === 1
        ? 'Le stage démarre demain. Cette vue regroupe l’onboarding plateforme, les dossiers admin et les actions à finaliser ce soir.'
        : `Le stage démarre dans ${daysToStart} jours. Ici, on suit qui s’est inscrit, qui a activé son compte, où en sont les dossiers admin, et ce qu’il reste à faire d’ici J1.`,
  );
</script>

<PageHero>
  <div class="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
    <div class="animate-in duration-300 fade-in slide-in-from-left-4">
      <p
        class="font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
      >
        <span class="opacity-60">&lt;</span> Préparation
        <span class="opacity-60">/&gt;</span>
      </p>
      <h1
        class="mt-3 font-heading text-4xl tracking-wide uppercase md:text-5xl"
      >
        {STAGE_SECONDE_LABEL}<span class="text-epi-teal">_</span>
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
    <div
      class="animate-in text-left duration-300 fade-in slide-in-from-bottom-2 lg:pr-6 lg:text-right"
    >
      <div
        class="flex items-baseline justify-start gap-3 font-heading leading-none lg:justify-end"
      >
        <div class="flex flex-col items-center">
          <span class="text-7xl text-white md:text-8xl lg:text-[8.5rem]"
            >{pad(days)}</span
          >
          <span
            class="mt-2 font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
            >jours</span
          >
        </div>
        <span class="-mx-1 text-7xl text-white/40 md:text-8xl lg:text-[8.5rem]"
          >:</span
        >
        <div class="flex flex-col items-center">
          <span class="text-7xl text-white md:text-8xl lg:text-[8.5rem]"
            >{pad(hours)}</span
          >
          <span
            class="mt-2 font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
            >heures</span
          >
        </div>
        <span class="-mx-1 text-7xl text-white/40 md:text-8xl lg:text-[8.5rem]"
          >:</span
        >
        <div class="flex flex-col items-center">
          <span class="text-7xl text-white md:text-8xl lg:text-[8.5rem]"
            >{pad(minutes)}</span
          >
          <span
            class="mt-2 font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
            >minutes</span
          >
        </div>
      </div>
    </div>
  </div>
</PageHero>
