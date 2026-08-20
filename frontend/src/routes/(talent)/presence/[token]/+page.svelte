<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import PartyPopper from '@lucide/svelte/icons/party-popper';
  import CalendarCheck from '@lucide/svelte/icons/calendar-check';
  import Clock from '@lucide/svelte/icons/clock';
  import UserX from '@lucide/svelte/icons/user-x';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import House from '@lucide/svelte/icons/house';
  import { Button } from '$lib/components/ui/button';
  import { statusLabelFr } from '$lib/domain/eventPresence';
  import { triggerConfetti } from '$lib/actions/confetti';

  let { data } = $props();

  // Half-day in lowercase reads better mid-sentence ("ce lundi 15 juin (matin)").
  const slotLower = $derived(data.slotLabel.toLowerCase());

  const VIEW = {
    present: {
      Icon: PartyPopper,
      title: 'C’est noté !',
      badge: 'bg-epi-tech-ink/15 text-epi-tech-ink',
      blob: 'bg-epi-tech-ink/25',
      celebrate: true,
      ctaLabel: 'Retour à mon espace',
      ctaTo: '/',
    },
    already: {
      Icon: CalendarCheck,
      title: 'Déjà enregistré',
      badge: 'bg-primary/10 text-primary',
      blob: 'bg-primary/20',
      celebrate: false,
      ctaLabel: 'Retour à mon espace',
      ctaTo: '/',
    },
    closed: {
      Icon: Clock,
      title: 'Créneau clôturé',
      badge: 'bg-warning/10 text-warning',
      blob: 'bg-warning/20',
      celebrate: false,
      ctaLabel: 'Retour à mon espace',
      ctaTo: '/',
    },
    not_registered: {
      Icon: UserX,
      title: 'Compte non rattaché',
      badge: 'bg-destructive/10 text-destructive',
      blob: 'bg-destructive/15',
      celebrate: false,
      ctaLabel: 'Retour à mon espace',
      ctaTo: '/',
    },
    invalid: {
      Icon: TriangleAlert,
      title: 'QR code expiré',
      badge: 'bg-muted text-muted-foreground',
      blob: 'bg-muted-foreground/10',
      celebrate: false,
      ctaLabel: 'Retour à mon espace',
      ctaTo: '/',
    },
  } as const;

  const ui = $derived(VIEW[data.state]);
  const Icon = $derived(ui.Icon);

  // Personalised punch line on success; the other states keep their plain title.
  const headline = $derived(
    data.state === 'present' && data.prenom
      ? `C’est noté, ${data.prenom} !`
      : ui.title,
  );

  // Warm, time-appropriate closer (no space metaphors, per the brand voice).
  const closer = $derived(
    data.slot === 'morning'
      ? 'Bonne matinée à toi ! 🙌'
      : 'Bon après-midi à toi ! 🙌',
  );

  onMount(() => {
    if (data.state !== 'present') return;
    // Respect reduced-motion for both the confetti and the haptic buzz.
    const reduce = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (reduce) return;
    triggerConfetti();
    // Android only; a silent no-op on iOS Safari (no Vibration API there).
    navigator.vibrate?.([25, 40, 25]);
  });
</script>

<div
  class="relative flex min-h-[100dvh] flex-col items-center justify-center gap-7 overflow-hidden px-6 py-16 text-center"
>
  <!-- soft decorative halo -->
  <div
    class="pointer-events-none absolute -top-10 h-56 w-56 rounded-full blur-3xl {ui.blob} {ui.celebrate
      ? 'halo-pulse'
      : ''}"
    aria-hidden="true"
  ></div>

  <div class="pop relative">
    {#if ui.celebrate}
      <span
        class="absolute inset-0 animate-ping rounded-full bg-epi-tech-ink/30"
        aria-hidden="true"
      ></span>
    {/if}
    <div
      class="relative flex size-24 items-center justify-center rounded-full {ui.badge}"
    >
      <Icon class="size-12" />
    </div>
  </div>

  <div class="rise relative max-w-sm space-y-2">
    <h1 class="font-heading text-display-m">{headline}</h1>
    <p class="text-pretty text-muted-foreground">
      {#if data.state === 'present'}
        Tu es bien noté présent pour le
        <span class="font-semibold text-foreground">{data.eventLabel}</span>, ce
        {data.dayLabel} ({slotLower}). {closer}
      {:else if data.state === 'already'}
        Pas besoin de scanner : le staff a déjà enregistré ton statut de
        présence{#if data.status}
          ({statusLabelFr(data.status)}){/if} pour le {data.eventLabel} de ce {data.dayLabel}
        ({slotLower}).
      {:else if data.state === 'closed'}
        L’émargement de ce créneau ({data.dayLabel}, {slotLower}) est terminé.
        Va voir un membre du staff pour signaler ta présence.
      {:else if data.state === 'not_registered'}
        Ton compte n’est pas rattaché à cet événement. Rapproche-toi du staff
        pour qu’on règle ça ensemble.
      {:else}
        Ce QR code est expiré ou invalide. Demande au staff de le réafficher,
        puis rescanne-le.
      {/if}
    </p>
  </div>

  <div class="rise-delayed relative">
    <Button
      href={resolve(ui.ctaTo)}
      variant={data.state === 'present' ? 'default' : 'outline'}
    >
      <House class="mr-2 h-4 w-4" />
      {ui.ctaLabel}
    </Button>
  </div>
</div>

<style>
  /* CSS keyframes (not Svelte transitions) so the entrance plays reliably on
     first paint after SSR hydration, where intro transitions are skipped. */
  .pop {
    animation: pop 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .rise {
    animation: rise 0.4s ease-out 0.12s both;
  }
  .rise-delayed {
    animation: rise 0.4s ease-out 0.22s both;
  }
  .halo-pulse {
    animation: halo 2.6s ease-in-out infinite;
  }
  @keyframes pop {
    0% {
      opacity: 0;
      transform: scale(0.6);
    }
    60% {
      opacity: 1;
      transform: scale(1.08);
    }
    100% {
      transform: scale(1);
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes halo {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.85;
    }
    50% {
      transform: scale(1.12);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pop,
    .rise,
    .rise-delayed,
    .halo-pulse {
      animation: none;
    }
  }
</style>
