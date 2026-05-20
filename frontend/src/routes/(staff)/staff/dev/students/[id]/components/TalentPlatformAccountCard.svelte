<script lang="ts">
  import { Separator } from '$lib/components/ui/separator';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import { formatDateFr } from '$lib/utils';
  import { relativeFr } from './TalentStatStrip.svelte';

  /**
   * Plateforme-side facts about the talent account: when it was created, when
   * the talent first logged in, last activity, profile completion, and the
   * aggregated XP / participations counters. Lives in the Administration tab.
   */
  type Props = {
    student: {
      createdAt: Date;
      infoValidatedAt: Date | null;
      lastActiveAt: Date | null;
      xp: number;
      level: string | null;
      eventsCount: number;
    };
    firstLoginAt: Date | null;
    timezone: string;
  };

  let { student, firstLoginAt, timezone }: Props = $props();

  const lastActiveRelative = $derived(relativeFr(student.lastActiveAt));
</script>

<EpiSection overline="Plateforme" title="Compte Jump" accent="tech">
  <div class="space-y-4 text-sm">
    <dl class="space-y-2.5">
      <div class="flex items-baseline justify-between gap-3">
        <dt
          class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Compte créé
        </dt>
        <dd class="font-mono text-xs">
          {formatDateFr(student.createdAt, timezone)}
        </dd>
      </div>
      <div class="flex items-baseline justify-between gap-3">
        <dt
          class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Profil validé
        </dt>
        <dd class="font-mono text-xs">
          {#if student.infoValidatedAt}
            {formatDateFr(student.infoValidatedAt, timezone)}
          {:else}
            <span class="text-epi-orange">En cours</span>
          {/if}
        </dd>
      </div>
      <div class="flex items-baseline justify-between gap-3">
        <dt
          class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Première connexion
        </dt>
        <dd class="font-mono text-xs">
          {#if firstLoginAt}
            {formatDateFr(firstLoginAt, timezone)}
          {:else}
            <span class="text-muted-foreground italic">Jamais</span>
          {/if}
        </dd>
      </div>
      <div class="flex items-baseline justify-between gap-3">
        <dt
          class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Dernière activité
        </dt>
        <dd class="text-right">
          {#if student.lastActiveAt}
            <span class="block text-xs font-medium">{lastActiveRelative}</span>
            <span class="block font-mono text-[10px] text-muted-foreground">
              {formatDateFr(student.lastActiveAt, timezone)}
            </span>
          {:else}
            <span class="font-mono text-xs text-muted-foreground italic"
              >Jamais</span
            >
          {/if}
        </dd>
      </div>
    </dl>

    <Separator />

    <dl class="grid grid-cols-2 gap-3">
      <div>
        <dt
          class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          XP
        </dt>
        <dd class="mt-1 flex items-baseline gap-2">
          <span class="font-heading text-2xl text-epi-orange">{student.xp}</span
          >
          {#if student.level}
            <span
              class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
              >{student.level}</span
            >
          {/if}
        </dd>
      </div>
      <div>
        <dt
          class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Événements
        </dt>
        <dd class="mt-1">
          <span class="font-heading text-2xl text-epi-blue"
            >{student.eventsCount}</span
          >
        </dd>
      </div>
    </dl>
  </div>
</EpiSection>
